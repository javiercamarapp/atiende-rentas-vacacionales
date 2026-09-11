import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";

/**
 * Patrón 3 (rescatado de Likida/atiende.ai): antes de este patrón, SOLO
 * `/auth/mfa/verificar` (A3-AUTH-01) usaba un rate limit persistido en
 * Postgres (`LimitadorVentanaPostgres`, rate_limit_bucket). El límite
 * GLOBAL montado en TODAS las rutas públicas (`app.use("*", ...)`,
 * apps/api/src/app.ts) y el límite adicional por email de `/auth/login`
 * (apps/api/src/routes/auth.ts) seguían con `LimitadorVentana` — un `Map`
 * en memoria del proceso, ineficaz en el despliegue serverless real
 * (Vercel, múltiples instancias/cold starts, cada una con su propio `Map`
 * vacío). Ambos se migraron a `LimitadorVentanaPostgres`/
 * `crearRateLimitPostgres`, reusando `rate_limit_bucket` (misma tabla,
 * sin aprovisionar Redis).
 *
 * Esta prueba reproduce el mismo experimento "dos instancias / cold
 * starts" que `tests/auditoria-3/auth/rateLimitNoDistribuido.test.ts` usó
 * para A3-AUTH-01, pero contra `crearApp()` completo (HTTP real vía
 * `app.request()` en proceso — mismo patrón que la mayoría de
 * `test/integration/*.test.ts`, sin necesidad de un listener real porque
 * ni el límite global ni el de login dependen de un socket TCP real: se
 * degradan a la clave constante "socket-desconocido", documentado en
 * seguridad/rateLimit.ts) con DOS pools de conexión INDEPENDIENTES
 * (simulando dos contenedores serverless distintos) apuntando al MISMO
 * backend Postgres real (embedded-postgres).
 */

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

function puertoAleatorio(): number {
  return 61900 + Math.floor(Math.random() * 800);
}

process.env.JWT_SECRET = "prueba-jwt-secret-patron-3-rate-limit-al-menos-32-car";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";
// Ventana larga en todo el archivo: dentro de la duración de la prueba
// nunca se reinicia por tiempo (lo que falsearía el resultado), solo por
// alcanzar `maximo`.
process.env.RATE_LIMIT_VENTANA_MS = "600000";
process.env.RATE_LIMIT_LOGIN_EMAIL_VENTANA_MS = "600000";

