import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { crearTenant, crearUsuario } from "../soporte/fixtures.js";

/**
 * REQ-151 (docs/REQUISITOS.md, MUST): bandeja de solicitudes ARCO/RGPD —
 * cola de tickets con plazo por jurisdicción, estado y responsable
 * asignado, contra `embedded-postgres` real (mismo patrón que el resto de
 * `apps/api/test/integration/*.test.ts`).
 */
process.env.JWT_SECRET = "prueba-jwt-secret-req151-arco-al-menos-32-caracteres-000";
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
  otroTenantId: string;
  emailAdminOtroTenant: string;
  passwordAdminOtroTenant: string;
}
let fx: Fixture;

function puertoAleatorio(): number {
  return 55000 + Math.floor(Math.random() * 3000);
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
  return {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
  };
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-req151-arco-test-"));
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

  superusuario = new pg.Client({
    host: "localhost",
    port: puerto,
    user: "postgres",
    password: "postgres",
    database: "atiende_rv_test",
  });
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

  const tenantId = await crearTenant(superusuario, "Tenant ARCO");
  const emailAdmin = "admin-arco@example.com";
  const passwordAdmin = "PasswordAdmin123!";
  await crearUsuario(superusuario, { tenantId, email: emailAdmin, rol: "admin_gestora", password: passwordAdmin });
  const emailOperador = "operador-arco@example.com";
  const passwordOperador = "PasswordOperador123!";
  await crearUsuario(superusuario, { tenantId, email: emailOperador, rol: "operador", password: passwordOperador });

  const otroTenantId = await crearTenant(superusuario, "Tenant ARCO Otro");
  const emailAdminOtroTenant = "admin-arco-otro@example.com";
  const passwordAdminOtroTenant = "PasswordAdminOtro123!";
  await crearUsuario(superusuario, {
    tenantId: otroTenantId,
    email: emailAdminOtroTenant,
    rol: "admin_gestora",
    password: passwordAdminOtroTenant,
  });

  fx = {
    tenantId,
    emailAdmin,
    passwordAdmin,
    emailOperador,
    passwordOperador,
    otroTenantId,
    emailAdminOtroTenant,
    passwordAdminOtroTenant,
  };

  pool = new pg.Pool({ host: "localhost", port: puerto, user: USUARIO_APP, password: PASSWORD_APP, database: "atiende_rv_test" });
  app = crearApp({ pool });
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await superusuario?.end();
  await servidor?.stop();
  await rm(databaseDir, { recursive: true, force: true });
});

describe("REQ-151 — Bandeja de solicitudes ARCO/RGPD: alta y permisos", () => {
  it("un operador (no ROLES_ADMIN) recibe 403 al intentar crear un ticket", async () => {
    const token = await login(fx.emailOperador, fx.passwordOperador);
    const res = await app.request(
      "/solicitudes-arco",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "acceso",
          jurisdiccion: "mx_lfpdppp",
          solicitanteNombre: "Persona Uno",
          solicitanteEmail: "persona1@example.com",
        }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("un admin crea un ticket LFPDPPP; la respuesta trae plazoLimite calculado y estado 'recibida'", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      "/solicitudes-arco",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "acceso",
          jurisdiccion: "mx_lfpdppp",
          solicitanteNombre: "Persona LFPDPPP",
          solicitanteEmail: "persona-lfpdppp@example.com",
          descripcion: "Quiere copia de sus datos personales",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      estado: string;
      jurisdiccion: string;
      recibidaEn: string;
      plazoLimite: string;
      vencida: boolean;
    };
    expect(body.estado).toBe("recibida");
    expect(body.vencida).toBe(false);
    // LFPDPPP: 20 días hábiles > 20 días de calendario, siempre por
    // delante de recibidaEn en al menos ese margen.
    const dias = (new Date(body.plazoLimite).getTime() - new Date(body.recibidaEn).getTime()) / 86_400_000;
    expect(dias).toBeGreaterThanOrEqual(20);
    expect(dias).toBeLessThanOrEqual(28);
  });

  it("un admin crea un ticket RGPD; el plazo cae exactamente 1 mes después de recibidaEn", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      "/solicitudes-arco",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "oposicion",
          jurisdiccion: "ue_rgpd",
          solicitanteNombre: "Persona RGPD",
          solicitanteEmail: "persona-rgpd@example.com",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { recibidaEn: string; plazoLimite: string };
    const recibida = new Date(body.recibidaEn);
    const esperado = new Date(recibida);
    esperado.setUTCMonth(esperado.getUTCMonth() + 1);
    expect(new Date(body.plazoLimite).toISOString()).toBe(esperado.toISOString());
  });

  it("rechaza un cuerpo con jurisdiccion inválida (422 de validación zod)", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      "/solicitudes-arco",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "acceso",
          jurisdiccion: "no_existe",
          solicitanteNombre: "X",
          solicitanteEmail: "x@example.com",
        }),
      }),
    );
    expect(res.status).toBe(422);
  });
});

