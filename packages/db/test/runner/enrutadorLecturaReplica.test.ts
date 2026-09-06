import { describe, expect, it, vi } from "vitest";
import { EnrutadorLecturaReplica, leerUrlReplicaDesdeEntorno, type PoolConsultable } from "../../src/runner/enrutadorLecturaReplica.js";

function poolFalso(comportamiento: "ok" | "falla"): PoolConsultable & { llamadas: number } {
  const pool = {
    llamadas: 0,
    async query<T>(_sql: string, _params?: unknown[]) {
      pool.llamadas++;
      if (comportamiento === "falla") throw new Error("réplica caída (simulado)");
      return { rows: [] as T[] };
    },
  };
  return pool;
}

/**
 * H-091: estas pruebas ejercitan el ENRUTADOR con dos pools FALSOS
 * inyectados — nunca contra una réplica de streaming real (no disponible
 * en este entorno de construcción, ver comentario de cabecera del
 * módulo). Documentan el comportamiento de fallback, no la replicación.
 */
describe("EnrutadorLecturaReplica — H-091 (enrutamiento + fallback, sin réplica real)", () => {
  it("sin réplica configurada (replica: null), consultaSoloLectura va siempre al primario", async () => {
    const primario = poolFalso("ok");
    const enrutador = new EnrutadorLecturaReplica({ primario, replica: null });
    await enrutador.consultaSoloLectura("SELECT 1");
    expect(primario.llamadas).toBe(1);
    expect(enrutador.tieneReplica).toBe(false);
  });

  it("con réplica configurada y funcionando, consultaSoloLectura va a la réplica — el primario NUNCA se toca", async () => {
    const primario = poolFalso("ok");
    const replica = poolFalso("ok");
    const enrutador = new EnrutadorLecturaReplica({ primario, replica });
    await enrutador.consultaSoloLectura("SELECT 1");
    expect(replica.llamadas).toBe(1);
    expect(primario.llamadas).toBe(0);
    expect(enrutador.tieneReplica).toBe(true);
  });

  it("si la réplica falla, cae automáticamente al primario — nunca propaga el error de la réplica", async () => {
    const primario = poolFalso("ok");
    const replica = poolFalso("falla");
    const enrutador = new EnrutadorLecturaReplica({ primario, replica });
    await expect(enrutador.consultaSoloLectura("SELECT 1")).resolves.toEqual({ rows: [] });
    expect(replica.llamadas).toBe(1);
    expect(primario.llamadas).toBe(1);
  });

  it("el fallback invoca onFallback con el error original, sin lanzar", async () => {
    const primario = poolFalso("ok");
    const replica = poolFalso("falla");
    const onFallback = vi.fn();
    const enrutador = new EnrutadorLecturaReplica({ primario, replica, onFallback });
    await enrutador.consultaSoloLectura("SELECT 1");
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect((onFallback.mock.calls[0]![0] as Error).message).toContain("réplica caída");
  });

  it("si TANTO la réplica como el primario fallan, el error del primario SÍ se propaga (no hay tercer nivel)", async () => {
    const primario = poolFalso("falla");
    const replica = poolFalso("falla");
    const enrutador = new EnrutadorLecturaReplica({ primario, replica });
    await expect(enrutador.consultaSoloLectura("SELECT 1")).rejects.toThrow("réplica caída");
  });

  it("consultaEscritura SIEMPRE va al primario, incluso con réplica configurada", async () => {
    const primario = poolFalso("ok");
    const replica = poolFalso("ok");
    const enrutador = new EnrutadorLecturaReplica({ primario, replica });
    await enrutador.consultaEscritura("INSERT INTO x VALUES (1)");
    expect(primario.llamadas).toBe(1);
    expect(replica.llamadas).toBe(0);
  });

  it("pasa los parámetros de la consulta intactos al pool elegido", async () => {
    const capturados: unknown[][] = [];
    const primario: PoolConsultable = {
      async query(_sql, params) {
        capturados.push(params ?? []);
        return { rows: [] };
      },
    };
    const enrutador = new EnrutadorLecturaReplica({ primario, replica: null });
    await enrutador.consultaSoloLectura("SELECT * FROM x WHERE id = $1", ["abc"]);
    expect(capturados).toEqual([["abc"]]);
  });
});

describe("leerUrlReplicaDesdeEntorno", () => {
  it("devuelve null si DATABASE_URL_REPLICA no está definida", () => {
    expect(leerUrlReplicaDesdeEntorno({})).toBeNull();
  });

  it("devuelve null si DATABASE_URL_REPLICA está definida pero vacía", () => {
    expect(leerUrlReplicaDesdeEntorno({ DATABASE_URL_REPLICA: "" })).toBeNull();
  });

  it("devuelve la URL tal cual si está definida y no vacía", () => {
    expect(leerUrlReplicaDesdeEntorno({ DATABASE_URL_REPLICA: "postgres://replica.ejemplo/db" })).toBe(
      "postgres://replica.ejemplo/db",
    );
  });
});
