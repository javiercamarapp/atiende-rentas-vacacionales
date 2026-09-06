/**
 * Formato de backup lógico propio (Lote 10, H-086). Deliberadamente JSON
 * (no el formato binario/texto de `pg_dump`) para no depender de invocar
 * un binario externo con `child_process` desde el runner de pruebas — el
 * mismo patrón "propio, sin binarios nativos extra" que ya usa el runner
 * de migraciones (`packages/db/src/runner`) y el parser ICS de
 * `packages/adapters`.
 */
export const VERSION_FORMATO_BACKUP = "atiende-rv-backup-logico-v1";

export type ValorSerializado =
  | string
  | number
  | boolean
  | null
  | { $t: "buffer"; v: string } // base64
  | { $t: "date"; v: string } // ISO 8601
  | { $t: "json"; v: string }; // JSON.stringify ya aplicado (columnas json/jsonb)

export interface FilaSerializada {
  [columna: string]: ValorSerializado;
}

export interface TablaBackup {
  nombre: string;
  columnas: string[];
  filas: FilaSerializada[];
}

export interface BackupLogico {
  version: typeof VERSION_FORMATO_BACKUP;
  generadoEn: string; // ISO 8601
  /** Orden seguro para restaurar (padres antes que hijos según FK) — el
   * mismo orden se usa invertido para el TRUNCATE previo. */
  ordenTablas: string[];
  tablas: TablaBackup[];
}
