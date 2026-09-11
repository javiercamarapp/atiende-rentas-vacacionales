import type { MiddlewareHandler } from "hono";
import type { PoolClient } from "pg";
import { ErrorDominio } from "../contrato/errores.js";
import { resolverIp } from "./rateLimit.js";

/**
 * A3-AUTH-01 (docs/auditoria-3/seguridad-auth.md, ALTO): `LimitadorVentana`
 * (./rateLimit.ts) es un `Map` en memoria del proceso — ineficaz en el
 * despliegue serverless real (Vercel), donde cada cold start arranca un
 * proceso nuevo con su propio `Map` vacío. `LimitadorVentanaPostgres` es
 * el mismo concepto (ventana fija, clave de negocio arbitraria) pero el
 * contador vive en la tabla `rate_limit_bucket` (migración
 * packages/db/src/migrations/0127_rate_limit_bucket.ts) — sobrevive cold
 * starts porque vive en Postgres, no en el proceso Node, y se comparte
 * entre TODAS las instancias serverless que apunten a la misma base de
 * datos (exactamente la razón por la que `/auth/login` sí resiste fuerza
 * bruta en producción: su bloqueo temporal usa el mismo principio sobre
 * `usuario.intentos_fallidos`/`bloqueado_hasta`, migración 0106).
 *
 * El incremento es atómico dentro de la función SQL
 * `rate_limit_registrar_intento` (una sola sentencia `INSERT ... ON
 * CONFLICT DO UPDATE` protegida por el lock de fila de Postgres): dos
 * invocaciones concurrentes para la MISMA clave, aunque vengan de
 * instancias/procesos distintos con conexiones distintas, nunca pisan el
 * conteo de la otra. Por eso esta clase no necesita guardar NADA de
 * estado propio (a diferencia de `LimitadorVentana`, que sí tenía el
 * `Map`) — es un cliente sin estado sobre la fuente de verdad real.
 */
export interface OpcionesRateLimitPostgres {
  ventanaMs: number;
  maximo: number;
}

/** Conexión mínima que necesita este limitador — cualquier `PoolClient`
 * de `conConexion` sirve; tipado estrecho a propósito para poder probarlo
 * también contra un `EjecutorSql` (PGlite/embedded-postgres) sin arrastrar
 * el tipo completo de `pg`. */
export interface ConexionSql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    texto: string,
    valores?: unknown[],
  ): Promise<{ rows: T[] }>;
}

/** Margen de gracia antes de borrar un bucket expirado (evita el caso
 * límite de borrar una fila justo antes de que otra instancia todavía en
 * vuelo intente leerla/actualizarla). */
const LIMPIEZA_MARGEN_MS = 5 * 60_000;

/** Probabilidad de disparar la limpieza perezosa en cada intento — barre
 * `rate_limit_bucket` sin requerir un cron dedicado solo para esta tabla
 * (fuera de alcance de A3-AUTH-01), a costa de una consulta extra
 * ocasional y barata (índice por `reinicia_en`). */
const PROBABILIDAD_LIMPIEZA = 0.01;

export class LimitadorVentanaPostgres {
  constructor(private readonly opciones: OpcionesRateLimitPostgres) {}

  /**
   * Registra un intento para `clave` sobre `cliente`. Lanza
   * `ErrorDominio("rate_limited", ...)` si ya se alcanzó el máximo
   * configurado dentro de la ventana vigente (mapea a HTTP 429, ver
   * apps/api/src/contrato/errores.ts) — mismo contrato observable que
   * `LimitadorVentana.registrarIntento`, para que las rutas que migran de
   * uno a otro no cambien de comportamiento hacia el cliente.
   *
   * No requiere una transacción explícita: cada llamada es una única
   * invocación de función SQL, ya atómica en sí misma.
   */
  async registrarIntento(cliente: ConexionSql, clave: string): Promise<void> {
    const { rows } = await cliente.query<{ rate_limit_registrar_intento: boolean }>(
      "SELECT rate_limit_registrar_intento($1, $2, $3) AS rate_limit_registrar_intento",
      [clave, this.opciones.ventanaMs, this.opciones.maximo],
    );
    const permitido = rows[0]?.rate_limit_registrar_intento ?? false;
    if (!permitido) {
      throw new ErrorDominio("rate_limited", "Demasiadas solicitudes, intenta de nuevo más tarde");
    }

    if (Math.random() < PROBABILIDAD_LIMPIEZA) {
      // Best-effort: un fallo de limpieza nunca debe tumbar la request de
      // verificación de MFA que la disparó.
      await cliente.query("SELECT rate_limit_limpiar_expirados($1)", [LIMPIEZA_MARGEN_MS]).catch(() => undefined);
    }
  }
}

