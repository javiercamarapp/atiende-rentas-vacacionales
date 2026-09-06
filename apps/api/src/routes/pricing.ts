import { Hono } from "hono";
import type pg from "pg";
import { esRangoValido } from "@atiende-rv/domain";
import {
  calcularCotizacion,
  detectarViolacionesParidad,
  evaluarPublicacionTarifa,
  requiereDesactivarPricingNativo,
} from "@atiende-rv/domain/pricing";
import type { ContextoPricingUnidad, PrecioPublicadoCanal, ReglaCanal } from "@atiende-rv/domain/pricing";
import {
  CuerpoCotizar,
  CuerpoDescuentoDuracion,
  CuerpoMinStay,
  CuerpoParidad,
  CuerpoReglaCanalPricing,
  CuerpoTarifaBase,
  CuerpoTarifaTemporada,
  ErrorDominio,
} from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { ROLES_ADMIN } from "../rolesComunes.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import { crearAdaptadorCorreo } from "../workers/notificaciones/adaptadorCorreo.js";
import { despacharNotificacion } from "../workers/notificaciones/dispatcher.js";

/**
 * Pricing básico (Lote 7, BACKLOG E11, RV13). Reglas no negociables:
 * - RV13-R-01/H-069: publicar tarifas SOLO hacia adaptadores con
 *   `ratesPush: true`. `CAPACIDADES_CANAL_CONOCIDAS` refleja el estado REAL
 *   de Fase 2 (Lote 2): ningún canal declara esa capacidad todavía — iCal
 *   nunca transporta tarifas (RV13 §3). Este mapa se actualiza únicamente
 *   cuando un adaptador REAL (packages/adapters) declare la capacidad, no
 *   antes, y nunca a partir de un simulador (D-019).
 * - H-068: `calcularCotizacion` (packages/domain/pricing) es la única
 *   fuente de verdad para el precio — esta ruta solo carga el contexto de
 *   BD y expone el resultado, nunca reimplementa el cálculo.
 */
const CAPACIDADES_CANAL_CONOCIDAS: Record<string, { ratesPush: boolean }> = {
  airbnb: { ratesPush: false },
  vrbo: { ratesPush: false },
  booking: { ratesPush: false },
  manual: { ratesPush: false },
};

