import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearMotorEmbeddedPostgres, type MotorEmbeddedPostgres } from "../../src/runner/motorEmbeddedPostgres.js";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";
import { EnrutadorLecturaReplica, type PoolConsultable } from "../../src/runner/enrutadorLecturaReplica.js";

/**
 * H-091 — la parte "más real" disponible en este entorno de construcción:
 * DOS clusters `embedded-postgres` REALES e independientes (primario +
 * una segunda base restaurada/sembrada a mano, etiquetada como "réplica
 * SIMULADA de solo lectura" — NUNCA una réplica de streaming real de
 * Postgres, que exige un segundo servidor en modo standby conectado por
 * WAL, imposible de levantar con `embedded-postgres` en este entorno).
 *
 * Lo que SÍ prueba esta suite, contra procesos Postgres reales (no
 * mocks): (a) el enrutador lee de la "réplica" cuando existe y tiene
 * datos distintos al primario — prueba que de verdad es una conexión de
 * red separada, no el mismo objeto; (b) al APAGAR el proceso de la
 * "réplica" (`motor.cerrar()`, un cluster completo, no una función que
 * lanza), una consulta subsiguiente cae al primario ante un error REAL
 * del cliente `pg` ("Client was closed and is not queryable" — el
 * cliente persistente de `motorEmbeddedPostgres.ts` se cierra antes de
 * detener el proceso), no uno simulado.
 *
 * Lo que NO prueba (documentado, no fingido): latencia de replicación,
 * lag de datos entre primario/réplica, ni el comportamiento de un
 * failover de Postgres real.
 */
let primario: MotorEmbeddedPostgres;
let replicaSimulada: MotorEmbeddedPostgres;

beforeAll(async () => {
  primario = await crearMotorEmbeddedPostgres("atiende_rv_primario");
  replicaSimulada = await crearMotorEmbeddedPostgres("atiende_rv_replica_simulada");
  await aplicarMigraciones(primario.ejecutor, migraciones);
  await aplicarMigraciones(replicaSimulada.ejecutor, migraciones);

  // Sembrado manual, NO replicación real: cada cluster recibe un tenant
  // con un nombre DISTINGUIBLE para poder verificar, leyendo, cuál de los
  // dos procesos respondió realmente.
  await primario.ejecutor.query(`INSERT INTO tenant (nombre) VALUES ('Tenant visto por PRIMARIO')`);
  await replicaSimulada.ejecutor.query(`INSERT INTO tenant (nombre) VALUES ('Tenant visto por REPLICA-SIMULADA')`);
}, 120_000);

afterAll(async () => {
  await primario.cerrar();
  // La "réplica" puede haber sido cerrada ya por la propia prueba de
  // fallback — cerrar de nuevo un motor ya cerrado no debe hacer fallar
  // la suite completa.
  await replicaSimulada.cerrar().catch(() => undefined);
});

describe("EnrutadorLecturaReplica contra dos clusters embedded-postgres REALES (H-091)", () => {
  it("con la réplica simulada arriba, consultaSoloLectura lee de ELLA (conexión de red separada del primario)", async () => {
    const enrutador = new EnrutadorLecturaReplica({
      primario: primario.ejecutor as unknown as PoolConsultable,
      replica: replicaSimulada.ejecutor as unknown as PoolConsultable,
    });
    const { rows } = await enrutador.consultaSoloLectura<{ nombre: string }>("SELECT nombre FROM tenant");
    expect(rows.map((r) => r.nombre)).toEqual(["Tenant visto por REPLICA-SIMULADA"]);
  });

  it("al APAGAR el cluster de la réplica (proceso real detenido), el fallback al primario funciona ante un error de conexión REAL", async () => {
    await replicaSimulada.cerrar();

    const enrutador = new EnrutadorLecturaReplica({
      primario: primario.ejecutor as unknown as PoolConsultable,
      replica: replicaSimulada.ejecutor as unknown as PoolConsultable,
      onFallback: (error) => {
        // Documenta en el propio resultado de la prueba que el fallback
        // se disparó por un error de conexión REAL del cliente `pg` tras
        // apagar el proceso Postgres de la réplica — no una excepción de
        // prueba fabricada a mano (mensaje exacto de `pg` para un
        // cliente cuyo socket ya se cerró: "Client was closed and is not
        // queryable").
        expect(String(error)).toMatch(/closed|ECONNREFUSED|Connection terminated|connect|socket/i);
      },
    });

    const { rows } = await enrutador.consultaSoloLectura<{ nombre: string }>("SELECT nombre FROM tenant");
    expect(rows.map((r) => r.nombre)).toEqual(["Tenant visto por PRIMARIO"]);
  });
}, 120_000);
