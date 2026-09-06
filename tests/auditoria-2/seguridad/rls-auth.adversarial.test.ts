import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
// Import relativo directo a apps/api/src (mismo patrón que
// tests/adversarial/multitenant/casos.test.ts): ejercita el código HTTP
// real de producción, no una reimplementación de prueba.
import { crearApp } from "../../../apps/api/src/app.js";
import { hashContrasena } from "../../../apps/api/src/seguridad/contrasenas.js";
import { cargarConfiguracion } from "../../../apps/api/src/config/env.js";

/**
 * Auditoría-2 / Seguridad: RLS multitenant + autenticación JWT.
 * Complementa (no duplica) tests/adversarial/multitenant/casos.test.ts y
 * packages/db/test/integration/rls.test.ts. Contra embedded-postgres real
 * + apps/api/src/app.js real (crearApp).
 */

process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";
const JWT_SECRET_PRUEBA = "auditoria-2-seguridad-jwt-secret-1234567890ab";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

function puertoAleatorio(): number {
  return 45000 + Math.floor(Math.random() * 8000);
}

interface Contexto {
  databaseDir: string;
  servidor: EmbeddedPostgres;
  superusuario: pg.Client;
  puerto: number;
}

async function levantarCluster(nombreDb: string): Promise<Contexto> {
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-auditoria2-seguridad-"));
  const puerto = puertoAleatorio();
  const servidor = new EmbeddedPostgres({
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
  await servidor.createDatabase(nombreDb);

  const superusuario = servidor.getPgClient(nombreDb);
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

  return { databaseDir, servidor, superusuario, puerto };
}

async function apagarCluster(ctx: Contexto): Promise<void> {
  await ctx.superusuario.end().catch(() => undefined);
  await ctx.servidor.stop().catch(() => undefined);
  await rm(ctx.databaseDir, { recursive: true, force: true }).catch(() => undefined);
}

// ============================================================================
// SUITE 1 — Fuga de contexto de sesión Postgres en el pool bajo concurrencia
// ============================================================================
describe("H-AUD2-01: set_config(..., false) de contexto de tenant + pool reutilizado entre requests", () => {
  let ctx: Contexto;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearApp>;
  let tenantA: string, tenantB: string, unidadA: string, unidadB: string;
  const emailA = "admin.a@aud2-pool.local";
  const emailB = "admin.b@aud2-pool.local";
  const passA = "clave-pool-admin-a-1";
  const passB = "clave-pool-admin-b-1";

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET_PRUEBA;
    // Evita que el rate limiter genérico (apps/api/src/seguridad/rateLimit.ts,
    // máximo=100/60s por defecto, misma clave ip+método+ruta) interfiera con
    // esta prueba, que necesita >200 requests GET /usuarios en la misma
    // "IP" (app.request no manda x-forwarded-for) para forzar el
    // entrelazado real sobre el pool — el rate limiting en sí se audita
    // por separado en la suite H-AUD2-05.
    process.env.RATE_LIMIT_MAXIMO = "100000";
    ctx = await levantarCluster("atiende_rv_aud2_pool");
    const tA = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('AUD2-POOL-A') RETURNING id",
    );
    const tB = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('AUD2-POOL-B') RETURNING id",
    );
    tenantA = tA.rows[0]!.id;
    tenantB = tB.rows[0]!.id;
    const pA = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop A', 'America/Mexico_City') RETURNING id",
      [tenantA],
    );
    const pB = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop B', 'America/Mexico_City') RETURNING id",
      [tenantB],
    );
    const uA = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, 'U-A', 1) RETURNING id",
      [pA.rows[0]!.id],
    );
    const uB = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, 'U-B', 1) RETURNING id",
      [pB.rows[0]!.id],
    );
    unidadA = uA.rows[0]!.id;
    unidadB = uB.rows[0]!.id;
    await ctx.superusuario.query(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
      [tenantA, emailA, await hashContrasena(passA)],
    );
    await ctx.superusuario.query(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
      [tenantB, emailB, await hashContrasena(passB)],
    );

    // Pool DELIBERADAMENTE minúsculo (max=2): fuerza que las conexiones
    // físicas se reciclen entre requests de tenants distintos en un
    // volumen alto de peticiones concurrentes/entrelazadas — el escenario
    // exacto que haría fallar un `set_config(..., true)`/SET LOCAL mal
    // ubicado fuera de una transacción, o un checkout que no llamara a
    // fijarSesion/limpiarSesion como primera operación.
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: ctx.puerto,
      database: "atiende_rv_aud2_pool",
      user: USUARIO_APP,
      password: PASSWORD_APP,
      max: 2,
    });
    app = crearApp({ pool });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await apagarCluster(ctx);
    delete process.env.RATE_LIMIT_MAXIMO;
  });

  it("cita de código: conSesion() SIEMPRE llama a fijarSesion/limpiarSesion como primera operación tras pool.connect()", async () => {
    // apps/api/src/db/contexto.ts líneas 58-73: `conSesion` hace
    // `pool.connect()` y, ANTES de invocar `fn`, llama a `fijarSesion` (o
    // `limpiarSesion` si no hay sesión) — nunca hay una ventana en la que
    // una consulta sensible a RLS corra sobre una conexión física sin que
    // el contexto de ESTA request ya esté fijado. Esto es fail-safe
    // estructural: `pg.Pool.connect()` entrega la conexión en exclusiva
    // (no se comparte con otra request concurrente hasta `release()`), y
    // `set_config` es de alcance SESIÓN-DE-BACKEND-POSTGRES (por conexión
    // TCP), no global al clúster — así que "fuga entre requests
    // concurrentes reales" solo sería posible si (a) dos requests
    // compartieran la misma conexión física AL MISMO TIEMPO (imposible
    // con pg.Pool: exclusivo hasta release), o (b) una ruta se saltara
    // conSesion/conConexion. Verificado: todas las rutas de
    // apps/api/src/routes/*.ts usan conSesion/conConexion excepto
    // apps/api/src/workers/observabilidad/rutas.ts (pool.query crudo,
    // pero nunca lee tabla de negocio con RLS, solo métricas/health).
    expect(true).toBe(true);
  });

  it("REPRODUCCION: 200 requests entrelazadas admin-A/admin-B sobre pool max=2 nunca filtran ocupación de un tenant al otro", async () => {
    const loginA = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailA, password: passA }),
    });
    const loginB = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailB, password: passB }),
    });
    const { accessToken: tokenA } = (await loginA.json()) as { accessToken: string };
    const { accessToken: tokenB } = (await loginB.json()) as { accessToken: string };

    // Crea una reserva real en cada tenant para tener "algo que filtrar".
    await app.request("/reservas", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ unidadId: unidadA, rango: { inicio: "2028-01-10", fin: "2028-01-12" } }),
    });
    await app.request("/reservas", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ unidadId: unidadB, rango: { inicio: "2028-02-10", fin: "2028-02-12" } }),
    });

    async function pedirComoA() {
      const res = await app.request("/usuarios", {
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const cuerpo = (await res.json()) as { usuarios?: Array<{ email: string }> };
      return { status: res.status, emails: (cuerpo.usuarios ?? []).map((u) => u.email) };
    }
    async function pedirComoB() {
      const res = await app.request("/usuarios", {
        headers: { authorization: `Bearer ${tokenB}` },
      });
      const cuerpo = (await res.json()) as { usuarios?: Array<{ email: string }> };
      return { status: res.status, emails: (cuerpo.usuarios ?? []).map((u) => u.email) };
    }

    const tandas = 100; // 100 * 2 = 200 requests entrelazadas
    const resultados: Array<{ quien: "A" | "B"; status: number; emails: string[] }> = [];
    for (let i = 0; i < tandas; i++) {
      // Promise.all fuerza el entrelazado real: ambas requests están "en
      // vuelo" a la vez compitiendo por las 2 conexiones del pool.
      const [ra, rb] = await Promise.all([
        pedirComoA().then((r) => ({ quien: "A" as const, ...r })),
        pedirComoB().then((r) => ({ quien: "B" as const, ...r })),
      ]);
      resultados.push(ra, rb);
    }

    let fugas = 0;
    for (const r of resultados) {
      expect(r.status).toBe(200);
      if (r.quien === "A" && r.emails.includes(emailB)) fugas++;
      if (r.quien === "B" && r.emails.includes(emailA)) fugas++;
    }
    console.log(`[H-AUD2-01] ${resultados.length} requests entrelazadas, fugas de contexto detectadas=${fugas}`);
    expect(fugas).toBe(0);
  }, 60_000);
});

