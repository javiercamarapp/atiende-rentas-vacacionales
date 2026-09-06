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

  describe("Auditoría 2, corrección Q-01: caso límite x.xx5 que antes divergía entre 4 copias", () => {
    // Antes de esta corrección `apps/api/src/routes/finanzas.ts` y las 2
    // copias de `apps/web` (finanzas/api.ts, reportes/api.ts) reimplementaban
    // este formateador con `Math.round` en vez del `Math.trunc` que domain ya
    // declaraba "criterio único" — divergencia real solo visible cuando
    // `centavos` llega con un residuo fraccionario (defensivo: en operación
    // normal siempre es entero, ver justificación en redondeo.ts). Las 3
    // copias ahora reexportan literalmente esta función (mismo módulo,
    // mismo objeto de función) — este test fija el comportamiento del ÚNICO
    // punto que las 4 llamadas comparten.
    it("1000.5 centavos (10.005 pesos) trunca a 10.00, nunca redondea a 10.01", () => {
      // Con Math.trunc (criterio único, canónico): 1000.
      // Con Math.round (criterio de las 3 copias eliminadas): 1001.
      expect(decimalDesdeCentavos(1000.5)).toBe("10.00");
    });

    it("el mismo caso límite en negativo: -1000.5 trunca hacia cero, a -10.00", () => {
      expect(decimalDesdeCentavos(-1000.5)).toBe("-10.00");
    });

    it("para centavos ya enteros (el caso real de producción) el criterio no importa: idéntico resultado", () => {
      // Confirma que la consolidación no cambió NINGÚN resultado para el
      // caso normal (entero) — solo eliminó la divergencia en el caso de
      // bug defensivo.
      for (const centavos of [0, 1, 99, 100, 123456, -5025, 840000]) {
        const viaTrunc = decimalDesdeCentavos(centavos);
        const viaRoundHipotetico = (() => {
          const negativo = centavos < 0;
          const abs = Math.abs(Math.round(centavos));
          return `${negativo ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
        })();
        expect(viaTrunc).toBe(viaRoundHipotetico);
      }
    });
  });
});
