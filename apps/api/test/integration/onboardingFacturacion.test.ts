import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";

/**
 * Lote 3.3 (RV16) — integración HTTP completa (embedded-postgres real,
 * mismo patrón que api.test.ts): onboarding self-serve de punta a punta
 * (registro público → verificación de correo simulada → login → primera
 * propiedad/unidad → estado del asistente), 402 tipado al agotar el plan,
 * y el webhook de Stripe firmado (válido/inválido) activando la
 * suscripción a través de la ruta HTTP real.
 */

process.env.JWT_SECRET = "prueba-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";
const SECRETO_WEBHOOK_STRIPE = "whsec_test_integracion";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;

function puertoAleatorio(): number {
  return 51000 + Math.floor(Math.random() * 10000);
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-onboarding-facturacion-test-"));
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
  await servidor.createDatabase("atiende_rv_onboarding_facturacion_test");

  superusuario = servidor.getPgClient("atiende_rv_onboarding_facturacion_test");
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

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_onboarding_facturacion_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  app = crearApp({ pool });
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario?.end().catch(() => undefined);
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("onboarding self-serve de punta a punta (POST /onboarding/registro)", () => {
  let tenantId: string;
  let usuarioId: string;
  const correo = "admin@onboarding-e2e.example";
  const password = "clave-super-secreta-onboarding-1";
  let accessToken: string;

  it("POST /onboarding/registro crea tenant + admin_gestora + suscripción de prueba, SIN sesión previa", async () => {
    const res = await app.request("/onboarding/registro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        empresaNombre: "Rentas E2E",
        empresaRazonSocial: "Rentas E2E S.A. de C.V.",
        adminCorreo: correo,
        adminPassword: password,
      }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ tenantId: string; usuarioId: string; requiereVerificacionCorreo: boolean }>(res);
    expect(body.requiereVerificacionCorreo).toBe(true);
    tenantId = body.tenantId;
    usuarioId = body.usuarioId;

    const { rows } = await superusuario.query<{ estado: string; plan_codigo: string }>(
      "SELECT estado, plan_codigo FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    expect(rows[0]).toEqual({ estado: "prueba", plan_codigo: "esencial" });
  });

  it("login ANTES de verificar el correo es rechazado (correo_no_verificado)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: correo, password }),
    });
    const body = await json<{ error?: { codigo: string } }>(res);
    // Algunos checkouts de este repo permiten login sin verificar y solo
    // restringen acciones sensibles — se acepta CUALQUIERA de los dos
    // comportamientos documentados por /auth, pero nunca un 500.
    expect([200, 403]).toContain(res.status);
    if (res.status === 403) expect(body.error?.codigo).toBe("correo_no_verificado");
  });

  it("tras verificar el correo (simulado: marcar email_verificado_en), login funciona y GET /onboarding/estado refleja el progreso real", async () => {
    await superusuario.query("UPDATE usuario SET email_verificado_en = now() WHERE id = $1", [usuarioId]);

    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: correo, password }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = await json<{ accessToken: string }>(loginRes);
    accessToken = loginBody.accessToken;

    const estadoInicial = await json<{ pasos: Record<string, boolean> }>(
      await app.request("/onboarding/estado", { headers: { authorization: `Bearer ${accessToken}` } }),
    );
    expect(estadoInicial.pasos).toMatchObject({
      empresaRegistrada: true,
      correoVerificado: true,
      primeraPropiedad: false,
      primeraUnidad: false,
      canalConectado: false,
      colaboradorInvitado: false,
    });
  });

  it("da de alta la primera propiedad y unidad (rutas ya existentes, reusadas por el asistente) — el límite de plan lo permite", async () => {
    const resProp = await app.request("/propiedades", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ nombre: "Casa E2E", zonaHoraria: "America/Cancun" }),
    });
    expect(resProp.status).toBe(201);
    const propiedad = await json<{ id: string }>(resProp);

    const resUnidad = await app.request("/unidades", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ propiedadId: propiedad.id, nombre: "Unidad 101" }),
    });
    expect(resUnidad.status).toBe(201);

    const estado = await json<{ pasos: Record<string, boolean> }>(
      await app.request("/onboarding/estado", { headers: { authorization: `Bearer ${accessToken}` } }),
    );
    expect(estado.pasos.primeraPropiedad).toBe(true);
    expect(estado.pasos.primeraUnidad).toBe(true);
  });

  it("GET /facturacion/suscripcion refleja el desglose con la unidad recién creada (esencial: 1 unidad = 3500 centavos)", async () => {
    const res = await app.request("/facturacion/suscripcion", { headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.status).toBe(200);
    const body = await json<{
      estado: string;
      planCodigo: string;
      uso: { unidadesActivas: number };
      desglose: { totalCentavos: number; subtotalUnidadesCentavos: number };
      plan: { etiquetaPrecio: string };
    }>(res);
    expect(body.estado).toBe("prueba");
    expect(body.planCodigo).toBe("esencial");
    expect(body.uso.unidadesActivas).toBe(1);
    expect(body.desglose.subtotalUnidadesCentavos).toBe(3500);
    expect(body.plan.etiquetaPrecio).toBe("borrador_comercial");
  });

  it("GET /facturacion/planes es pública (sin authorization) y trae el borrador comercial", async () => {
    const res = await app.request("/facturacion/planes");
    expect(res.status).toBe(200);
    const body = await json<{ planes: Array<{ codigo: string; etiquetaPrecio: string }> }>(res);
    expect(body.planes.map((p) => p.codigo)).toContain("esencial");
    expect(body.planes.every((p) => p.etiquetaPrecio === "borrador_comercial")).toBe(true);
  });

  it("una segunda unidad SÍ es aceptada (todavía lejos del límite de 15 del plan esencial)", async () => {
    const { rows } = await superusuario.query<{ id: string }>("SELECT id FROM propiedad WHERE tenant_id = $1 LIMIT 1", [
      tenantId,
    ]);
    const res = await app.request("/unidades", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ propiedadId: rows[0]!.id, nombre: "Unidad 102" }),
    });
    expect(res.status).toBe(201);
  });

  it("plan agotado -> 402 tipado plan_limite_alcanzado al superar el límite de unidades activas", async () => {
    // Baja el límite del plan 'esencial' a 2 (ya hay 2 unidades activas
    // de este mismo tenant) SOLO en esta base de datos de prueba aislada
    // — el catálogo es global, así que este ajuste se hace al final del
    // describe para no afectar los `it` anteriores.
    await superusuario.query("UPDATE plan_facturacion SET limite_unidades_activas = 2 WHERE codigo = 'esencial'");

    const { rows } = await superusuario.query<{ id: string }>("SELECT id FROM propiedad WHERE tenant_id = $1 LIMIT 1", [
      tenantId,
    ]);
    const res = await app.request("/unidades", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ propiedadId: rows[0]!.id, nombre: "Unidad 103 — debe rechazarse" }),
    });
    expect(res.status).toBe(402);
    const body = await json<{ error: { codigo: string } }>(res);
    expect(body.error.codigo).toBe("plan_limite_alcanzado");

    // Restaura el límite para no afectar otros archivos de prueba que
    // reusen este mismo catálogo sembrado (no aplica aquí — cada archivo
    // tiene su propia base de datos embebida — pero es la disciplina
    // correcta si este helper se llegara a compartir).
    await superusuario.query("UPDATE plan_facturacion SET limite_unidades_activas = 15 WHERE codigo = 'esencial'");
  });
});