export function crearRutasPricing(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/unidades/:unidadId", async (c) => {
    const auth = c.get("auth");
    const unidadId = c.req.param("unidadId");
    const contexto = await conSesion(pool, sesionDeAuth(auth), (cliente) => cargarContextoPricing(cliente, unidadId));
    if (!contexto) throw new ErrorDominio("recurso_no_encontrado", "Unidad no encontrada o sin tarifa base configurada");
    return c.json(serializarContexto(contexto));
  });

  app.post("/unidades/:unidadId/base", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const unidadId = c.req.param("unidadId");
    const cuerpo = CuerpoTarifaBase.parse(await c.req.json());
    await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        await cliente.query(
          `INSERT INTO tarifa_base (unidad_id, precio_noche_centavos, moneda, vigente_desde, creado_por)
           VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
           ON CONFLICT (unidad_id, vigente_desde) DO UPDATE SET precio_noche_centavos = EXCLUDED.precio_noche_centavos, moneda = EXCLUDED.moneda`,
          [unidadId, cuerpo.precioNocheCentavos, cuerpo.moneda, cuerpo.vigenteDesde ?? null, auth.usuarioId],
        );
      }),
    );
    return c.json({ ok: true }, 201);
  });

  app.post("/unidades/:unidadId/temporadas", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const unidadId = c.req.param("unidadId");
    const cuerpo = CuerpoTarifaTemporada.parse(await c.req.json());
    if (!esRangoValido(cuerpo.rango)) throw new ErrorDominio("rango_invalido", "El rango de la temporada debe cumplir inicio < fin");
    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        const { rows } = await cliente.query<{ id: string }>(
          `INSERT INTO tarifa_temporada (unidad_id, nombre, fecha_inicio, fecha_fin, precio_noche_centavos, moneda, creado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [unidadId, cuerpo.nombre, cuerpo.rango.inicio, cuerpo.rango.fin, cuerpo.precioNocheCentavos, cuerpo.moneda, auth.usuarioId],
        );
        return rows[0]!;
      }),
    );
    return c.json({ id: fila.id }, 201);
  });

  app.post("/unidades/:unidadId/descuentos-duracion", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const unidadId = c.req.param("unidadId");
    const cuerpo = CuerpoDescuentoDuracion.parse(await c.req.json());
    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        const { rows } = await cliente.query<{ id: string }>(
          `INSERT INTO tarifa_descuento_duracion (unidad_id, noches_minimas, porcentaje_descuento_basis_points, fuente)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (unidad_id, noches_minimas) DO UPDATE SET porcentaje_descuento_basis_points = EXCLUDED.porcentaje_descuento_basis_points, fuente = EXCLUDED.fuente
           RETURNING id`,
          [unidadId, cuerpo.nochesMinimas, cuerpo.porcentajeDescuentoBasisPoints, cuerpo.fuente],
        );
        return rows[0]!;
      }),
    );
    return c.json({ id: fila.id }, 201);
  });

  app.post("/unidades/:unidadId/min-stay", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const unidadId = c.req.param("unidadId");
    const cuerpo = CuerpoMinStay.parse(await c.req.json());
    if (!esRangoValido(cuerpo.rango)) throw new ErrorDominio("rango_invalido", "El rango de min-stay debe cumplir inicio < fin");
    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        const { rows } = await cliente.query<{ id: string }>(
          `INSERT INTO tarifa_min_stay (unidad_id, fecha_inicio, fecha_fin, dia_semana_checkin, noches_minimas)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [unidadId, cuerpo.rango.inicio, cuerpo.rango.fin, cuerpo.diaSemanaCheckIn, cuerpo.nochesMinimas],
        );
        return rows[0]!;
      }),
    );
    return c.json({ id: fila.id }, 201);
  });

  app.post("/unidades/:unidadId/reglas-canal", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const unidadId = c.req.param("unidadId");
    const cuerpo = CuerpoReglaCanalPricing.parse(await c.req.json());
    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      enTransaccion(cliente, async () => {
        const canal = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = $1", [cuerpo.canalCodigo]);
        if (!canal.rows[0]) throw new ErrorDominio("validacion", `Canal desconocido: "${cuerpo.canalCodigo}"`);
        const { rows } = await cliente.query<{ id: string }>(
          `INSERT INTO tarifa_regla_canal (unidad_id, canal_id, markup_basis_points, activo)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (unidad_id, canal_id) DO UPDATE SET markup_basis_points = EXCLUDED.markup_basis_points, activo = EXCLUDED.activo
           RETURNING id`,
          [unidadId, canal.rows[0].id, cuerpo.markupBasisPoints, cuerpo.activo],
        );
        return rows[0]!;
      }),
    );
    return c.json({ id: fila.id, avisoDesactivarNativo: cuerpo.activo ? requiereDesactivarPricingNativo(cuerpo.canalCodigo) : null }, 201);
  });

  // H-069/H-070: nunca publica nada — solo evalúa si SE PODRÍA publicar y
  // por qué (mensaje literal para la UI, RV13 §3).
  app.get("/unidades/:unidadId/publicacion/:canalCodigo", (c) => {
    const canalCodigo = c.req.param("canalCodigo");
    const capacidades = CAPACIDADES_CANAL_CONOCIDAS[canalCodigo] ?? null;
    const evaluacion = evaluarPublicacionTarifa(
      canalCodigo,
      capacidades
        ? { availabilityPush: true, ratesPush: capacidades.ratesPush, reservationsPull: true, icalImportExport: true, messaging: false }
        : null,
    );
    return c.json(evaluacion);
  });

  // H-071 (RV13-R-04/R-06): comparador de paridad de precios entre
  // canales. `precios` es SIEMPRE dato de entrada del usuario (ningún
  // canal real de Fase 2 declara `ratesPush`, así que no hay integración
  // que "importe" el precio publicado — ver CAPACIDADES_CANAL_CONOCIDAS
  // arriba). Solo detecta y, si hay violaciones, las registra como
  // `alerta` (tipo 'paridad_precio', migración 0111) para que aparezcan
  // en el monitor de alertas — NUNCA publica ni modifica ninguna tarifa.
  app.post("/unidades/:unidadId/paridad", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const unidadId = c.req.param("unidadId");
    const cuerpo = CuerpoParidad.parse(await c.req.json());

    const entradas: PrecioPublicadoCanal[] = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const resultado: PrecioPublicadoCanal[] = [];
      for (const precio of cuerpo.precios) {
        const { rows } = await cliente.query<{ markup_basis_points: number; activo: boolean }>(
          `SELECT trc.markup_basis_points, trc.activo FROM tarifa_regla_canal trc
           JOIN canal ca ON ca.id = trc.canal_id
           WHERE trc.unidad_id = $1 AND ca.codigo = $2`,
          [unidadId, precio.canalCodigo],
        );
        resultado.push({
          canalCodigo: precio.canalCodigo,
          precioNocheCentavos: precio.precioNocheCentavos,
          reglaCanal: rows[0]
            ? { canalCodigo: precio.canalCodigo, markupBasisPoints: rows[0].markup_basis_points, activo: rows[0].activo }
            : null,
        });
      }
      return resultado;
    });

    const violaciones = detectarViolacionesParidad(entradas, {
      precioReferenciaNocheCentavos: cuerpo.precioReferenciaNocheCentavos,
      toleranciaBasisPoints: cuerpo.toleranciaBasisPoints,
    });

    if (violaciones.length > 0) {
      await conSesion(pool, sesionDeAuth(auth), (cliente) =>
        enTransaccion(cliente, async () => {
          for (const violacion of violaciones) {
            const magnitud = Math.abs(violacion.diferenciaBasisPoints);
            const severidad = magnitud >= 500 ? "alta" : magnitud >= 200 ? "media" : "baja";
            const canal = await cliente.query<{ id: string }>("SELECT id FROM canal WHERE codigo = $1", [violacion.canalCodigo]);
            await cliente.query(
              `INSERT INTO alerta (tipo, severidad, canal_id, unidad_id, mensaje, metadata)
               VALUES ('paridad_precio', $1, $2, $3, $4, $5)`,
              [
                severidad,
                canal.rows[0]?.id ?? null,
                unidadId,
                violacion.propuesta.mensaje,
                JSON.stringify({
                  diferenciaBasisPoints: violacion.diferenciaBasisPoints,
                  precioReferenciaNocheCentavos: violacion.precioReferenciaNocheCentavos,
                  precioEsperadoNocheCentavos: violacion.precioEsperadoNocheCentavos,
                  precioPublicadoNocheCentavos: violacion.precioPublicadoNocheCentavos,
                  precioPropuestoNocheCentavos: violacion.propuesta.precioPropuestoNocheCentavos,
                }),
              ],
            );
          }
        }),
      );

      // H-054: además de la fila in-app ya insertada arriba, se ofrece el
      // abanico correo/webhook al usuario que disparó la comparación —
      // best-effort deliberado (nunca puede tumbar esta respuesta 200 ya
      // calculada; un fallo de correo/webhook solo se ignora, no se
      // reintenta desde aquí).
      try {
        const usuarioFila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
          cliente.query<{ email: string }>("SELECT email FROM usuario WHERE id = $1", [auth.usuarioId]),
        );
        const email = usuarioFila.rows[0]?.email;
        if (email) {
          await conSesion(pool, sesionDeAuth(auth), (cliente) =>
            despacharNotificacion(
              { ejecutor: cliente, adaptadorCorreo: crearAdaptadorCorreo() },
              {
                usuarioId: auth.usuarioId,
                usuarioEmail: email,
                tenantId: auth.tenantId,
                contenido: {
                  tipoEvento: "paridad_precio",
                  titulo: `${violaciones.length} violación(es) de paridad de precios detectada(s)`,
                  cuerpoTexto: violaciones.map((v) => v.propuesta.mensaje).join(" · "),
                  metadata: { unidadId, violaciones: violaciones.length },
                },
              },
            ),
          );
        }
      } catch {
        // best-effort: nunca falla la respuesta HTTP por un problema de
        // correo/webhook — la fila in-app ya quedó persistida arriba.
      }
    }

    return c.json({ violaciones, alertasGeneradas: violaciones.length });
  });

  // H-068: cotización determinista para reserva directa.
  app.post("/cotizar", async (c) => {
    const auth = c.get("auth");
    const cuerpo = CuerpoCotizar.parse(await c.req.json());
    if (!esRangoValido(cuerpo.rango)) throw new ErrorDominio("rango_invalido", "El rango de cotización debe cumplir inicio < fin");

    const contexto = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cargarContextoPricing(cliente, cuerpo.unidadId),
    );
    if (!contexto) throw new ErrorDominio("recurso_no_encontrado", "Unidad no encontrada o sin tarifa base configurada");

    let reglaCanal: ReglaCanal | null = null;
    if (cuerpo.canalCodigo) {
      reglaCanal = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
        const { rows } = await cliente.query<{ markup_basis_points: number; activo: boolean }>(
          `SELECT trc.markup_basis_points, trc.activo FROM tarifa_regla_canal trc
           JOIN canal ca ON ca.id = trc.canal_id
           WHERE trc.unidad_id = $1 AND ca.codigo = $2`,
          [cuerpo.unidadId, cuerpo.canalCodigo],
        );
        if (!rows[0]) return null;
        return { canalCodigo: cuerpo.canalCodigo!, markupBasisPoints: rows[0].markup_basis_points, activo: rows[0].activo };
      });
    }

    let resultado;
    try {
      resultado = calcularCotizacion({ contexto, rango: cuerpo.rango, reglaCanal });
    } catch (error) {
      throw new ErrorDominio("rango_invalido", error instanceof Error ? error.message : "No se pudo cotizar");
    }
    return c.json(resultado);
  });

  return app;
}

