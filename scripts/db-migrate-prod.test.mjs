import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { ejecutarMigracionProd, resolverUrlMigracion } from "./db-migrate-prod.mjs";

// Sigue el mismo patrón (y la misma nota de "no wired al gate `npm run
// test` raíz todavía") que scripts/filtrar-tests.test.mjs y
// scripts/verificar-lotes.test.mjs — se corre con
// `npx vitest run scripts/`.

describe("resolverUrlMigracion", () => {
  it("prioriza DATABASE_URL_DIRECT sobre DATABASE_URL", () => {
    expect(
      resolverUrlMigracion({ DATABASE_URL_DIRECT: "postgres://direct", DATABASE_URL: "postgres://pooler" }),
    ).toEqual({ databaseUrl: "postgres://direct", origen: "DATABASE_URL_DIRECT" });
  });

  it("usa DATABASE_URL si DATABASE_URL_DIRECT no está definida", () => {
    expect(resolverUrlMigracion({ DATABASE_URL: "postgres://pooler" })).toEqual({
      databaseUrl: "postgres://pooler",
      origen: "DATABASE_URL",
    });
  });

  it("sin ninguna de las dos: databaseUrl undefined, origen null", () => {
    expect(resolverUrlMigracion({})).toEqual({ databaseUrl: undefined, origen: null });
  });

  it("una variable vacía o solo espacios cuenta como no definida", () => {
    expect(
      resolverUrlMigracion({ DATABASE_URL_DIRECT: "   ", DATABASE_URL: "postgres://pooler" }),
    ).toEqual({ databaseUrl: "postgres://pooler", origen: "DATABASE_URL" });
  });
});

describe("ejecutarMigracionProd — sin variables de entorno", () => {
  it("sale con código 0 (no es un error) y no intenta conectar", async () => {
    const logs = [];
    const codigo = await ejecutarMigracionProd({}, { log: (m) => logs.push(m) });
    expect(codigo).toBe(0);
    expect(logs.join("\n")).toMatch(/DATABASE_URL_DIRECT.*DATABASE_URL.*definidas/is);
  });
});

describe("ejecutarMigracionProd — contra embedded-postgres real", () => {
  let databaseDir;
  let servidor;

  afterEach(async () => {
    await servidor?.stop().catch(() => undefined);
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
    servidor = undefined;
    databaseDir = undefined;
  });

  async function levantarPostgres() {
    databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-migrate-prod-test-"));
    const puerto = 58000 + Math.floor(Math.random() * 1000);
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
    await servidor.createDatabase("atiende_rv_migrate_prod_test");
    return `postgres://postgres:postgres@127.0.0.1:${puerto}/atiende_rv_migrate_prod_test`;
  }

  it("aplica las 70 migraciones del catálogo en limpio y es idempotente en la segunda corrida", async () => {
    const url = await levantarPostgres();
    const logs1 = [];
    const codigo1 = await ejecutarMigracionProd(
      { DATABASE_URL_DIRECT: url },
      { log: (m) => logs1.push(m) },
    );
    expect(codigo1).toBe(0);
    expect(logs1.join("\n")).toMatch(/migración\(es\) nueva\(s\) aplicada\(s\)/);

    const logs2 = [];
    const codigo2 = await ejecutarMigracionProd(
      { DATABASE_URL_DIRECT: url },
      { log: (m) => logs2.push(m) },
    );
    expect(codigo2).toBe(0);
    expect(logs2.join("\n")).toMatch(/ninguna nueva por aplicar/);
  }, 60_000);

  it("prioriza DATABASE_URL_DIRECT: una DATABASE_URL rota no impide el éxito si DIRECT es válida", async () => {
    const url = await levantarPostgres();
    const codigo = await ejecutarMigracionProd(
      { DATABASE_URL_DIRECT: url, DATABASE_URL: "postgres://usuario:clave@host-que-no-existe/db" },
      { log: () => {}, error: () => {} },
    );
    expect(codigo).toBe(0);
  }, 60_000);

  it("termina con código 1 y un mensaje de error si la conexión falla", async () => {
    const errores = [];
    const codigo = await ejecutarMigracionProd(
      { DATABASE_URL_DIRECT: "postgres://postgres:postgres@127.0.0.1:1/nada" },
      { log: () => {}, error: (m) => errores.push(m) },
    );
    expect(codigo).toBe(1);
    expect(errores.length).toBeGreaterThan(0);
  }, 15_000);

  it("DATABASE_SSL=require contra un Postgres embebido sin TLS falla limpiamente (prueba que el flag SSL sí se respeta)", async () => {
    const url = await levantarPostgres();
    const errores = [];
    const codigo = await ejecutarMigracionProd(
      { DATABASE_URL_DIRECT: url, DATABASE_SSL: "require" },
      { log: () => {}, error: (m) => errores.push(m) },
    );
    expect(codigo).toBe(1);
    expect(errores.length).toBeGreaterThan(0);
  }, 15_000);
});
