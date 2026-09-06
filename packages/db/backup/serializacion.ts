import type { ValorSerializado } from "./tiposBackup.js";

/**
 * Serializa un valor tal como lo devuelve el driver SQL (pg/PGlite: los
 * timestamptz llegan como `Date`, bytea como `Buffer`, json/jsonb ya
 * parseados como objeto/array JS) a una forma JSON-segura reversible. Sin
 * esto, `JSON.stringify` de un `Buffer` o un `Date` pierde información o
 * produce un formato no reconstruible byte a byte.
 */
export function serializarValor(valor: unknown): ValorSerializado {
  if (valor === null || valor === undefined) return null;
  if (Buffer.isBuffer(valor)) return { $t: "buffer", v: valor.toString("base64") };
  if (valor instanceof Date) return { $t: "date", v: valor.toISOString() };
  if (typeof valor === "object") return { $t: "json", v: JSON.stringify(valor) };
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") return valor;
  return String(valor);
}

/**
 * Reconstruye el valor a la forma que espera el `params` de una consulta
 * parametrizada de inserción. Las fechas y los JSON viajan como texto —
 * Postgres castea el texto al tipo real de la columna (`timestamptz`,
 * `jsonb`) automáticamente al insertarlo; `bytea` sí necesita volver a ser
 * un `Buffer` real.
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
    default:
      return valor;
  }
}
