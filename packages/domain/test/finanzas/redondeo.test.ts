import { describe, expect, it } from "vitest";
import {
  aplicarPorcentaje,
  centavosDesdeDecimal,
  decimalDesdeCentavos,
  restarCentavos,
  sumarCentavos,
} from "../../src/finanzas/redondeo.js";

describe("redondeo monetario determinista (sin float)", () => {
  it("convierte decimales a centavos exactos", () => {
    expect(centavosDesdeDecimal("1234.56")).toBe(123456);
    expect(centavosDesdeDecimal("0.01")).toBe(1);
    expect(centavosDesdeDecimal("10")).toBe(1000);
    expect(centavosDesdeDecimal("-50.25")).toBe(-5025);
  });

  it("redondea half-up al convertir milésimos ambiguos", () => {
    // 10.005 -> 10.01 (half-up), nunca banker's rounding (10.00).
    expect(centavosDesdeDecimal("10.005")).toBe(1001);
  });

  it("rechaza decimales malformados", () => {
    expect(() => centavosDesdeDecimal("abc")).toThrow();
    expect(() => centavosDesdeDecimal("1.2.3")).toThrow();
  });

  it("decimalDesdeCentavos es el inverso exacto de centavosDesdeDecimal", () => {
    expect(decimalDesdeCentavos(123456)).toBe("1234.56");
    expect(decimalDesdeCentavos(1)).toBe("0.01");
    expect(decimalDesdeCentavos(-5025)).toBe("-50.25");
  });

  it("aplicarPorcentaje nunca usa punto flotante: 16% de 10000 centavos es exactamente 1600", () => {
    expect(aplicarPorcentaje(10000, 1600)).toBe(1600);
  });

  it("aplicarPorcentaje redondea half-up en casos no exactos", () => {
    // 3% de 101 centavos = 3.03 -> redondea a 3
    expect(aplicarPorcentaje(101, 300)).toBe(3);
    // 33.33% (3333 bp) de 100 centavos = 33.33 -> 33
    expect(aplicarPorcentaje(100, 3333)).toBe(33);
    // caso .5 exacto: 50% de 3 centavos = 1.5 -> half-up a 2
    expect(aplicarPorcentaje(3, 5000)).toBe(2);
  });

  it("suma y resta de centavos son exactas para valores típicos de renta vacacional", () => {
    expect(sumarCentavos(150000, 25000, 999)).toBe(175999);
    expect(restarCentavos(150000, 25000, 999)).toBe(124001);
  });

  it("100 aplicaciones sucesivas de 1/3 de 1 peso no acumulan error de float", () => {
    // Verificación anti-regresión: con floats, 100 * (1/3) puede no dar
    // exactamente 100/3 por error de representación binaria.
    let acumulado = 0;
    for (let i = 0; i < 100; i += 1) {
      acumulado = sumarCentavos(acumulado, aplicarPorcentaje(100, 3333));
    }
    expect(acumulado).toBe(3300); // 100 * 33 centavos, exacto
  });
});
