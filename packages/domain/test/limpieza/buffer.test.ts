import { describe, expect, it } from "vitest";
import { calcularRangoBuffer } from "../../src/limpieza/buffer.js";

describe("calcularRangoBuffer (H-050)", () => {
  it("calcula el rango [checkout, checkout+n) para un buffer de 1 noche", () => {
    expect(calcularRangoBuffer("2026-06-10", 1)).toEqual({ inicio: "2026-06-10", fin: "2026-06-11" });
  });

  it("calcula un buffer de varias noches", () => {
    expect(calcularRangoBuffer("2026-06-10", 3)).toEqual({ inicio: "2026-06-10", fin: "2026-06-13" });
  });

  it("buffer=0 significa 'sin buffer' (null, ningún bloqueo se crea)", () => {
    expect(calcularRangoBuffer("2026-06-10", 0)).toBeNull();
  });
});
