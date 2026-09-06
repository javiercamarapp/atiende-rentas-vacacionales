import { describe, expect, it } from "vitest";
import { deserializarValor, serializarValor } from "../../backup/serializacion.js";

/**
 * Lote 3.2 (H-096+): round-trip de `serializarValor`/`deserializarValor`
 * SIN Postgres (funciones puras) — cubre específicamente el caso que
 * rompía `npm run test:integration` (backup.test.ts) en cuanto el
 * esquema tuvo su primera columna de ARRAY NATIVO real
 * (`tenant.dominios_google_permitidos text[]`, migración
 * packages/db/src/migrations/0101_usuario_auth_extendida.ts):
 *
 * Antes, un `Array` de JS (lo que el driver devuelve tanto para una
 * columna `text[]` como para una columna `jsonb` que resulta ser un
 * array) se serializaba genérico como `$t:"json"` y se "deserializaba"
 * como el STRING JSON crudo — insertar ese string en una columna
 * `text[]` fallaba con "malformed array literal" porque Postgres exige
 * sintaxis de literal de array (`{a,b}`), nunca sintaxis JSON
 * (`["a","b"]`), para esa columna.
 */
describe("serializarValor/deserializarValor — columnas de ARRAY nativo (H-096+)", () => {
  it("un array con esColumnaArray=true se etiqueta 'pgarray' y se restaura como Array real de JS (nunca un string JSON)", () => {
    const original = ["empresa.example", "otra.example"];
    const serializado = serializarValor(original, true);
    expect(serializado).toEqual({ $t: "pgarray", v: JSON.stringify(original) });

    const restaurado = deserializarValor(serializado);
    expect(Array.isArray(restaurado)).toBe(true);
    expect(restaurado).toEqual(original);
    // Nunca el string JSON crudo — eso es justo el bug que rompía la
    // restauración contra una columna `text[]` real.
    expect(typeof restaurado).not.toBe("string");
  });

  it("un array vacío (default de dominios_google_permitidos: '{}') hace el mismo round-trip", () => {
    const serializado = serializarValor([], true);
    expect(deserializarValor(serializado)).toEqual([]);
  });

  it("sin esColumnaArray (columna jsonb cuyo contenido es un array, p. ej. mfa_recovery_codes) sigue viajando como 'json' — comportamiento sin cambios", () => {
    const original = [{ hash: "abc123", usadoEn: null }];
    const serializado = serializarValor(original, false);
    expect(serializado).toEqual({ $t: "json", v: JSON.stringify(original) });
    // Para una columna jsonb, el texto JSON crudo SÍ es lo correcto —
    // Postgres lo castea automáticamente al insertarlo.
    expect(deserializarValor(serializado)).toBe(JSON.stringify(original));
  });

  it("no confunde un objeto jsonb normal (no-array) con una columna array", () => {
    const original = { motivo: "prueba" };
    const serializado = serializarValor(original, true); // aunque el llamador diga "es array", esto NO es un Array
    expect(serializado).toEqual({ $t: "json", v: JSON.stringify(original) });
  });

  it("null/undefined/Buffer/Date/primitivos no cambian de comportamiento", () => {
    expect(serializarValor(null)).toBeNull();
    expect(serializarValor(undefined)).toBeNull();
    expect(serializarValor(42)).toBe(42);
    expect(serializarValor("texto")).toBe("texto");
    expect(serializarValor(true)).toBe(true);

    const buf = Buffer.from("hola");
    const serBuf = serializarValor(buf);
    expect(serBuf).toEqual({ $t: "buffer", v: buf.toString("base64") });
    expect(deserializarValor(serBuf)).toEqual(buf);

    const fecha = new Date("2026-01-01T00:00:00.000Z");
    const serFecha = serializarValor(fecha);
    expect(serFecha).toEqual({ $t: "date", v: fecha.toISOString() });
    expect(deserializarValor(serFecha)).toBe(fecha.toISOString());
  });
});
