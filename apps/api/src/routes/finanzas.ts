import { Hono } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import {
  calcularMovimientoReserva,
  conciliarPayout,
  decimalDesdeCentavos,
  esMismoContenidoQueVersionAnterior,
  evaluarAlertaRetencionFiscal,
  generarOwnerStatement,
} from "@atiende-rv/domain/finanzas";
import type { EntradaMovimientoReserva, ReservaConciliable } from "@atiende-rv/domain/finanzas";
import {
  CuerpoGenerarStatement,
  CuerpoImportarPayout,
  CuerpoMovimientoReserva,
  CuerpoReglaComisionCanal,
  ErrorDominio,
} from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";

/**
 * Finanzas / owners / statements (Lote 7, BACKLOG E10, RV12). Reglas no
 * negociables reflejadas aquí:
 * - Finanzas-1: si el canal ya entrega el monto neto de su comisión, NUNCA
 *   se vuelve a restar (delegado enteramente a
 *   `@atiende-rv/domain/finanzas` — esta ruta nunca reimplementa el cálculo).
 * - H-062: el owner statement se calcula SIEMPRE desde `reserva_financiero`
 *   (que a su vez es 1:1 con `ocupacion_unidad`), nunca al revés, y su
 *   generación es idempotente por hash de contenido.
 * - H-067/B-005: ninguna cifra de impuesto se calcula aquí — `linea_impuesto`
 *   solo persiste lo que el usuario capturó manualmente, siempre marcado
 *   `revision_fiscal = true` (constraint en la propia tabla).
 */
