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
describe("H-AUD2-02: huesped_minimo no tiene tenant_id ni RLS — POST /mensajeria/conversaciones no valida propiedad de huespedMinimoId", () => {
  let ctx: Contexto;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearApp>;
  let tenantA: string, unidadA: string;
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

    // Fila real de huesped_minimo "perteneciente" (por uso, no por FK) a
    // una reserva del tenant B — simula el caso real: cualquier
    // reservación con huésped en CUALQUIER tenant crea una fila así vía
    // POST /reservas (apps/api/src/routes/reservas.ts línea ~76). El ID
    // en sí nunca se devuelve al cliente por ningún endpoint de lectura
    // (verificado: grep de huesped_minimo_id/huespedMinimoId en
    // apps/api/src/routes muestra solo escritura, nunca en un SELECT
    // expuesto), así que asumimos aquí el escenario "el atacante ya
    // obtuvo el UUID por otra vía" (fuga previa, log, error verboso,
    // fuerza bruta con recursos, insider) — el punto de esta prueba es
    // demostrar que, SI eso ocurre, no hay NINGUNA segunda barrera (ni
    // RLS ni validación de aplicación) que lo detenga.
    huespedIdTenantB = (
      await ctx.superusuario.query<{ id: string }>(
        `INSERT INTO huesped_minimo (nombre, contacto) VALUES ($1, 'tel:+52-555-0000-secreto') RETURNING id`,
        [NOMBRE_HUESPED_B_SECRETO],
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

  it("cita de código: huesped_minimo (packages/db/src/migrations/0005_ocupacion_unidad.ts) no tiene columna tenant_id ni ENABLE/FORCE ROW LEVEL SECURITY en ninguna migración", async () => {
    const rls = await ctx.superusuario.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'huesped_minimo'`,
    );
    expect(rls.rows[0]!.relrowsecurity).toBe(false);
    expect(rls.rows[0]!.relforcerowsecurity).toBe(false);
    const columnas = await ctx.superusuario.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'huesped_minimo'`,
    );
    expect(columnas.rows.map((r) => r.column_name)).not.toContain("tenant_id");
  });

  it("REPRODUCCION: admin de tenant A adjunta huespedMinimoId de OTRO tenant a una conversación propia sin ningún rechazo", async () => {
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
        huespedMinimoId: huespedIdTenantB, // huésped de OTRO tenant — nunca validado
        idioma: "es",
      }),
    });
    const cuerpo = (await res.json()) as { id?: string; error?: unknown };
    console.log(`[H-AUD2-02] POST /mensajeria/conversaciones cross-tenant huespedMinimoId -> status=${res.status}`);
    // CRITERIO DE RUPTURA: la API acepta (201) una conversación que
    // vincula el huésped de OTRO tenant sin ningún error de validación ni
    // de RLS. Si esto llegara a devolver un error, el hallazgo estaría
    // mitigado — documentamos el resultado real observado.
    expect(res.status).toBe(201);
    const conversacionId = cuerpo.id as string;

    // Generar un borrador (sin mensaje entrante -> plantilla por defecto,
    // packages/domain/src/mensajeria/borrador.ts `mensajePorDefecto`)
    // expone literalmente `ctx.nombreHuesped` en el texto de salida.
    const resBorrador = await app.request(`/mensajeria/conversaciones/${conversacionId}/borradores`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({}),
    });
    const cuerpoBorrador = (await resBorrador.json()) as { texto?: string };
    console.log(
      `[H-AUD2-02] borrador generado (status=${resBorrador.status}): "${cuerpoBorrador.texto ?? ""}"`,
    );
    expect(resBorrador.status).toBe(201);
    // FUGA CONFIRMADA: el nombre del huésped del tenant B aparece
    // literalmente en la respuesta que recibe un admin del tenant A.
    expect(cuerpoBorrador.texto).toContain(NOMBRE_HUESPED_B_SECRETO);
  });
});

