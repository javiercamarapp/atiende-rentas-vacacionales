// Carga de configuración por variables de entorno (Lote 0, extendida en
// Lote 3 con auth/RLS/cifrado). Sin valores reales embebidos: todo viene de
// `process.env`, documentado en `.env.example`.

import { randomBytes } from "node:crypto";
import { generarClaveCifradoBase64 } from "../seguridad/cifrado.js";

export interface ConfiguracionApi {
  puerto: number;
  entorno: "development" | "test" | "production";
  etiquetaEntorno: string;
  origenWeb: string;
  databaseUrl: string;
  jwtSecret: string;
  cifradoCanalClaves: string;
  rateLimit: {
    ventanaMs: number;
    maximo: number;
    /** S-06: allow-list de IPs de proxy de confianza (balanceador/reverse
     * proxy propio) que sí pueden fijar `X-Forwarded-For`/`X-Real-IP` de
     * forma confiable. Vacía por defecto — fail-safe. */
    proxiesDeConfianza: readonly string[];
  };
  /** S-06: límite adicional de intentos de login por email/usuario,
   * independiente del límite genérico por IP — evita fuerza bruta contra
   * una sola cuenta desde múltiples IPs/proxies. */
  rateLimitLoginPorEmail: { ventanaMs: number; maximo: number };
  /** Base pública de esta API (Lote 11B, corrección #3: URL de
   * exportación iCal) — usada SOLO para componer la URL absoluta del feed
   * `.ics` que se le muestra al usuario; la ruta pública en sí
   * (`GET /feed/ical/:token`) no depende de este valor para funcionar. */
  urlPublicaApi: string;
  /** Lote 3.2 (H-096+): Google Sign-In (OpenID Connect). Sin las tres
   * variables (`GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`) el botón de
   * Google aparece deshabilitado con motivo en la UI (`GET /auth/config`)
   * — NUNCA un 500, y NUNCA se monta ninguna ruta `/auth/google/*` real.
   * Ver docs/despliegue/google-oauth.md. */
  google: {
    clientId: string | null;
    clientSecret: string | null;
    redirectUri: string | null;
  };
  /** Proveedor OIDC simulado (dev/pruebas/E2E, H-096) — SOLO se monta si
   * `entorno` es 'development'/'test' explícito (fail-closed, D-019). */
  oidcSimuladoHabilitado: boolean;
  /** SMTP configurable por entorno; sin `SMTP_HOST` se usa el adaptador
   * de correo simulado (apps/api/src/seguridad/correo.ts) — nunca se
   * intenta un envío real con configuración incompleta. */
  smtp: {
    host: string | null;
    puerto: number;
    seguro: boolean;
    usuario: string | null;
    password: string | null;
    remitente: string;
  };
  /** Política de contraseñas: verificación opcional (desactivada por
   * defecto) contra HIBP k-anonymity — ver seguridad/passwordPolicy.ts. */
  politicaContrasenaHibp: boolean;
  /** Bloqueo temporal de cuenta tras N intentos fallidos consecutivos
   * (además del rate limit por IP+email, S-06) — persistente en
   * `usuario.intentos_fallidos`/`bloqueado_hasta` (migración 0101). */
  bloqueoCuenta: { maxIntentos: number; duracionMs: number };
  /** URL base de apps/web — usada para componer los links de verificación
   * de correo/restablecer contraseña y el redirect final tras el login
   * con Google (nunca se redirige a una URL fuera de este origen). */
  urlPublicaWeb: string;
  /** Lote 3.3 (RV16, facturación): Stripe real (Checkout + webhooks +
   * portal de cliente) SOLO se activa si AMBAS variables están presentes
   * — ver `construirPagosStripeDesdeEntorno` en
   * packages/domain/src/facturacion/pagos/stripe.ts. Sin ellas (el valor
   * por defecto en cualquier checkout de desarrollo), la API monta
   * únicamente `PagosSimulado`, nunca llama a Stripe real. Sin claves de
   * Stripe en este repo — ambas vienen siempre de `process.env`. */
  stripe: {
    claveSecreta: string | null;
    secretoWebhook: string | null;
  };
}

/** Quita diacríticos y normaliza mayúsculas/espacios — mismo criterio que
 * `packages/sim/src/comun/etiquetado.ts` (S-04): `.toLowerCase()` a secas
 * NO reconoce "producción" (con tilde) como "produccion". */
function normalizarEntornoTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const ENTORNOS_DESARROLLO = new Set(["development", "desarrollo", "dev"]);
const ENTORNOS_PRUEBAS = new Set(["test", "pruebas", "testing"]);

