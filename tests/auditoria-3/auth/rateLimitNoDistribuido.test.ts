// Auditoría-3 / A3-AUTH-01 — CORREGIDO.
//
// Hallazgo original: `apps/api/src/seguridad/rateLimit.ts` implementa
// `LimitadorVentana` como un `Map` en memoria del proceso Node. El propio
// archivo lo documenta ("básico... suficiente para un solo proceso... un
// despliegue multi-instancia necesita un backend compartido") como
// limitación conocida del limitador GENÉRICO por IP+ruta. El despliegue
// real evaluado en esta auditoría es Vercel serverless
// (apps/api/api/index.ts), donde cada invocación puede aterrizar en una
// instancia de función distinta (o una nueva tras un cold start), cada una
// con su propio proceso Node y por tanto su propio `Map` vacío.
//
// El problema de severidad ALTA no era ese límite genérico (defensa en
// profundidad, documentado, aceptado) sino que `POST /auth/mfa/verificar`
// (segundo factor: código TOTP de 6 dígitos o código de recuperación)
// dependía ÚNICAMENTE de él para frenar fuerza bruta contra el segundo
// factor durante los 5 minutos de vida del `mfaToken`
// (DURACION_MFA_PENDIENTE_SEGUNDOS = 300, apps/api/src/seguridad/jwt.ts) —
// a diferencia de `/auth/login`, que sí tiene un contador persistente en
// Postgres (`autenticar_registrar_intento_fallido`/`bloqueado_hasta`,
// migración 0106).
//
// Corrección: `apps/api/src/seguridad/rateLimitPostgres.ts` añade
// `LimitadorVentanaPostgres`, con el contador persistido en la tabla
// `rate_limit_bucket` (packages/db/src/migrations/0127_rate_limit_bucket.ts)
// en vez de un `Map`. `POST /auth/mfa/verificar` ahora lo usa, con clave
// por usuario (fuerte, ligada al mfaToken firmado) Y por IP (defensa
// adicional) — ver apps/api/src/routes/auth.ts.
//
// Este archivo tiene DOS bloques:
//   1. El original (sin tocar en su esencia): documenta que el limitador
//      GENÉRICO en memoria (`LimitadorVentana`/`crearRateLimit`) sigue
//      siendo, por diseño, no distribuido — eso NO cambió con este fix y
//      sigue siendo una limitación aceptada de esa pieza reutilizable
//      (dos procesos jamás comparten su `Map`). Ya no es la vulnerabilidad
//      A3-AUTH-01 porque la ruta sensible (MFA) dejó de depender
//      ÚNICAMENTE de él.
//   2. Uno NUEVO que reproduce el mismo experimento "dos instancias /
//      cold starts" pero contra `LimitadorVentanaPostgres`, con DOS pools
//      de conexión INDEPENDIENTES (simulando dos contenedores serverless
//      distintos, cada uno con su propia conexión, su propia memoria de
//      proceso) apuntando al MISMO backend Postgres real
//      (embedded-postgres, igual que test/integration/authExtendido.test.ts)
//      — y confirma que, a diferencia del bloque 1, el contador SÍ se
//      comparte: agotar el límite en la "instancia A" bloquea
//      inmediatamente a la "instancia B", sin esperar la ventana.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearRateLimit } from "../../../apps/api/src/seguridad/rateLimit.js";
import { LimitadorVentanaPostgres } from "../../../apps/api/src/seguridad/rateLimitPostgres.js";
import { ErrorDominio } from "../../../apps/api/src/contrato/errores.js";

function crearAppConLimite() {
  const app = new Hono();
  // Mismo mapeo de ErrorDominio -> HTTP que apps/api/src/app.ts (aquí
  // reducido a lo necesario para esta prueba: solo nos interesa que
  // "rate_limited" se traduzca a 429, tal como en la app real).
  app.onError((err, c) => {
    if (err instanceof ErrorDominio) return c.json({ codigo: err.codigo, mensaje: err.message }, err.httpStatus as never);
    throw err;
  });
  app.use("*", crearRateLimit({ ventanaMs: 60_000, maximo: 3 }));
  app.get("/mfa/verificar-simulado", (c) => c.json({ ok: true }));
  return app;
}

