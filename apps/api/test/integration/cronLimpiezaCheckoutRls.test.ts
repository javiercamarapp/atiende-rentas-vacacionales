import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import {
  abrirSesionLimpiezaCheckout,
  crearRutasCronLimpiezaCheckout,
  SERVICIO_CRON_LIMPIEZA_CHECKOUT,
} from "../../src/rutas/internas/cronLimpiezaCheckout.js";
import { crearPropiedad, crearTenant, crearUnidad, crearUsuario } from "../soporte/fixtures.js";

/**
 * Contraparte de integración de `cronLimpiezaCheckout.test.ts` (unitario,
 * con `procesar` simulado): aquí NO se simula Postgres — contra
 * `embedded-postgres` real, con el rol `app_rv` y las políticas RLS
 * reales, se verifica lo que un mock no puede probar:
 *   - que `abrirSesionLimpiezaCheckout` de verdad logra leer
 *     `outbox_evento` y crear una `tarea_operativa` para un tenant
 *     DISTINTO al propio del superadmin, usando su PROPIA delegación de
 *     servicio (`cron_limpieza_checkout`, nunca `cron_sync_ical` — cada
 *     servicio es una fila independiente en `delegacion_servicio_sistema`,
 *     A3-DESP-01);
 *   - que sin esa delegación (o con ella revocada) el acceso cross-tenant
 *     se rechaza fail-closed, sin tocar `acceso_romper_cristal`;
 *   - que el checkout REAL (`GET /internal/cron/limpieza-checkout` de
 *     punta a punta) crea la tarea de limpieza automáticamente, sin que
 *     nadie llame a `POST /operacion/tareas/procesar-eventos` a mano.
 *
 * Mismo patrón que `test/integration/cronSyncRls.test.ts`.
 */

process.env.JWT_SECRET = "prueba-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";
const SECRETO_PRUEBA = "cron-secret-integracion-limpieza-checkout-1234567890";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;

let tenantId: string;
let unidadId: string;
let superadminId: string;
let superadminSinDelegacionId: string;
let adminGestoraId: string;

function puertoAleatorio(): number {
  return 56000 + Math.floor(Math.random() * 9000);
}

/** Encola el mismo evento que `packages/domain/src/aplicacion/reservas.ts`
 * encola al confirmar una reserva de canal ('cerrar_disponibilidad') —
 * insertado directamente como el superusuario (sin pasar por RLS), igual
 * que `cronSyncRls.test.ts` inserta `unidad_canal_feed` a mano. */
async function encolarCheckout(ocupacionUnidadId: string): Promise<void> {
  await superusuario.query(
    `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload) VALUES ($1, 'cerrar_disponibilidad', '{}'::jsonb)`,
    [ocupacionUnidadId],
  );
}