let databaseDir: string;
let servidorPg: EmbeddedPostgres;
let superusuario: pg.Client;
let poolInstanciaA: pg.Pool;
let poolInstanciaB: pg.Pool;
// Dos PARES de crearApp() independientes, cada uno con su propio
// `RATE_LIMIT_MAXIMO`/`RATE_LIMIT_LOGIN_EMAIL_MAXIMO` — `cargarConfiguracion()`
// lee `process.env` de forma síncrona en el momento de `crearApp()`, así
// que basta con cambiar la variable ANTES de cada llamada. Necesario para
// aislar los dos límites entre sí: el límite GLOBAL usa la clave
// `IP:METODO:RUTA` — un `POST /auth/login` cuenta para ESA clave global
// sin importar el email — así que si ambos límites compartieran el mismo
// `maximo` bajo, las pruebas del límite por email chocarían con el límite
// global sobre la MISMA ruta (`/auth/login`) antes de poder aislar el
// comportamiento por email.
let appGlobalA: ReturnType<typeof crearApp>;
let appGlobalB: ReturnType<typeof crearApp>;
let appLoginA: ReturnType<typeof crearApp>;
let appLoginB: ReturnType<typeof crearApp>;

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-patron3-rate-limit-test-"));
  const puertoPg = puertoAleatorio();
  servidorPg = new EmbeddedPostgres({
    databaseDir,
    port: puertoPg,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidorPg.initialise();
  await servidorPg.start();
  await servidorPg.createDatabase("atiende_rv_patron3_rate_limit_test");

  superusuario = servidorPg.getPgClient("atiende_rv_patron3_rate_limit_test");
  await superusuario.connect();

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

  // Dos pools INDEPENDIENTES a propósito — cada uno representa una
  // instancia/contenedor serverless distinto con su propia conexión y su
  // propia memoria de proceso; lo único que comparten es la base de datos
  // real, exactamente como dos invocaciones de apps/api/api/index.ts en
  // Vercel apuntando al mismo DATABASE_URL.
  poolInstanciaA = new pg.Pool({
    host: "127.0.0.1",
    port: puertoPg,
    database: "atiende_rv_patron3_rate_limit_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  poolInstanciaB = new pg.Pool({
    host: "127.0.0.1",
    port: puertoPg,
    database: "atiende_rv_patron3_rate_limit_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });

  // Par 1: límite GLOBAL bajo (3) — usado SOLO para las rutas GET del
  // primer describe (nunca tocan /auth/login, así que el límite por email
  // alto/irrelevante aquí no importa).
  process.env.RATE_LIMIT_MAXIMO = "3";
  process.env.RATE_LIMIT_LOGIN_EMAIL_MAXIMO = "1000";
  appGlobalA = crearApp({ pool: poolInstanciaA });
  appGlobalB = crearApp({ pool: poolInstanciaB });

  // Par 2: límite GLOBAL alto (nunca se alcanza con las ~7 peticiones a
  // POST /auth/login de este archivo) + límite por email bajo (3) — así
  // que un 429 en este par SOLO puede venir del limitador por email, no
  // del genérico por IP+ruta, que comparte la MISMA clave
  // (`...:POST:/auth/login`) para cualquier email.
  process.env.RATE_LIMIT_MAXIMO = "1000";
  process.env.RATE_LIMIT_LOGIN_EMAIL_MAXIMO = "3";
  appLoginA = crearApp({ pool: poolInstanciaA });
  appLoginB = crearApp({ pool: poolInstanciaB });
}, 120_000);

afterAll(async () => {
  await poolInstanciaA?.end().catch(() => undefined);
  await poolInstanciaB?.end().catch(() => undefined);
  await superusuario?.end().catch(() => undefined);
  await servidorPg?.stop().catch(() => undefined);
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("Patrón 3 — límite GLOBAL (app.use('*', crearRateLimitPostgres)) comparte contador entre 'cold starts' vía Postgres", () => {
  it("agota el límite en la 'instancia A' sobre GET /health, y la 'instancia B' (su propio crearApp, su propio pool) queda bloqueada de inmediato para la MISMA clave (misma IP degradada + método + ruta)", async () => {
    // Las primeras 3 (RATE_LIMIT_MAXIMO=3 de este par de apps) pasan en
    // la instancia A.
    const r1 = await appGlobalA.request("/health");
    const r2 = await appGlobalA.request("/health");
    const r3 = await appGlobalA.request("/health");
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);

    // La 4a, en la MISMA instancia, ya rechaza (sanity check).
    const r4 = await appGlobalA.request("/health");
    expect(r4.status).toBe(429);

    // "Cold start" / instancia B: objeto crearApp() NUEVO, pool NUEVO. Si
    // el contador NO sobreviviera al cold start (el bug que corrige el
    // patrón 3), esta petición pasaría con 200, exactamente como pasaba
    // antes con `LimitadorVentana`/`crearRateLimit` en memoria. Con el
    // backend persistido, la ventana sigue vigente y el máximo ya se
    // alcanzó: debe rechazar de inmediato.
    const rB = await appGlobalB.request("/health");
    expect(rB.status).toBe(429);
  });

  it("una ruta DISTINTA en la instancia B no está bloqueada — la clave incluye el path, no es un candado global por IP", async () => {
    // Misma IP degradada ("socket-desconocido") que la prueba anterior,
    // pero GET /metrics es una clave distinta (`...:GET:/metrics` en vez
    // de `...:GET:/health`) — su propio contador, independiente.
    const res = await appGlobalB.request("/metrics");
    expect(res.status).toBe(200);
  });
});

describe("Patrón 3 — límite por email de /auth/login (LimitadorVentanaPostgres) comparte contador entre 'cold starts' vía Postgres", () => {
  const emailCompartido = "patron3-rate-limit@auth-test.local";

  async function intentoLogin(app: ReturnType<typeof crearApp>, email: string) {
    return app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "cualquier-password-no-importa-1234" }),
    });
  }

  it("agota el límite por email en la 'instancia A' (email inexistente, nunca toca el bloqueo de cuenta — un mecanismo distinto), y la 'instancia B' queda bloqueada de inmediato para el MISMO email", async () => {
    // Las primeras 3 (RATE_LIMIT_LOGIN_EMAIL_MAXIMO=3 de este par de
    // apps) pasan el rate limit y llegan hasta la lógica de negocio real:
    // como el email no existe, responden 401 (credenciales_invalidas),
    // nunca 429. El límite GLOBAL de este par está en 1000 — nunca
    // interfiere con las pocas peticiones de esta prueba.
    const r1 = await intentoLogin(appLoginA, emailCompartido);
    const r2 = await intentoLogin(appLoginA, emailCompartido);
    const r3 = await intentoLogin(appLoginA, emailCompartido);
    expect([r1.status, r2.status, r3.status]).toEqual([401, 401, 401]);

    // La 4a, en la MISMA instancia, ya rechaza por rate limit.
    const r4 = await intentoLogin(appLoginA, emailCompartido);
    expect(r4.status).toBe(429);

    // Instancia B ("cold start"): mismo email, contador compartido vía
    // Postgres — bloqueada de inmediato, sin necesidad de agotar sus
    // propios 3 intentos (lo que pasaría con LimitadorVentana en
    // memoria, el bug que corrige este patrón).
    const rB = await intentoLogin(appLoginB, emailCompartido);
    expect(rB.status).toBe(429);
  });

  it("un email DISTINTO en la instancia B no está bloqueado — el límite es por clave (email normalizado), no un candado global", async () => {
    const res = await intentoLogin(appLoginB, "otro-email-sin-relacion@auth-test.local");
    expect(res.status).toBe(401);
  });

  it("normaliza el email a mayúsculas/minúsculas a la MISMA clave que la versión ya bloqueada, consistente con `email.trim().toLowerCase()` en routes/auth.ts (el espacio en blanco NO se prueba aquí: `z.string().email()` ya lo rechaza con 422 antes de llegar al rate limit, sin espacio que normalizar)", async () => {
    const res = await intentoLogin(appLoginB, emailCompartido.toUpperCase());
    expect(res.status).toBe(429);
  });
});