/** S-11 (docs/auditoria-2/seguridad.md): antes, `leerEntorno` comparaba
 * `valor === "production"` de forma exacta y sensible a may\u00fasculas/
 * acentos \u2014 cualquier variante ("PRODUCTION", "producci\u00f3n", o cualquier
 * typo) ca\u00eda al `return "development"` por defecto, el valor M\u00c1S
 * PERMISIVO posible. Eso desactivaba en silencio cualquier guard aguas
 * abajo que comparara `entorno === "production"` (p. ej.
 * apps/api/src/routes/backoffice/cuentasCanal.ts: "un simulador nunca se
 * presenta como conexi\u00f3n productiva"). Ahora, tras normalizar diacr\u00edticos/
 * may\u00fasculas: development/desarrollo/dev y test/pruebas/testing se
 * reconocen expl\u00edcitamente; CUALQUIER OTRO valor (incluida cualquier
 * variante mal escrita de "production", o uno completamente desconocido)
 * se clasifica como "production" \u2014 fail-closed, nunca al rev\u00e9s. Solo la
 * AUSENCIA total de `NODE_ENV` se trata como desarrollo local (D-017).
 *
 * INVARIANTE (reverificaci\u00f3n independiente, hallazgo nuevo, docs/auditoria-2/
 * REVERIFICACION.md \u00a73): "AUSENCIA total" significa `valor === undefined`
 * \u00daNICAMENTE. Una variable DEFINIDA pero vac\u00eda o compuesta solo de
 * espacios (`NODE_ENV=""` o `NODE_ENV="   "`) NO es ausencia \u2014 es un valor
 * "desconocido" expl\u00edcito, y por tanto cae en el mismo fail-closed que
 * cualquier otro valor no reconocido ("production"). Tratarla como
 * "development" reabrir\u00eda exactamente el bypass de S-02/S-03/S-04/S-11 por
 * una veta no probada por la auditor\u00eda original (camino real:
 * apps/api/src/routes/mensajeria/borradores.ts, `new SimuladorMensajeria(...)`
 * sin `entorno`/`ATIENDE_ENTORNO` expl\u00edcitos). */
function leerEntorno(valor: string | undefined): ConfiguracionApi["entorno"] {
  if (valor === undefined) return "development";
  const normalizado = normalizarEntornoTexto(valor);
  if (ENTORNOS_DESARROLLO.has(normalizado)) return "development";
  if (ENTORNOS_PRUEBAS.has(normalizado)) return "test";
  return "production";
}

/** Entornos donde está permitido degradar a un secreto efímero generado
 * en memoria en vez de exigir una variable de entorno explícita (S-02/
 * S-03). Fail-closed: cualquier valor de `NODE_ENV` que NO sea
 * reconocido explícitamente aquí (incluida cualquier variante mal
 * escrita/acentuada/mayúscula de "production", o un valor por completo
 * desconocido) se trata como productivo a efectos de exigir secretos —
 * nunca al revés. Un `NODE_ENV` ausente (`undefined`) se trata como
 * desarrollo local.
 *
 * INVARIANTE (hallazgo nuevo, docs/auditoria-2/REVERIFICACION.md §3): igual
 * que en `leerEntorno`, solo `undefined` cuenta como ausencia. `NODE_ENV=""`
 * o `NODE_ENV="   "` es una variable DEFINIDA con un valor "desconocido" —
 * exige secretos explícitos (fail-closed), nunca se trata como desarrollo. */
const ENTORNOS_CON_SECRETOS_RELAJADOS = new Set(["development", "desarrollo", "test", "pruebas", "dev", "testing"]);

function exigeSecretosExplicitos(valorCrudoNodeEnv: string | undefined): boolean {
  if (valorCrudoNodeEnv === undefined) return false;
  return !ENTORNOS_CON_SECRETOS_RELAJADOS.has(normalizarEntornoTexto(valorCrudoNodeEnv));
}

const LONGITUD_MINIMA_JWT_SECRET = 32;

// Cachés a nivel de módulo (un solo proceso Node): un secreto efímero
// generado para desarrollo/pruebas debe permanecer ESTABLE entre llamadas
// a `cargarConfiguracion()` dentro del mismo proceso (login y verificación
// de JWT, o cifrado y descifrado de credenciales de canal, pueden ocurrir
// en instancias de configuración distintas) — nunca regenerarse en cada
// llamada, o cualquier operación cruzada fallaría con "secreto" distinto.
let jwtSecretEfimeroCache: string | undefined;
let cifradoCanalClavesEfimeroCache: string | undefined;

function resolverJwtSecret(env: NodeJS.ProcessEnv, entornoEsProductivo: boolean): string {
  if (env.JWT_SECRET !== undefined && env.JWT_SECRET !== "") {
    if (env.JWT_SECRET.length < LONGITUD_MINIMA_JWT_SECRET) {
      throw new Error(
        `JWT_SECRET configurado tiene ${env.JWT_SECRET.length} caracteres; se exigen al menos ` +
          `${LONGITUD_MINIMA_JWT_SECRET} (entropía insuficiente para firmar tokens HS256 con seguridad, S-03).`,
      );
    }
    return env.JWT_SECRET;
  }
  if (entornoEsProductivo) {
    throw new Error(
      "JWT_SECRET es obligatorio cuando NODE_ENV no es 'development'/'test' explícito (fail-closed, S-03). " +
        "Defínelo en la configuración del despliegue — ver apps/api/.env.example.",
    );
  }
  if (jwtSecretEfimeroCache === undefined) {
    jwtSecretEfimeroCache = randomBytes(32).toString("hex");
    console.warn(
      "[config] JWT_SECRET no definido: usando una clave efímera generada en memoria SOLO para " +
        "desarrollo/pruebas (S-03). Los tokens firmados en este arranque no serán válidos en otro proceso.",
    );
  }
  return jwtSecretEfimeroCache;
}

