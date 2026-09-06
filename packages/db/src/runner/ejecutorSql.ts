/**
 * Contrato mínimo que necesita el runner de migraciones para hablar con
 * cualquier motor SQL. Tanto el cliente `pg` de `embedded-postgres` como
 * `PGlite` exponen un método `query(sql, params?)` compatible
 * estructuralmente con esta interfaz — no hace falta un adaptador dedicado
 * por motor, solo tipar el subconjunto que usamos (D-009: el mismo SQL debe
 * ser portable entre ambos).
 */
export interface FilaSql {
  [columna: string]: unknown;
}

export interface ResultadoSql<T extends FilaSql = FilaSql> {
  rows: T[];
  rowCount?: number | null;
}

export interface EjecutorSql {
  query<T extends FilaSql = FilaSql>(
    sql: string,
    params?: unknown[],
  ): Promise<ResultadoSql<T>>;
  /**
   * Ejecuta uno o más statements SQL sin parámetros (protocolo simple de
   * consulta), a diferencia de `query`, que usa el protocolo extendido
   * (prepared statement) y por tanto solo admite un único statement por
   * llamada. Necesario para correr el `up`/`down` de una migración
   * completa (varios `CREATE TABLE`/`ALTER TABLE` separados por `;`) en
   * una sola llamada.
   */
  exec(sql: string): Promise<void>;
}
