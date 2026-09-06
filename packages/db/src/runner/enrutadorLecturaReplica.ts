/**
 * H-091 (BACKLOG E15 §Operación-3, REQ-166, Lote 3.0): soporte de RÉPLICA
 * DE LECTURA — configuración opcional vía `DATABASE_URL_REPLICA`,
 * enrutamiento de consultas de solo lectura (reportes, calendario de solo
 * lectura) hacia la réplica cuando existe, y fallback automático al
 * primario ante cualquier fallo de la réplica.
 *
 * **Límite honesto de este lote**: no hay infraestructura de réplica de
 * lectura REAL disponible en este entorno de construcción (streaming
 * replication de Postgres exige un segundo servidor en modo standby,
 * fuera del alcance de `embedded-postgres`/PGlite). Este módulo entrega:
 * (a) el enrutador en sí, con fallback automático, probado con DOS pools
 * FALSOS inyectados (uno que funciona, uno que falla) — nunca contra una
 * réplica de streaming real; (b) la lectura de configuración
 * (`DATABASE_URL_REPLICA`). NO se prueba: latencia de replicación real,
 * lectura de datos efectivamente consistentes/stale desde una réplica de
 * verdad, ni el comportamiento de Postgres ante un failover real. Nunca
 * se presenta el fallback como "probado contra replicación real" — no lo
 * está.
 */
export interface PoolConsultable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface OpcionesEnrutadorLecturaReplica {
  primario: PoolConsultable;
  /** `null` = sin réplica configurada (`DATABASE_URL_REPLICA` sin
   * definir) — toda consulta, incluidas las de solo lectura, va siempre
   * al primario. Esto es el comportamiento POR DEFECTO y es
   * intencionalmente indistinguible de "sin este módulo": ningún entorno
   * que no configure la variable ve ningún cambio de comportamiento. */
  replica: PoolConsultable | null;
  /** Invocado cada vez que una consulta cae de réplica a primario —
   * nunca lanza, solo observa (para métricas/logs del llamador). */
  onFallback?: (error: unknown) => void;
}

export class EnrutadorLecturaReplica {
  private readonly primario: PoolConsultable;
  private readonly replica: PoolConsultable | null;
  private readonly onFallback?: (error: unknown) => void;

  constructor(opciones: OpcionesEnrutadorLecturaReplica) {
    this.primario = opciones.primario;
    this.replica = opciones.replica;
    this.onFallback = opciones.onFallback;
  }

  /** `true` solo si hay una réplica configurada — para que el llamador
   * pueda, por ejemplo, exponer el dato en `/health/detallado` sin tener
   * que rastrear la configuración por separado. */
  get tieneReplica(): boolean {
    return this.replica !== null;
  }

  /**
   * Consulta de SOLO LECTURA (reportes, calendario de solo lectura, §RV19/
   * 21-...): intenta la réplica primero si está configurada; ante
   * CUALQUIER error de la réplica (desconexión, timeout, réplica caída),
   * reintenta automáticamente contra el primario — nunca propaga el error
   * de la réplica al llamador si el primario puede responder. Sin réplica
   * configurada, va directo al primario (sin intento previo, sin
   * latencia extra).
   */
  async consultaSoloLectura<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    if (!this.replica) return this.primario.query<T>(sql, params);
    try {
      return await this.replica.query<T>(sql, params);
    } catch (error) {
      this.onFallback?.(error);
      return this.primario.query<T>(sql, params);
    }
  }

  /** Consultas de escritura SIEMPRE van al primario — nunca a la réplica
   * (una réplica de lectura, por definición, no acepta escrituras).
   * Método trivial, expuesto solo para que el código que usa el
   * enrutador nunca tenga que decidir "¿primario o `this.primario`
   * directo?" — ambos son exactamente lo mismo. */
  async consultaEscritura<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    return this.primario.query<T>(sql, params);
  }
}

/**
 * Lee `DATABASE_URL_REPLICA` del entorno — `null` si no está definida o
 * está vacía (mismo criterio que `DATABASE_URL` en `config/env.ts`:
 * ausencia de variable nunca es un error, es "sin réplica configurada").
 * Pura: no abre ninguna conexión, no valida que la URL sea alcanzable —
 * esa validación es responsabilidad de quien construya el `pg.Pool` real
 * a partir de esta URL.
 */
export function leerUrlReplicaDesdeEntorno(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.DATABASE_URL_REPLICA;
  return url && url.trim() !== "" ? url : null;
}
