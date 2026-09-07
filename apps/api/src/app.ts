import { Hono } from "hono";
import { cors } from "hono/cors";
import pg from "pg";
import { obtenerPoolServerlessCompartido, verificarSaludBaseDeDatos } from "@atiende-rv/db";
import { cargarConfiguracion } from "./config/env.js";
import { cuerpoError, ErrorDominio } from "./contrato/errores.js";
import { crearLogger } from "./middleware/logger.js";
import { crearRutasFeedIcal } from "./routes/feedIcal.js";
import { registrarRutas } from "./routes/index.js";
import { cabecerasSeguridad } from "./seguridad/cabeceras.js";
import { KeyringCifradoCanal } from "./seguridad/cifrado.js";
import { construirAdaptadorCorreo } from "./seguridad/correo.js";
import { capturarErrorNoManejado, crearRutaPruebaSentry } from "./observabilidad/sentry.js";
import { construirPagosStripeDesdeEntorno, PagosSimulado } from "@atiende-rv/domain/facturacion";
import { crearRateLimit } from "./seguridad/rateLimit.js";
import { ZodError, type ZodIssue } from "zod";
import {
  construirExportadoresDesdeEntorno,
  crearMiddlewareObservabilidad,
  crearTrazador,
  leerConfiguracionOtelEntorno,
  redactarPiiEnTexto,
  RegistroMetricas,
  rutasObservabilidad,
} from "./workers/observabilidad/index.js";

export interface OpcionesCrearApp {
  /** Pool de conexión ya construido — inyectable en pruebas para apuntar
   * a `embedded-postgres` con el rol `app_rv` en vez de `DATABASE_URL`. */
  pool?: pg.Pool;
}

/** S-15 (docs/auditoria-2/seguridad.md): el mensaje por defecto de Zod
 * para `invalid_enum_value` SÍ incluye el valor recibido tal cual
 * ("Invalid enum value. Expected 'a' | 'b', received 'xxx'") — contradice
 * el comentario explícito de este archivo ("ZodError... sin ecoar el
 * valor recibido"). Cualquier dato sensible enviado en un campo enum
 * (p. ej. una cadena con forma de credencial que el cliente puso por
 * error en el campo equivocado) terminaba reflejado en la respuesta 422.
 * Se reconstruye el mensaje para ese código de issue sin el valor
 * recibido; el resto de códigos de Zod (`invalid_type`, `too_small`, …)
 * ya no ecoan el valor en su mensaje por defecto, solo su tipo/forma. */
function mensajeZodSinEcoar(issue: ZodIssue): string {
  if (issue.code === "invalid_enum_value") {
    return `Invalid enum value. Expected one of: ${issue.options.join(", ")}`;
  }
  return issue.message;
}

