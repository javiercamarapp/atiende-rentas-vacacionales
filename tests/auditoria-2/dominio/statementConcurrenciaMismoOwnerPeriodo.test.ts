import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  aplicarMigraciones,
  crearMotorEmbeddedPostgres,
  migraciones,
  type MotorEmbeddedPostgres,
} from "@atiende-rv/db";
import {
  esMismoContenidoQueVersionAnterior,
  generarOwnerStatement,
  type EntradaMovimientoReserva,
} from "@atiende-rv/domain/finanzas";

/**
 * Auditoría adversarial independiente (fase 2) — SOLO finanzas/pricing,
 * punto 1d del encargo: idempotencia de generación de owner statement bajo
 * re-ejecución CONCURRENTE real.
 *
 * Función real que genera/persiste (localizada en el código de producto):
 *  - Cálculo puro: packages/domain/src/finanzas/statement.ts
 *    (`generarOwnerStatement` / `esMismoContenidoQueVersionAnterior`).
 *  - Persistencia/orquestación HTTP: `apps/api/src/routes/finanzas.ts`,
 *    handler `POST /statements/generar` (líneas ~283-410): dentro de UNA
 *    transacción (`enTransaccion`, `apps/api/src/db/contexto.ts`, sin
 *    `SELECT ... FOR UPDATE` ni advisory lock ni nivel de aislamiento
 *    SERIALIZABLE) hace `SELECT version, hash_contenido ... ORDER BY
 *    version DESC LIMIT 1`, decide con `esMismoContenidoQueVersionAnterior`
 *    si reusar o crear, y si crea, hace
 *    `INSERT ... version = (anterior?.version ?? 0) + 1`.
 *
 * La única protección real contra duplicados es la restricción
 * `UNIQUE (owner_id, periodo_inicio, periodo_fin, version)` de la
 * migración 0052 — NO hay lock de aplicación (advisory lock) ni
 * SERIALIZABLE ni upsert (`ON CONFLICT`).
 *
 * Esta suite replica EXACTAMENTE esa secuencia SQL (mismas queries, mismo
 * orden, misma decisión de versión) con DOS conexiones reales de
 * `embedded-postgres` disparadas EN PARALELO (`Promise.allSettled`, no
 * secuencial) para el MISMO owner+periodo, y confirma si:
 *  (a) los datos NUNCA se corrompen (el UNIQUE constraint sí lo impide), y
 *  (b) la segunda petición concurrente recibe una respuesta idempotente
 *      "graciosa" (id de la versión ya creada, `creado: false`) — el
 *      comportamiento que el propio comentario de `statement.ts` promete
 *      ("el llamador... decide... si debe crear una versión nueva o
 *      devolver la existente sin duplicar") — en vez de un error de
 *      violación de restricción sin manejar que se propagaría como 500.
 */

let motor: MotorEmbeddedPostgres;
let ownerId: string;
let tenantId: string;
let periodoInicio: string;
let periodoFin: string;