/**
 * `pg` parsea columnas `date` como `Date` de JS por defecto (no como texto)
 * — sin un `::text` explícito en el SQL, `Temporal.PlainDate.from(...)` de
 * packages/domain fallaría o interpretaría mal la fecha. Se castea aquí
 * (una sola función, en vez de repetir `::text` en cada columna de cada
 * SELECT) para tolerar ambas formas sin depender del parser global de
 * `pg` (nunca se toca `pg.types` a nivel de proceso — otros lotes podrían
 * depender del comportamiento por defecto).
 */
function aFechaIso(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

async function cargarContextoPricing(
  cliente: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  unidadId: string,
): Promise<ContextoPricingUnidad | null> {
  const base = await cliente.query(
    "SELECT precio_noche_centavos, moneda FROM tarifa_base WHERE unidad_id = $1 AND vigente_desde <= CURRENT_DATE ORDER BY vigente_desde DESC LIMIT 1",
    [unidadId],
  );
  if (base.rows.length === 0) return null;
  const filaBase = base.rows[0] as { precio_noche_centavos: number; moneda: string };

  const temporadas = await cliente.query(
    "SELECT nombre, fecha_inicio, fecha_fin, precio_noche_centavos FROM tarifa_temporada WHERE unidad_id = $1",
    [unidadId],
  );
  const descuentos = await cliente.query(
    "SELECT noches_minimas, porcentaje_descuento_basis_points, fuente FROM tarifa_descuento_duracion WHERE unidad_id = $1",
    [unidadId],
  );
  const minStay = await cliente.query(
    "SELECT fecha_inicio, fecha_fin, dia_semana_checkin, noches_minimas FROM tarifa_min_stay WHERE unidad_id = $1",
    [unidadId],
  );

  return {
    unidadId,
    moneda: filaBase.moneda,
    precioBaseNocheCentavos: Number(filaBase.precio_noche_centavos),
    temporadas: (temporadas.rows as Record<string, unknown>[]).map((t) => ({
      nombre: t.nombre as string,
      rango: { inicio: aFechaIso(t.fecha_inicio), fin: aFechaIso(t.fecha_fin) },
      precioNocheCentavos: Number(t.precio_noche_centavos),
    })),
    descuentosDuracion: (descuentos.rows as Record<string, unknown>[]).map((d) => ({
      nochesMinimas: Number(d.noches_minimas),
      porcentajeDescuentoBasisPoints: Number(d.porcentaje_descuento_basis_points),
      fuente: d.fuente as string,
    })),
    reglasMinStay: (minStay.rows as Record<string, unknown>[]).map((m) => ({
      rango: { inicio: aFechaIso(m.fecha_inicio), fin: aFechaIso(m.fecha_fin) },
      diaSemanaCheckIn: m.dia_semana_checkin === null ? null : Number(m.dia_semana_checkin),
      nochesMinimas: Number(m.noches_minimas),
    })),
  };
}

function serializarContexto(contexto: ContextoPricingUnidad) {
  return contexto;
}