export function crearRutasFinanzas(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // ---------------------------------------------------------------------
  // Reglas de comisión de canal (H-063/H-065)
  // ---------------------------------------------------------------------
  app.get("/reglas-comision", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "contador");
    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT rcc.id, ca.codigo AS canal_codigo, rcc.propiedad_id, rcc.ya_neto_de_comision,
                rcc.comision_basis_points, rcc.fuente, rcc.vigente_desde
         FROM regla_comision_canal rcc
         JOIN canal ca ON ca.id = rcc.canal_id
         ORDER BY rcc.vigente_desde DESC`,
      );
      return rows;
    });
    return c.json({
      reglas: filas.map((f) => ({
        id: f.id,
        canalCodigo: f.canal_codigo,
        propiedadId: f.propiedad_id,
        yaNetoDeComision: f.ya_neto_de_comision,
        comisionBasisPoints: f.comision_basis_points,
        fuente: f.fuente,
        vigenteDesde: aFechaIso(f.vigente_desde),
      })),
    });
  });

  app.post("/reglas-comision", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoReglaComisionCanal.parse(await c.req.json());
    if (!auth.tenantId) throw new ErrorDominio("tenant_forbidden", "Se requiere un tenant explícito");

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const canal = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = $1", [
          cuerpo.canalCodigo,
        ]);
        if (!canal.rows[0]) throw new ErrorDominio("validacion", `Canal desconocido: "${cuerpo.canalCodigo}"`);
        const { rows } = await cliente.query<{ id: string }>(
          `INSERT INTO regla_comision_canal (tenant_id, canal_id, propiedad_id, ya_neto_de_comision, comision_basis_points, fuente, vigente_desde)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE))
           RETURNING id`,
          [
            auth.tenantId,
            canal.rows[0].id,
            cuerpo.propiedadId ?? null,
            cuerpo.yaNetoDeComision,
            cuerpo.comisionBasisPoints,
            cuerpo.fuente,
            cuerpo.vigenteDesde ?? null,
          ],
        );
        return rows[0]!;
      }),
    );
    return c.json({ id: fila.id }, 201);
  });

  // ---------------------------------------------------------------------
  // Movimiento financiero por reserva (H-062/H-063)
  // ---------------------------------------------------------------------
  app.post("/reservas/:ocupacionId/movimiento", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const ocupacionId = c.req.param("ocupacionId");
    const cuerpo = CuerpoMovimientoReserva.parse(await c.req.json());

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const ocupacion = await cliente.query<{ capa: string; canal_id: string | null; unidad_id: string }>(
          "SELECT capa, canal_origen_id AS canal_id, unidad_id FROM ocupacion_unidad WHERE id = $1",
          [ocupacionId],
        );
        const fila = ocupacion.rows[0];
        if (!fila || fila.capa !== "reserva") {
          throw new ErrorDominio("recurso_no_encontrado", "Reserva no encontrada");
        }

        const propiedad = await cliente.query<{ id: string }>(
          "SELECT p.id FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE u.id = $1",
          [fila.unidad_id],
        );
        const propiedadId = propiedad.rows[0]?.id ?? null;

        const regla = await buscarReglaComisionCanal(cliente, {
          canalId: fila.canal_id,
          propiedadId,
        });

        const entrada: EntradaMovimientoReserva = {
          ocupacionUnidadId: ocupacionId,
          moneda: cuerpo.moneda,
          montoBrutoCentavos: cuerpo.montoBrutoCentavos,
          comisionCanal: regla,
          comisionGestor: { basisPoints: cuerpo.comisionGestorBasisPoints, base: cuerpo.comisionGestorBase },
          gastos: cuerpo.gastos,
          impuestos: cuerpo.impuestos,
        };
        const movimiento = calcularMovimientoReserva(entrada);

        const rf = await cliente.query<{ id: string }>(
          `INSERT INTO reserva_financiero
             (ocupacion_unidad_id, moneda, monto_bruto_centavos, ya_neto_de_comision,
              comision_canal_basis_points, comision_canal_fuente, comision_canal_centavos,
              comision_gestor_basis_points, comision_gestor_base, comision_gestor_centavos,
              monto_recibido_centavos, neto_centavos, creado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (ocupacion_unidad_id) DO UPDATE SET
             moneda = EXCLUDED.moneda,
             monto_bruto_centavos = EXCLUDED.monto_bruto_centavos,
             ya_neto_de_comision = EXCLUDED.ya_neto_de_comision,
             comision_canal_basis_points = EXCLUDED.comision_canal_basis_points,
             comision_canal_fuente = EXCLUDED.comision_canal_fuente,
             comision_canal_centavos = EXCLUDED.comision_canal_centavos,
             comision_gestor_basis_points = EXCLUDED.comision_gestor_basis_points,
             comision_gestor_base = EXCLUDED.comision_gestor_base,
             comision_gestor_centavos = EXCLUDED.comision_gestor_centavos,
             monto_recibido_centavos = EXCLUDED.monto_recibido_centavos,
             neto_centavos = EXCLUDED.neto_centavos,
             actualizado_en = now()
           RETURNING id`,
          [
            ocupacionId,
            cuerpo.moneda,
            movimiento.ingresoBrutoCentavos,
            regla.yaNetoDeComision,
            regla.comisionBasisPoints,
            movimiento.comisionCanalFuente,
            movimiento.comisionCanalCentavos,
            cuerpo.comisionGestorBasisPoints,
            cuerpo.comisionGestorBase,
            movimiento.comisionGestorCentavos,
            movimiento.montoRecibidoCentavos,
            movimiento.netoCentavos,
            auth.usuarioId,
          ],
        );
        const reservaFinancieroId = rf.rows[0]!.id;

        await cliente.query("DELETE FROM linea_gasto WHERE reserva_financiero_id = $1", [reservaFinancieroId]);
        for (const gasto of cuerpo.gastos) {
          await cliente.query(
            `INSERT INTO linea_gasto (reserva_financiero_id, tipo, descripcion, monto_centavos, moneda, creado_por)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [reservaFinancieroId, gasto.tipo, gasto.descripcion ?? null, gasto.montoCentavos, cuerpo.moneda, auth.usuarioId],
          );
        }
        await cliente.query("DELETE FROM linea_impuesto WHERE reserva_financiero_id = $1", [reservaFinancieroId]);
        for (const impuesto of cuerpo.impuestos) {
          await cliente.query(
            `INSERT INTO linea_impuesto (reserva_financiero_id, tipo, monto_centavos, moneda, nota, creado_por)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              reservaFinancieroId,
              impuesto.tipo,
              impuesto.montoCentavos,
              cuerpo.moneda,
              impuesto.nota ?? "Revisión legal/fiscal pendiente (B-005)",
              auth.usuarioId,
            ],
          );
        }

        return { reservaFinancieroId, movimiento };
      }),
    );

    return c.json(
      {
        id: resultado.reservaFinancieroId,
        ocupacionUnidadId: ocupacionId,
        ...serializarMovimiento(resultado.movimiento),
      },
      201,
    );
  });

  app.get("/reservas/:ocupacionId", async (c) => {
    const auth = c.get("auth");
    const ocupacionId = c.req.param("ocupacionId");
    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      // Nunca un JOIN directo a ocupacion_unidad/unidad aquí: RLS (0015)
      // excluye explícitamente a contador de esas dos tablas, y un JOIN
      // normal quedaría vacío para ese rol antes de llegar a
      // reserva_financiero. El RFC (única pieza que sí necesita cruzar esa
      // frontera, H-067) se obtiene con la función SECURITY DEFINER
      // dedicada (0054), no con un JOIN sujeto a la política de las otras
      // tablas.
      const { rows } = await cliente.query("SELECT * FROM reserva_financiero WHERE ocupacion_unidad_id = $1", [
        ocupacionId,
      ]);
      if (!rows[0]) return null;
      const rf = rows[0];
      const rfc = await cliente.query<{ rfc_propietario: string | null }>(
        "SELECT reserva_financiero_rfc_propietario($1) AS rfc_propietario",
        [rf.id],
      );
      rf.rfc_propietario = rfc.rows[0]?.rfc_propietario ?? null;
      const gastos = await cliente.query(
        "SELECT id, tipo, descripcion, monto_centavos, moneda FROM linea_gasto WHERE reserva_financiero_id = $1",
        [rf.id],
      );
      const impuestos = await cliente.query(
        "SELECT id, tipo, monto_centavos, moneda, nota FROM linea_impuesto WHERE reserva_financiero_id = $1",
        [rf.id],
      );
      return { rf, gastos: gastos.rows, impuestos: impuestos.rows };
    });
    if (!resultado) throw new ErrorDominio("recurso_no_encontrado", "Movimiento financiero no encontrado");

    const alertaFiscal = evaluarAlertaRetencionFiscal(resultado.rf.rfc_propietario);
    return c.json({
      ocupacionUnidadId: ocupacionId,
      moneda: resultado.rf.moneda,
      montoBrutoCentavos: Number(resultado.rf.monto_bruto_centavos),
      yaNetoDeComision: resultado.rf.ya_neto_de_comision,
      comisionCanalCentavos: Number(resultado.rf.comision_canal_centavos),
      comisionGestorCentavos: Number(resultado.rf.comision_gestor_centavos),
      montoRecibidoCentavos: Number(resultado.rf.monto_recibido_centavos),
      netoCentavos: Number(resultado.rf.neto_centavos),
      gastos: resultado.gastos.map((g) => ({
        id: g.id,
        tipo: g.tipo,
        descripcion: g.descripcion,
        montoCentavos: Number(g.monto_centavos),
      })),
      impuestos: resultado.impuestos.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        montoCentavos: Number(i.monto_centavos),
        nota: i.nota,
      })),
      alertaFiscal,
    });
  });

  // ---------------------------------------------------------------------
  // Owner statements (H-062, idempotente y versionado)
  // ---------------------------------------------------------------------
  app.post("/statements/generar", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoGenerarStatement.parse(await c.req.json());
    if (cuerpo.periodoInicio >= cuerpo.periodoFin) {
      throw new ErrorDominio("rango_invalido", "periodoInicio debe ser anterior a periodoFin");
    }

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const owner = await cliente.query<{ id: string; tenant_id: string }>(
          `SELECT o.id, eg.tenant_id FROM owner o JOIN empresa_gestora eg ON eg.id = o.empresa_gestora_id WHERE o.id = $1`,
          [cuerpo.ownerId],
        );
        if (!owner.rows[0]) throw new ErrorDominio("recurso_no_encontrado", "Propietario no encontrado");

        const { rows: filasReserva } = await cliente.query(
          `SELECT rf.*, ou.id AS ocupacion_id
           FROM reserva_financiero rf
           JOIN ocupacion_unidad ou ON ou.id = rf.ocupacion_unidad_id
           JOIN unidad un ON un.id = ou.unidad_id
           WHERE un.owner_id = $1
             AND upper(ou.rango) >= $2::date AND upper(ou.rango) < $3::date
             AND ou.estado <> 'cancelado'
           ORDER BY ou.id`,
          [cuerpo.ownerId, cuerpo.periodoInicio, cuerpo.periodoFin],
        );

        if (filasReserva.length === 0) {
          throw new ErrorDominio("validacion", "No hay movimientos financieros de reservas en ese periodo para este propietario");
        }
        const moneda = filasReserva[0]!.moneda;

        const entradas: EntradaMovimientoReserva[] = [];
        for (const fr of filasReserva) {
          const gastos = await cliente.query(
            "SELECT tipo, descripcion, monto_centavos FROM linea_gasto WHERE reserva_financiero_id = $1",
            [fr.id],
          );
          const impuestos = await cliente.query(
            "SELECT tipo, monto_centavos, nota FROM linea_impuesto WHERE reserva_financiero_id = $1",
            [fr.id],
          );
          entradas.push({
            ocupacionUnidadId: fr.ocupacion_id,
            moneda: fr.moneda,
            montoBrutoCentavos: Number(fr.monto_bruto_centavos),
            comisionCanal: {
              yaNetoDeComision: fr.ya_neto_de_comision,
              comisionBasisPoints: fr.comision_canal_basis_points,
              fuente: fr.comision_canal_fuente,
            },
            comisionGestor: { basisPoints: fr.comision_gestor_basis_points, base: fr.comision_gestor_base },
            gastos: gastos.rows.map((g) => ({ tipo: g.tipo, descripcion: g.descripcion, montoCentavos: Number(g.monto_centavos) })),
            impuestos: impuestos.rows.map((i) => ({ tipo: i.tipo, montoCentavos: Number(i.monto_centavos), nota: i.nota })),
          });
        }

        const calculado = generarOwnerStatement({
          ownerId: cuerpo.ownerId,
          periodo: { inicio: cuerpo.periodoInicio, fin: cuerpo.periodoFin },
          moneda,
          reservas: entradas,
        });

        const versionAnterior = await cliente.query<{ version: number; hash_contenido: string }>(
          `SELECT version, hash_contenido FROM owner_statement
           WHERE owner_id = $1 AND periodo_inicio = $2 AND periodo_fin = $3
           ORDER BY version DESC LIMIT 1`,
          [cuerpo.ownerId, cuerpo.periodoInicio, cuerpo.periodoFin],
        );
        const anterior = versionAnterior.rows[0] ?? null;

        if (esMismoContenidoQueVersionAnterior(calculado, anterior?.hash_contenido ?? null)) {
          const { rows } = await cliente.query("SELECT id FROM owner_statement WHERE owner_id = $1 AND periodo_inicio = $2 AND periodo_fin = $3 AND version = $4", [
            cuerpo.ownerId,
            cuerpo.periodoInicio,
            cuerpo.periodoFin,
            anterior!.version,
          ]);
          return { id: rows[0]!.id, version: anterior!.version, calculado, creado: false };
        }

        const nuevaVersion = (anterior?.version ?? 0) + 1;
        const insertado = await cliente.query<{ id: string }>(
          `INSERT INTO owner_statement
             (owner_id, tenant_id, periodo_inicio, periodo_fin, version, moneda,
              ingresos_brutos_centavos, comision_canal_centavos, comision_gestor_centavos,
              gastos_centavos, impuestos_centavos, neto_centavos, hash_contenido, motivo_version, generado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING id`,
          [
            cuerpo.ownerId,
            owner.rows[0]!.tenant_id,
            cuerpo.periodoInicio,
            cuerpo.periodoFin,
            nuevaVersion,
            calculado.moneda,
            calculado.ingresosBrutosCentavos,
            calculado.comisionCanalCentavos,
            calculado.comisionGestorCentavos,
            calculado.gastosCentavos,
            calculado.impuestosCentavos,
            calculado.netoCentavos,
            calculado.hashContenido,
            cuerpo.motivoVersion ?? null,
            auth.usuarioId,
          ],
        );
        const statementId = insertado.rows[0]!.id;
        for (const linea of calculado.lineas) {
          await cliente.query(
            `INSERT INTO owner_statement_linea (statement_id, ocupacion_unidad_id, tipo, descripcion, monto_centavos, moneda)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [statementId, linea.ocupacionUnidadId, linea.tipo, linea.descripcion, linea.montoCentavos, linea.moneda],
          );
        }
        return { id: statementId, version: nuevaVersion, calculado, creado: true };
      }),
    );

    return c.json(
      {
        id: resultado.id,
        version: resultado.version,
        ...serializarStatement(resultado.calculado),
      },
      resultado.creado ? 201 : 200,
    );
  });

  app.get("/statements", async (c) => {
    const auth = c.get("auth");
    const ownerId = c.req.query("ownerId");
    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT DISTINCT ON (owner_id, periodo_inicio, periodo_fin)
                id, owner_id, periodo_inicio, periodo_fin, version, moneda, neto_centavos, generado_en
         FROM owner_statement
         WHERE $1::uuid IS NULL OR owner_id = $1
         ORDER BY owner_id, periodo_inicio, periodo_fin, version DESC`,
        [ownerId ?? null],
      );
      return rows;
    });
    return c.json({
      statements: filas.map((f) => ({
        id: f.id,
        ownerId: f.owner_id,
        periodoInicio: aFechaIso(f.periodo_inicio),
        periodoFin: aFechaIso(f.periodo_fin),
        version: f.version,
        moneda: f.moneda,
        netoCentavos: Number(f.neto_centavos),
        generadoEn: f.generado_en,
      })),
    });
  });

  app.get("/statements/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<FilaOwnerStatement>("SELECT * FROM owner_statement WHERE id = $1", [id]);
      if (!rows[0]) return null;
      const lineas = await cliente.query<FilaOwnerStatementLinea>(
        "SELECT tipo, descripcion, monto_centavos, moneda, ocupacion_unidad_id FROM owner_statement_linea WHERE statement_id = $1 ORDER BY tipo",
        [id],
      );
      return { statement: rows[0], lineas: lineas.rows };
    });
    if (!resultado) throw new ErrorDominio("recurso_no_encontrado", "Statement no encontrado");
    return c.json(serializarStatementFila(resultado.statement, resultado.lineas));
  });

  // Descarga en dev: HTML imprimible (nunca se pretende un PDF real firmado
  // fiscalmente — esto es evidencia de UI, no un documento fiscal).
  app.get("/statements/:id/descarga", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<FilaOwnerStatement>(
        `SELECT os.*, o.nombre AS owner_nombre FROM owner_statement os JOIN owner o ON o.id = os.owner_id WHERE os.id = $1`,
        [id],
      );
      if (!rows[0]) return null;
      const lineas = await cliente.query<FilaOwnerStatementLinea>(
        "SELECT tipo, descripcion, monto_centavos, moneda FROM owner_statement_linea WHERE statement_id = $1 ORDER BY tipo",
        [id],
      );
      return { statement: rows[0], lineas: lineas.rows };
    });
    if (!resultado) throw new ErrorDominio("recurso_no_encontrado", "Statement no encontrado");

    const html = renderizarStatementHtml(resultado.statement, resultado.lineas);
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="statement-${id}.html"`);
    return c.body(html);
  });

  // ---------------------------------------------------------------------
  // Payouts y conciliación (H-064)
  // ---------------------------------------------------------------------
  app.post("/payouts", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoImportarPayout.parse(await c.req.json());
    if (!auth.tenantId) throw new ErrorDominio("tenant_forbidden", "Se requiere un tenant explícito");

    const montoTotal = cuerpo.lineas.reduce((acc, l) => acc + l.montoCentavos, 0);

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const canal = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = $1", [
          cuerpo.canalCodigo,
        ]);
        if (!canal.rows[0]) throw new ErrorDominio("validacion", `Canal desconocido: "${cuerpo.canalCodigo}"`);

        const payout = await cliente.query<{ id: string }>(
          `INSERT INTO payout_canal (tenant_id, canal_id, referencia_externa, moneda, monto_total_centavos, fecha_payout, origen_importacion, creado_por)
           VALUES ($1, $2, $3, $4, $5, $6, 'csv_vrbo', $7)
           RETURNING id`,
          [auth.tenantId, canal.rows[0].id, cuerpo.referenciaExterna ?? null, cuerpo.moneda, montoTotal, cuerpo.fechaPayout, auth.usuarioId],
        );
        const payoutId = payout.rows[0]!.id;

        const { rows: candidatas } = await cliente.query(
          `SELECT ou.id AS ocupacion_unidad_id, ou.external_id, rf.monto_recibido_centavos
           FROM ocupacion_unidad ou
           JOIN unidad u ON u.id = ou.unidad_id
           JOIN propiedad p ON p.id = u.propiedad_id
           LEFT JOIN reserva_financiero rf ON rf.ocupacion_unidad_id = ou.id
           WHERE p.tenant_id = $1 AND ou.capa = 'reserva' AND ou.canal_origen_id = $2 AND rf.id IS NOT NULL`,
          [auth.tenantId, canal.rows[0].id],
        );
        const reservas: ReservaConciliable[] = candidatas.map((r) => ({
          ocupacionUnidadId: r.ocupacion_unidad_id,
          externalId: r.external_id,
          montoEsperadoCentavos: Number(r.monto_recibido_centavos),
        }));

        const conciliacion = conciliarPayout(
          cuerpo.lineas.map((l) => ({ referenciaExternaReserva: l.referenciaExternaReserva ?? null, montoCentavos: l.montoCentavos })),
          reservas,
        );

        for (const linea of conciliacion) {
          await cliente.query(
            `INSERT INTO payout_linea (payout_id, ocupacion_unidad_id, referencia_externa_reserva, monto_centavos, monto_esperado_centavos, estado_conciliacion, nota)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              payoutId,
              linea.ocupacionUnidadId,
              linea.referenciaExternaReserva,
              linea.montoCentavos,
              linea.montoEsperadoCentavos,
              linea.estado,
              linea.nota,
            ],
          );
        }

        return { payoutId, conciliacion };
      }),
    );

    return c.json(
      {
        id: resultado.payoutId,
        lineas: resultado.conciliacion,
        resumen: {
          conciliadas: resultado.conciliacion.filter((l) => l.estado === "conciliado").length,
          pendientes: resultado.conciliacion.filter((l) => l.estado === "pendiente").length,
          discrepancias: resultado.conciliacion.filter((l) => l.estado === "discrepancia").length,
        },
      },
      201,
    );
  });

  app.get("/payouts/:id", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora", "contador");
    const id = c.req.param("id");
    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query("SELECT * FROM payout_canal WHERE id = $1", [id]);
      if (!rows[0]) return null;
      const lineas = await cliente.query("SELECT * FROM payout_linea WHERE payout_id = $1", [id]);
      return { payout: rows[0], lineas: lineas.rows };
    });
    if (!resultado) throw new ErrorDominio("recurso_no_encontrado", "Payout no encontrado");
    return c.json({
      id: resultado.payout.id,
      canalId: resultado.payout.canal_id,
      montoTotalCentavos: Number(resultado.payout.monto_total_centavos),
      fechaPayout: aFechaIso(resultado.payout.fecha_payout),
      lineas: resultado.lineas.map((l) => ({
        ocupacionUnidadId: l.ocupacion_unidad_id,
        montoCentavos: Number(l.monto_centavos),
        montoEsperadoCentavos: l.monto_esperado_centavos === null ? null : Number(l.monto_esperado_centavos),
        estadoConciliacion: l.estado_conciliacion,
        nota: l.nota,
      })),
    });
  });

  // H-067: alerta de retención (sin calcular impuestos, B-005).
  app.get("/alerta-fiscal/:unidadId", async (c) => {
    const auth = c.get("auth");
    const unidadId = c.req.param("unidadId");
    const rfc = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<{ rfc_propietario: string | null }>(
        "SELECT rfc_propietario FROM unidad WHERE id = $1",
        [unidadId],
      );
      if (!rows[0]) return undefined;
      return rows[0].rfc_propietario;
    });
    if (rfc === undefined) throw new ErrorDominio("recurso_no_encontrado", "Unidad no encontrada");
    return c.json(evaluarAlertaRetencionFiscal(rfc));
  });

  return app;
}

async function buscarReglaComisionCanal(
  cliente: PoolClient,
  params: { canalId: string | null; propiedadId: string | null },
): Promise<{ yaNetoDeComision: boolean; comisionBasisPoints: number; fuente: string }> {
  if (!params.canalId) {
    return {
      yaNetoDeComision: false,
      comisionBasisPoints: 0,
      fuente: "Reserva sin canal de origen (directa) — sin comisión de canal aplicable",
    };
  }
  const { rows } = await cliente.query(
    `SELECT ya_neto_de_comision, comision_basis_points, fuente
     FROM regla_comision_canal
     WHERE canal_id = $1 AND (propiedad_id = $2 OR propiedad_id IS NULL) AND vigente_desde <= CURRENT_DATE
     ORDER BY (propiedad_id IS NOT NULL) DESC, vigente_desde DESC
     LIMIT 1`,
    [params.canalId, params.propiedadId],
  );
  const fila = rows[0];
  if (!fila) {
    return {
      yaNetoDeComision: false,
      comisionBasisPoints: 0,
      fuente: "Sin regla de comisión configurada para este canal — configúrala en Finanzas > Reglas de comisión (RV12 R1/R5)",
    };
  }
  return {
    yaNetoDeComision: fila.ya_neto_de_comision,
    comisionBasisPoints: fila.comision_basis_points,
    fuente: fila.fuente,
  };
}

function serializarMovimiento(m: ReturnType<typeof calcularMovimientoReserva>) {
  return {
    ingresoBrutoCentavos: m.ingresoBrutoCentavos,
    montoRecibidoCentavos: m.montoRecibidoCentavos,
    comisionCanalCentavos: m.comisionCanalCentavos,
    comisionCanalFuente: m.comisionCanalFuente,
    comisionGestorCentavos: m.comisionGestorCentavos,
    gastosCentavos: m.gastosCentavos,
    impuestosCentavos: m.impuestosCentavos,
    netoCentavos: m.netoCentavos,
  };
}

function serializarStatement(s: ReturnType<typeof generarOwnerStatement>) {
  return {
    ownerId: s.ownerId,
    periodo: s.periodo,
    moneda: s.moneda,
    ingresosBrutosCentavos: s.ingresosBrutosCentavos,
    comisionCanalCentavos: s.comisionCanalCentavos,
    comisionGestorCentavos: s.comisionGestorCentavos,
    gastosCentavos: s.gastosCentavos,
    impuestosCentavos: s.impuestosCentavos,
    netoCentavos: s.netoCentavos,
    lineas: s.lineas,
    hashContenido: s.hashContenido,
  };
}

// Auditoría 2, corrección Q-08 (calidad-codigo.md): estas 2 filas de BD
// eran los únicos `any` de todo el repo sobre objetos de dinero — tipadas
// aquí con las columnas reales de `owner_statement`/`owner_statement_linea`
// (packages/db/src/migrations/0050_finanzas_pricing.ts y siguientes).
interface FilaOwnerStatement {
  id: string;
  owner_id: string;
  periodo_inicio: unknown; // Date (parser de pg) — formateada con aFechaIso().
  periodo_fin: unknown;
  version: number;
  moneda: string;
  ingresos_brutos_centavos: string | number;
  comision_canal_centavos: string | number;
  comision_gestor_centavos: string | number;
  gastos_centavos: string | number;
  impuestos_centavos: string | number;
  neto_centavos: string | number;
  generado_en: string;
  /** Solo presente en la consulta de `/statements/:id/descarga` (JOIN con `owner`). */
  owner_nombre?: string;
}

interface FilaOwnerStatementLinea {
  tipo: string;
  descripcion: string | null;
  monto_centavos: string | number;
  moneda: string;
  /** Solo seleccionada en `/statements/:id` (no en `/descarga`). */
  ocupacion_unidad_id?: string | null;
}

function serializarStatementFila(statement: FilaOwnerStatement, lineas: FilaOwnerStatementLinea[]) {
  return {
    id: statement.id,
    ownerId: statement.owner_id,
    periodoInicio: aFechaIso(statement.periodo_inicio),
    periodoFin: aFechaIso(statement.periodo_fin),
    version: statement.version,
    moneda: statement.moneda,
    ingresosBrutosCentavos: Number(statement.ingresos_brutos_centavos),
    comisionCanalCentavos: Number(statement.comision_canal_centavos),
    comisionGestorCentavos: Number(statement.comision_gestor_centavos),
    gastosCentavos: Number(statement.gastos_centavos),
    impuestosCentavos: Number(statement.impuestos_centavos),
    netoCentavos: Number(statement.neto_centavos),
    generadoEn: statement.generado_en,
    lineas: lineas.map((l) => ({
      tipo: l.tipo,
      descripcion: l.descripcion,
      montoCentavos: Number(l.monto_centavos),
      moneda: l.moneda,
      ocupacionUnidadId: l.ocupacion_unidad_id,
    })),
  };
}

/**
 * `pg` parsea columnas `date` como `Date` de JS por defecto — sin esto,
 * `f.vigente_desde`/`statement.periodo_inicio`/etc. se serializarían con un
 * formato distinto a `FechaIso` (YYYY-MM-DD) del contrato. Nunca se toca el
 * parser global de `pg` (`pg.types`) para no afectar a otros lotes que
 * compartan el mismo proceso.
 */
function aFechaIso(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

// Auditoría 2, corrección Q-01: el formateador de dinero vivía duplicado
// aquí (`decimalDeCentavos`, con `Math.round`) mientras `packages/domain`
// ya declaraba uno "canónico" (`decimalDesdeCentavos`, con `Math.trunc`) —
// ver `packages/domain/src/finanzas/redondeo.ts` para el criterio único
// documentado. Se elimina la copia local; el HTML del Owner Statement usa
// la misma función que domain/web.
function renderizarStatementHtml(statement: FilaOwnerStatement, lineas: FilaOwnerStatementLinea[]): string {
  const filas = lineas
    .map(
      (l) =>
        `<tr><td>${escaparHtml(l.tipo)}</td><td>${escaparHtml(l.descripcion ?? "")}</td><td style="text-align:right">${statement.moneda} ${decimalDesdeCentavos(Number(l.monto_centavos))}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Owner Statement ${escaparHtml(statement.id)}</title>
<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#111}table{width:100%;border-collapse:collapse;margin-top:1rem}td,th{border-bottom:1px solid #ddd;padding:.4rem .6rem}h1{font-size:1.25rem}.aviso{background:#fff3cd;border:1px solid #ffe08a;padding:.5rem .75rem;border-radius:.4rem;font-size:.85rem;margin-bottom:1rem}</style>
</head>
<body>
<h1>Owner statement — ${escaparHtml(statement.owner_nombre ?? statement.owner_id)}</h1>
<p>Periodo: ${escaparHtml(aFechaIso(statement.periodo_inicio))} a ${escaparHtml(aFechaIso(statement.periodo_fin))} — versión ${escaparHtml(String(statement.version))}</p>
<div class="aviso">Documento generado por Atiende para revisión operativa — no es un comprobante fiscal (CFDI). Cualquier cifra de impuesto/retención requiere revisión legal/fiscal (B-005).</div>
<table>
<thead><tr><th>Tipo</th><th>Descripción</th><th style="text-align:right">Monto</th></tr></thead>
<tbody>${filas}</tbody>
<tfoot><tr><td colspan="2"><strong>Neto a pagar</strong></td><td style="text-align:right"><strong>${statement.moneda} ${decimalDesdeCentavos(Number(statement.neto_centavos))}</strong></td></tr></tfoot>
</table>
</body>
</html>`;
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
