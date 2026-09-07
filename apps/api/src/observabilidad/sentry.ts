// Sentry (bucle B, docs/PROGRAMA-PUNTA-A-PUNTA.md): monitoreo de errores
// de la API, ESTRICTAMENTE OPCIONAL por entorno — mismo criterio
// fail-closed/"nada finge producción" que el resto de adaptadores reales
// de este repo (D-017/D-019): sin `SENTRY_DSN`, `iniciarSentry` no llama
// `Sentry.init` en absoluto, así que el SDK nunca abre una conexión de
// red ni instrumenta nada — cero llamadas de red, cero overhead. Única
// excepción aceptada a "sin SDKs pesados" (ver guardias del programa):
// `@sentry/node` es el SDK oficial, dependencia real de `apps/api`
// (queda como `external` en `deploy/build-api-vercel.mjs` automáticamente,
// porque ese script toma la lista de externos de
// `apps/api/package.json#dependencies` — no hace falta tocar el script).
//
// Este módulo NO se conecta directamente a los workers de
// `apps/api/src/workers/observabilidad/**` (outboxWorker, cicloSync
// Instrumentado) — ese árbol es territorio del paquete A (`cron-sync`,
// ver "Archivos" del programa). En vez de editar esos archivos, se expone
// aquí `capturarExcepcionWorker`, ya lista para que quien integre esos
// workers (o una vuelta futura) llame `captureException` con los tags
// `worker`/`canalId`/`tenantId` sin datos personales — evita el solape de
// archivos mutables entre paquetes en la misma vuelta del bucle.
import { Hono } from "hono";
import * as Sentry from "@sentry/node";

/** Cabeceras HTTP que nunca deben llegar a Sentry tal cual — llevan
 * credenciales de sesión/autenticación completas. */
const CABECERAS_SENSIBLES = new Set(["authorization", "cookie", "set-cookie", "x-csrf-token"]);

/** Nombres de campo que, sin importar dónde aparezcan en el payload de un
 * evento (cuerpo de request, `extra`, `contexts`), delatan un secreto —
 * coincide por substring/insensible a mayúsculas a propósito (cubre
 * `password`, `contraseña`, `refreshToken`, `DATABASE_URL`,
 * `jwt_secret`, `client_secret`, etc.) en vez de una lista cerrada de
 * nombres exactos, que un campo nuevo podría esquivar por accidente. */
const PATRON_CAMPO_SECRETO = /pass(word)?|contrase|token|secret|clave|api[_-]?key|database_url|authorization|cookie/i;

const MARCADOR_REDACTADO = "[REDACTADO]";

/** Límite de profundidad de recursión al redactar objetos anidados —
 * defensivo contra una referencia circular o un payload patológicamente
 * profundo que un atacante controle parcialmente (nunca debe colgar
 * `beforeSend`, que corre en el hot path de cualquier excepción). */
const PROFUNDIDAD_MAXIMA_REDACCION = 8;

function redactarValor(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (profundidad >= PROFUNDIDAD_MAXIMA_REDACCION) return MARCADOR_REDACTADO;
  if (Array.isArray(valor)) return valor.map((v) => redactarValor(v, profundidad + 1));
  if (typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      salida[clave] = PATRON_CAMPO_SECRETO.test(clave) ? MARCADOR_REDACTADO : redactarValor(v, profundidad + 1);
    }
    return salida;
  }
  return valor;
}

function redactarCabeceras(cabeceras: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!cabeceras) return cabeceras;
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(cabeceras)) {
    salida[clave] = CABECERAS_SENSIBLES.has(clave.toLowerCase()) ? MARCADOR_REDACTADO : valor;
  }
  return salida;
}

function redactarCookies(cookies: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!cookies) return cookies;
  const salida: Record<string, string> = {};
  for (const clave of Object.keys(cookies)) {
    salida[clave] = MARCADOR_REDACTADO;
  }
  return salida;
}

/**
 * `beforeSend` de Sentry, exportado de forma independiente para poder
 * probarlo sin inicializar el SDK real (mockeado en los tests). Nunca
 * lanza: un evento que no calce con la forma esperada se devuelve tal
 * cual saneado en lo que se pueda, nunca se descarta por accidente.
 *
 * - Cabeceras `authorization`/`cookie`/`set-cookie` → redactadas.
 * - Cualquier campo cuyo NOMBRE parezca un secreto (password/token/
 *   secret/DATABASE_URL/...) en el cuerpo de la request, `extra` o
 *   `contexts` → redactado, sin importar en qué nivel de anidamiento.
 * - `user.email` → eliminado salvo `enviarPii === true`
 *   (`SENTRY_SEND_PII=true`, opt-in explícito).
 */
