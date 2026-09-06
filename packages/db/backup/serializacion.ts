import type { ValorSerializado } from "./tiposBackup.js";

/**
 * Serializa un valor tal como lo devuelve el driver SQL (pg/PGlite: los
 * timestamptz llegan como `Date`, bytea como `Buffer`, json/jsonb ya
 * parseados como objeto/array JS, ARRAY nativo de Postgres también como
 * `Array` de JS) a una forma JSON-segura reversible. Sin esto,
 * `JSON.stringify` de un `Buffer` o un `Date` pierde información o
 * produce un formato no reconstruible byte a byte.
 *
 * `esColumnaArray` (Lote 3.2, H-096+, ver tiposBackup.ts): un `Array` de
 * JS es AMBIGUO por sí solo — puede venir de una columna `text[]`/`int[]`
 * (ARRAY nativo de Postgres) o de una columna `jsonb` cuyo contenido
 * resulta ser un array JSON (p. ej. `usuario.mfa_recovery_codes`). Ambos
 * casos necesitan una sintaxis de restauración DISTINTA (literal de array
 * de Postgres `{a,b}` vs. texto JSON `["a","b"]`), así que el llamador
 * (`exportar.ts`, que sí conoce el tipo real de la columna vía
 * `information_schema`) debe indicar cuál es cuál.
 */
export function serializarValor(valor: unknown, esColumnaArray: boolean = false): ValorSerializado {
  if (valor === null || valor === undefined) return null;
  if (Buffer.isBuffer(valor)) return { $t: "buffer", v: valor.toString("base64") };
  if (valor instanceof Date) return { $t: "date", v: valor.toISOString() };
  if (Array.isArray(valor) && esColumnaArray) return { $t: "pgarray", v: JSON.stringify(valor) };
  if (typeof valor === "object") return { $t: "json", v: JSON.stringify(valor) };
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") return valor;
  return String(valor);
}

/**
 * Reconstruye el valor a la forma que espera el `params` de una consulta
 * parametrizada de inserción. Las fechas y los JSON viajan como texto —
 * Postgres castea el texto al tipo real de la columna (`timestamptz`,
 * `jsonb`) automáticamente al insertarlo; `bytea` sí necesita volver a ser
 * un `Buffer` real. `pgarray` (H-096) sí necesita volver a ser un `Array`
 * de JS real (no un string JSON) — `pg` codifica un parámetro `Array`
 * directamente al formato de wire de ARRAY de Postgres, que es lo que la
 * columna destino (`text[]`, etc.) espera; un string con sintaxis JSON
 * (`["a","b"]`) NUNCA es un literal de array de Postgres válido
 * (`{a,b}`), así que enviarlo como texto plano fallaría con "malformed
 * array literal".
 */
export function deserializarValor(valor: ValorSerializado): unknown {
  if (valor === null) return null;
  if (typeof valor !== "object") return valor;
  switch (valor.$t) {
    case "buffer":
      return Buffer.from(valor.v, "base64");
    case "date":
      return valor.v;
    case "json":
      return valor.v;
    case "pgarray":
      return JSON.parse(valor.v) as unknown[];
    default:
      return valor;
  }
}