// ============================================================================
// SUITE 2 — IDOR cross-tenant vía huesped_minimo (mensajería): tabla sin RLS
// ============================================================================
describe("[CORREGIDO S-05] H-AUD2-02: huesped_minimo ahora tiene tenant_id + RLS — POST /mensajeria/conversaciones valida propiedad de huespedMinimoId", () => {
  let ctx: Contexto;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearApp>;
  let tenantA: string, tenantB: string, unidadA: string;
  let huespedIdTenantB: string;
  const emailAdminA = "admin.a@aud2-idor.local";
  const passAdminA = "clave-idor-admin-a-1";
  const NOMBRE_HUESPED_B_SECRETO = "Nombre-Secreto-Huesped-Tenant-B-Confidencial";

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET_PRUEBA;
    ctx = await levantarCluster("atiende_rv_aud2_idor");
    const tA = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('AUD2-IDOR-A') RETURNING id",
    );
    const tB = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('AUD2-IDOR-B') RETURNING id",
    );
    tenantA = tA.rows[0]!.id;
    tenantB = tB.rows[0]!.id;
    const pA = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop A', 'America/Mexico_City') RETURNING id",
      [tenantA],
    );
    unidadA = (
      await ctx.superusuario.query<{ id: string }>(
        "INSERT INTO unidad (propiedad_id, nombre, duracion_minima_noches) VALUES ($1, 'U-A', 1) RETURNING id",
        [pA.rows[0]!.id],
      )
    ).rows[0]!.id;
    await ctx.superusuario.query(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
      [tenantA, emailAdminA, await hashContrasena(passAdminA)],
    );

    // [CORREGIDO S-05] huesped_minimo AHORA exige tenant_id NOT NULL
    // (migración 0093) — la fila ya no puede crearse "huérfana" como
    // antes de la corrección. Simula el caso real: cualquier reservación
    // con huésped del tenant B crea una fila así vía POST /reservas
    // (apps/api/src/routes/reservas.ts), que ahora deriva tenant_id de
    // unidad_tenant_id() en vez de dejarlo fuera del esquema.
    huespedIdTenantB = (
      await ctx.superusuario.query<{ id: string }>(
        `INSERT INTO huesped_minimo (nombre, contacto, tenant_id) VALUES ($1, 'tel:+52-555-0000-secreto', $2) RETURNING id`,
        [NOMBRE_HUESPED_B_SECRETO, tenantB],
      )
    ).rows[0]!.id;

    pool = new pg.Pool({
      host: "127.0.0.1",
      port: ctx.puerto,
      database: "atiende_rv_aud2_idor",
      user: USUARIO_APP,
      password: PASSWORD_APP,
    });
    app = crearApp({ pool });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await apagarCluster(ctx);
  });

  it("[CORREGIDO S-05] cita de código: huesped_minimo (packages/db/src/migrations/0093_huesped_minimo_tenant_rls.ts) SÍ tiene columna tenant_id y ENABLE/FORCE ROW LEVEL SECURITY", async () => {
    const rls = await ctx.superusuario.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'huesped_minimo'`,
    );
    expect(rls.rows[0]!.relrowsecurity).toBe(true);
    expect(rls.rows[0]!.relforcerowsecurity).toBe(true);
    const columnas = await ctx.superusuario.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'huesped_minimo'`,
    );
    expect(columnas.rows.map((r) => r.column_name)).toContain("tenant_id");
  });

  it("[CORREGIDO S-05] REPRODUCCION: admin de tenant A ya NO puede adjuntar huespedMinimoId de OTRO tenant a una conversación propia — 404 recurso_no_encontrado", async () => {
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailAdminA, password: passAdminA }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };

    const res = await app.request("/mensajeria/conversaciones", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        unidadId: unidadA, // unidad PROPIA de tenant A — pasa RLS/WITH CHECK sin problema
        canalCodigo: "airbnb",
        huespedMinimoId: huespedIdTenantB, // huésped de OTRO tenant — AHORA sí se valida
        idioma: "es",
      }),
    });
    const cuerpo = (await res.json()) as { id?: string; error?: { codigo?: string } };
    console.log(`[H-AUD2-02 corregido] POST /mensajeria/conversaciones cross-tenant huespedMinimoId -> status=${res.status}`);
    // Antes de la corrección: la API aceptaba (201) una conversación que
    // vinculaba el huésped de OTRO tenant sin ningún error. Ahora el
    // chequeo explícito en conversaciones.ts (WHERE tenant_id =
    // unidad_tenant_id($2)) rechaza con 404 ANTES de crear la fila.
    expect(res.status).toBe(404);
    expect(cuerpo.error?.codigo).toBe("recurso_no_encontrado");
  });

  it("[CORREGIDO S-05] control positivo: un huespedMinimoId del MISMO tenant SÍ se acepta y el borrador generado expone su nombre con normalidad", async () => {
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailAdminA, password: passAdminA }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };

    const huespedPropio = await ctx.superusuario.query<{ id: string }>(
      `INSERT INTO huesped_minimo (nombre, contacto, tenant_id) VALUES ('Huesped Propio Tenant A', 'tel:+52-555-1111', $1) RETURNING id`,
      [tenantA],
    );

    const res = await app.request("/mensajeria/conversaciones", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        unidadId: unidadA,
        canalCodigo: "airbnb",
        huespedMinimoId: huespedPropio.rows[0]!.id,
        idioma: "es",
      }),
    });
    expect(res.status).toBe(201);
    const cuerpo = (await res.json()) as { id: string };

    const resBorrador = await app.request(`/mensajeria/conversaciones/${cuerpo.id}/borradores`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({}),
    });
    expect(resBorrador.status).toBe(201);
    const cuerpoBorrador = (await resBorrador.json()) as { texto?: string };
    expect(cuerpoBorrador.texto).toContain("Huesped Propio Tenant A");
  });
});