export function redactarEventoSentry(event: Sentry.ErrorEvent, enviarPii: boolean): Sentry.ErrorEvent {
  const copia: Sentry.ErrorEvent = { ...event };

  if (copia.request) {
    copia.request = {
      ...copia.request,
      headers: redactarCabeceras(copia.request.headers),
      data: redactarValor(copia.request.data),
      cookies: redactarCookies(copia.request.cookies),
    };
  }
  if (copia.extra) {
    copia.extra = redactarValor(copia.extra) as typeof copia.extra;
  }
  if (copia.contexts) {
    copia.contexts = redactarValor(copia.contexts) as typeof copia.contexts;
  }
  if (!enviarPii && copia.user) {
    const { email: _correoOmitido, ...restoUsuario } = copia.user;
    copia.user = restoUsuario;
  }

  return copia;
}

const TASA_MUESTREO_TRAZAS_POR_DEFECTO = 0.1;

function parsearTasaMuestreo(valor: string | undefined): number {
  if (valor === undefined || valor.trim() === "") return TASA_MUESTREO_TRAZAS_POR_DEFECTO;
  const numero = Number.parseFloat(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 1) return TASA_MUESTREO_TRAZAS_POR_DEFECTO;
  return numero;
}

let sentryHabilitado = false;

/** Solo para pruebas/inspección — nunca debe usarse para ramificar lógica
 * de negocio (Sentry es observabilidad pura, D-017: nunca afecta el
 * comportamiento observable de una respuesta). */
export function sentryEstaHabilitado(): boolean {
  return sentryHabilitado;
}

/**
 * Inicializa Sentry SOLO si `SENTRY_DSN` está presente — sin ella, no
 * llama `Sentry.init` en absoluto (no-op total, sin llamadas de red,
 * mismo criterio que cualquier adaptador real de este repo). Idempotente
 * dentro del mismo proceso: útil en Vercel Functions, donde `api/index.ts`
 * puede reutilizar la misma instancia caliente entre invocaciones
 * (mismo patrón que `appCache` en `apps/api/api/index.ts`).
 */
export function iniciarSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) {
    sentryHabilitado = false;
    return false;
  }

  const enviarPii = env.SENTRY_SEND_PII === "true";

  Sentry.init({
    dsn,
    // Nunca "producción" a ciegas por defecto — mismo valor que ya usa
    // `GET /health` (config/env.ts#etiquetaEntorno): `APP_ENV_LABEL` si
    // está configurado, si no `NODE_ENV`, si no "development".
    environment: env.APP_ENV_LABEL ?? env.NODE_ENV ?? "development",
    // `VERCEL_GIT_COMMIT_SHA` la inyecta Vercel automáticamente en cada
    // build — sin ella (dev local, Docker/VPS sin ese entorno), se omite
    // en vez de mandar un release falso.
    release: env.VERCEL_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: parsearTasaMuestreo(env.SENTRY_TRACES_SAMPLE_RATE),
    beforeSend: (event) => redactarEventoSentry(event, enviarPii),
  });

  sentryHabilitado = true;
  return true;
}

/**
 * Captura un error NO manejado del `app.onError` central de Hono
 * (apps/api/src/app.ts, rama de 500 genérico — nunca los `ErrorDominio`/
 * `ZodError` esperados, que son flujo de control normal, no bugs). No-op
 * si Sentry no está habilitado. Nunca lanza ni cambia el código/cuerpo de
 * la respuesta que ya construye `app.onError` — se llama ANTES de
 * construir esa respuesta, puramente como efecto secundario de
 * observabilidad.
 */
export function capturarErrorNoManejado(error: unknown): void {
  if (!sentryHabilitado) return;
  Sentry.captureException(error);
}

/** Contexto de negocio seguro para etiquetar una excepción de un worker
 * en segundo plano — nunca PII (nunca email/teléfono/nombre de huésped,
 * §RV19/21-7), solo identificadores opacos ya usados como etiquetas de
 * métricas en `workers/observabilidad/metricas.ts`. */
