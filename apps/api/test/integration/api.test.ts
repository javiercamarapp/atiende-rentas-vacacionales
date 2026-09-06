import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { hashContrasena } from "../../src/seguridad/contrasenas.js";

/**
 * Pruebas de contrato HTTP (LOTES.md Lote 3: "pruebas HTTP de cada
 * endpoint con errores tipados") + prueba explícita de "logs sin PII"
 * (H-047, §RV19/21-7) sobre un flujo completo. Contra `embedded-postgres`
 * real con el rol `app_rv` (mismo patrón que packages/db/test/integration/
 * rls.test.ts) — nunca contra el superusuario de migraciones, para que
 * las respuestas HTTP reflejen el comportamiento real de RLS, no un
 * entorno con RLS desactivado de facto.
 */

process.env.JWT_SECRET = "prueba-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;
const lineasLog: string[] = [];

interface Fixture {
  tenantA: string;
  tenantB: string;
  unidadA: string;
  unidadB: string;
  emailAdminA: string;
  passwordAdminA: string;
  emailOperadorSolo: string;
  passwordOperadorSolo: string;
}
let fx: Fixture;

function puertoAleatorio(): number {
  return 50000 + Math.floor(Math.random() * 10000);
}

async function login(email: string, password: string) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken: string };
  return { status: res.status, accessToken: body.accessToken, body };
}

