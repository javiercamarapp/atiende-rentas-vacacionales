/**
 * Formato de backup lógico propio (Lote 10, H-086). Deliberadamente JSON
 * (no el formato binario/texto de `pg_dump`) para no depender de invocar
 * un binario externo con `child_process` desde el runner de pruebas — el
 * mismo patrón "propio, sin binarios nativos extra" que ya usa el runner
 * de migraciones (`packages/db/src/runner`) y el parser ICS de
 * `packages/adapters`.
 */
// v2 (Lote 3.2, H-096+): corrige un round-trip roto para columnas de
// ARRAY NATIVO de Postgres (p. ej. `text[]`, primer caso real en el
// esquema: `tenant.dominios_google_permitidos`). Antes, un valor `Array`
// devuelto por el driver (indistinguible en JS de un `jsonb` que resulta
// ser un array — ambos llegan como `Array` de JS) se serializaba genérico
// como `$t:"json"` y se restauraba como el STRING JSON crudo
// (`'["a.com","b.com"]'`); Postgres interpreta el parámetro de una
// columna `text[]` con la sintaxis de LITERAL DE ARRAY (`{a.com,b.com}`),
// nunca con sintaxis JSON — la restauración fallaba con "malformed array
// literal". `columnasArray` (nuevo, por tabla) le dice a
// `exportar`/`restaurar` qué columnas son arrays nativos para que
// `serializarValor`/`deserializarValor` los etiqueten `$t:"pgarray"` y
// los devuelvan como un `Array` de JS real al reinsertar — `pg` sabe
// codificar un parámetro `Array` de JS al formato de wire de Postgres
// para CUALQUIER tipo de columna array, sin ambigüedad, porque en ese
// punto ya se sabe (por `columnasArray`) que es genuinamente una columna
// array nativa y no un jsonb-que-resulta-ser-array (que sigue viajando
// como `$t:"json"`, sin cambios, exactamente como antes).
export const VERSION_FORMATO_BACKUP = "atiende-rv-backup-logico-v2";

export type ValorSerializado =
  | string
  | number
  | boolean
  | null
  | { $t: "buffer"; v: string } // base64
  | { $t: "date"; v: string } // ISO 8601
  | { $t: "json"; v: string } // JSON.stringify ya aplicado (columnas json/jsonb)
  | { $t: "pgarray"; v: string }; // JSON.stringify de un Array — columna de ARRAY NATIVO (text[], int[], ...)

export interface FilaSerializada {
  [columna: string]: ValorSerializado;
}

export interface TablaBackup {
  nombre: string;
  columnas: string[];
  /** Subconjunto de `columnas` cuyo tipo real en Postgres es un ARRAY
   * NATIVO (`information_schema.columns.data_type = 'ARRAY'`) — nunca
   * confundir con una columna `jsonb` cuyo contenido resulte ser un array
   * de JSON, que NO aparece aquí y sigue viajando como `$t:"json"`. */
  columnasArray: string[];
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
