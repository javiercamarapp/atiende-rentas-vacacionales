import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { _reiniciarCachePoolsServerless, aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";

/**
 * D-DSD-15 (Lote 3.3, Supabase): `GET /health` — los TRES estados reales
 * del campo `baseDeDatos` (antes de esta corrección, `apps/api/src/
 * app.test.ts` solo cubría la forma general de la respuesta, nunca este
 * campo). Contra `embedded-postgres` real (D-022) para el estado "ok" y
 * contra una URL sintácticamente válida pero inalcanzable para "error" —
 * el estado "sin_configurar" no requiere Postgres real (cubierto también,
 * más barato, en packages/db/test/runner/saludBaseDeDatos.test.ts).
 *
 * Manipula `process.env.DATABASE_URL` directamente (guardado/restaurado
 * en cada test) porque `crearApp()` lee `DATABASE_URL` de
 * `cargarConfiguracion()` — independiente de cualquier `pool` inyectado
 * vía `opciones.pool` — así que es la única forma de variar el campo
 * `baseDeDatos` de `GET /health` entre pruebas sin tocar `app.ts` más
 * allá del cambio ya hecho.
 */

process.env.JWT_SECRET = "prueba-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const DATABASE_URL_ORIGINAL = process.env.DATABASE_URL;

function puertoAleatorioEnRango(): number {
  return 59000 + Math.floor(Math.random() * 500);
}

let databaseDir: string;
let servidor: EmbeddedPostgres;
let databaseUrlOk: string;

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-health-test-"));
  const puerto = puertoAleatorioEnRango();
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
  await servidor.createDatabase("atiende_rv_health_test");
  databaseUrlOk = `postgres://postgres:postgres@127.0.0.1:${puerto}/atiende_rv_health_test`;

  // Catálogo completo aplicado de antemano: prueba el caso feliz real de
  // `migracionesPendientes` (0, no "ausente por tabla inexistente").
  const cliente = new pg.Client({ connectionString: databaseUrlOk });
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
}, 60_000);

afterAll(async () => {
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
  if (DATABASE_URL_ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = DATABASE_URL_ORIGINAL;
});

afterEach(async () => {
  await _reiniciarCachePoolsServerless();
});

describe("GET /health — campo baseDeDatos honesto", () => {
  it("sin DATABASE_URL: 'sin_configurar', sin migracionesPendientes ni motivo", async () => {
    delete process.env.DATABASE_URL;
    const app = crearApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.baseDeDatos).toBe("sin_configurar");
    expect(body.baseDeDatosMotivo).toBeUndefined();
    expect(body.migracionesPendientes).toBeUndefined();
  });

  it("con DATABASE_URL apuntando a Postgres real: 'ok'", async () => {
    process.env.DATABASE_URL = databaseUrlOk;
    const app = crearApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.baseDeDatos).toBe("ok");
    expect(body.migracionesPendientes).toBe(0);
    expect(body.baseDeDatosMotivo).toBeUndefined();
  });

  it("con DATABASE_URL inalcanzable: 'error', con motivo corto y respuesta dentro de ~2s", async () => {
    process.env.DATABASE_URL = "postgres://usuario:clave@127.0.0.1:1/nada";
    const app = crearApp();
    const inicio = Date.now();
    const res = await app.request("/health");
    const duracionMs = Date.now() - inicio;
    expect(res.status).toBe(200); // /health SIEMPRE responde 200 — el estado va en el body
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.baseDeDatos).toBe("error");
    expect(typeof body.baseDeDatosMotivo).toBe("string");
    expect(body.baseDeDatosMotivo).not.toMatch(/usuario:clave|127\.0\.0\.1:1/); // nunca la URL/credenciales
    expect(body.migracionesPendientes).toBeUndefined();
    expect(duracionMs).toBeLessThan(3_000); // 2s de timeout interno + margen de red/proceso
  }, 10_000);

  it("no rompe el contrato existente (status/entorno/aviso) — regresión de apps/api/src/app.test.ts", async () => {
    delete process.env.DATABASE_URL;
    const app = crearApp();
    const res = await app.request("/health");
    const body = (await res.json()) as { status: string; entorno: string; aviso: string };
    expect(body.status).toBe("ok");
    expect(body.entorno).not.toBe("produccion");
    expect(body.aviso).toMatch(/sin conexiones productivas/i);
  });
});