function resolverCifradoCanalClaves(env: NodeJS.ProcessEnv, entornoEsProductivo: boolean): string {
  if (env.CANAL_CIFRADO_CLAVES !== undefined && env.CANAL_CIFRADO_CLAVES !== "") {
    return env.CANAL_CIFRADO_CLAVES;
  }
  if (entornoEsProductivo) {
    throw new Error(
      "CANAL_CIFRADO_CLAVES es obligatorio cuando NODE_ENV no es 'development'/'test' explícito " +
        "(fail-closed, S-02). Defínelo en la configuración del despliegue — ver apps/api/.env.example.",
    );
  }
  if (cifradoCanalClavesEfimeroCache === undefined) {
    cifradoCanalClavesEfimeroCache = `v1:${generarClaveCifradoBase64()}`;
    console.warn(
      "[config] CANAL_CIFRADO_CLAVES no definido: usando una clave de cifrado efímera generada en " +
        "memoria SOLO para desarrollo/pruebas (S-02). Las credenciales de canal cifradas en este " +
        "arranque no serán descifrables en otro proceso.",
    );
  }
  return cifradoCanalClavesEfimeroCache;
}

export function cargarConfiguracion(env: NodeJS.ProcessEnv = process.env): ConfiguracionApi {
  const entorno = leerEntorno(env.NODE_ENV);
  const entornoEsProductivo = exigeSecretosExplicitos(env.NODE_ENV);
  return {
    puerto: Number.parseInt(env.PORT ?? "8787", 10),
    entorno,
    // Nunca "producción" por defecto (D-017): un despliegue sin variable
    // explícita se etiqueta como desarrollo, el estado más conservador.
    etiquetaEntorno: env.APP_ENV_LABEL ?? "desarrollo",
    origenWeb: env.WEB_ORIGIN ?? "http://localhost:5173",
    databaseUrl: env.DATABASE_URL ?? "",
    jwtSecret: resolverJwtSecret(env, entornoEsProductivo),
    cifradoCanalClaves: resolverCifradoCanalClaves(env, entornoEsProductivo),
    rateLimit: {
      ventanaMs: Number.parseInt(env.RATE_LIMIT_VENTANA_MS ?? "60000", 10),
      maximo: Number.parseInt(env.RATE_LIMIT_MAXIMO ?? "100", 10),
      proxiesDeConfianza: (env.RATE_LIMIT_PROXIES_DE_CONFIANZA ?? "")
        .split(",")
        .map((ip) => ip.trim())
        .filter((ip) => ip !== ""),
    },
    rateLimitLoginPorEmail: {
      ventanaMs: Number.parseInt(env.RATE_LIMIT_LOGIN_EMAIL_VENTANA_MS ?? "900000", 10),
      maximo: Number.parseInt(env.RATE_LIMIT_LOGIN_EMAIL_MAXIMO ?? "20", 10),
    },
    urlPublicaApi: env.API_PUBLIC_URL ?? `http://localhost:${Number.parseInt(env.PORT ?? "8787", 10)}`,
    google: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null,
      redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || null,
    },
    // D-019: nunca en producción, sin importar el valor de esta variable —
    // mismo criterio fail-closed que ATIENDE_ENTORNO para los demás
    // simuladores de canal.
    oidcSimuladoHabilitado: !entornoEsProductivo && (env.ATIENDE_OIDC_SIMULADO ?? "true") !== "false",
    smtp: {
      host: env.SMTP_HOST?.trim() || null,
      puerto: Number.parseInt(env.SMTP_PORT ?? "587", 10),
      seguro: env.SMTP_SECURE === "true",
      usuario: env.SMTP_USER?.trim() || null,
      password: env.SMTP_PASSWORD ?? null,
      remitente: env.SMTP_FROM?.trim() || "no-responder@atiende.example",
    },
    politicaContrasenaHibp: env.POLITICA_CONTRASENA_HIBP === "true",
    bloqueoCuenta: {
      maxIntentos: Number.parseInt(env.BLOQUEO_CUENTA_MAX_INTENTOS ?? "8", 10),
      duracionMs: Number.parseInt(env.BLOQUEO_CUENTA_DURACION_MS ?? "900000", 10), // 15 minutos
    },
    urlPublicaWeb: env.WEB_ORIGIN ?? "http://localhost:5173",
    stripe: {
      claveSecreta: env.STRIPE_SECRET_KEY?.trim() || null,
      secretoWebhook: env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    },
  };
}
