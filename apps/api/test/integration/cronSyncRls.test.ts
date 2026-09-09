import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import {
  crearProveedorSesionPostgres,
  crearRutasCronSyncIcal,
  SERVICIO_CRON_SYNC_ICAL,
  type ResumenEjecucionCron,
} from "../../src/rutas/internas/cronSync.js";
import { fijarSesion } from "../../src/db/contexto.js";
import { RegistroMetricas } from "../../src/workers/observabilidad/metricas.js";
import { crearPropiedad, crearTenant, crearUnidad, crearUsuario } from "../soporte/fixtures.js";

/**
 * Contraparte de integración de `test/observabilidad/cronSync.test.ts`
 * (unitario, con `proveedorSesion`/`ejecutarCiclo` simulados): aquí NO se
 * simula Postgres — contra `embedded-postgres` real, con el rol `app_rv`
 * (`NOSUPERUSER NOBYPASSRLS`) y las políticas RLS reales de
 * `0128_delegacion_servicio_sistema.ts`/`0092_rls_tablas_canal_lote2.ts`,
 * se verifica lo que un mock no puede probar:
 *   - que `crearProveedorSesionPostgres` de verdad logra leer
 *     `unidad_canal_feed` de tenants DISTINTOS al propio del superadmin
 *     usando una DELEGACIÓN DE SERVICIO ya activa (nunca auto-otorgada,
 *     A3-DESP-01);
 *   - que sin esa delegación (o con ella revocada) el acceso cross-tenant
 *     se rechaza fail-closed, sin tocar `acceso_romper_cristal` para
 *     nada;
 *   - que `app_rv` NO puede crear su propia delegación (RLS bloquea el
 *     INSERT: no hay política para `app_rv` en esa tabla, a propósito);
 *   - que `cerrar()` registra el resumen del lote en el canal de
 *     auditoría DEDICADO (`auditoria_ejecucion_servicio_sistema`), nunca
 *     en `acceso_romper_cristal`/`auditoria_mutacion`.
 *
 * `ejecutarCiclo` se sigue inyectando simulado (sin red real ni canal
 * real, mismo criterio D-017/D-019 que el resto del programa): esta suite
 * prueba RLS/delegación de servicio, no el motor de sync en sí (ya
 * cubierto por `packages/adapters`).
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
let superadminSinDelegacionId: string;
let adminGestoraId: string;

function puertoAleatorio(): number {
  return 55000 + Math.floor(Math.random() * 9000);
}

/** Conexión app_rv con la sesión RLS fijada como `usuarioId` (mismo
 * `fijarSesion` que usa `crearProveedorSesionPostgres` en producción) —
 * para probar directamente qué le permite hacer RLS a esa identidad,
 * sin pasar por `crearProveedorSesionPostgres`. */
async function comoUsuarioAppRv(usuarioId: string, rol: string): Promise<pg.PoolClient> {
  const cliente = await pool.connect();
  await fijarSesion(cliente, { usuarioId, tenantId: null, rol });
  return cliente;
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
  // Superadmin real y activo, pero SIN delegación de servicio — cubre el
  // fail-closed de A3-DESP-01 (antes solo existía el fail-closed de "no
  // es superadmin"; ahora hay uno adicional: "es superadmin pero nadie
  // le delegó explícitamente el servicio del cron").
  superadminSinDelegacionId = await crearUsuario(superusuario, {
    tenantId: null,
    email: "cron-superadmin-sin-delegacion@api-test.local",
    rol: "superadmin",
    password: "clave-super-secreta-sin-delegacion",
  });
  adminGestoraId = await crearUsuario(superusuario, {
    tenantId: tenant1Id,
    email: "admin-gestora-cron@api-test.local",
    rol: "admin_gestora",
    password: "clave-super-secreta-admin-gestora",
  });

  // Delegación de servicio para `superadminId` — creada por el
  // "operador" (superusuario, el mismo rol con el que corren las
  // migraciones), NUNCA por app_rv/el propio cron (ver test dedicado más
  // abajo que confirma que app_rv no puede hacer este INSERT).
  await superusuario.query(
    `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
     VALUES ($1, $2, 'Delegación de prueba para la suite de integración del cron de sync iCal')`,
    [SERVICIO_CRON_SYNC_ICAL, superadminId],
  );

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
});

