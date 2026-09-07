// Entrypoint serverless de Vercel Functions para apps/api (Lote 3.3,
// despliegue). NO reemplaza `apps/api/src/index.ts` (servidor Node.js
// tradicional con `@hono/node-server`, usado en desarrollo local y en la
// alternativa Docker/VPS — ver deploy/docker-compose.yml) — este archivo
// es un adaptador delgado exclusivo para el runtime "Functions" de
// Vercel, montado vía `vercel.json` (`functions."apps/api/api/index.ts"`)
// y las reescrituras `/api/*`.
//
// FAIL-CLOSED EN EL BORDE (requisito de despliegue, docs/despliegue/
// README.md): `crearApp()` llama a `cargarConfiguracion()`, que ABORTA
// (lanza) si faltan `JWT_SECRET`/`CANAL_CIFRADO_CLAVES` en un entorno que
// Vercel marca como productivo (`NODE_ENV=production` en Preview y
// Production por igual) — la política correcta de apps/api/src/config/
// env.ts (S-02/S-03). Sin este wrapper, ese throw ocurriría dentro del
// cold start de la función y Vercel devolvería un 500 genérico
// "FUNCTION_INVOCATION_FAILED" para CUALQUIER ruta, incluido `/health` —
// exactamente lo que un primer despliegue sin variables de entorno
// todavía configuradas produce. Aquí se captura ese error una sola vez
// (por instancia de función/cold start) y se sirve una app mínima que
// SIGUE fail-closed (todo devuelve 503, cero rutas de negocio) pero
// responde `/health` con 200 y un estado honesto en vez de reventar.
//
// Nota aparte, no relacionada con secretos: si los secretos SÍ están
// configurados pero `DATABASE_URL` no (p. ej. antes de aprovisionar el
// Postgres gestionado), `crearApp()` construye la app con normalidad —
// ver el campo `baseDeDatos` que agrega el propio `GET /health` en
// apps/api/src/app.ts.
import { handle } from "hono/vercel";
import { Hono } from "hono";
import { crearApp } from "../src/app.js";
import { esperarEnvioSentry, iniciarSentry, sentryEstaHabilitado } from "../src/observabilidad/sentry.js";

// Sentry (bucle B): se inicializa ANTES de construir la app (antes incluso
// de que `crearApp()`/`cargarConfiguracion()` puedan lanzar en el arranque
// fail-closed de arriba) — así un error de arranque real también queda
// instrumentado, no solo los errores de request ya en marcha. No-op total
// sin `SENTRY_DSN` (ver apps/api/src/observabilidad/sentry.ts).
iniciarSentry(process.env);

function construirAppSinConfigurar(motivo: string): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json(
      {
        status: "sin_configurar",
        baseDeDatos: "sin_configurar",
        aviso:
          "Despliegue sin las variables de entorno obligatorias (JWT_SECRET/CANAL_CIFRADO_CLAVES) todavía " +
          "configuradas en este proyecto de Vercel — ver docs/despliegue/README.md. Fail-closed: ninguna " +
          "ruta de negocio está activa hasta que se configuren.",
        motivo,
      },
      200,
    ),
  );

  app.all("*", (c) =>
    c.json(
      {
        error: {
          codigo: "servicio_no_configurado",
          mensaje:
            "Este despliegue todavía no tiene las variables de entorno obligatorias configuradas " +
            "(ver docs/despliegue/README.md).",
        },
      },
      503,
    ),
  );

  return app;
}

// Cacheada a nivel de módulo: se reconstruye solo en un cold start nuevo
// (mismo patrón que el pool de conexión dentro de `crearApp()`), nunca en
// cada invocación — evita relanzar el `try/catch` de configuración en
// cada request de una misma instancia de función ya caliente.
let appCache: Hono | undefined;

function obtenerApp(): Hono {
  if (appCache) return appCache;
  try {
    appCache = crearApp();
  } catch (err) {
    const motivo = err instanceof Error ? err.message : "Error de configuración desconocido";
    console.error(`[api/vercel] arranque fail-closed en el borde: ${motivo}`);
    appCache = construirAppSinConfigurar(motivo);
  }
  return appCache;
}

// Montada bajo `/api` (verificado con un despliegue de prueba real a
// Preview): `apps/api/src/app.ts` define sus rutas SIN prefijo
// (`GET /health`, `POST /onboarding/...`, etc. — el mismo árbol que sirve
// `@hono/node-server` en desarrollo, puerto 8787), pero Vercel reescribe
// `/api/(.*) -> /api` (`vercel.json`) preservando la URL ORIGINAL de la
// petición — Hono recibía literalmente `/api/health` y no encontraba
// ninguna ruta registrada para eso, cayendo siempre en el `app.all("*")`
// de repuesto (503) en vez de en `GET /health`. `.route("/api", app)`
// re-raíza el árbol completo de rutas bajo ese prefijo para que coincida
// con lo que el navegador y `apps/web/src/lib/api/cliente.ts`
// (`VITE_API_URL=/api`) de verdad piden.
function montarBajoApi(app: Hono): Hono {
  const raiz = new Hono();
  raiz.route("/api", app);
  return raiz;
}

// `fetch` NOMBRADA, NUNCA `export default` (verificado con un despliegue
// de prueba real a Preview): el launcher Node.js de Vercel interpreta un
// `export default` como la firma clásica `(req, res) => void` e ignora
// cualquier valor de retorno — nuestra función (vía `handle()` de
// `hono/vercel`) RETORNA un `Response` en vez de escribir en `res`, así
// que la petición se quedaba colgada hasta `FUNCTION_INVOCATION_TIMEOUT`
// (el propio runtime lo advierte: "default export returned a Response...
// Fix: export a `fetch` function"). `export const fetch` es la firma
// Web-estándar (mismo nombre que Cloudflare Workers) que Vercel sí
// reconoce para Node.js Functions modernas.
const manejarFetch = handle(montarBajoApi(obtenerApp()));

// Sentry (bucle B) + Vercel Functions: el proceso de una función puede
// congelarse apenas se envía la `Response` (no hay proceso "de larga
// vida" entre invocaciones) — el propio SDK/documentación de Sentry para
// entornos serverless advierte que, sin esperar explícitamente, un evento
// que su transporte todavía no terminó de mandar por red en ese instante
// se pierde en silencio. `Sentry.flush(2000)` (apps/api/src/observabilidad/
// sentry.ts#esperarEnvioSentry) vacía esa cola antes de dejar terminar la
// invocación — con timeout acotado para no alargar la latencia de la
// respuesta al cliente más de 2s en el peor caso. No-op (sin `await` real)
// si Sentry no está habilitado.
export const fetch: typeof manejarFetch = sentryEstaHabilitado()
  ? (async (...args: Parameters<typeof manejarFetch>) => {
      try {
        return await manejarFetch(...args);
      } finally {
        await esperarEnvioSentry(2000);
      }
    })
  : manejarFetch;
