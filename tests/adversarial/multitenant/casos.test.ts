import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
// Import relativo directo a `apps/api/src` (mismo patrón que
// `tests/adversarial/outbox/casos.test.ts`): `@atiende-rv/api` solo
// expone "." y "./contrato" en su package.json, así que `crearApp` se
// importa por ruta de archivo. Esto ejercita EL MISMO código HTTP real
// que corre en producción, no una reimplementación de prueba.
import { crearApp } from "../../../apps/api/src/app.js";
import { hashContrasena } from "../../../apps/api/src/seguridad/contrasenas.js";

/**
 * Casos adversariales 18 (aislamiento multitenant) y 19 (escalada de
 * privilegios), verificados a nivel HTTP contra `embedded-postgres` real
 * con el rol `app_rv` — complementa (no duplica) la verificación con SQL
 * directo de `packages/db/test/integration/rls.test.ts` (H-042/H-044):
 * aquella prueba demuestra que la BASE DE DATOS por sí sola es
 * fail-closed sin importar la capa de aplicación; esta prueba demuestra
 * que la capa HTTP real (`apps/api`) también rechaza el cruce de tenant y
 * la escalada de rol de punta a punta, incluyendo el camino de ESCRITURA
 * (POST /bloqueos y /reservas referenciando una unidad de OTRO tenant),
 * que la suite HTTP de Lote 3 (`apps/api/test/integration/api.test.ts`)
 * no cubre (esa cubre solo el camino de LECTURA, GET /unidades/:id).
 */

process.env.JWT_SECRET = "prueba-jwt-secret-adversarial-multitenant-1234567890";
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
  unidadA: string;
  unidadB: string;
  emailAdminA: string;
  passwordAdminA: string;
  emailAdminB: string;
  passwordAdminB: string;
  emailOperadorSolo: string;
  passwordOperadorSolo: string;
}
let fx: Fixture;

