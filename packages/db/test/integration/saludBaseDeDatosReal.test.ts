import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verificarSaludBaseDeDatos } from "../../src/runner/saludBaseDeDatos.js";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";
import type { EjecutorSql } from "../../src/runner/ejecutorSql.js";
import pg from "pg";

/**
 * D-DSD-15: `verificarSaludBaseDeDatos` contra un Postgres REAL
 * (`embedded-postgres`, D-022 — nunca en pruebas unitarias). Los tres
 * estados que exige el paquete de trabajo D:
 *   1. "ok" — SELECT 1 real, con conteo de migraciones pendientes real.
 *   2. "error" — puerto sin nada escuchando (ECONNREFUSED real).
 *   3. "sin_configurar" — cubierto ya en el test unitario (no requiere
 *      Postgres real, no vale la pena repetirlo aquí).
 */

function puertoAleatorioEnRango(): number {
  return 55000 + Math.floor(Math.random() * 3000);
}

let databaseDir: string;
let servidor: EmbeddedPostgres;
let puerto: number;
let databaseUrl: string;
const poolsAbiertos: pg.Pool[] = [];

/** Cada `it()` abre su propio `pg.Pool` (para probar el `obtenerPool`
 * inyectado sin depender del caché de módulo real) — se registra aquí
 * para cerrarlo ANTES de `servidor.stop()` en `afterAll`. Sin esto, el
 * `stop()` del cluster embebido termina la conexión del lado del
 * servidor mientras el `pg.Pool` sigue viva del lado del cliente, lo que
 * emite un evento `error` no capturado (`terminating connection due to
 * administrator command`) que Vitest reporta como excepción no
 * manejada. */
function poolDePrueba(opciones: ConstructorParameters<typeof pg.Pool>[0]): pg.Pool {
  const pool = new pg.Pool(opciones);
  pool.on("error", () => {
    /* limpieza de prueba: un error aquí solo puede venir del cierre
     * ordenado del cluster embebido en afterAll, nunca de una aserción */
  });
  poolsAbiertos.push(pool);
  return pool;
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-salud-db-test-"));
  puerto = puertoAleatorioEnRango();
  servidor = new EmbeddedPostgres({
    databaseDir,
    port: puerto,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("atiende_rv_salud_test");
  databaseUrl = `postgres://postgres:postgres@127.0.0.1:${puerto}/atiende_rv_salud_test`;
}, 60_000);

afterAll(async () => {
  await Promise.all(poolsAbiertos.map((pool) => pool.end().catch(() => undefined)));
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("verificarSaludBaseDeDatos — contra embedded-postgres real", () => {
  it("reporta 'ok' sin migracionesPendientes antes de aplicar ninguna migración (tabla inexistente)", async () => {
    const resultado = await verificarSaludBaseDeDatos(databaseUrl, {
      obtenerPool: () => poolDePrueba({ connectionString: databaseUrl, max: 1 }),
    });
    expect(resultado.estado).toBe("ok");
    expect(resultado.migracionesPendientes).toBeUndefined();
  });

  it("reporta migracionesPendientes:0 tras aplicar el catálogo completo", async () => {
    const cliente = new pg.Client({ connectionString: databaseUrl });
    await cliente.connect();
    const ejecutor: EjecutorSql = {
      async query(sql, params) {
        const r = await cliente.query(sql, params as unknown[] | undefined);
        return { rows: r.rows, rowCount: r.rowCount };
      },
      async exec(sql) {
        await cliente.query(sql);
      },
    };
    await aplicarMigraciones(ejecutor, migraciones);
    await cliente.end();

    const resultado = await verificarSaludBaseDeDatos(databaseUrl, {
      obtenerPool: () => poolDePrueba({ connectionString: databaseUrl, max: 1 }),
    });
    expect(resultado).toEqual({ estado: "ok", migracionesPendientes: 0 });
  });

  it("reporta 'error' con motivo corto contra un puerto real sin nada escuchando", async () => {
    const puertoLibre = puerto + 1; // dentro del rango del cluster, pero sin servidor
    const urlRota = `postgres://postgres:postgres@127.0.0.1:${puertoLibre}/nada`;
    const resultado = await verificarSaludBaseDeDatos(urlRota, {
      obtenerPool: () => poolDePrueba({ connectionString: urlRota, max: 1, connectionTimeoutMillis: 1000 }),
      timeoutMs: 1_900,
    });
    expect(resultado.estado).toBe("error");
    expect(resultado.motivo).toBeDefined();
    expect(resultado.motivo).not.toMatch(/postgres:postgres/); // nunca la cadena de conexión
  }, 10_000);
});