// Construcción de la app Hono (Lote 0: healthcheck; Lote 3: auth/RLS/
// auditoría/cifrado sobre el dominio de Lote 1). Separada de `index.ts`
// (arranque del server) para que las pruebas puedan importar `crearApp()`
// sin abrir un puerto real ni una conexión real a Postgres si inyectan su
// propio `pool` de pruebas.
export function crearApp(opciones: OpcionesCrearApp = {}) {
  const config = cargarConfiguracion();
  const app = new Hono();

  // Con `DATABASE_URL` real, el pool sale del helper serverless de
  // packages/db (SSL automático para hosts gestionados como Supabase,
  // tamaño de pool acotado y caché a nivel de módulo entre invocaciones
  // de Vercel Functions — ver conexionServerless.ts). Sin URL se conserva
  // el comportamiento anterior (pool "vacío" que solo falla al usarse).
  const pool =
    opciones.pool ??
    (config.databaseUrl
      ? obtenerPoolServerlessCompartido(config.databaseUrl)
      : new pg.Pool({ connectionString: undefined }));
  const keyring = new KeyringCifradoCanal(config.cifradoCanalClaves);
  // Lote 3.3 (RV16): Stripe real SOLO si AMBAS variables están presentes
  // (fail-safe hacia PagosSimulado, nunca un adaptador Stripe a medias) —
  // ver packages/domain/src/facturacion/pagos/stripe.ts.
  const pagos = construirPagosStripeDesdeEntorno({
    STRIPE_SECRET_KEY: config.stripe.claveSecreta ?? undefined,
    STRIPE_WEBHOOK_SECRET: config.stripe.secretoWebhook ?? undefined,
  }) ?? new PagosSimulado();

  app.use("*", cabecerasSeguridad);
  // `credentials: true` (Lote 3.2, H-096): imprescindible para que el
  // navegador envíe/reciba la cookie httpOnly de refresh + la cookie CSRF
  // del cliente 'web' en peticiones cross-origin (apps/web en :5173, esta
  // API en :8787 en desarrollo) — sin esto el navegador descarta
  // silenciosamente cualquier `Set-Cookie` de una respuesta CORS.
  app.use("*", cors({ origin: config.origenWeb, credentials: true }));
  app.use("*", crearRateLimit(config.rateLimit));
  app.use("*", crearLogger());

  // Observabilidad (Lote 10, H-035/H-036): un span SERVER + métricas por
  // request, exportadas a consola/archivo en dev y a OTLP si
  // OTEL_EXPORTER_OTLP_ENDPOINT está configurado. `/metrics` y
  // `/health/detallado` viven en workers/observabilidad/rutas.ts.
  const metricas = new RegistroMetricas();
  const trazador = crearTrazador("atiende-rv-api", construirExportadoresDesdeEntorno(leerConfiguracionOtelEntorno()));
  app.use("*", crearMiddlewareObservabilidad(trazador, metricas));
  app.route("/", rutasObservabilidad({ metricas, pool, jwtSecret: config.jwtSecret }));
  // Sentry (bucle B): ruta interna de verificación end-to-end de la
  // integración, fail-closed sin CRON_SECRET — ver
  // apps/api/src/observabilidad/sentry.ts y docs/despliegue/sentry.md.
  app.route("/internal", crearRutaPruebaSentry());

  app.get("/health", async (c) => {
    // Lote 3.3 (despliegue, D-DSD-15): estado HONESTO de `DATABASE_URL` —
    // antes este campo era `config.databaseUrl ? "configurada" :
    // "sin_configurar"`, un chequeo puramente sintáctico que reportaba
    // "configurada" incluso con una URL rota/inalcanzable. Ahora:
    // "sin_configurar" (sin URL, sin abrir conexión), "ok" (un `SELECT 1`
    // real respondió dentro del timeout) o "error" (con `baseDeDatosMotivo`
    // corto y sin credenciales — ver packages/db/src/runner/
    // saludBaseDeDatos.ts). `migracionesPendientes` solo se agrega cuando
    // "ok" y es barato de calcular (una consulta adicional a
    // `schema_migrations`, ya contra una conexión que se sabe viva).
    const saludDb = await verificarSaludBaseDeDatos(config.databaseUrl);
    return c.json({
      status: "ok",
      entorno: config.entorno,
      etiquetaEntorno: config.etiquetaEntorno,
      // Recordatorio explícito en el propio healthcheck: sin conexiones
      // productivas de ningún canal (DEFINICION-DE-HECHO §1).
      aviso: "Entorno de desarrollo — sin conexiones productivas",
      baseDeDatos: saludDb.estado,
      ...(saludDb.motivo !== undefined ? { baseDeDatosMotivo: saludDb.motivo } : {}),
      ...(saludDb.migracionesPendientes !== undefined
        ? { migracionesPendientes: saludDb.migracionesPendientes }
        : {}),
    });
  });

  // Feed .ics público (Lote 11B, corrección #3): montado ANTES de
  // `registrarRutas` a propósito, sin `requiereAutenticacion` — el token
  // opaco en la URL es la única credencial, nunca un JWT (un canal
  // externo suscribiendo esta URL no tiene sesión de usuario).
  app.route("/feed/ical", crearRutasFeedIcal(pool));

  registrarRutas(app, {
    pool,
    jwtSecret: config.jwtSecret,
    keyring,
    urlPublicaApi: config.urlPublicaApi,
    rateLimitLoginPorEmail: config.rateLimitLoginPorEmail,
    pagos,
    // Lote 3.2 (H-096+): auth extendida (Google OIDC, correo, política de
    // contraseñas/bloqueo, proveedor OIDC simulado) — ver DependenciasAuth
    // en routes/auth.ts.
    auth: {
      correo: construirAdaptadorCorreo(process.env),
      urlPublicaApi: config.urlPublicaApi,
      urlPublicaWeb: config.urlPublicaWeb,
      google: config.google,
      oidcSimuladoHabilitado: config.oidcSimuladoHabilitado,
      politicaContrasenaHibp: config.politicaContrasenaHibp,
      bloqueoCuenta: config.bloqueoCuenta,
      entorno: config.entorno,
    },
  });

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
            detalles: err.issues.map((i) => ({ path: i.path.join("."), mensaje: mensajeZodSinEcoar(i) })),
          },
        },
        422,
      );
    }
    // S-10 (docs/auditoria-2/seguridad.md): errores nativos de Postgres
    // (p. ej. invalid_text_representation al castear un valor a uuid)
    // incluyen el valor recibido en su propio mensaje — antes se pasaba
    // completo a console.error sin sanear, potencial PII en texto plano.
    console.error(
      JSON.stringify({ error: "no_manejado", mensaje: redactarPiiEnTexto((err as Error).message) }),
    );
    // Sentry (bucle B): solo la rama de 500 genérico — NUNCA cambia el
    // código/cuerpo de esta respuesta, es puramente un efecto secundario
    // de observabilidad; no-op si SENTRY_DSN no está configurado. Los
    // `ErrorDominio`/`ZodError` de arriba son flujo de control esperado,
    // no bugs — no se envían a Sentry.
    capturarErrorNoManejado(err);
    return c.json({ error: { codigo: "error_interno", mensaje: "Error interno del servidor" } }, 500);
  });

  return app;
}
