import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { crearPropiedad, crearTenant, crearUsuario } from "../soporte/fixtures.js";

/**
 * Pruebas de integración del back office / superadmin (Lote 8, BACKLOG
 * E13 H-074/H-075/H-076 + E02 H-011/H-012). Comando real equivalente al
 * `--filter=backoffice` documentado en docs/fase2/LOTES.md (Vitest no
 * soporta `--filter` como flag propio; el equivalente exacto es apuntar
 * al archivo):
 *
 *   npm run test:integration -w @atiende-rv/api -- test/integration/backoffice.test.ts
 *
 * Contra `embedded-postgres` real (D-009/D-022), mismo patrón que
 * test/integration/api.test.ts.
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

interface Fixture {
  tenantA: string;
  tenantB: string;
  propiedadA: string;
  emailSuperadmin: string;
  passwordSuperadmin: string;
  emailAdminA: string;
  passwordAdminA: string;
}
let fx: Fixture;

function puertoAleatorio(): number {
  return 51000 + Math.floor(Math.random() * 10000);
}

async function login(email: string, password: string) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken: string };
  return { status: res.status, accessToken: body.accessToken };
}

function autenticado(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } };
}

async function jsonPost(ruta: string, token: string, cuerpo: unknown) {
  const res = await app.request(
    ruta,
    autenticado(token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    }),
  );
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function jsonGet(ruta: string, token: string) {
  const res = await app.request(ruta, autenticado(token));
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-backoffice-test-"));
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
  await servidor.createDatabase("atiende_rv_backoffice_test");

  superusuario = servidor.getPgClient("atiende_rv_backoffice_test");
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

  const tenantAId = await crearTenant(superusuario, "Backoffice Tenant A");
  const tenantBId = await crearTenant(superusuario, "Backoffice Tenant B");
  const propiedadAId = await crearPropiedad(superusuario, tenantAId, { nombre: "Prop A" });

  const passwordSuperadmin = "clave-super-secreta-superadmin";
  const passwordAdminA = "clave-super-secreta-admin-a";
  await crearUsuario(superusuario, { tenantId: null, email: "superadmin@backoffice-test.local", rol: "superadmin", password: passwordSuperadmin });
  await crearUsuario(superusuario, { tenantId: tenantAId, email: "admin.a@backoffice-test.local", rol: "admin_gestora", password: passwordAdminA });

  fx = {
    tenantA: tenantAId,
    tenantB: tenantBId,
    propiedadA: propiedadAId,
    emailSuperadmin: "superadmin@backoffice-test.local",
    passwordSuperadmin,
    emailAdminA: "admin.a@backoffice-test.local",
    passwordAdminA,
  };

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_backoffice_test",
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

describe("H-074: directorio de tenants (superadmin, sin concesión)", () => {
  it("GET /backoffice/tenants lista tenants con métricas agregadas sin necesitar romper cristal", async () => {
    const { accessToken } = await login(fx.emailSuperadmin, fx.passwordSuperadmin);
    const { status, body } = await jsonGet("/backoffice/tenants", accessToken);
    expect(status).toBe(200);
    const nombres = (body as { tenants: { nombre: string; metricas: { unidadesTotal: number } }[] }).tenants.map(
      (t) => t.nombre,
    );
    expect(nombres).toContain("Backoffice Tenant A");
    expect(nombres).toContain("Backoffice Tenant B");
  });
});

describe("H-075/H-076: acceso 'romper cristal' auditado", () => {
  it("sin concesión vigente, superadmin obtiene 0 filas de datos de un tenant (RLS lo impide)", async () => {
    const { accessToken } = await login(fx.emailSuperadmin, fx.passwordSuperadmin);
    const { status, body } = await jsonGet(`/backoffice/propiedades?tenantId=${fx.tenantA}`, accessToken);
    expect(status).toBe(200);
    expect((body as { propiedades: unknown[] }).propiedades).toEqual([]);
  });

  it("crear una concesión con motivo genera una entrada ACCESO_ROMPER_CRISTAL en auditoria_mutacion, y desbloquea la lectura de ESE tenant", async () => {
    const { accessToken } = await login(fx.emailSuperadmin, fx.passwordSuperadmin);

    const creado = await jsonPost("/backoffice/romper-cristal", accessToken, {
      tenantId: fx.tenantA,
      motivo: "Investigación de ticket de soporte #42",
      minutos: 15,
    });
    expect(creado.status).toBe(201);

    // Evidencia de auditoría (§Auditoría-1): entrada con motivo explícito.
    const auditoria = await superusuario.query(
      `SELECT actor_id, tenant_id, operacion, valores_nuevos FROM auditoria_mutacion
       WHERE operacion = 'ACCESO_ROMPER_CRISTAL' AND tenant_id = $1 ORDER BY creado_en DESC LIMIT 1`,
      [fx.tenantA],
    );
    expect(auditoria.rowCount).toBe(1);
    expect(auditoria.rows[0]!.valores_nuevos.motivo).toBe("Investigación de ticket de soporte #42");
    // Evidencia impresa para docs/logs/lote8-integration.log (§Auditoría-1:
    // "romper cristal genera entrada de auditoría con motivo").
    console.log(
      `[H-075/§Auditoría-1] auditoria_mutacion: operacion=${auditoria.rows[0]!.operacion} actor_id=${auditoria.rows[0]!.actor_id} tenant_id=${auditoria.rows[0]!.tenant_id} motivo="${auditoria.rows[0]!.valores_nuevos.motivo}"`,
    );

    // Ahora SÍ ve datos de negocio de tenant A.
    const { status, body } = await jsonGet(`/backoffice/propiedades?tenantId=${fx.tenantA}`, accessToken);
    expect(status).toBe(200);
    const nombres = (body as { propiedades: { nombre: string }[] }).propiedades.map((p) => p.nombre);
    expect(nombres).toContain("Prop A");

    // Pero sigue en 0 filas para el tenant B (sin concesión sobre B).
    const otroTenant = await jsonGet(`/backoffice/propiedades?tenantId=${fx.tenantB}`, accessToken);
    expect((otroTenant.body as { propiedades: unknown[] }).propiedades).toEqual([]);
  });

  it("el banner persistente (GET /backoffice/romper-cristal) refleja la concesión activa y permite revocarla", async () => {
    const { accessToken } = await login(fx.emailSuperadmin, fx.passwordSuperadmin);
    const activos = await jsonGet("/backoffice/romper-cristal", accessToken);
    expect(activos.status).toBe(200);
    const accesos = (activos.body as { accesos: { id: string; tenantId: string }[] }).accesos;
    expect(accesos.length).toBeGreaterThan(0);

    const revocar = await jsonPost(`/backoffice/romper-cristal/${accesos[0]!.id}/revocar`, accessToken, {});
    expect(revocar.status).toBe(200);
  });
});

describe("§Roles-4: admin de tenant A no administra tenant B", () => {
  it("admin_gestora de tenant A recibe tenant_forbidden al intentar leer propiedades de tenant B", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const res = await app.request(`/backoffice/propiedades?tenantId=${fx.tenantB}`, autenticado(accessToken));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("tenant_forbidden");
  });

  it("admin_gestora de tenant A SÍ administra su propio tenant (alta de propiedad con dirección/moneda/zona horaria)", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const { status, body } = await jsonPost("/backoffice/propiedades", accessToken, {
      nombre: "Casa Feliz",
      zonaHoraria: "America/Mexico_City",
      moneda: "MXN",
      direccion: { linea1: "Calle 1 #23", ciudad: "Mérida", pais: "MX" },
    });
    expect(status).toBe(201);
    expect((body as { direccion: { ciudad: string } }).direccion.ciudad).toBe("Mérida");
  });
});

describe("H-012: multi-unidad con cantidad + cuentas de canal sin credenciales en respuesta", () => {
  it("POST /backoffice/unidades con cantidad=3 crea 3 unidades independientes", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const { status, body } = await jsonPost("/backoffice/unidades", accessToken, {
      propiedadId: fx.propiedadA,
      nombre: "Depa",
      cantidad: 3,
    });
    expect(status).toBe(201);
    const unidades = (body as { unidades: { nombre: string }[] }).unidades;
    expect(unidades).toHaveLength(3);
    expect(unidades.map((u) => u.nombre)).toEqual(["Depa 1", "Depa 2", "Depa 3"]);
  });

  it("alta de cuenta de canal 'partner_pendiente' exige motivo, y la respuesta nunca incluye credenciales", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);

    const sinMotivo = await jsonPost("/backoffice/cuentas-canal", accessToken, {
      canalCodigo: "booking",
      nombre: "Booking directo",
      tipoConexion: "partner_pendiente",
    });
    expect(sinMotivo.status).toBe(422);

    const lineasLog: string[] = [];
    const consoleLogOriginal = console.log;
    console.log = (linea: string) => lineasLog.push(String(linea));
    let creado: { status: number; body: unknown };
    try {
      creado = await jsonPost("/backoffice/cuentas-canal", accessToken, {
        canalCodigo: "airbnb",
        nombre: "Airbnb con secreto",
        tipoConexion: "ical",
        credenciales: { apiKey: "secreto-super-confidencial-12345" },
      });
    } finally {
      console.log = consoleLogOriginal;
    }
    expect(creado.status).toBe(201);
    const cuerpoTexto = JSON.stringify(creado.body);
    expect(cuerpoTexto).not.toContain("secreto-super-confidencial-12345");
    expect((creado.body as { credencialesConfiguradas: boolean }).credencialesConfiguradas).toBe(true);
    // Tampoco en ningún log emitido durante la request.
    expect(lineasLog.join("\n")).not.toContain("secreto-super-confidencial-12345");
  });

  it("un simulador nunca se presenta como conexión productiva: bloqueado fuera de development/test", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const nodeEnvOriginal = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { status, body } = await jsonPost("/backoffice/cuentas-canal", accessToken, {
        canalCodigo: "vrbo",
        nombre: "Simulador prohibido en prod",
        tipoConexion: "simulador",
      });
      expect(status).toBe(422);
      expect((body as { error: { codigo: string } }).error.codigo).toBe("validacion");
    } finally {
      process.env.NODE_ENV = nodeEnvOriginal;
    }
  });
});

describe("Invitaciones de colaborador (RV12 §1)", () => {
  it("crea una invitación, devuelve el token UNA vez, y el listado nunca expone el hash", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const creada = await jsonPost("/backoffice/usuarios/invitaciones", accessToken, {
      email: "nuevo.colaborador@backoffice-test.local",
      rol: "operador",
      colaboradorNivel: "calendario_mensajeria",
    });
    expect(creada.status).toBe(201);
    expect(typeof (creada.body as { token: string }).token).toBe("string");

    const listado = await jsonGet("/backoffice/usuarios/invitaciones", accessToken);
    expect(listado.status).toBe(200);
    const texto = JSON.stringify(listado.body);
    expect(texto).not.toContain("token");
  });
});

describe("Feature flags por tenant con auditoría", () => {
  it("PATCH /backoffice/flags/:id con motivo cambia el valor y queda en la auditoría del flag", async () => {
    const { accessToken } = await login(fx.emailSuperadmin, fx.passwordSuperadmin);
    const cambio = await app.request(
      "/backoffice/flags/sync.canal_pausado_por_alerta",
      autenticado(accessToken, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ valor: true, tenantId: fx.tenantA, motivo: "Prueba de pausa manual" }),
      }),
    );
    expect(cambio.status).toBe(200);

    const auditoria = await jsonGet("/backoffice/flags/sync.canal_pausado_por_alerta/auditoria", accessToken);
    expect(auditoria.status).toBe(200);
    const entradas = (auditoria.body as { entradas: { motivo: string }[] }).entradas;
    expect(entradas.some((e) => e.motivo === "Prueba de pausa manual")).toBe(true);
  });
});