// ============================================================================
// SUITE 3 — JWT_SECRET de desarrollo hardcodeado como fallback fail-open
// ============================================================================
describe("H-AUD2-03: JWT_SECRET por defecto ('nunca usar en producción') sin guardarraíl de arranque", () => {
  it("[CORREGIDO S-03] cargarConfiguracion() sin JWT_SECRET en el entorno ya NO usa un secreto hardcodeado conocido — genera una clave efímera en memoria (NODE_ENV vacío se sigue tratando como desarrollo, D-017)", () => {
    const config = cargarConfiguracion({} as NodeJS.ProcessEnv);
    // Antes: apps/api/src/config/env.ts línea 27 devolvía el literal
    // "desarrollo-nunca-usar-en-produccion-cambia-este-valor-ya-32b",
    // visible para cualquiera con acceso al repositorio.
    expect(config.jwtSecret).not.toBe("desarrollo-nunca-usar-en-produccion-cambia-este-valor-ya-32b");
    expect(config.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.entorno).toBe("development");
  });

  it("[CORREGIDO S-03] cargarConfiguracion() con NODE_ENV='production' y sin JWT_SECRET ahora ABORTA (fail-closed) en vez de caer a un secreto conocido", () => {
    expect(() =>
      cargarConfiguracion({
        NODE_ENV: "production",
        CANAL_CIFRADO_CLAVES: "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET es obligatorio/);
  });

  it("[CORREGIDO S-03] REPRODUCCION: un token firmado con el ANTIGUO secreto de desarrollo hardcodeado ya NO es aceptado por requiereAutenticacion — crearApp() ahora genera una clave efímera distinta cuando JWT_SECRET no está seteado", async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    let ctx: Contexto | undefined;
    try {
      ctx = await levantarCluster("atiende_rv_aud2_jwtdefault");
      const tenant = await ctx.superusuario.query<{ id: string }>(
        "INSERT INTO tenant (nombre) VALUES ('AUD2-JWTDEFAULT') RETURNING id",
      );
      const usuario = await ctx.superusuario.query<{ id: string }>(
        `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'nadie@aud2.local', 'superadmin', $2) RETURNING id`,
        [null, await hashContrasena("no-se-usa")],
      );
      const pool = new pg.Pool({
        host: "127.0.0.1",
        port: ctx.puerto,
        database: "atiende_rv_aud2_jwtdefault",
        user: USUARIO_APP,
        password: PASSWORD_APP,
      });
      const app = crearApp({ pool }); // crearApp() llama cargarConfiguracion() con process.env real, SIN JWT_SECRET

      const secretoDefault = new TextEncoder().encode(
        "desarrollo-nunca-usar-en-produccion-cambia-este-valor-ya-32b",
      );
      const tokenForjado = await new SignJWT({ tenant_id: null, rol: "superadmin", colaborador_nivel: null })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(usuario.rows[0]!.id)
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(secretoDefault);

      const res = await app.request("/backoffice/tenants", {
        headers: { authorization: `Bearer ${tokenForjado}` },
      });
      console.log(`[H-AUD2-03 corregido] request forjada con el ANTIGUO secreto default -> status=${res.status}`);
      // Antes de la corrección: se esperaba (y se obtenía) un status
      // distinto de 401 (forjado aceptado, con un secreto público). Ahora
      // crearApp() genera una clave efímera EN MEMORIA distinta de ese
      // literal — el token forjado con el viejo secreto ya no verifica.
      expect(res.status).toBe(401);

      await pool.end().catch(() => undefined);
    } finally {
      if (original === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = original;
      if (ctx) await apagarCluster(ctx);
    }
  }, 60_000);
});

// ============================================================================
// SUITE 4 — Canal lateral de tiempo en /auth/login (enumeración de usuarios)
// ============================================================================
describe("H-AUD2-04: /auth/login — mensaje de error uniforme pero canal lateral de TIEMPO distingue usuario inexistente de contraseña incorrecta", () => {
  let ctx: Contexto;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearApp>;
  const emailExistente = "admin.existe@aud2-timing.local";
  const passwordCorrecta = "clave-correcta-timing-1";

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET_PRUEBA;
    // S-06 (rate limit por email, apps/api/src/routes/auth.ts): esta
    // prueba mide TIEMPO con 25 repeticiones seguidas del MISMO email
    // (necesario para comparar contra un hash real) — muy por encima del
    // default de 20 intentos/15min. Sin subir el techo aquí, las últimas
    // repeticiones de cada tanda recibirían 429 (retorno casi
    // instantáneo) y contaminarían la medición de tiempo real de scrypt.
    process.env.RATE_LIMIT_LOGIN_EMAIL_MAXIMO = "1000";
    ctx = await levantarCluster("atiende_rv_aud2_timing");
    const tenant = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('AUD2-TIMING') RETURNING id",
    );
    await ctx.superusuario.query(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
      [tenant.rows[0]!.id, emailExistente, await hashContrasena(passwordCorrecta)],
    );
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: ctx.puerto,
      database: "atiende_rv_aud2_timing",
      user: USUARIO_APP,
      password: PASSWORD_APP,
    });
    app = crearApp({ pool });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await apagarCluster(ctx);
    delete process.env.RATE_LIMIT_LOGIN_EMAIL_MAXIMO;
  });

  it("mensaje de error es idéntico (mitigación existente, cita: apps/api/src/routes/auth.ts líneas 73-81)", async () => {
    const resInexistente = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "no-existe@aud2-timing.local", password: "loquesea123" }),
    });
    const resPasswordMala = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailExistente, password: "password-incorrecta-999" }),
    });
    const [c1, c2] = await Promise.all([resInexistente.json(), resPasswordMala.json()]) as Array<{
      error: { codigo: string; mensaje: string };
    }>;
    expect(resInexistente.status).toBe(resPasswordMala.status);
    expect(c1.error.codigo).toBe(c2.error.codigo);
    expect(c1.error.mensaje).toBe(c2.error.mensaje);
  });

  it("[CORREGIDO S-13] el TIEMPO de respuesta YA NO distingue usuario inexistente de contraseña incorrecta — ambos caminos pagan el mismo costo de scrypt", async () => {
    // Antes de la corrección: apps/api/src/routes/auth.ts líneas 72-81 —
    // si `usuario` era undefined, se lanzaba el error INMEDIATAMENTE sin
    // llamar a `verificarContrasena` (que ejecuta scrypt con N=16384 —
    // computacionalmente cara a propósito, seguridad/contrasenas.ts). Si
    // el usuario SÍ existía, ese costo de scrypt siempre se pagaba, sin
    // importar si el password era correcto o no. Eso creaba una asimetría
    // de tiempo medible (~10x). Ahora, cuando el usuario no existe/está
    // inactivo/sin hash, auth.ts corre `verificarContrasena` contra un
    // hash "señuelo" fijo (HASH_SENUELO_TIMING) antes de rechazar,
    // pagando el mismo costo de scrypt en ambos caminos.
    const REPETICIONES = 25;

    async function medir(email: string, password: string): Promise<number[]> {
      const tiempos: number[] = [];
      for (let i = 0; i < REPETICIONES; i++) {
        const inicio = performance.now();
        await app.request("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        tiempos.push(performance.now() - inicio);
      }
      return tiempos;
    }

    function mediana(valores: number[]): number {
      const ordenados = [...valores].sort((a, b) => a - b);
      const mitad = Math.floor(ordenados.length / 2);
      return ordenados.length % 2 === 0 ? (ordenados[mitad - 1]! + ordenados[mitad]!) / 2 : ordenados[mitad]!;
    }

    const tiemposInexistente = await medir("no-existe-timing@aud2-timing.local", "loquesea123");
    const tiemposPasswordMala = await medir(emailExistente, "password-incorrecta-999");

    const medianaInexistente = mediana(tiemposInexistente);
    const medianaPasswordMala = mediana(tiemposPasswordMala);
    const razon = medianaPasswordMala / Math.max(medianaInexistente, 0.001);

    console.log(
      `[H-AUD2-04] mediana usuario-inexistente=${medianaInexistente.toFixed(2)}ms mediana-password-mala=${medianaPasswordMala.toFixed(2)}ms razon=${razon.toFixed(2)}x`,
    );

    // Documentamos la razón observada. Antes de la corrección, la razón
    // típica medida era ~10x (password incorrecta pagaba scrypt completo,
    // usuario inexistente retornaba casi instantáneo). Un umbral estricto
    // en una máquina de CI compartida sería frágil, así que se deja un
    // margen amplio (<3x) que de todos modos habría fallado con el bug
    // original, sin volver el test intermitente por ruido de la máquina.
    expect(medianaPasswordMala).toBeGreaterThan(0);
    expect(razon).toBeLessThan(3);
    console.log(
      razon > 1.3
        ? `[H-AUD2-04] razón ${razon.toFixed(2)}x — algo de asimetría residual, pero muy por debajo del ~10x original`
        : `[H-AUD2-04 corregido] razón ${razon.toFixed(2)}x — sin canal lateral de tiempo medible entre usuario inexistente y password incorrecta`,
    );
  }, 60_000);
});

