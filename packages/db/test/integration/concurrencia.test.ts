import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { crearMotorEmbeddedPostgres, type MotorEmbeddedPostgres } from "../../src/runner/motorEmbeddedPostgres.js";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";

/**
 * Pruebas de integración/concurrencia REAL contra `embedded-postgres`
 * (Postgres 18.4, D-009/D-022) — NUNCA contra PGlite, que serializa toda
 * escritura y por tanto no puede validar contención real entre procesos.
 *
 * H-005 / §Calendario-1 punto 1: dos INSERT concurrentes de rangos
 * solapados sobre la misma unidad_id, disparados desde dos conexiones
 * (`pg.Client`) INDEPENDIENTES y en paralelo real (`Promise.allSettled`,
 * no secuencial) — el segundo debe fallar con SQLSTATE 23P01.
 */

let motor: MotorEmbeddedPostgres;
let tenantId: string;

beforeAll(async () => {
  motor = await crearMotorEmbeddedPostgres();
  await aplicarMigraciones(motor.ejecutor, migraciones);
  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant integración') RETURNING id`,
  );
  tenantId = tenant.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await motor.cerrar();
});

async function crearUnidad(nombre: string): Promise<string> {
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, $2, 'America/Mexico_City') RETURNING id`,
    [tenantId, `Propiedad ${nombre}`],
  );
  const unidad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2) RETURNING id`,
    [propiedad.rows[0]!.id, nombre],
  );
  return unidad.rows[0]!.id;
}

/**
 * Inserta una reserva dentro de su propia transacción, tomando primero el
 * advisory lock por unidad (mismo patrón que
 * `packages/domain/src/aplicacion/reservas.ts`, D-012/RV17 §7.4).
 *
 * Nota empírica de esta sesión: SIN el advisory lock, dos INSERT
 * verdaderamente concurrentes (mismo instante, dos conexiones) sobre
 * rangos solapados a veces terminan en `40P01` (deadlock_detected) en vez
 * de `23P01` (exclusion_violation) — comportamiento documentado de
 * PostgreSQL: una inserción espera a que termine cualquier transacción
 * concurrente aún no confirmada cuya fila podría conflictuar, y si dos
 * transacciones se esperan mutuamente, el detector de deadlocks aborta una
 * de las dos con `40P01`. El advisory lock serializa las transacciones que
 * tocan la misma unidad, así que cuando sí hay conflicto, siempre es
 * contra una fila YA confirmada — `23P01` limpio y determinístico, nunca
 * un deadlock. Verificado reproduciendo ambos códigos en esta misma
 * sesión antes de añadir el lock (ver docs/PROGRESO.md).
 */
async function insertarReserva(cliente: pg.Client, unidadId: string, inicio: string, fin: string) {
  await cliente.query("BEGIN");
  try {
    await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [unidadId]);
    const resultado = await cliente.query(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange($2, $3, '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
       RETURNING id`,
      [unidadId, inicio, fin],
    );
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  }
}

describe("H-005 / §Calendario-1: concurrencia real del EXCLUDE contra embedded-postgres", () => {
  it("dos inserciones CONCURRENTES (dos conexiones, Promise.allSettled) de rangos solapados: la segunda falla con 23P01", async () => {
    const unidadId = await crearUnidad("Concurrencia solapada");
    const conexionA = await motor.nuevaConexion();
    const conexionB = await motor.nuevaConexion();

    const [resultadoA, resultadoB] = await Promise.allSettled([
      insertarReserva(conexionA, unidadId, "2026-06-01", "2026-06-05"),
      insertarReserva(conexionB, unidadId, "2026-06-03", "2026-06-07"),
    ]);

    const estados = [resultadoA.status, resultadoB.status];
    expect(estados.filter((s) => s === "fulfilled")).toHaveLength(1);
    expect(estados.filter((s) => s === "rejected")).toHaveLength(1);

    const rechazado = resultadoA.status === "rejected" ? resultadoA : (resultadoB as PromiseRejectedResult);
    const codigoSql = (rechazado.reason as { code?: string; message?: string }).code;
    // Evidencia explícita en el log de CI (H-005/§Calendario-1): el
    // SQLSTATE real devuelto por embedded-postgres para la segunda
    // inserción concurrente solapada.
    console.log(
      `[H-005] segunda inserción concurrente solapada rechazada con SQLSTATE=${codigoSql} ` +
        `(${(rechazado.reason as { message?: string }).message})`,
    );
    expect(codigoSql).toBe("23P01");

    const conteo = await motor.ejecutor.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1`,
      [unidadId],
    );
    expect(conteo.rows[0]!.n).toBe("1");
  });

  it("dos inserciones CONCURRENTES de rangos ADYACENTES: ambas tienen éxito (caso adversarial 15)", async () => {
    const unidadId = await crearUnidad("Concurrencia adyacente");
    const conexionA = await motor.nuevaConexion();
    const conexionB = await motor.nuevaConexion();

    const [resultadoA, resultadoB] = await Promise.allSettled([
      insertarReserva(conexionA, unidadId, "2026-06-01", "2026-06-05"),
      insertarReserva(conexionB, unidadId, "2026-06-05", "2026-06-08"),
    ]);

    expect(resultadoA.status).toBe("fulfilled");
    expect(resultadoB.status).toBe("fulfilled");

    const conteo = await motor.ejecutor.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1`,
      [unidadId],
    );
    expect(conteo.rows[0]!.n).toBe("2");
  });

  it("carrera de 5 conexiones concurrentes por el mismo rango: exactamente una gana", async () => {
    const unidadId = await crearUnidad("Carrera 5 conexiones");
    const conexiones = await Promise.all(Array.from({ length: 5 }, () => motor.nuevaConexion()));

    const resultados = await Promise.allSettled(
      conexiones.map((c) => insertarReserva(c, unidadId, "2026-09-01", "2026-09-05")),
    );

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    const rechazadas = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(exitosas).toHaveLength(1);
    expect(rechazadas).toHaveLength(4);
    console.log(
      `[H-005] carrera de 5 conexiones: 1 ganadora, 4 rechazadas con SQLSTATE=` +
        rechazadas.map((r) => (r.reason as { code?: string }).code).join(","),
    );
    for (const r of rechazadas) {
      expect((r.reason as { code?: string }).code).toBe("23P01");
    }
  });

  it("multi-unidad: inserciones concurrentes en unidades distintas para la misma fecha, ambas OK", async () => {
    const unidadA = await crearUnidad("Multi-unidad A");
    const unidadB = await crearUnidad("Multi-unidad B");
    const conexionA = await motor.nuevaConexion();
    const conexionB = await motor.nuevaConexion();

    const [resultadoA, resultadoB] = await Promise.allSettled([
      insertarReserva(conexionA, unidadA, "2026-10-01", "2026-10-05"),
      insertarReserva(conexionB, unidadB, "2026-10-01", "2026-10-05"),
    ]);

    expect(resultadoA.status).toBe("fulfilled");
    expect(resultadoB.status).toBe("fulfilled");
  });
});