describe("Limitador GENÉRICO en memoria (LimitadorVentana/crearRateLimit): sigue sin ser distribuido, por diseño — defensa en profundidad, ya NO es el único freno de rutas sensibles", () => {
  it("agota el límite en una 'instancia', pero una 'instancia' nueva (cold start) lo resetea para la MISMA IP — comportamiento documentado sin cambios, NO es A3-AUTH-01 tras el fix", async () => {
    // Misma "IP" simulada en Hono test mode: en app.request() sin
    // @hono/node-server real, ipDelSocket() se degrada a la clave
    // constante "socket-desconocido" (ver rateLimit.ts), lo cual agrava
    // el efecto en esta prueba (todas las peticiones comparten clave)
    // pero es equivalente en naturaleza al caso real: el CONTADOR no
    // sobrevive entre instancias del middleware.
    const instanciaA = crearAppConLimite();

    const resultadosA: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await instanciaA.request("/mfa/verificar-simulado");
      resultadosA.push(res.status);
    }
    expect(resultadosA.slice(0, 3)).toEqual([200, 200, 200]);
    expect(resultadosA[3]).toBe(429);

    // "Cold start" / nueva instancia serverless: se crea una app nueva,
    // que instancia un `LimitadorVentana` nuevo (su propio `Map` vacío).
    const instanciaB = crearAppConLimite();
    const resultadosB: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await instanciaB.request("/mfa/verificar-simulado");
      resultadosB.push(res.status);
    }

    // Este límite GENÉRICO sigue reseteándose entre instancias — es la
    // pieza de defensa en profundidad documentada, no la vulnerabilidad
    // corregida. Ver el bloque de abajo para la ruta que sí importa.
    expect(resultadosB.slice(0, 3)).toEqual([200, 200, 200]);
    expect(resultadosB[3]).toBe(429);
  });
});

// ---------------------------------------------------------------------
// A3-AUTH-01 (corregido): LimitadorVentanaPostgres SÍ comparte estado
// entre instancias (cold starts simulados), vía el mismo backend Postgres.
// ---------------------------------------------------------------------
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

function puertoAleatorio(): number {
  return 61700 + Math.floor(Math.random() * 2000);
}

