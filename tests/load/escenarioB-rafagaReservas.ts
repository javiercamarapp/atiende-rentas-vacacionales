import { aplicarMigraciones, crearMotorEmbeddedPostgres, migraciones } from "@atiende-rv/db";
import { emitirResultado, infoHardware, resumenLatencias } from "./comun.js";

/**
 * Escenario (b) — BACKLOG H-093: ráfaga de reservas DIRECTAS concurrentes
 * sobre la MISMA unidad, mismo rango de fechas. Extiende a escala (N
 * conexiones simultáneas) el entregable verificable de H-005/Lote 1
 * (`packages/db/test/integration/concurrencia.test.ts`, que prueba
 * exactamente esto con 2 conexiones): OWASP ASVS 2.3.4 exige verificación
 * activa contra doble-reserva bajo condición de carrera real, no solo con
 * 2 actores.
 *
 * Este escenario usa el mismo patrón SQL con `pg_advisory_xact_lock` +
 * `SAVEPOINT` que `packages/domain/src/aplicacion/ejecutor.ts`
 * (`bloquearUnidadEnTransaccion`) para demostrar la propiedad real bajo
 * carga: EXACTAMENTE una transacción gana, TODAS las demás fallan con
 * `23P01` (exclusion_violation) — nunca `40P01` (deadlock) — y CERO
 * deadlocks bajo N-way real concurrency.
 *
 * Uso: tsx tests/load/escenarioB-rafagaReservas.ts [nConcurrentes]
 */

const N_CONCURRENTES = Number(process.argv[2] ?? 30);

async function insertarConLock(cliente: Awaited<ReturnType<Awaited<ReturnType<typeof crearMotorEmbeddedPostgres>>["nuevaConexion"]>>, unidadId: string, inicio: string, fin: string) {
  const t0 = Date.now();
  await cliente.query("BEGIN");
  try {
    await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [unidadId]);
    await cliente.query(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange($2, $3, '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
      [unidadId, inicio, fin],
    );
    await cliente.query("COMMIT");
    return { ok: true, codigoSql: null, latenciaMs: Date.now() - t0 };
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    const codigoSql = (error as { code?: string }).code ?? "desconocido";
    return { ok: false, codigoSql, latenciaMs: Date.now() - t0 };
  }
}

async function main() {
  const motor = await crearMotorEmbeddedPostgres("atiende_rv_load_rafaga");
  await aplicarMigraciones(motor.ejecutor, migraciones);

  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant carga ráfaga') RETURNING id`,
  );
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop ráfaga', 'America/Mexico_City') RETURNING id`,
    [tenant.rows[0]!.id],
  );
  const unidad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, 'Unidad ráfaga', 1) RETURNING id`,
    [propiedad.rows[0]!.id],
  );
  const unidadId = unidad.rows[0]!.id;

  // N conexiones REALES independientes, todas apuntando al MISMO rango de
  // fechas de la MISMA unidad — la condición de carrera más dura posible
  // (ASVS 2.3.4).
  const conexiones = await Promise.all(Array.from({ length: N_CONCURRENTES }, () => motor.nuevaConexion()));

  const inicioTotal = Date.now();
  const resultados = await Promise.allSettled(
    conexiones.map((c) => insertarConLock(c, unidadId, "2028-06-01", "2028-06-05")),
  );
  const duracionTotalMs = Date.now() - inicioTotal;

  await Promise.all(conexiones.map((c) => c.end()));

  const liquidados = resultados.map((r) => (r.status === "fulfilled" ? r.value : { ok: false, codigoSql: "promesa_rechazada", latenciaMs: NaN }));
  const ganadores = liquidados.filter((r) => r.ok);
  const perdedores = liquidados.filter((r) => !r.ok);
  const codigosSqlDeLosPerdedores = new Set(perdedores.map((r) => r.codigoSql));
  const deadlocks = perdedores.filter((r) => r.codigoSql === "40P01").length;
  const exclusionViolations = perdedores.filter((r) => r.codigoSql === "23P01").length;

  const conteoFinal = await motor.ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
    [unidadId],
  );

  await motor.cerrar();

  emitirResultado({
    escenario: "B-rafaga-reservas-directas",
    supuestos: [
      "N conexiones pg INDEPENDIENTES compitiendo por el MISMO rango de la MISMA unidad — el peor caso de contención posible, no una ráfaga de tráfico distribuido entre muchas unidades (eso es más parecido al escenario A).",
      "Se usa el patrón SQL crudo con pg_advisory_xact_lock + INSERT directo (mismo patrón que packages/db/test/integration/concurrencia.test.ts, H-005) para observar el código SQLSTATE crudo (23P01) — la capa de dominio (crearReservaConfirmada) CONVIERTE ese 23P01 en un resultado 'conflicto_pendiente' sin excepción visible al llamador (ver tests/adversarial/calendario/casos.test.ts, caso 2); este escenario mide el comportamiento de la BASE DE DATOS bajo contención real, no el envoltorio de aplicación.",
    ],
    parametros: { conexionesConcurrentes: N_CONCURRENTES },
    hardware: infoHardware(),
    duracionTotalMs,
    latenciaTransaccionMs: resumenLatencias(liquidados.filter((r) => Number.isFinite(r.latenciaMs)).map((r) => r.latenciaMs)),
    ganadores: ganadores.length,
    perdedores: perdedores.length,
    codigosSqlDeLosPerdedores: [...codigosSqlDeLosPerdedores],
    deadlocksDetectados: deadlocks,
    exclusionViolationsDetectadas: exclusionViolations,
    filasActivasFinales: Number(conteoFinal.rows[0]!.n),
    exactamenteUnGanador: ganadores.length === 1,
    sinDeadlocks: deadlocks === 0,
  });
}

main().catch((error) => {
  console.error("[escenarioB-rafagaReservas] error fatal:", error);
  process.exit(1);
});
