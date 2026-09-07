import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import {
  ALCANCE_ROMPER_CRISTAL_CRON,
  crearProveedorSesionPostgres,
  crearRutasCronSyncIcal,
  MOTIVO_ROMPER_CRISTAL_CRON,
} from "../../src/rutas/internas/cronSync.js";
import { RegistroMetricas } from "../../src/workers/observabilidad/metricas.js";
import { crearPropiedad, crearTenant, crearUnidad, crearUsuario } from "../soporte/fixtures.js";

/**
 * Contraparte de integración de `test/observabilidad/cronSync.test.ts`
 * (unitario, con `proveedorSesion`/`ejecutarCiclo` simulados): aquí NO se
 * simula Postgres — contra `embedded-postgres` real, con el rol `app_rv`
 * (`NOSUPERUSER NOBYPASSRLS`) y las políticas RLS reales de
 * `0061_acceso_romper_cristal.ts`/`0092_rls_tablas_canal_lote2.ts`, se
 * verifica el ÚNICO punto que un mock no puede probar: que
 * `crearProveedorSesionPostgres` de verdad logra leer `unidad_canal_feed`
 * de tenants DISTINTOS al propio del superadmin (el mecanismo de
 * auto-concesión "romper cristal" descrito en la cabecera de
 * `cronSync.ts` y en `docs/despliegue/cron-sync.md`), y que la concesión
 * queda revocada al terminar — nunca "abierta" más tiempo del necesario.
 *
 * `ejecutarCiclo` se sigue inyectando simulado (sin red real ni canal
 * real, mismo criterio D-017/D-019 que el resto del programa): esta suite
 * prueba RLS/auto-concesión, no el motor de sync en sí (ya cubierto por
 * `packages/adapters`).
 */

process.env.JWT_SECRET = "prueba-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";
const SECRETO_PRUEBA = "cron-secret-integracion-de-prueba-1234567890";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;

let tenant1Id: string;
let tenant2Id: string;
let unidad1Id: string;
let unidad2Id: string;
let canalAirbnbId: string;
let superadminId: string;
let adminGestoraId: string;

function puertoAleatorio(): number {
  return 55000 + Math.floor(Math.random() * 9000);
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-cron-sync-rls-test-"));
  const puerto = puertoAleatorio();
  servidor = new EmbeddedPostgres({
    databaseDir,
    port: puerto,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("atiende_rv_cron_sync_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_cron_sync_rls_test");
  await superusuario.connect();
  await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

  const ejecutor: EjecutorSql = {
    async query(sql, params) {
      const r = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql) {
      await superusuario.query(sql);
    },
  };
  await aplicarMigraciones(ejecutor, migraciones);

  // Dos tenants DISTINTOS, cada uno con un canal iCal activo (url_import
  // no vacío) — el punto de esta suite es probar que el superadmin del
  // cron lee AMBOS en una sola sesión, algo que ningún test unitario con
  // mocks puede demostrar.
  tenant1Id = await crearTenant(superusuario, "T-CRON-SYNC-1");
  tenant2Id = await crearTenant(superusuario, "T-CRON-SYNC-2");
  const propiedad1Id = await crearPropiedad(superusuario, tenant1Id, { nombre: "Prop cron 1" });
  const propiedad2Id = await crearPropiedad(superusuario, tenant2Id, { nombre: "Prop cron 2" });
  unidad1Id = await crearUnidad(superusuario, propiedad1Id, { nombre: "Unidad cron 1" });
  unidad2Id = await crearUnidad(superusuario, propiedad2Id, { nombre: "Unidad cron 2" });

  const filaCanal = await superusuario.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
  canalAirbnbId = filaCanal.rows[0]!.id;

  await superusuario.query(
    "INSERT INTO unidad_canal_feed (unidad_id, canal_id, url_import) VALUES ($1, $2, $3)",
    [unidad1Id, canalAirbnbId, "https://example.test/tenant1.ics"],
  );
  await superusuario.query(
    "INSERT INTO unidad_canal_feed (unidad_id, canal_id, url_import) VALUES ($1, $2, $3)",
    [unidad2Id, canalAirbnbId, "https://example.test/tenant2.ics"],
  );

  superadminId = await crearUsuario(superusuario, {
    tenantId: null,
    email: "cron-superadmin@api-test.local",
    rol: "superadmin",
    password: "clave-super-secreta-cron-superadmin",
  });
  adminGestoraId = await crearUsuario(superusuario, {
    tenantId: tenant1Id,
    email: "admin-gestora-cron@api-test.local",
    rol: "admin_gestora",
    password: "clave-super-secreta-admin-gestora",
  });

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_cron_sync_rls_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
});

afterEach(async () => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SYNC_SUPERADMIN_ID;
  // Limpia cualquier concesión que un test haya dejado vigente (defensivo
  // — cada test debería cerrar la suya, pero un `expect` que lanza a
  // mitad de un `it` no debe filtrar estado hacia el siguiente).
  await superusuario
    .query("UPDATE acceso_romper_cristal SET revocado_en = now() WHERE revocado_en IS NULL")
    .catch(() => undefined);
});