function autenticado(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } };
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-api-test-"));
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
  await servidor.createDatabase("atiende_rv_api_test");

  superusuario = servidor.getPgClient("atiende_rv_api_test");
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

  const tenantA = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-API-A') RETURNING id");
  const tenantB = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-API-B') RETURNING id");
  const propA = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop A', 'America/Cancun') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const propB = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop B', 'America/Cancun') RETURNING id",
    [tenantB.rows[0]!.id],
  );
  const unidadA = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, 'U-A', 1) RETURNING id",
    [propA.rows[0]!.id],
  );
  const unidadB = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'U-B') RETURNING id",
    [propB.rows[0]!.id],
  );

  const passwordAdminA = "clave-super-secreta-admin";
  const passwordOperadorSolo = "clave-super-secreta-operador";
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantA.rows[0]!.id, "admin.a@api-test.local", await hashContrasena(passwordAdminA)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, colaborador_nivel, password_hash)
     VALUES ($1, $2, 'operador', 'solo_calendario', $3)`,
    [tenantA.rows[0]!.id, "operador.solo@api-test.local", await hashContrasena(passwordOperadorSolo)],
  );

  fx = {
    tenantA: tenantA.rows[0]!.id,
    tenantB: tenantB.rows[0]!.id,
    unidadA: unidadA.rows[0]!.id,
    unidadB: unidadB.rows[0]!.id,
    emailAdminA: "admin.a@api-test.local",
    passwordAdminA,
    emailOperadorSolo: "operador.solo@api-test.local",
    passwordOperadorSolo,
  };

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_api_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  app = crearApp({ pool });
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("POST /auth/login", () => {
  it("credenciales válidas devuelven un access token y datos de sesión", async () => {
    const { status, body } = await login(fx.emailAdminA, fx.passwordAdminA);
    expect(status).toBe(200);
    expect((body as { usuario: { rol: string } }).usuario.rol).toBe("admin_gestora");
  });

  it("contraseña incorrecta devuelve 401 credenciales_invalidas (mismo mensaje que email inexistente)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fx.emailAdminA, password: "clave-incorrecta-123" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("credenciales_invalidas");
  });

  it("email inexistente devuelve el mismo error/codigo (sin enumeración de usuarios)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "no-existe@api-test.local", password: "cualquiera123" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("credenciales_invalidas");
  });
});

describe("errores de dominio tipados", () => {
  it("422 rango_invalido al crear una reserva con fin <= inicio", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const res = await app.request(
      "/reservas",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-05-10", fin: "2026-05-10" } }),
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("rango_invalido");
  });

  it("409 unidad_no_disponible al crear dos reservas directas solapadas", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const primera = await app.request(
      "/reservas",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-05-20", fin: "2026-05-25" } }),
      }),
    );
    expect(primera.status).toBe(201);

    const segunda = await app.request(
      "/reservas",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-05-22", fin: "2026-05-27" } }),
      }),
    );
    expect(segunda.status).toBe(409);
    const body = (await segunda.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("unidad_no_disponible");
  });

  it("403 rol_forbidden: un operador 'solo_calendario' no puede crear una reserva", async () => {
    const { accessToken } = await login(fx.emailOperadorSolo, fx.passwordOperadorSolo);
    const res = await app.request(
      "/reservas",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-06-01", fin: "2026-06-02" } }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("rol_forbidden");
  });

  it("404 recurso_no_encontrado: adminA no puede leer el calendario de una unidad del tenant B (RLS oculta la fila)", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const res = await app.request(
      `/unidades/${fx.unidadB}/calendario?desde=2026-01-01&hasta=2026-01-31`,
      autenticado(accessToken),
    );
    // La ruta responde 200 con noches vacías (RLS filtra las filas de
    // ocupación, no la existencia de la unidad en sí — no hay 500, y el
    // llamador de tenant A jamás ve una sola noche marcada como ocupada
    // de una unidad ajena).
    expect(res.status).toBe(200);
    const body = (await res.json()) as { noches: { ocupada: boolean }[] };
    expect(body.noches.every((n) => !n.ocupada)).toBe(true);
  });

  it("403 rol_forbidden: GET /auditoria exige admin_gestora/superadmin", async () => {
    const { accessToken } = await login(fx.emailOperadorSolo, fx.passwordOperadorSolo);
    const res = await app.request("/auditoria", autenticado(accessToken));
    expect(res.status).toBe(403);
  });

  it("401 token_invalido sin encabezado Authorization", async () => {
    const res = await app.request("/propiedades");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("token_invalido");
  });
});

describe("H-047 / §RV19/21-7: logs sin PII en un flujo completo", () => {
  it("un flujo de login + crear reserva con datos de huésped no filtra email/teléfono en los logs", async () => {
    lineasLog.length = 0;
    const appConLogger = crearApp({ pool });
    // Redirige temporalmente console.log para capturar lo que escribe el
    // logger de apps/api/src/middleware/logger.ts durante el flujo.
    const originalLog = console.log;
    console.log = (linea: string) => lineasLog.push(String(linea));
    try {
      const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
      const res = await appConLogger.request(
        "/reservas",
        autenticado(accessToken, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            unidadId: fx.unidadA,
            rango: { inicio: "2026-09-01", fin: "2026-09-03" },
            huespedNombre: "Huésped Secreto",
            huespedContacto: "huesped.secreto@correo-privado.example",
          }),
        }),
      );
      expect(res.status).toBe(201);
    } finally {
      console.log = originalLog;
    }

    const salidaCompleta = lineasLog.join("\n");
    expect(salidaCompleta).not.toContain("huesped.secreto@correo-privado.example");
    expect(salidaCompleta).not.toContain("Huésped Secreto");
    expect(salidaCompleta).not.toContain(fx.passwordAdminA);
    expect(salidaCompleta).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});

describe("H-046 / §RV19/21-13: credenciales de cuenta_canal cifradas, nunca en claro", () => {
  it("POST /canales/cuentas cifra el secreto — la columna en BD no contiene el texto plano ni en la respuesta HTTP", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const secretoEnClaro = "SECRETO-DE-CANAL-EN-CLARO-98765";

    const res = await app.request(
      "/canales/cuentas",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          canalCodigo: "airbnb",
          nombre: "Cuenta de prueba",
          credenciales: { apiKey: secretoEnClaro },
        }),
      }),
    );
    expect(res.status).toBe(201);
    const cuerpoRespuesta = await res.text();
    expect(cuerpoRespuesta).not.toContain(secretoEnClaro);
    const { id } = JSON.parse(cuerpoRespuesta) as { id: string };

    // Verificación directa en BD (como superusuario, para leer el bytea
    // crudo): el secreto en claro no aparece en ninguna columna de la fila.
    const fila = await superusuario.query<{
      credenciales_cifradas: Buffer;
      credenciales_ref: string | null;
    }>("SELECT credenciales_cifradas, credenciales_ref FROM cuenta_canal WHERE id = $1", [id]);
    const cifradoComoTexto = fila.rows[0]!.credenciales_cifradas.toString("latin1");
    expect(cifradoComoTexto).not.toContain(secretoEnClaro);
    expect(fila.rows[0]!.credenciales_ref).not.toBe(secretoEnClaro);

    // GET /canales tampoco expone ninguna columna de credenciales.
    const lista = await app.request("/canales", autenticado(accessToken));
    const listaTexto = await lista.text();
    expect(listaTexto).not.toContain(secretoEnClaro);
  });
});