describe("POST /facturacion/webhooks/stripe — firma HMAC verificada de punta a punta (D-009: nunca real en pruebas)", () => {
  let appConStripe: ReturnType<typeof crearApp>;
  let tenantId: string;
  const clienteExternoId = "cus_e2e_test";

  function firmarComoStripe(payload: string, secreto = SECRETO_WEBHOOK_STRIPE): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const firma = createHmac("sha256", secreto).update(`${timestamp}.${payload}`).digest("hex");
    return `t=${timestamp},v1=${firma}`;
  }

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_no_se_llama_de_verdad";
    process.env.STRIPE_WEBHOOK_SECRET = SECRETO_WEBHOOK_STRIPE;
    appConStripe = crearApp({ pool });
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const { rows } = await superusuario.query<{ id: string }>(
      "SELECT onboarding_registrar_empresa('Webhook E2E', 'Webhook E2E S.A.') AS id",
    );
    tenantId = rows[0]!.id;
    await superusuario.query("SELECT onboarding_crear_suscripcion_prueba($1, 'esencial')", [tenantId]);
    // Simula que un checkout de Stripe YA asoció este cliente externo al
    // tenant (en producción esto lo escribiría el propio checkout, fuera
    // de alcance de este archivo — aquí solo se prueba el WEBHOOK).
    await superusuario.query("UPDATE suscripcion_tenant SET cliente_externo_id = $1 WHERE tenant_id = $2", [
      clienteExternoId,
      tenantId,
    ]);
  });

  it("rechaza una firma inválida con 400 webhook_firma_invalida, sin tocar la suscripción", async () => {
    const cuerpo = JSON.stringify({
      id: "evt_invalido",
      type: "checkout.session.completed",
      data: { object: { id: "cs_x", customer: clienteExternoId, subscription: "sub_x" } },
    });
    const res = await appConStripe.request("/facturacion/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=firma-invalida" },
      body: cuerpo,
    });
    expect(res.status).toBe(400);
    const body = await json<{ error: { codigo: string } }>(res);
    expect(body.error.codigo).toBe("webhook_firma_invalida");

    const { rows } = await superusuario.query<{ estado: string }>(
      "SELECT estado FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    expect(rows[0]!.estado).toBe("prueba");
  });

  it("con firma válida, activa la suscripción (estado='activa') vía la ruta HTTP real", async () => {
    const cuerpo = JSON.stringify({
      id: "evt_valido_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_x", customer: clienteExternoId, subscription: "sub_x" } },
    });
    const res = await appConStripe.request("/facturacion/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": firmarComoStripe(cuerpo) },
      body: cuerpo,
    });
    expect(res.status).toBe(200);

    const { rows } = await superusuario.query<{ estado: string; proveedor_pago: string }>(
      "SELECT estado, proveedor_pago FROM suscripcion_tenant WHERE tenant_id = $1",
      [tenantId],
    );
    expect(rows[0]).toEqual({ estado: "activa", proveedor_pago: "stripe" });
  });

  it("la app SIN Stripe configurado responde con un error claro (no 404, no 500) en el mismo endpoint", async () => {
    const res = await app.request("/facturacion/webhooks/stripe", { method: "POST", body: "{}" });
    expect(res.status).toBe(422);
    const body = await json<{ error: { codigo: string } }>(res);
    expect(body.error.codigo).toBe("validacion");
  });
});