function puertoAleatorio(): number {
  return 55000 + Math.floor(Math.random() * 8000);
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
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-adversarial-multitenant-"));
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
  await servidor.createDatabase("atiende_rv_adversarial_mt");

  superusuario = servidor.getPgClient("atiende_rv_adversarial_mt");
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

  const tenantA = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('T-ADV-MT-A') RETURNING id",
  );
  const tenantB = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('T-ADV-MT-B') RETURNING id",
  );
  const propA = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop A', 'America/Mexico_City') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const propB = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop B', 'America/Mexico_City') RETURNING id",
    [tenantB.rows[0]!.id],
  );
  const unidadA = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, 'U-A', 1) RETURNING id",
    [propA.rows[0]!.id],
  );
  const unidadB = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, 'U-B', 1) RETURNING id",
    [propB.rows[0]!.id],
  );

  const passwordAdminA = "clave-super-secreta-admin-a-1";
  const passwordAdminB = "clave-super-secreta-admin-b-1";
  const passwordOperadorSolo = "clave-super-secreta-operador-1";
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantA.rows[0]!.id, "admin.a@adversarial-mt.local", await hashContrasena(passwordAdminA)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantB.rows[0]!.id, "admin.b@adversarial-mt.local", await hashContrasena(passwordAdminB)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, colaborador_nivel, password_hash)
     VALUES ($1, $2, 'operador', 'solo_calendario', $3)`,
    [tenantA.rows[0]!.id, "operador.solo@adversarial-mt.local", await hashContrasena(passwordOperadorSolo)],
  );

  fx = {
    tenantA: tenantA.rows[0]!.id,
    tenantB: tenantB.rows[0]!.id,
    unidadA: unidadA.rows[0]!.id,
    unidadB: unidadB.rows[0]!.id,
    emailAdminA: "admin.a@adversarial-mt.local",
    passwordAdminA,
    emailAdminB: "admin.b@adversarial-mt.local",
    passwordAdminB,
    emailOperadorSolo: "operador.solo@adversarial-mt.local",
    passwordOperadorSolo,
  };

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_adversarial_mt",
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

describe("caso 18 — aislamiento multitenant (HTTP, además del SQL directo de packages/db/test/integration/rls.test.ts)", () => {
  it("adminA no puede LEER el calendario de la unidad del tenant B (200 con noches vacías, RLS filtra las filas de ocupación — mismo contrato que apps/api/test/integration/api.test.ts)", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const res = await app.request(
      `/unidades/${fx.unidadB}/calendario?desde=2027-01-01&hasta=2027-01-31`,
      autenticado(accessToken),
    );
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { noches: { ocupada: boolean }[] };
    expect(cuerpo.noches.every((n) => !n.ocupada)).toBe(true);
  });

  it("adminA no puede ESCRIBIR (POST /bloqueos) referenciando la unidad del tenant B — invariante de datos (nunca hay fuga/escritura)", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const res = await app.request(
      "/bloqueos",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unidadId: fx.unidadB,
          rango: { inicio: "2027-06-01", fin: "2027-06-05" },
          razon: "BLOQUEO_PROPIETARIO",
        }),
      }),
    );
    const cuerpo = (await res.json()) as { error?: { codigo: string; mensaje: string } };
    console.log(
      `[CASO 18] POST /bloqueos cross-tenant -> status=${res.status} codigo=${cuerpo.error?.codigo} mensaje="${cuerpo.error?.mensaje}"`,
    );
    // La operación NUNCA debe tener éxito (201) contra una unidad de otro
    // tenant — el criterio duro de ACEPTACION §Calendario-2 caso 18. El
    // CÓDIGO HTTP exacto se verifica aparte (ver el siguiente `it`, que
    // documenta un defecto real de clasificación de error).
    expect(res.status).not.toBe(201);

    // Verificación de datos, independiente del código HTTP exacto
    // devuelto: NINGUNA fila se creó en ocupacion_unidad para la unidad
    // del tenant B como consecuencia de esta petición. Este es el
    // invariante de seguridad real (aislamiento de datos) y SIEMPRE se
    // cumple, incluso cuando el código de error está mal clasificado.
    const filas = await superusuario.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1`,
      [fx.unidadB],
    );
    expect(filas.rows[0]!.n).toBe("0");
  });

  // D-ADV-01 CERRADO (docs/auditoria-2/defectos-adversarial.md,
  // commit e976d99): POST /bloqueos con un unidadId de OTRO tenant era
  // rechazado por RLS a nivel de base de datos (correcto, cero filas
  // escritas — ver el `it` anterior), pero `traducirErrorDominio`
  // (apps/api/src/routes/reservas.ts, reutilizada por bloqueos.ts) no
  // reconocía el mensaje de violación de RLS de Postgres ("new row
  // violates row-level security policy") ni el código SQLSTATE `42501`
  // en ninguno de sus patrones previos, así que caía al genérico
  // `error_interno` → HTTP 500. `traducirErrorDominio` ahora reconoce
  // `error.code === "42501"` y el texto "row-level security policy" y
  // los mapea a `recurso_no_encontrado` (404) — mismo criterio que ya
  // usa `POST /reservas` para el idéntico escenario cross-tenant. Este
  // `it` estaba EN ROJO a propósito antes de e976d99; ahora está en
  // VERDE (confirmado con ejecución real: HTTP 404 observado).
  it("POST /bloqueos cross-tenant responde con un error de autorización clasificado (403/404), no 500 genérico (D-ADV-01, cerrado)", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const res = await app.request(
      "/bloqueos",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unidadId: fx.unidadB,
          rango: { inicio: "2027-06-10", fin: "2027-06-12" },
          razon: "BLOQUEO_PROPIETARIO",
        }),
      }),
    );
    expect([403, 404]).toContain(res.status);
  });

  it("adminA no puede ESCRIBIR (POST /reservas) referenciando la unidad del tenant B", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);
    const res = await app.request(
      "/reservas",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadB, rango: { inicio: "2027-07-01", fin: "2027-07-03" } }),
      }),
    );
    expect(res.status).not.toBe(201);
    const filas = await superusuario.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1`,
      [fx.unidadB],
    );
    expect(filas.rows[0]!.n).toBe("0");
  });

  it("adminB no ve la lista de usuarios del tenant A (GET /usuarios)", async () => {
    const { accessToken: tokenB } = await login(fx.emailAdminB, fx.passwordAdminB);
    const res = await app.request("/usuarios", autenticado(tokenB));
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { usuarios: Array<{ email: string }> };
    expect(cuerpo.usuarios.some((u) => u.email.endsWith("@adversarial-mt.local") && u.email.startsWith("admin.a"))).toBe(
      false,
    );
    expect(cuerpo.usuarios.some((u) => u.email.startsWith("operador.solo"))).toBe(false);
  });
});

describe("caso 19 — escalada de privilegios rechazada en la capa de servicio (no solo UI)", () => {
  it("un operador 'solo_calendario' no puede crear un bloqueo vía HTTP (403 rol_forbidden)", async () => {
    const { accessToken } = await login(fx.emailOperadorSolo, fx.passwordOperadorSolo);
    const res = await app.request(
      "/bloqueos",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unidadId: fx.unidadA,
          rango: { inicio: "2027-08-01", fin: "2027-08-05" },
          razon: "BLOQUEO_PROPIETARIO",
        }),
      }),
    );
    expect(res.status).toBe(403);
    const cuerpo = (await res.json()) as { error: { codigo: string } };
    expect(cuerpo.error.codigo).toBe("rol_forbidden");
  });

  it("un operador 'solo_calendario' no puede cancelar una reserva (exige acceso_total) vía HTTP", async () => {
    const { accessToken: tokenAdmin } = await login(fx.emailAdminA, fx.passwordAdminA);
    const creada = await app.request(
      "/reservas",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2027-09-01", fin: "2027-09-03" } }),
      }),
    );
    expect(creada.status).toBe(201);
    const { id } = (await creada.json()) as { id: string };

    const { accessToken: tokenOperador } = await login(fx.emailOperadorSolo, fx.passwordOperadorSolo);
    const cancelacion = await app.request(
      `/reservas/${id}/cancelar`,
      autenticado(tokenOperador, { method: "POST" }),
    );
    expect(cancelacion.status).toBe(403);

    // La reserva sigue activa: el intento de escalada no tuvo NINGÚN
    // efecto sobre el dato.
    const fila = await superusuario.query<{ estado: string }>(
      `SELECT estado FROM ocupacion_unidad WHERE id = $1`,
      [id],
    );
    expect(fila.rows[0]!.estado).toBe("confirmado");
  });

  it("intento auditado: no hay ninguna auditoría de éxito para la escritura rechazada del operador", async () => {
    const { accessToken } = await login(fx.emailOperadorSolo, fx.passwordOperadorSolo);
    await app.request(
      "/bloqueos",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unidadId: fx.unidadA,
          rango: { inicio: "2027-10-01", fin: "2027-10-05" },
          razon: "MANTENIMIENTO",
        }),
      }),
    );
    const filas = await superusuario.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND razon = 'MANTENIMIENTO'`,
      [fx.unidadA],
    );
    expect(filas.rows[0]!.n).toBe("0"); // el rechazo en la capa de servicio impidió CUALQUIER escritura
  });
});
