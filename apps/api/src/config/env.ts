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
}

function leerEntorno(valor: string | undefined): ConfiguracionApi["entorno"] {
  if (valor === "test" || valor === "production") return valor;
  return "development";
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

/** Entornos donde está permitido degradar a un secreto efímero generado
 * en memoria en vez de exigir una variable de entorno explícita (S-02/
 * S-03). Fail-closed: cualquier valor de `NODE_ENV` que NO sea
 * reconocido explícitamente aquí (incluida cualquier variante mal
 * escrita/acentuada/mayúscula de "production", o un valor por completo
 * desconocido) se trata como productivo a efectos de exigir secretos —
 * nunca al revés. Un `NODE_ENV` ausente se trata como desarrollo local. */
const ENTORNOS_CON_SECRETOS_RELAJADOS = new Set(["development", "desarrollo", "test", "pruebas", "dev", "testing"]);

function exigeSecretosExplicitos(valorCrudoNodeEnv: string | undefined): boolean {
  if (valorCrudoNodeEnv === undefined || valorCrudoNodeEnv.trim() === "") return false;
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
  };
}