beforeAll(async () => {
  motor = await crearMotorEmbeddedPostgres("atiende_rv_statement_concurrencia_test");
  await aplicarMigraciones(motor.ejecutor, migraciones);

  const tenant = await motor.ejecutor.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('T-Concurrencia-Statement') RETURNING id",
  );
  tenantId = tenant.rows[0]!.id;
  const eg = await motor.ejecutor.query<{ id: string }>(
    "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'EG Concurrencia') RETURNING id",
    [tenantId],
  );
  const owner = await motor.ejecutor.query<{ id: string }>(
    "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner Concurrencia') RETURNING id",
    [eg.rows[0]!.id],
  );
  ownerId = owner.rows[0]!.id;
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria, moneda) VALUES ($1, 'Prop Concurrencia', 'America/Cancun', 'MXN') RETURNING id",
    [tenantId],
  );
  const unidad = await motor.ejecutor.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad Concurrencia') RETURNING id",
    [propiedad.rows[0]!.id, ownerId],
  );
  const ocupacion = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2026-11-01', '2026-11-05', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
     RETURNING id`,
    [unidad.rows[0]!.id],
  );
  await motor.ejecutor.query(
    `INSERT INTO reserva_financiero
       (ocupacion_unidad_id, moneda, monto_bruto_centavos, ya_neto_de_comision,
        comision_canal_basis_points, comision_canal_fuente,
        comision_gestor_basis_points, comision_gestor_base,
        monto_recibido_centavos, neto_centavos)
     VALUES ($1, 'MXN', 500000, true, 0, 'Airbnb host-only', 1000, 'neto_de_canal', 500000, 450000)`,
    [ocupacion.rows[0]!.id],
  );

  periodoInicio = "2026-11-01";
  periodoFin = "2026-12-01";
}, 120_000);

afterAll(async () => {
  await motor.cerrar();
});

/**
 * Réplica fiel de la secuencia de `POST /statements/generar`
 * (apps/api/src/routes/finanzas.ts líneas 291-401), usando una conexión
 * `pg.Client` propia (transacción real e independiente) para simular una
 * request HTTP concurrente distinta.
 */
async function generarStatementComoLoHaceLaRuta(cliente: pg.Client): Promise<{ id: string; version: number; creado: boolean }> {
  await cliente.query("BEGIN");
  try {
    const { rows: filasReserva } = await cliente.query(
      `SELECT rf.*, ou.id AS ocupacion_id
       FROM reserva_financiero rf
       JOIN ocupacion_unidad ou ON ou.id = rf.ocupacion_unidad_id
       JOIN unidad un ON un.id = ou.unidad_id
       WHERE un.owner_id = $1
         AND upper(ou.rango) >= $2::date AND upper(ou.rango) < $3::date
         AND ou.estado <> 'cancelado'
       ORDER BY ou.id`,
      [ownerId, periodoInicio, periodoFin],
    );
    const moneda = filasReserva[0]!.moneda;
    const entradas: EntradaMovimientoReserva[] = filasReserva.map((fr) => ({
      ocupacionUnidadId: fr.ocupacion_id,
      moneda: fr.moneda,
      montoBrutoCentavos: Number(fr.monto_bruto_centavos),
      comisionCanal: {
        yaNetoDeComision: fr.ya_neto_de_comision,
        comisionBasisPoints: fr.comision_canal_basis_points,
        fuente: fr.comision_canal_fuente,
      },
      comisionGestor: { basisPoints: fr.comision_gestor_basis_points, base: fr.comision_gestor_base },
      gastos: [],
      impuestos: [],
    }));

    const calculado = generarOwnerStatement({
      ownerId,
      periodo: { inicio: periodoInicio, fin: periodoFin },
      moneda,
      reservas: entradas,
    });

    // Punto crítico de la carrera: SELECT sin FOR UPDATE, sin advisory
    // lock, aislamiento por defecto (READ COMMITTED) — dos transacciones
    // concurrentes pueden leer AMBAS "no existe versión anterior" antes de
    // que cualquiera haga commit.
    const versionAnterior = await cliente.query<{ version: number; hash_contenido: string }>(
      `SELECT version, hash_contenido FROM owner_statement
       WHERE owner_id = $1 AND periodo_inicio = $2 AND periodo_fin = $3
       ORDER BY version DESC LIMIT 1`,
      [ownerId, periodoInicio, periodoFin],
    );
    const anterior = versionAnterior.rows[0] ?? null;

    if (esMismoContenidoQueVersionAnterior(calculado, anterior?.hash_contenido ?? null)) {
      const { rows } = await cliente.query(
        `SELECT id FROM owner_statement WHERE owner_id = $1 AND periodo_inicio = $2 AND periodo_fin = $3 AND version = $4`,
        [ownerId, periodoInicio, periodoFin, anterior!.version],
      );
      await cliente.query("COMMIT");
      return { id: rows[0]!.id, version: anterior!.version, creado: false };
    }

    const nuevaVersion = (anterior?.version ?? 0) + 1;
    const insertado = await cliente.query<{ id: string }>(
      `INSERT INTO owner_statement
         (owner_id, tenant_id, periodo_inicio, periodo_fin, version, moneda,
          ingresos_brutos_centavos, comision_canal_centavos, comision_gestor_centavos,
          gastos_centavos, impuestos_centavos, neto_centavos, hash_contenido)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        ownerId,
        tenantId,
        periodoInicio,
        periodoFin,
        nuevaVersion,
        calculado.moneda,
        calculado.ingresosBrutosCentavos,
        calculado.comisionCanalCentavos,
        calculado.comisionGestorCentavos,
        calculado.gastosCentavos,
        calculado.impuestosCentavos,
        calculado.netoCentavos,
        calculado.hashContenido,
      ],
    );
    await cliente.query("COMMIT");
    return { id: insertado.rows[0]!.id, version: nuevaVersion, creado: true };
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

describe("1d: generación concurrente del mismo owner statement (mismo owner+periodo, dos conexiones reales en paralelo)", () => {
  it("nunca corrompe los datos: como máximo una fila persiste para (owner, periodo, version=1)", async () => {
    const clienteA = await motor.nuevaConexion();
    const clienteB = await motor.nuevaConexion();

    const resultados = await Promise.allSettled([
      generarStatementComoLoHaceLaRuta(clienteA),
      generarStatementComoLoHaceLaRuta(clienteB),
    ]);

    const { rows } = await motor.ejecutor.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM owner_statement WHERE owner_id = $1 AND periodo_inicio = $2 AND periodo_fin = $3`,
      [ownerId, periodoInicio, periodoFin],
    );
    // Esto SÍ debe sostenerse: el UNIQUE constraint de 0052 impide una
    // segunda fila con la misma versión — no hay duplicación de datos.
    expect(Number(rows[0]!.count)).toBe(1);

    // Pero la garantía de PRODUCTO prometida es más fuerte que "no hay
    // datos corruptos": ambas peticiones concurrentes deberían resolver
    // exitosamente (una crea, la otra detecta la versión ya creada y la
    // reusa) — nunca debería haber un rechazo/excepción sin manejar
    // propagándose al llamador HTTP como un error 500.
    const rechazadas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rechazadas.length > 0) {
      // Evidencia para el reporte de auditoría: el rechazo real es un
      // 23505 (unique_violation) de Postgres, sin manejar por la capa de
      // aplicación — se propagaría tal cual como un error 500 al cliente
      // HTTP que perdió la carrera.
      // eslint-disable-next-line no-console
      console.log("EVIDENCIA rechazo concurrente (code/message):", rechazadas[0]!.reason?.code, rechazadas[0]!.reason?.message);
    }
    expect(rechazadas).toHaveLength(0);
  }, 120_000);
});