export interface OpcionesRateLimitMiddlewarePostgres extends OpcionesRateLimitPostgres {
  /** IPs de proxy de confianza (balanceador/reverse proxy propio) que sí
   * pueden fijar `X-Forwarded-For`/`X-Real-IP` de forma confiable. Vacía
   * por defecto — fail-safe (S-06), misma semántica que
   * `crearRateLimit` en ./rateLimit.ts. */
  proxiesDeConfianza?: readonly string[];
  /** Límite duro de tiempo para la consulta a `rate_limit_bucket` antes de
   * declarar Postgres inalcanzable y degradar (ver `MENSAJE_TIMEOUT` más
   * abajo). Por defecto 1500ms — mismo orden de magnitud que el timeout de
   * `verificarSaludBaseDeDatos` (packages/db/src/runner/
   * saludBaseDeDatos.ts, 2000ms), corto a propósito porque este chequeo
   * corre en TODAS las rutas, no solo en el healthcheck. */
  timeoutMs?: number;
}

const TIMEOUT_MS_POR_DEFECTO = 1500;
const MENSAJE_TIMEOUT = "__timeout_rate_limit_postgres__";

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(MENSAJE_TIMEOUT)), ms);
    promesa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (error) => {
        clearTimeout(temporizador);
        reject(error);
      },
    );
  });
}

/**
 * Patrón 3 (rescatado de Likida/atiende.ai): equivalente distribuido de
 * `crearRateLimit` (./rateLimit.ts), para el middleware GLOBAL montado en
 * `app.use("*", ...)` (apps/api/src/app.ts). Antes de esto, el rate limit
 * aplicado a TODAS las rutas públicas vivía en un `Map` en memoria — en el
 * despliegue serverless real (Vercel, múltiples instancias/cold starts)
 * ese límite global no limitaba nada de verdad, porque cada instancia
 * tenía su propio `Map` vacío. `crearRateLimitPostgres` usa el mismo
 * `ConexionSql` (típicamente el `pg.Pool` ya construido en `app.ts` — un
 * `Pool` es estructuralmente un `ConexionSql` válido: cada llamada a
 * `.query()` toma y libera una conexión del pool por sí sola, sin
 * necesidad de reservar un `PoolClient` dedicado por request) y por tanto
 * comparte el contador entre TODAS las instancias vía `rate_limit_bucket`
 * — la misma tabla que ya usa `/auth/mfa/verificar` (A3-AUTH-01), ahora
 * reutilizada aquí en vez de aprovisionar un backend nuevo (Redis).
 *
 * Reutiliza `resolverIp` de ./rateLimit.ts: MISMA resolución de IP
 * (socket real, cabeceras solo si el proxy es de confianza — S-06) que el
 * middleware en memoria, para que migrar de uno a otro no cambie ningún
 * comportamiento observable salvo la persistencia del contador.
 *
 * Fail-open SOLO ante un fallo de INFRAESTRUCTURA (Postgres inalcanzable
 * o la consulta tarda más que `timeoutMs`) — nunca ante un
 * `ErrorDominio("rate_limited")` real, que siempre bloquea la request tal
 * como antes. Sin esta distinción, este middleware GLOBAL (montado en
 * TODAS las rutas) convertiría cualquier caída transitoria de Postgres en
 * un 500 para absolutamente todo, incluidas `GET /health` y `GET
 * /metrics` — que app.ts y workers/observabilidad/rutas.ts documentan y
 * prueban explícitamente como "nunca lanzan aunque la BD no esté
 * disponible" (mismo criterio de degradación honesta que
 * packages/db/src/runner/saludBaseDeDatos.ts). El límite persistido en
 * Postgres para rutas que YA dependen de la BD (login, mfa/verificar)
 * sigue siendo efectivamente fail-closed en la práctica: si Postgres está
 * caído, esas rutas fallan de todos modos al intentar `conConexion`.
 */
export function crearRateLimitPostgres(cliente: ConexionSql, opciones: OpcionesRateLimitMiddlewarePostgres): MiddlewareHandler {
  const limitador = new LimitadorVentanaPostgres(opciones);
  const proxiesDeConfianza = opciones.proxiesDeConfianza ?? [];
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS_POR_DEFECTO;

  return async (c, next) => {
    const clave = `${resolverIp(c, proxiesDeConfianza)}:${c.req.method}:${new URL(c.req.url).pathname}`;
    try {
      await conTimeout(limitador.registrarIntento(cliente, clave), timeoutMs);
    } catch (error) {
      if (error instanceof ErrorDominio) throw error; // rate_limited real: sí bloquea
      console.error(
        JSON.stringify({
          evento: "rate_limit_postgres_infraestructura_inalcanzable",
          motivo: error instanceof Error && error.message === MENSAJE_TIMEOUT ? `timeout tras ${timeoutMs}ms` : "error de conexión",
          mensaje: error instanceof Error ? error.message : String(error),
        }),
      );
      // Fail-open de infraestructura, nunca de negocio — ver docstring.
    }
    await next();
  };
}

// Reexportado únicamente para que `PoolClient` de `pg` (usado en
// apps/api/src/routes/auth.ts) se acepte estructuralmente como
// `ConexionSql` sin un cast explícito en cada call site.
export type { PoolClient };
