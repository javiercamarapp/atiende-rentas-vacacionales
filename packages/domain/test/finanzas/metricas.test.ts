import { describe, expect, it } from "vitest";
import { calcularMetricasPeriodo } from "../../src/finanzas/metricas.js";

describe("calcularMetricasPeriodo — H-072/H-073 (ocupación, ADR, RevPAR)", () => {
  it("calcula ocupación, ADR y RevPAR con valores exactos", () => {
    const r = calcularMetricasPeriodo({
      ingresosBrutosCentavos: 1_000_00,
      nochesOcupadas: 10,
      nochesDisponibles: 20,
    });
    expect(r.ocupacionBasisPoints).toBe(5000); // 50.00%
    expect(r.adrCentavos).toBe(10000); // 100000/10
    expect(r.revparCentavos).toBe(5000); // 100000/20
  });

  it("cero noches disponibles nunca divide por cero", () => {
    const r = calcularMetricasPeriodo({ ingresosBrutosCentavos: 0, nochesOcupadas: 0, nochesDisponibles: 0 });
    expect(r.ocupacionBasisPoints).toBe(0);
    expect(r.adrCentavos).toBe(0);
    expect(r.revparCentavos).toBe(0);
  });

  it("redondea half-up la ocupación en basis points", () => {
    // 1/3 = 33.333...% -> 3333.33 bp -> redondeo half-up a 3333
    const r = calcularMetricasPeriodo({ ingresosBrutosCentavos: 0, nochesOcupadas: 1, nochesDisponibles: 3 });
    expect(r.ocupacionBasisPoints).toBe(3333);
  });

  it("rechaza noches ocupadas mayores a las disponibles", () => {
    expect(() =>
      calcularMetricasPeriodo({ ingresosBrutosCentavos: 0, nochesOcupadas: 5, nochesDisponibles: 3 }),
    ).toThrow();
  });

  it("rechaza valores negativos", () => {
    expect(() =>
      calcularMetricasPeriodo({ ingresosBrutosCentavos: 0, nochesOcupadas: -1, nochesDisponibles: 3 }),
    ).toThrow();
  });
});