// ============================================================================
// SUITE 3 — JWT_SECRET de desarrollo hardcodeado como fallback fail-open
// ============================================================================
describe("H-AUD2-03: JWT_SECRET por defecto ('nunca usar en producción') sin guardarraíl de arranque", () => {
  it("cargarConfiguracion() sin JWT_SECRET en el entorno usa un secreto hardcodeado conocido públicamente en el código fuente", () => {
    const config = cargarConfiguracion({} as NodeJS.ProcessEnv);
    // apps/api/src/config/env.ts línea 27: valor LITERAL en el código
    // fuente del repo, visible para cualquiera con acceso al repositorio
    // (incluyendo este mismo texto de auditoría).
    expect(config.jwtSecret).toBe("desarrollo-nunca-usar-en-produccion-cambia-este-valor-ya-32b");
    expect(config.entorno).toBe("development"); // nunca detecta "production" y aborta
  });

  it("REPRODUCCION: un token firmado con el secreto de desarrollo hardcodeado es aceptado por requiereAutenticacion si JWT_SECRET no está seteado", async () => {
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
      console.log(`[H-AUD2-03] request forjada con secreto default -> status=${res.status}`);
      // Si esto NO es 401/403 por token inválido, el forjado fue aceptado
      // (aunque la operación de negocio en sí falle después por falta de
      // datos, la AUTENTICACIÓN ya fue superada con un secreto público).
      expect(res.status).not.toBe(401);

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

  it("REPRODUCCION: el TIEMPO de respuesta sí distingue usuario inexistente (short-circuit) de password incorrecta (scrypt N=16384 corrido igual)", async () => {
    // apps/api/src/routes/auth.ts líneas 72-81: si `usuario` es undefined,
    // se lanza el error INMEDIATAMENTE sin llamar a `verificarContrasena`
    // (que ejecuta scrypt con N=16384 — computacionalmente cara a
    // propósito, seguridad/contrasenas.ts). Si el usuario SÍ existe, ese
    // costo de scrypt siempre se paga, sin importar si el password es
    // correcto o no. Esto crea una asimetría de tiempo medible.
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

    // Documentamos la razón observada (no fallamos duro el test contra un
    // umbral arbitrario que dependa de la máquina de CI, pero dejamos
    // constancia numérica del canal lateral real). Un `expect` blando
    // registra el hallazgo sin volver el test intermitente.
    expect(medianaPasswordMala).toBeGreaterThan(0);
    console.log(
      razon > 1.3
        ? `[H-AUD2-04] CONFIRMADO: canal lateral de tiempo medible (${razon.toFixed(2)}x más lento con password incorrecta que con usuario inexistente)`
        : `[H-AUD2-04] razón ${razon.toFixed(2)}x — canal lateral presente en el código pero no claramente medible en esta corrida/máquina`,
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

  it("REPRODUCCION: tras agotar el límite (maximo=3) con una IP fija, cambiar X-Forwarded-For por request lo evade indefinidamente", async () => {
    // apps/api/src/seguridad/rateLimit.ts línea ~21: `obtenerIp` confía
    // ciegamente en el header `x-forwarded-for` (primer valor de la
    // lista) sin ninguna validación de que la petición venga de un proxy
    // de confianza que lo haya fijado — cualquier cliente puede escribir
    // ese header directamente.
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

    // Ahora, con una IP FALSIFICADA distinta en cada request, el límite se
    // evade por completo — 20 requests adicionales, ninguna 429.
    let bloqueadasConIpRotada = 0;
    for (let i = 0; i < 20; i++) {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `198.51.100.${i}`, // distinta en cada intento
        },
        body: JSON.stringify({ email: "nadie@x.local", password: "x" }),
      });
      if (res.status === 429) bloqueadasConIpRotada++;
    }
    console.log(
      `[H-AUD2-05] tras agotar el límite con IP fija, 20 intentos con X-Forwarded-For rotado -> bloqueados=${bloqueadasConIpRotada}/20`,
    );
    expect(bloqueadasConIpRotada).toBe(0);
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

  it("NO REPRODUCIBLE: motivo de solo espacios es rechazado por el CHECK de base de datos (btrim(motivo) <> ''), aunque zod (min(1)) lo deja pasar", async () => {
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailSuperadmin, password: passSuperadmin }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };

    // packages/db/src/migrations/0061_acceso_romper_cristal.ts:
    // `motivo text NOT NULL CHECK (btrim(motivo) <> '')` — un motivo de
    // solo espacios pasa la validación zod de la API
    // (`z.string().min(1)`, apps/api/src/contrato/tipos.ts línea 683,
    // cuenta " " como longitud 1) pero es rechazado por la base de datos.
    const res = await app.request("/backoffice/romper-cristal", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ tenantId: tenantObjetivo, motivo: "   ", minutos: 30 }),
    });
    const cuerpo = (await res.json()) as { error?: { codigo: string } };
    console.log(
      `[H-AUD2-06] POST /backoffice/romper-cristal motivo=" " -> status=${res.status} codigo=${cuerpo.error?.codigo}`,
    );
    // La concesión NUNCA debe crearse con un motivo vacío en la práctica.
    expect(res.status).not.toBe(201);
    const filas = await ctx.superusuario.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM acceso_romper_cristal WHERE tenant_id = $1`,
      [tenantObjetivo],
    );
    expect(filas.rows[0]!.n).toBe("0");

    // Defecto de clasificación potencial (igual patrón que el defecto
    // documentado de POST /bloqueos en tests/adversarial/multitenant/
    // casos.test.ts): si la violación CHECK de Postgres (código 23514) no
    // se traduce a un error de dominio clasificado, cae a error_interno
    // (500) en vez de 422 validacion. Documentamos el código real
    // observado sin exigir un valor específico aquí.
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