async function crearOcupacionReserva(unidad: string, inicio: string, fin: string): Promise<string> {
  const resultado = await superusuario.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon)
     VALUES ($1, daterange($2::date, $3::date, '[)'), 'reserva', 'RESERVA_CANAL')
     RETURNING id`,
    [unidad, inicio, fin],
  );
  return resultado.rows[0]!.id;
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-cron-limpieza-checkout-rls-test-"));
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
  await servidor.createDatabase("atiende_rv_cron_limpieza_checkout_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_cron_limpieza_checkout_rls_test");
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

  tenantId = await crearTenant(superusuario, "T-CRON-LIMPIEZA-CHECKOUT-1");
  const propiedadId = await crearPropiedad(superusuario, tenantId, { nombre: "Prop cron limpieza" });
  unidadId = await crearUnidad(superusuario, propiedadId, { nombre: "Unidad cron limpieza" });

  superadminId = await crearUsuario(superusuario, {
    tenantId: null,
    email: "cron-limpieza-superadmin@api-test.local",
    rol: "superadmin",
    password: "clave-super-secreta-cron-limpieza",
  });
  superadminSinDelegacionId = await crearUsuario(superusuario, {
    tenantId: null,
    email: "cron-limpieza-superadmin-sin-delegacion@api-test.local",
    rol: "superadmin",
    password: "clave-super-secreta-sin-delegacion-limpieza",
  });
  adminGestoraId = await crearUsuario(superusuario, {
    tenantId,
    email: "admin-gestora-cron-limpieza@api-test.local",
    rol: "admin_gestora",
    password: "clave-super-secreta-admin-gestora-limpieza",
  });

  // Delegación de servicio PROPIA (nunca la de cron_sync_ical) — creada
  // por el "operador" (superusuario), nunca por app_rv.
  await superusuario.query(
    `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
     VALUES ($1, $2, 'Delegación de prueba para la suite de integración del cron de limpieza al checkout')`,
    [SERVICIO_CRON_LIMPIEZA_CHECKOUT, superadminId],
  );

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_cron_limpieza_checkout_rls_test",
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
  // Deja la tabla de tareas limpia entre pruebas (varias insertan tareas
  // sobre la MISMA unidad de fixture) para que cada `it` cuente solo lo
  // que ella misma generó.
  await superusuario.query("DELETE FROM checklist_item_tarea");
  await superusuario.query("DELETE FROM tarea_operativa");
  await superusuario.query("DELETE FROM outbox_evento_consumido_limpieza");
  await superusuario.query("DELETE FROM ocupacion_unidad WHERE unidad_id = $1", [unidadId]);
});

describe("abrirSesionLimpiezaCheckout — delegación de servicio PROPIA contra RLS real (A3-DESP-01)", () => {
  it("abre sesión y procesa el checkout de un tenant distinto al del superadmin (cross-tenant)", async () => {
    const ocupacionId = await crearOcupacionReserva(unidadId, "2026-05-01", "2026-05-05");
    await encolarCheckout(ocupacionId);

    const sesion = await abrirSesionLimpiezaCheckout({ pool, superadminId });
    const { procesarEventosCheckoutPendientes } = await import("@atiende-rv/domain");
    const resultado = await procesarEventosCheckoutPendientes(sesion.ejecutor);
    expect(resultado.procesados).toBe(1);
    expect(resultado.tareasCreadas).toHaveLength(1);
    await sesion.cerrar({ iniciadoEn: new Date(), procesados: resultado.procesados, huboError: false });

    const tareas = await superusuario.query<{ unidad_id: string; tipo: string; estado: string }>(
      `SELECT unidad_id, tipo, estado FROM tarea_operativa WHERE unidad_id = $1`,
      [unidadId],
    );
    expect(tareas.rows).toHaveLength(1);
    expect(tareas.rows[0]).toMatchObject({ unidad_id: unidadId, tipo: "limpieza", estado: "pendiente" });

    // Cross-tenant sin pasar por acceso_romper_cristal (A3-DESP-01).
    const romperCristal = await superusuario.query("SELECT 1 FROM acceso_romper_cristal WHERE superadmin_id = $1", [
      superadminId,
    ]);
    expect(romperCristal.rowCount).toBe(0);
  });

  it("cerrar() registra el resumen en el canal de auditoría DEDICADO con el servicio propio", async () => {
    const sesion = await abrirSesionLimpiezaCheckout({ pool, superadminId });
    await sesion.cerrar({ iniciadoEn: new Date(Date.now() - 1000), procesados: 3, huboError: false });

    const filas = await superusuario.query<{ servicio: string; feeds_procesados: number; feeds_error: number }>(
      `SELECT servicio, feeds_procesados, feeds_error FROM auditoria_ejecucion_servicio_sistema
       WHERE superadmin_id = $1 ORDER BY finalizado_en DESC LIMIT 1`,
      [superadminId],
    );
    expect(filas.rows[0]?.servicio).toBe(SERVICIO_CRON_LIMPIEZA_CHECKOUT);
    expect(filas.rows[0]?.feeds_procesados).toBe(3);
    expect(filas.rows[0]?.feeds_error).toBe(0);
  });

  it("rechaza (lanza) si el id configurado no es un superadmin activo", async () => {
    const sesion = abrirSesionLimpiezaCheckout({ pool, superadminId: adminGestoraId });
    await expect(sesion).rejects.toThrow(/no corresponde a un usuario activo con rol 'superadmin'/);
  });

  it("A3-DESP-01: rechaza fail-closed si el superadmin es activo pero NO tiene delegación de cron_limpieza_checkout", async () => {
    const sesion = abrirSesionLimpiezaCheckout({ pool, superadminId: superadminSinDelegacionId });
    await expect(sesion).rejects.toThrow(/no tiene una delegación de servicio activa/);
  });

  it("una delegación de cron_sync_ical (otro servicio) NO autoriza este cron — cada servicio es independiente", async () => {
    const otroSuperadminId = await crearUsuario(superusuario, {
      tenantId: null,
      email: "cron-limpieza-solo-sync@api-test.local",
      rol: "superadmin",
      password: "clave-super-secreta-solo-sync",
    });
    await superusuario.query(
      `INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
       VALUES ('cron_sync_ical', $1, 'Delegación de otro servicio, no de limpieza')`,
      [otroSuperadminId],
    );

    const sesion = abrirSesionLimpiezaCheckout({ pool, superadminId: otroSuperadminId });
    await expect(sesion).rejects.toThrow(/no tiene una delegación de servicio activa/);
  });
});

describe("GET /internal/cron/limpieza-checkout — end-to-end contra Postgres real", () => {
  it("con CRON_SECRET y CRON_SYNC_SUPERADMIN_ID (con delegación activa) configurados, crea la tarea y responde 200", async () => {
    const ocupacionId = await crearOcupacionReserva(unidadId, "2026-06-01", "2026-06-05");
    await encolarCheckout(ocupacionId);

    process.env.CRON_SECRET = SECRETO_PRUEBA;
    process.env.CRON_SYNC_SUPERADMIN_ID = superadminId;

    const app = crearRutasCronLimpiezaCheckout({ pool });
    const res = await app.request("/limpieza-checkout", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { procesados: number; tareasCreadas: string[] };
    expect(body.procesados).toBe(1);
    expect(body.tareasCreadas).toHaveLength(1);

    const tareas = await superusuario.query("SELECT 1 FROM tarea_operativa WHERE unidad_id = $1", [unidadId]);
    expect(tareas.rowCount).toBe(1);
  });

  it("CRON_SYNC_SUPERADMIN_ID sin delegación de cron_limpieza_checkout responde 500 explícito, nunca un 200 fingido", async () => {
    process.env.CRON_SECRET = SECRETO_PRUEBA;
    process.env.CRON_SYNC_SUPERADMIN_ID = superadminSinDelegacionId;

    const app = crearRutasCronLimpiezaCheckout({ pool });
    const res = await app.request("/limpieza-checkout", { headers: { authorization: `Bearer ${SECRETO_PRUEBA}` } });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("cron_limpieza_checkout_no_disponible");
  });
});