export interface ContextoErrorWorker {
  /** p. ej. "outboxWorker", "cicloSyncInstrumentado". */
  worker: string;
  canalId?: string;
  tenantId?: string;
}

/**
 * Captura una excepción no manejada de un worker en segundo plano
 * (outbox, ciclo de sync) con tags `worker`/`canalId`/`tenantId`. No-op
 * si Sentry no está habilitado. Expuesta aquí para que el código de los
 * workers (territorio del paquete `cron-sync`, `apps/api/src/workers/
 * observabilidad/**`) la invoque en sus bloques `catch` sin que este
 * paquete necesite tocar esos archivos.
 */
export function capturarExcepcionWorker(error: unknown, contexto: ContextoErrorWorker): void {
  if (!sentryHabilitado) return;
  const tags: Record<string, string> = { worker: contexto.worker };
  if (contexto.canalId) tags.canalId = contexto.canalId;
  if (contexto.tenantId) tags.tenantId = contexto.tenantId;
  Sentry.captureException(error, { tags });
}

/**
 * En Vercel Functions el proceso puede congelarse apenas se envía la
 * respuesta (no hay "keep-alive" de proceso entre invocaciones como en un
 * servidor Node tradicional) — un evento que Sentry todavía no terminó de
 * enviar por red en ese instante se pierde en silencio. `Sentry.flush()`
 * espera (hasta el timeout dado) a que la cola de envío se vacíe antes de
 * dejar que la función termine. Se documenta aquí, en vez de asumir que
 * `Sentry.init` ya lo resuelve solo, porque es exactamente el problema que
 * la propia documentación de Sentry para "serverless"/edge describe. No-op
 * si Sentry no está habilitado (evita el `await` innecesario en cada
 * request cuando no hay DSN configurado).
 */
export async function esperarEnvioSentry(timeoutMs = 2000): Promise<void> {
  if (!sentryHabilitado) return;
  await Sentry.flush(timeoutMs);
}

/**
 * `GET /internal/sentry-test` (montada bajo `/api` en Vercel, ver
 * `apps/api/api/index.ts` → queda en `GET /api/internal/sentry-test`,
 * como documenta `docs/despliegue/sentry.md`): dispara un evento de
 * prueba real hacia Sentry para verificar la integración end-to-end
 * desde el propio despliegue, sin exponer un endpoint público sin
 * protección.
 *
 * Fail-closed (mismo criterio que el resto de rutas internas de este
 * repo): reutiliza `CRON_SECRET` — el secreto interno que ya introduce
 * el paquete `cron-sync` para sus propias rutas bajo
 * `apps/api/src/rutas/internas/**` (ver "Archivos" del programa) — en vez
 * de inventar un segundo secreto paralelo. Sin `CRON_SECRET` configurado
 * en el entorno, la ruta responde SIEMPRE 503 (nunca "sin protección" por
 * accidente); con `CRON_SECRET` configurado pero una cabecera ausente o
 * distinta, responde 401. Solo con el secreto correcto dispara el evento
 * de prueba (o confirma en el cuerpo que Sentry está deshabilitado, si no
 * hay `SENTRY_DSN`, en vez de fingir que se envió algo).
 */
export function crearRutaPruebaSentry(env: NodeJS.ProcessEnv = process.env): Hono {
  const ruta = new Hono();

  ruta.get("/sentry-test", (c) => {
    const secretoConfigurado = env.CRON_SECRET?.trim();
    if (!secretoConfigurado) {
      return c.json(
        {
          error: {
            codigo: "servicio_no_configurado",
            mensaje: "CRON_SECRET no está configurado — ruta interna deshabilitada (fail-closed).",
          },
        },
        503,
      );
    }

    const cabeceraBearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const secretoRecibido = c.req.header("x-cron-secret") ?? cabeceraBearer;
    if (secretoRecibido !== secretoConfigurado) {
      return c.json({ error: { codigo: "no_autorizado", mensaje: "Secreto interno inválido o ausente." } }, 401);
    }

    if (!sentryEstaHabilitado()) {
      return c.json(
        { enviado: false, motivo: "Sentry no está configurado (SENTRY_DSN ausente) — no-op, nada que enviar." },
        200,
      );
    }

    Sentry.captureException(new Error("Evento de prueba de Sentry (GET /internal/sentry-test)"));
    return c.json({ enviado: true }, 200);
  });

  return ruta;
}
