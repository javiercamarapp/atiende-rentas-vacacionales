import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { crearPropiedad, crearTenant, crearUnidad, crearUsuario } from "../soporte/fixtures.js";

/**
 * H-054 (BACKLOG E08/E15, REQ-117, §Limpieza-2): CRUD de preferencias de
 * notificación y configuración de webhook de tenant, contra
 * `embedded-postgres` real (mismo patrón que el resto de
 * `apps/api/test/integration/*.test.ts`).
 */
process.env.JWT_SECRET = "prueba-jwt-secret-lote3-0-al-menos-32-caracteres-000";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;

interface Fixture {
  tenantId: string;
  emailAdmin: string;
  passwordAdmin: string;
  emailOperador: string;
  passwordOperador: string;
}
let fx: Fixture;

function puertoAleatorio(): number {
  return 58000 + Math.floor(Math.random() * 4000);
}

async function login(email: string, password: string) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

function autenticado(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } };
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-lote3-0-notif-test-"));
  const puerto = puertoAleatorio();
  servidor = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port: puerto,
    persistent: false,
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("atiende_rv_test");

  superusuario = new pg.Client({ host: "localhost", port: puerto, user: "postgres", password: "postgres", database: "atiende_rv_test" });
  await superusuario.connect();

  const ejecutor: EjecutorSql = {
    query: (sql, params) => superusuario.query(sql, params as unknown[] | undefined),
    exec: (sql) => superusuario.query(sql).then(() => undefined),
  };
  await aplicarMigraciones(ejecutor, migraciones);

  await superusuario.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${USUARIO_APP}') THEN
         CREATE ROLE ${USUARIO_APP} LOGIN PASSWORD '${PASSWORD_APP}';
       END IF;
     END $$;`,
  );
  await superusuario.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${USUARIO_APP};`);
  await superusuario.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${USUARIO_APP};`);

  const tenantId = await crearTenant(superusuario, "Tenant Notificaciones");
  const propiedadId = await crearPropiedad(superusuario, tenantId);
  await crearUnidad(superusuario, propiedadId);
  const emailAdmin = "admin-notif@example.com";
  const passwordAdmin = "PasswordAdmin123!";
  await crearUsuario(superusuario, { tenantId, email: emailAdmin, rol: "admin_gestora", password: passwordAdmin });
  const emailOperador = "operador-notif@example.com";
  const passwordOperador = "PasswordOperador123!";
  await crearUsuario(superusuario, { tenantId, email: emailOperador, rol: "operador", password: passwordOperador });

  fx = { tenantId, emailAdmin, passwordAdmin, emailOperador, passwordOperador };

  pool = new pg.Pool({ host: "localhost", port: puerto, user: USUARIO_APP, password: PASSWORD_APP, database: "atiende_rv_test" });
  app = crearApp({ pool });
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await superusuario?.end();
  await servidor?.stop();
  await rm(databaseDir, { recursive: true, force: true });
});

describe("Notificaciones — H-054: preferencias por usuario", () => {
  it("GET /notificaciones/preferencias empieza vacío (default seguro: nada activo salvo in_app)", async () => {
    const token = await login(fx.emailOperador, fx.passwordOperador);
    const res = await app.request("/notificaciones/preferencias", autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preferencias: unknown[] };
    expect(body.preferencias).toEqual([]);
  });

  it("PUT /notificaciones/preferencias guarda una preferencia y GET la refleja", async () => {
    const token = await login(fx.emailOperador, fx.passwordOperador);
    const put = await app.request(
      "/notificaciones/preferencias",
      autenticado(token, { method: "PUT", body: JSON.stringify({ tipoEvento: "paridad_precio", canal: "correo", activo: true }) }),
    );
    expect(put.status).toBe(200);

    const get = await app.request("/notificaciones/preferencias", autenticado(token));
    const body = (await get.json()) as { preferencias: Array<{ tipoEvento: string; canal: string; activo: boolean }> };
    expect(body.preferencias).toEqual([{ tipoEvento: "paridad_precio", canal: "correo", activo: true }]);
  });

  it("PUT con el mismo tipoEvento+canal hace upsert (no duplica filas)", async () => {
    const token = await login(fx.emailOperador, fx.passwordOperador);
    await app.request(
      "/notificaciones/preferencias",
      autenticado(token, { method: "PUT", body: JSON.stringify({ tipoEvento: "paridad_precio", canal: "correo", activo: false }) }),
    );
    const get = await app.request("/notificaciones/preferencias", autenticado(token));
    const body = (await get.json()) as { preferencias: Array<{ activo: boolean }> };
    expect(body.preferencias).toHaveLength(1);
    expect(body.preferencias[0]!.activo).toBe(false);
  });
});

describe("Notificaciones — H-054: webhook de tenant (ROLES_ADMIN, HMAC)", () => {
  it("un operador (no admin) recibe 403 al intentar configurar el webhook", async () => {
    const token = await login(fx.emailOperador, fx.passwordOperador);
    const res = await app.request(
      "/notificaciones/webhook",
      autenticado(token, { method: "POST", body: JSON.stringify({ url: "https://ejemplo.com/hook", activo: true }) }),
    );
    expect(res.status).toBe(403);
  });

  it("un admin puede crear el webhook; la respuesta incluye el secreto UNA vez, GET nunca lo devuelve", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const post = await app.request(
      "/notificaciones/webhook",
      autenticado(token, { method: "POST", body: JSON.stringify({ url: "https://ejemplo.com/hook", activo: true }) }),
    );
    expect(post.status).toBe(201);
    const postBody = (await post.json()) as { secretoHmac: string; url: string; activo: boolean };
    expect(postBody.secretoHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(postBody.url).toBe("https://ejemplo.com/hook");

    const get = await app.request("/notificaciones/webhook", autenticado(token));
    const getBody = (await get.json()) as Record<string, unknown>;
    expect(getBody).not.toHaveProperty("secretoHmac");
    expect(getBody.configurado).toBe(true);
    expect(getBody.activo).toBe(true);
  });

  it("rotar el webhook (segundo POST) genera un secreto DISTINTO del anterior", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const p1 = await app.request(
      "/notificaciones/webhook",
      autenticado(token, { method: "POST", body: JSON.stringify({ url: "https://ejemplo.com/hook-v2", activo: true }) }),
    );
    const p2 = await app.request(
      "/notificaciones/webhook",
      autenticado(token, { method: "POST", body: JSON.stringify({ url: "https://ejemplo.com/hook-v2", activo: true }) }),
    );
    const b1 = (await p1.json()) as { secretoHmac: string };
    const b2 = (await p2.json()) as { secretoHmac: string };
    expect(b1.secretoHmac).not.toBe(b2.secretoHmac);
  });

  it("rechaza una URL http:// (solo https)", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      "/notificaciones/webhook",
      autenticado(token, { method: "POST", body: JSON.stringify({ url: "http://ejemplo.com/hook", activo: true }) }),
    );
    expect(res.status).toBe(422); // error de validación zod (mismo criterio que el resto de la API).
  });

  it("DELETE /notificaciones/webhook desactiva la configuración", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const del = await app.request("/notificaciones/webhook", autenticado(token, { method: "DELETE" }));
    expect(del.status).toBe(200);
    const get = await app.request("/notificaciones/webhook", autenticado(token));
    const body = (await get.json()) as { configurado: boolean };
    expect(body.configurado).toBe(false);
  });
});