describe("crearProveedorSesionPostgres — auto-concesión romper cristal contra RLS real", () => {
  it("abre sesión, lee canales de AMBOS tenants (cross-tenant) y revoca la concesión al cerrar", async () => {
    const proveedor = crearProveedorSesionPostgres({ pool, superadminId });
    const sesion = await proveedor.abrir();

    const feeds = await sesion.listarFeedsActivos();
    expect(feeds.map((f) => f.tenantId).sort()).toEqual([tenant1Id, tenant2Id].sort());
    expect(feeds.map((f) => f.urlImport).sort()).toEqual(
      ["https://example.test/tenant1.ics", "https://example.test/tenant2.ics"].sort(),
    );

    // Mientras la sesión sigue abierta, la concesión debe existir, vigente
    // y con el motivo/alcance distinguibles del código (nunca confundible
    // con un "romper cristal" humano real).
    const vigentes = await superusuario.query<{ tenant_id: string; motivo: string; revocado_en: string | null }>(
      "SELECT tenant_id, motivo, revocado_en FROM acceso_romper_cristal WHERE superadmin_id = $1 AND alcance = $2",
      [superadminId, ALCANCE_ROMPER_CRISTAL_CRON],
    );
    expect(vigentes.rows).toHaveLength(2);
    expect(vigentes.rows.map((r) => r.tenant_id).sort()).toEqual([tenant1Id, tenant2Id].sort());
    expect(vigentes.rows.every((r) => r.motivo === MOTIVO_ROMPER_CRISTAL_CRON)).toBe(true);
    expect(vigentes.rows.every((r) => r.revocado_en === null)).toBe(true);

    await sesion.cerrar();

    const trasCerrar = await superusuario.query<{ revocado_en: string | null }>(
      "SELECT revocado_en FROM acceso_romper_cristal WHERE superadmin_id = $1 AND alcance = $2",
      [superadminId, ALCANCE_ROMPER_CRISTAL_CRON],
    );
    expect(trasCerrar.rows).toHaveLength(2);
    expect(trasCerrar.rows.every((r) => r.revocado_en !== null)).toBe(true);
  });

  it("rechaza (lanza) ANTES de otorgar ninguna concesión si el id configurado no es un superadmin activo", async () => {
    const proveedor = crearProveedorSesionPostgres({ pool, superadminId: adminGestoraId });

    await expect(proveedor.abrir()).rejects.toThrow(/no corresponde a un usuario activo con rol 'superadmin'/);

    const filas = await superusuario.query(
      "SELECT 1 FROM acceso_romper_cristal WHERE superadmin_id = $1",
      [adminGestoraId],
    );
    expect(filas.rowCount).toBe(0);
  });

  it("rechaza (lanza) si el id configurado no existe en absoluto en usuario", async () => {
    const proveedor = crearProveedorSesionPostgres({
      pool,
      superadminId: "00000000-0000-0000-0000-000000000000",
    });

    await expect(proveedor.abrir()).rejects.toThrow(/no corresponde a un usuario activo con rol 'superadmin'/);
  });
});

describe("GET /internal/cron/sync-ical — end-to-end contra Postgres real (ejecutarCiclo simulado)", () => {
  it("con CRON_SECRET y CRON_SYNC_SUPERADMIN_ID configurados, procesa los canales de ambos tenants y responde 200", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    process.env.CRON_SYNC_SUPERADMIN_ID = superadminId;

    const invocados: string[] = [];
    const app = crearRutasCronSyncIcal({
      pool,
      metricas: new RegistroMetricas(),
      ejecutarCiclo: async (feed) => {
        invocados.push(feed.tenantId);
        return { resultado: "exito_vacio" };
      },
    });

    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { procesados: number; errores: number; pendientes: number };
    expect(body.procesados).toBe(2);
    expect(body.errores).toBe(0);
    expect(body.pendientes).toBe(0);
    expect(invocados.sort()).toEqual([tenant1Id, tenant2Id].sort());

    // La concesión se revocó al terminar la request HTTP completa — no
    // queda una ventana "romper cristal" abierta después de responder.
    const filas = await superusuario.query<{ revocado_en: string | null }>(
      "SELECT revocado_en FROM acceso_romper_cristal WHERE superadmin_id = $1 AND alcance = $2",
      [superadminId, ALCANCE_ROMPER_CRISTAL_CRON],
    );
    expect(filas.rows.every((r) => r.revocado_en !== null)).toBe(true);
  });

  it("CRON_SYNC_SUPERADMIN_ID apuntando a un admin_gestora (no superadmin) responde 500 explícito, nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    process.env.CRON_SYNC_SUPERADMIN_ID = adminGestoraId;

    const app = crearRutasCronSyncIcal({ pool, metricas: new RegistroMetricas() });
    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_sync_no_disponible");
  });
});