describe("A3-AUTH-01 (corregido): LimitadorVentanaPostgres comparte contador entre 'cold starts' vía Postgres", () => {
  let databaseDir: string;
  let servidorPg: EmbeddedPostgres;
  let superusuario: pg.Client;
  // Dos pools INDEPENDIENTES a propósito: cada uno representa una
  // instancia/contenedor serverless distinto con su propia conexión y su
  // propia memoria de proceso — lo único que comparten es la base de
  // datos real, exactamente como dos invocaciones de
  // apps/api/api/index.ts en Vercel apuntando al mismo DATABASE_URL.
  let poolInstanciaA: pg.Pool;
  let poolInstanciaB: pg.Pool;

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-a3-auth-01-test-"));
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
    await servidorPg.createDatabase("atiende_rv_a3_auth_01_test");

    superusuario = servidorPg.getPgClient("atiende_rv_a3_auth_01_test");
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
    // Aplica TODO el catálogo real (incluida 0127_rate_limit_bucket.ts) —
    // exactamente el esquema que corre en producción, no una tabla ad-hoc
    // solo para esta prueba.
    await aplicarMigraciones(ejecutor, migraciones);

    poolInstanciaA = new pg.Pool({
      host: "127.0.0.1",
      port: puertoPg,
      database: "atiende_rv_a3_auth_01_test",
      user: USUARIO_APP,
      password: PASSWORD_APP,
    });
    poolInstanciaB = new pg.Pool({
      host: "127.0.0.1",
      port: puertoPg,
      database: "atiende_rv_a3_auth_01_test",
      user: USUARIO_APP,
      password: PASSWORD_APP,
    });
  }, 120_000);

  afterAll(async () => {
    await poolInstanciaA?.end().catch(() => undefined);
    await poolInstanciaB?.end().catch(() => undefined);
    await superusuario?.end().catch(() => undefined);
    await servidorPg?.stop().catch(() => undefined);
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("agota el límite en la 'instancia A', y la 'instancia B' (cold start, su propio LimitadorVentanaPostgres, su propio pool) queda bloqueada de inmediato para la MISMA clave", async () => {
    const clave = "mfa_verificar:usuario:11111111-1111-1111-1111-111111111111";

    // Instancia A: cold start #1 — su propio LimitadorVentanaPostgres,
    // sin ningún estado compartido en JS con la instancia B (a propósito:
    // son dos `new LimitadorVentanaPostgres(...)` en dos `describe`
    // distintos del ciclo de vida serverless).
    const limitadorInstanciaA = new LimitadorVentanaPostgres({ ventanaMs: 60_000, maximo: 3 });
    const clienteA = await poolInstanciaA.connect();
    try {
      // Las primeras 3 pasan.
      await limitadorInstanciaA.registrarIntento(clienteA, clave);
      await limitadorInstanciaA.registrarIntento(clienteA, clave);
      await limitadorInstanciaA.registrarIntento(clienteA, clave);
      // La 4a, en la MISMA instancia, ya rechaza (sanity check: el propio
      // LimitadorVentanaPostgres respeta `maximo` tal como
      // LimitadorVentana).
      await expect(limitadorInstanciaA.registrarIntento(clienteA, clave)).rejects.toMatchObject({
        codigo: "rate_limited",
      });
    } finally {
      clienteA.release();
    }

    // "Cold start" / instancia B: objeto NUEVO, pool de conexión NUEVO
    // (conexión física distinta) — la única cosa que la instancia A y la
    // B comparten es la fila de `rate_limit_bucket` en Postgres.
    const limitadorInstanciaB = new LimitadorVentanaPostgres({ ventanaMs: 60_000, maximo: 3 });
    const clienteB = await poolInstanciaB.connect();
    try {
      // Si el contador NO sobreviviera al "cold start" (el bug original),
      // esta primera llamada de la instancia B pasaría con 200/permitido,
      // exactamente como en el bloque de arriba con LimitadorVentana. Con
      // el backend persistido, en cambio, la ventana sigue vigente y el
      // máximo ya se alcanzó: debe rechazar de inmediato.
      await expect(limitadorInstanciaB.registrarIntento(clienteB, clave)).rejects.toMatchObject({
        codigo: "rate_limited",
      });
    } finally {
      clienteB.release();
    }
  });

  it("una clave DISTINTA (otro usuario/otra IP) en la instancia B no está bloqueada — el límite es por clave, no un candado global", async () => {
    const limitadorInstanciaB = new LimitadorVentanaPostgres({ ventanaMs: 60_000, maximo: 3 });
    const clienteB = await poolInstanciaB.connect();
    try {
      await expect(
        limitadorInstanciaB.registrarIntento(clienteB, "mfa_verificar:usuario:22222222-2222-2222-2222-222222222222"),
      ).resolves.toBeUndefined();
    } finally {
      clienteB.release();
    }
  });

  it("concurrencia real entre dos conexiones/instancias distintas para la MISMA clave: el incremento atómico en Postgres nunca deja pasar más de `maximo` intentos en total", async () => {
    const clave = "mfa_verificar:usuario:33333333-3333-3333-3333-333333333333";
    const limitadorA = new LimitadorVentanaPostgres({ ventanaMs: 60_000, maximo: 5 });
    const limitadorB = new LimitadorVentanaPostgres({ ventanaMs: 60_000, maximo: 5 });

    // 5 intentos "simultáneos" desde CADA instancia (10 en total) contra
    // la MISMA clave — si el incremento no fuera atómico en Postgres,
    // dos conexiones podrían leer el mismo `cuenta` antes de escribir y
    // dejar pasar más de 5 en total (condición de carrera clásica de un
    // check-then-act no serializado).
    const clientesA = await Promise.all(Array.from({ length: 5 }, () => poolInstanciaA.connect()));
    const clientesB = await Promise.all(Array.from({ length: 5 }, () => poolInstanciaB.connect()));
    try {
      const resultados = await Promise.allSettled([
        ...clientesA.map((cliente) => limitadorA.registrarIntento(cliente, clave)),
        ...clientesB.map((cliente) => limitadorB.registrarIntento(cliente, clave)),
      ]);

      const permitidos = resultados.filter((r) => r.status === "fulfilled").length;
      const bloqueados = resultados.filter((r) => r.status === "rejected").length;

      expect(permitidos).toBe(5);
      expect(bloqueados).toBe(5);
    } finally {
      for (const cliente of [...clientesA, ...clientesB]) cliente.release();
    }
  });
});