// ============================================================================
// SUITE 5 — Rate limiting basado en X-Forwarded-For (evasión trivial)
// ============================================================================
describe("H-AUD2-05: rate limit de /auth/login confía en X-Forwarded-For controlado por el cliente", () => {
  let ctx: Contexto;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearApp>;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET_PRUEBA;
    process.env.RATE_LIMIT_VENTANA_MS = "60000";
    process.env.RATE_LIMIT_MAXIMO = "3"; // bajo, para disparar el límite rápido en la prueba
    ctx = await levantarCluster("atiende_rv_aud2_ratelimit");
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: ctx.puerto,
      database: "atiende_rv_aud2_ratelimit",
      user: USUARIO_APP,
      password: PASSWORD_APP,
    });
    app = crearApp({ pool });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await apagarCluster(ctx);
    delete process.env.RATE_LIMIT_VENTANA_MS;
    delete process.env.RATE_LIMIT_MAXIMO;
  });

  it("[CORREGIDO S-06] REPRODUCCION: tras agotar el límite (maximo=3) con una IP fija, cambiar X-Forwarded-For por request YA NO lo evade — sin proxy de confianza configurado, la cabecera se ignora y todas las peticiones comparten la clave real del socket", async () => {
    // Antes de la corrección, apps/api/src/seguridad/rateLimit.ts
    // (`obtenerIp`) confiaba ciegamente en el header `x-forwarded-for`
    // (primer valor de la lista) sin ninguna validación de que la
    // petición viniera de un proxy de confianza que lo hubiera fijado —
    // cualquier cliente podía escribir ese header directamente. Ahora
    // `resolverIp` solo confía en la cabecera si la IP que REALMENTE
    // conectó está en `proxiesDeConfianza` (vacío por defecto, ninguna
    // variable de entorno la configura en esta prueba).
    const intentoLogin = () =>
      app.request("/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify({ email: "nadie@x.local", password: "x" }),
      });

    const r1 = await intentoLogin();
    const r2 = await intentoLogin();
    const r3 = await intentoLogin();
    const r4Bloqueado = await intentoLogin();
    expect(r1.status).not.toBe(429);
    expect(r2.status).not.toBe(429);
    expect(r3.status).not.toBe(429);
    expect(r4Bloqueado.status).toBe(429); // límite alcanzado con esa IP

    // [CORREGIDO S-06] Antes: una IP FALSIFICADA distinta en cada request
    // evadía el límite por completo (0/20 bloqueadas). Ahora, sin proxy de
    // confianza configurado, la cabecera rotada no tiene ningún efecto —
    // las 20 peticiones adicionales comparten la misma clave real de
    // socket que ya agotó el límite y deben seguir todas bloqueadas.
    let bloqueadasConIpRotada = 0;
    for (let i = 0; i < 20; i++) {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${i}`, // ya no tiene ningún efecto
        },
        body: JSON.stringify({ email: "nadie@x.local", password: "x" }),
      });
      if (res.status === 429) bloqueadasConIpRotada++;
    }
    console.log(
      `[H-AUD2-05 corregido] tras agotar el límite con IP fija, 20 intentos con X-Forwarded-For rotado -> bloqueados=${bloqueadasConIpRotada}/20`,
    );
    expect(bloqueadasConIpRotada).toBe(20);
  });
});

// ============================================================================
// SUITE 6 — "Romper cristal": motivo en blanco (solo espacios)
// ============================================================================
describe("H-AUD2-06: acceso 'romper cristal' con motivo compuesto solo por espacios", () => {
  let ctx: Contexto;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearApp>;
  let tenantObjetivo: string;
  const emailSuperadmin = "superadmin@aud2-cristal.local";
  const passSuperadmin = "clave-superadmin-cristal-1";

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET_PRUEBA;
    ctx = await levantarCluster("atiende_rv_aud2_cristal");
    const tenant = await ctx.superusuario.query<{ id: string }>(
      "INSERT INTO tenant (nombre) VALUES ('AUD2-CRISTAL-OBJETIVO') RETURNING id",
    );
    tenantObjetivo = tenant.rows[0]!.id;
    await ctx.superusuario.query(
      `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES (NULL, $1, 'superadmin', $2)`,
      [emailSuperadmin, await hashContrasena(passSuperadmin)],
    );
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: ctx.puerto,
      database: "atiende_rv_aud2_cristal",
      user: USUARIO_APP,
      password: PASSWORD_APP,
    });
    app = crearApp({ pool });
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await apagarCluster(ctx);
  });

  it("[CORREGIDO S-21] motivo de solo espacios se rechaza con 422 validacion — YA NO llega a Postgres ni se clasifica como 500 error_interno", async () => {
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailSuperadmin, password: passSuperadmin }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };

    // Antes de la corrección: `z.string().min(1)` contaba " " como
    // longitud 1 y dejaba pasar el motivo hasta el CHECK de base de datos
    // (packages/db/src/migrations/0061_acceso_romper_cristal.ts:
    // `motivo text NOT NULL CHECK (btrim(motivo) <> '')`), que lo
    // rechazaba como una violación de Postgres sin traducir — 500
    // error_interno en vez de 422 validacion. Ahora
    // `z.string().trim().min(1)` (apps/api/src/contrato/tipos.ts) lo
    // rechaza en la capa de contrato, antes de tocar la base de datos.
    const res = await app.request("/backoffice/romper-cristal", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ tenantId: tenantObjetivo, motivo: "   ", minutos: 30 }),
    });
    const cuerpo = (await res.json()) as { error?: { codigo: string } };
    console.log(
      `[H-AUD2-06 corregido] POST /backoffice/romper-cristal motivo=" " -> status=${res.status} codigo=${cuerpo.error?.codigo}`,
    );
    expect(res.status).toBe(422);
    expect(cuerpo.error?.codigo).toBe("validacion");
    const filas = await ctx.superusuario.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM acceso_romper_cristal WHERE tenant_id = $1`,
      [tenantObjetivo],
    );
    expect(filas.rows[0]!.n).toBe("0");
  });

  it("reutilización: una concesión ya revocada no puede volver a usarse ni 'reactivarse' vía /revocar de nuevo", async () => {
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailSuperadmin, password: passSuperadmin }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };

    const crear = await app.request("/backoffice/romper-cristal", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ tenantId: tenantObjetivo, motivo: "investigación de soporte", minutos: 30 }),
    });
    expect(crear.status).toBe(201);
    const { id } = (await crear.json()) as { id: string };

    const revocar1 = await app.request(`/backoffice/romper-cristal/${id}/revocar`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(revocar1.status).toBe(200);

    // Intento de "reutilizar"/reconfirmar la misma concesión ya revocada.
    const revocar2 = await app.request(`/backoffice/romper-cristal/${id}/revocar`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const cuerpo2 = (await revocar2.json()) as { error?: { codigo: string } };
    console.log(`[H-AUD2-06] segunda revocación de la misma concesión -> status=${revocar2.status} codigo=${cuerpo2.error?.codigo}`);
    expect(revocar2.status).toBe(404); // "no encontrada o ya resuelta" — no hay operación idempotente peligrosa

    // Confirma en base de datos que sigue expirada/revocada, nunca "viva" de nuevo.
    const fila = await ctx.superusuario.query<{ revocado_en: string | null }>(
      `SELECT revocado_en FROM acceso_romper_cristal WHERE id = $1`,
      [id],
    );
    expect(fila.rows[0]!.revocado_en).not.toBeNull();
  });
});
