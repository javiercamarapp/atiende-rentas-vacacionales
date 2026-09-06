import { Hono } from "hono";
import { cors } from "hono/cors";
import pg from "pg";
import { cargarConfiguracion } from "./config/env.js";
import { cuerpoError, ErrorDominio } from "./contrato/errores.js";
import { crearLogger } from "./middleware/logger.js";
import { crearRutasFeedIcal } from "./routes/feedIcal.js";
import { registrarRutas } from "./routes/index.js";
import { cabecerasSeguridad } from "./seguridad/cabeceras.js";
import { KeyringCifradoCanal } from "./seguridad/cifrado.js";
import { crearRateLimit } from "./seguridad/rateLimit.js";
import { ZodError } from "zod";
import {
  construirExportadoresDesdeEntorno,
  crearMiddlewareObservabilidad,
  crearTrazador,
  leerConfiguracionOtelEntorno,
  RegistroMetricas,
  rutasObservabilidad,
} from "./workers/observabilidad/index.js";

export interface OpcionesCrearApp {
  /** Pool de conexión ya construido — inyectable en pruebas para apuntar
   * a `embedded-postgres` con el rol `app_rv` en vez de `DATABASE_URL`. */
  pool?: pg.Pool;
}

// Construcción de la app Hono (Lote 0: healthcheck; Lote 3: auth/RLS/
// auditoría/cifrado sobre el dominio de Lote 1). Separada de `index.ts`
// (arranque del server) para que las pruebas puedan importar `crearApp()`
// sin abrir un puerto real ni una conexión real a Postgres si inyectan su
// propio `pool` de pruebas.
export function crearApp(opciones: OpcionesCrearApp = {}) {
  const config = cargarConfiguracion();
  const app = new Hono();

  const pool = opciones.pool ?? new pg.Pool({ connectionString: config.databaseUrl || undefined });
  const keyring = new KeyringCifradoCanal(config.cifradoCanalClaves);

  app.use("*", cabecerasSeguridad);
  app.use("*", cors({ origin: config.origenWeb }));
  app.use("*", crearRateLimit(config.rateLimit));
  app.use("*", crearLogger());

  // Observabilidad (Lote 10, H-035/H-036): un span SERVER + métricas por
  // request, exportadas a consola/archivo en dev y a OTLP si
  // OTEL_EXPORTER_OTLP_ENDPOINT está configurado. `/metrics` y
  // `/health/detallado` viven en workers/observabilidad/rutas.ts.
  const metricas = new RegistroMetricas();
  const trazador = crearTrazador("atiende-rv-api", construirExportadoresDesdeEntorno(leerConfiguracionOtelEntorno()));
  app.use("*", crearMiddlewareObservabilidad(trazador, metricas));
  app.route("/", rutasObservabilidad({ metricas, pool }));

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      entorno: config.entorno,
      etiquetaEntorno: config.etiquetaEntorno,
      // Recordatorio explícito en el propio healthcheck: sin conexiones
      // productivas de ningún canal (DEFINICION-DE-HECHO §1).
      aviso: "Entorno de desarrollo — sin conexiones productivas",
    }),
  );

  // Feed .ics público (Lote 11B, corrección #3): montado ANTES de
  // `registrarRutas` a propósito, sin `requiereAutenticacion` — el token
  // opaco en la URL es la única credencial, nunca un JWT (un canal
  // externo suscribiendo esta URL no tiene sesión de usuario).
  app.route("/feed/ical", crearRutasFeedIcal(pool));

  registrarRutas(app, { pool, jwtSecret: config.jwtSecret, keyring, urlPublicaApi: config.urlPublicaApi });

  // Manejador central de errores: todo `ErrorDominio` mapea a su
  // `httpStatus`/`codigo` fijo (nunca 500 genérico para un error de
  // dominio esperado); `ZodError` de validación mapea a 422 sin ecoar el
  // valor recibido (evita reflejar una contraseña u otro dato sensible en
  // el propio mensaje de error); cualquier otro error es un 500 genérico
  // SIN el mensaje/stack original (§RV19/21-7: nunca exponer detalles
  // internos ni PII al cliente).
  app.onError((err, c) => {
    if (err instanceof ErrorDominio) {
      return c.json(cuerpoError(err), err.httpStatus as never);
    }
    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            codigo: "validacion",
            mensaje: "Datos de entrada inválidos",
            detalles: err.issues.map((i) => ({ path: i.path.join("."), mensaje: i.message })),
          },
        },
        422,
      );
    }
    console.error(JSON.stringify({ error: "no_manejado", mensaje: (err as Error).message }));
    return c.json({ error: { codigo: "error_interno", mensaje: "Error interno del servidor" } }, 500);
  });

  return app;
}
