import type { PoolClient } from "pg";
import { ErrorDominio } from "../contrato/errores.js";

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

// Reexportado únicamente para que `PoolClient` de `pg` (usado en
// apps/api/src/routes/auth.ts) se acepte estructuralmente como
// `ConexionSql` sin un cast explícito en cada call site.
export type { PoolClient };