function resumenDePrueba(overrides: Partial<ResumenEjecucionCron> = {}): ResumenEjecucionCron {
  return {
    iniciadoEn: new Date(),
    tenantsAlcanzados: 2,
    feedsProcesados: 2,
    feedsError: 0,
    feedsPendientes: 0,
    ...overrides,
  };
}

describe("crearProveedorSesionPostgres — delegación de servicio contra RLS real (A3-DESP-01)", () => {
  it("abre sesión, lee canales de AMBOS tenants (cross-tenant) usando la delegación ya activa", async () => {
    const proveedor = crearProveedorSesionPostgres({ pool, superadminId });
    const sesion = await proveedor.abrir();

    const feeds = await sesion.listarFeedsActivos();
    expect(feeds.map((f) => f.tenantId).sort()).toEqual([tenant1Id, tenant2Id].sort());
    expect(feeds.map((f) => f.urlImport).sort()).toEqual(
      ["https://example.test/tenant1.ics", "https://example.test/tenant2.ics"].sort(),
    );

    // Ningún acceso cross-tenant del cron pasa por acceso_romper_cristal
    // (A3-DESP-01): la tabla del canal humano de emergencia sigue vacía.
    const romperCristal = await superusuario.query("SELECT 1 FROM acceso_romper_cristal WHERE superadmin_id = $1", [
      superadminId,
    ]);
    expect(romperCristal.rowCount).toBe(0);

    await sesion.cerrar(resumenDePrueba());
  });

  it("cerrar() registra el resumen del lote en el canal de auditoría DEDICADO, nunca en acceso_romper_cristal", async () => {
    const proveedor = crearProveedorSesionPostgres({ pool, superadminId });
    const sesion = await proveedor.abrir();
    await sesion.listarFeedsActivos();

    const iniciadoEn = new Date(Date.now() - 5_000);
    await sesion.cerrar({
      iniciadoEn,
      tenantsAlcanzados: 2,
      feedsProcesados: 2,
      feedsError: 1,
      feedsPendientes: 3,
    });

    const filas = await superusuario.query<{
      servicio: string;
      superadmin_id: string;
      tenants_alcanzados: number;
      feeds_procesados: number;
      feeds_error: number;
      feeds_pendientes: number;
    }>(
      `SELECT servicio, superadmin_id, tenants_alcanzados, feeds_procesados, feeds_error, feeds_pendientes
       FROM auditoria_ejecucion_servicio_sistema
       WHERE superadmin_id = $1
       ORDER BY finalizado_en DESC
       LIMIT 1`,
      [superadminId],
    );
    expect(filas.rows).toHaveLength(1);
    const fila = filas.rows[0]!;
    expect(fila.servicio).toBe(SERVICIO_CRON_SYNC_ICAL);
    expect(fila.tenants_alcanzados).toBe(2);
    expect(fila.feeds_procesados).toBe(2);
    expect(fila.feeds_error).toBe(1);
    expect(fila.feeds_pendientes).toBe(3);

    // Sigue sin tocar el canal humano en absoluto.
    const romperCristal = await superusuario.query("SELECT 1 FROM acceso_romper_cristal WHERE superadmin_id = $1", [
      superadminId,
    ]);
    expect(romperCristal.rowCount).toBe(0);
  });

  it("rechaza (lanza) ANTES de comprobar delegación alguna si el id configurado no es un superadmin activo", async () => {
    const proveedor = crearProveedorSesionPostgres({ pool, superadminId: adminGestoraId });

    await expect(proveedor.abrir()).rejects.toThrow(/no corresponde a un usuario activo con rol 'superadmin'/);
  });

  it("rechaza (lanza) si el id configurado no existe en absoluto en usuario", async () => {
    const proveedor = crearProveedorSesionPostgres({
      pool,
      superadminId: "00000000-0000-0000-0000-000000000000",
    });

    await expect(proveedor.abrir()).rejects.toThrow(/no corresponde a un usuario activo con rol 'superadmin'/);
  });

  it("A3-DESP-01: rechaza (lanza) fail-closed si el superadmin es activo pero NO tiene delegación de servicio", async () => {
    const proveedor = crearProveedorSesionPostgres({ pool, superadminId: superadminSinDelegacionId });

    await expect(proveedor.abrir()).rejects.toThrow(/no tiene una delegación de servicio activa/);

    // Tampoco filtra a los datos de negocio: sin la verificación pasando,
    // jamás se ejecuta ni siquiera el SELECT de feeds.
    const romperCristal = await superusuario.query("SELECT 1 FROM acceso_romper_cristal WHERE superadmin_id = $1", [
      superadminSinDelegacionId,
    ]);
    expect(romperCristal.rowCount).toBe(0);
  });

  it("A3-DESP-01: una delegación REVOCADA ya no autoriza abrir sesión", async () => {
    const otroSuperadminId = await crearUsuario(superusuario, {
      tenantId: null,
      email: "cron-superadmin-revocado@api-test.local",
      rol: "superadmin",
      password: "clave-super-secreta-revocado",
    });
    await superusuario.query(
      `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo, revocado_en)
       VALUES ($1, $2, 'Delegación de prueba ya revocada', now())`,
      [SERVICIO_CRON_SYNC_ICAL, otroSuperadminId],
    );

    const proveedor = crearProveedorSesionPostgres({ pool, superadminId: otroSuperadminId });
    await expect(proveedor.abrir()).rejects.toThrow(/no tiene una delegación de servicio activa/);
  });

  it("A3-DESP-01: app_rv (el propio cron) NO puede crear su propia delegación de servicio — RLS lo bloquea", async () => {
    const cliente = await comoUsuarioAppRv(superadminId, "superadmin");
    try {
      await expect(
        cliente.query(
          `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
           VALUES ('otro_servicio_cualquiera', $1, 'intento de auto-otorgarse una delegación')`,
          [superadminId],
        ),
      ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege (sin política INSERT para app_rv)
    } finally {
      cliente.release();
    }
  });
});

describe("GET /internal/cron/sync-ical — end-to-end contra Postgres real (ejecutarCiclo simulado)", () => {
  it("con CRON_SECRET y CRON_SYNC_SUPERADMIN_ID (con delegación activa) configurados, procesa ambos tenants y responde 200", async () => {
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

    // El resumen de la corrida HTTP completa quedó en el canal de
    // auditoría dedicado — nunca en acceso_romper_cristal (que sigue sin
    // ninguna fila para esta identidad en toda la suite).
    const auditoria = await superusuario.query<{ feeds_procesados: number; tenants_alcanzados: number }>(
      `SELECT feeds_procesados, tenants_alcanzados FROM auditoria_ejecucion_servicio_sistema
       WHERE superadmin_id = $1 ORDER BY finalizado_en DESC LIMIT 1`,
      [superadminId],
    );
    expect(auditoria.rows[0]?.feeds_procesados).toBe(2);
    expect(auditoria.rows[0]?.tenants_alcanzados).toBe(2);

    const romperCristal = await superusuario.query("SELECT 1 FROM acceso_romper_cristal WHERE superadmin_id = $1", [
      superadminId,
    ]);
    expect(romperCristal.rowCount).toBe(0);
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

  it("A3-DESP-01: CRON_SYNC_SUPERADMIN_ID activo pero SIN delegación de servicio responde 500 explícito, nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    process.env.CRON_SYNC_SUPERADMIN_ID = superadminSinDelegacionId;

    const app = crearRutasCronSyncIcal({ pool, metricas: new RegistroMetricas() });
    const res = await app.request("/sync-ical", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_sync_no_disponible");
  });
});