describe("REQ-151 — Bandeja de solicitudes ARCO/RGPD: listado, aislamiento por tenant y ciclo de vida", () => {
  it("GET /solicitudes-arco de un tenant nunca incluye tickets de otro tenant", async () => {
    const tokenOtro = await login(fx.emailAdminOtroTenant, fx.passwordAdminOtroTenant);
    const crea = await app.request(
      "/solicitudes-arco",
      autenticado(tokenOtro, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "cancelacion",
          jurisdiccion: "mx_lfpdppp",
          solicitanteNombre: "Persona Otro Tenant",
          solicitanteEmail: "persona-otro@example.com",
        }),
      }),
    );
    const { id: idOtroTenant } = (await crea.json()) as { id: string };

    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const lista = await app.request("/solicitudes-arco?tamano=100", autenticado(token));
    const body = (await lista.json()) as { entradas: { id: string }[] };
    expect(body.entradas.map((e) => e.id)).not.toContain(idOtroTenant);

    // Tampoco es visible por GET directo (aislamiento, no solo filtro del
    // listado).
    const directo = await app.request(`/solicitudes-arco/${idOtroTenant}`, autenticado(token));
    expect(directo.status).toBe(404);
  });

  it("PATCH sin resolucionNotas al intentar resolver es rechazado (422)", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const crea = await app.request(
      "/solicitudes-arco",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "rectificacion",
          jurisdiccion: "mx_lfpdppp",
          solicitanteNombre: "Persona Sin Notas",
          solicitanteEmail: "sin-notas@example.com",
        }),
      }),
    );
    const { id } = (await crea.json()) as { id: string };

    const patch = await app.request(
      `/solicitudes-arco/${id}`,
      autenticado(token, { method: "PATCH", body: JSON.stringify({ estado: "resuelta" }) }),
    );
    expect(patch.status).toBe(422);
  });

  it("ciclo de vida completo: asignar responsable, pasar a en_proceso, y resolver con notas", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const crea = await app.request(
      "/solicitudes-arco",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "acceso",
          jurisdiccion: "ue_rgpd",
          solicitanteNombre: "Persona Ciclo Completo",
          solicitanteEmail: "ciclo-completo@example.com",
        }),
      }),
    );
    const { id } = (await crea.json()) as { id: string };

    // 1) Asignar responsable + pasar a en_proceso.
    const responsable = await pool.query<{ id: string }>("SELECT id FROM usuario WHERE email = $1", [fx.emailAdmin]);
    const responsableId = responsable.rows[0]!.id;
    const asignar = await app.request(
      `/solicitudes-arco/${id}`,
      autenticado(token, {
        method: "PATCH",
        body: JSON.stringify({ estado: "en_proceso", responsableId }),
      }),
    );
    expect(asignar.status).toBe(200);
    const asignadoBody = (await asignar.json()) as { estado: string; responsableId: string | null };
    expect(asignadoBody.estado).toBe("en_proceso");
    expect(asignadoBody.responsableId).toBe(responsableId);

    // 2) Resolver con notas.
    const resolver = await app.request(
      `/solicitudes-arco/${id}`,
      autenticado(token, {
        method: "PATCH",
        body: JSON.stringify({ estado: "resuelta", resolucionNotas: "Se le proporcionó copia de sus datos por correo." }),
      }),
    );
    expect(resolver.status).toBe(200);
    const resueltoBody = (await resolver.json()) as {
      estado: string;
      resolucionNotas: string | null;
      resueltaEn: string | null;
      responsableId: string | null;
    };
    expect(resueltoBody.estado).toBe("resuelta");
    expect(resueltoBody.resolucionNotas).toBe("Se le proporcionó copia de sus datos por correo.");
    expect(resueltoBody.resueltaEn).not.toBeNull();
    // El responsable asignado en el paso 1 se conserva (COALESCE, no se
    // pisa por omitirlo en este PATCH).
    expect(resueltoBody.responsableId).toBe(responsableId);
  });

  it("PATCH a un id inexistente devuelve 404", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      "/solicitudes-arco/00000000-0000-0000-0000-000000000000",
      autenticado(token, { method: "PATCH", body: JSON.stringify({ estado: "en_proceso" }) }),
    );
    expect(res.status).toBe(404);
  });

  it("GET /solicitudes-arco?estado=recibida filtra correctamente", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    await app.request(
      "/solicitudes-arco",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          tipoDerecho: "oposicion",
          jurisdiccion: "mx_lfpdppp",
          solicitanteNombre: "Persona Filtro",
          solicitanteEmail: "persona-filtro@example.com",
        }),
      }),
    );
    const res = await app.request("/solicitudes-arco?estado=recibida&tamano=100", autenticado(token));
    const body = (await res.json()) as { entradas: { estado: string }[] };
    expect(body.entradas.length).toBeGreaterThan(0);
    for (const e of body.entradas) expect(e.estado).toBe("recibida");
  });
});
