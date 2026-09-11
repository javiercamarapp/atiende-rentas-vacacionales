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

  it("sin nochesBloqueadasPorLimpiezaPendiente, el RevPAR ajustado es idéntico al RevPAR normal (comportamiento previo a H-072 intacto)", () => {
    const r = calcularMetricasPeriodo({ ingresosBrutosCentavos: 1_000_00, nochesOcupadas: 10, nochesDisponibles: 20 });
    expect(r.nochesDisponiblesVendibles).toBe(20);
    expect(r.revparAjustadoLimpiezaCentavos).toBe(r.revparCentavos);
  });
});

describe("calcularMetricasPeriodo — H-072 (cruce real con tarea_operativa de Lote 5: limpieza pendiente reduce el inventario vendible)", () => {
  it("resta del RevPAR ajustado las noches bloqueadas por una tarea de limpieza aún no completada", () => {
    // 7 noches del periodo, 2 ocupadas y vendidas en $1,000.00, 2 más
    // bloqueadas porque la limpieza de turnover de otra estancia sigue
    // pendiente: solo 5 noches eran realmente vendibles.
    const r = calcularMetricasPeriodo({
      ingresosBrutosCentavos: 1_000_00,
      nochesOcupadas: 2,
      nochesDisponibles: 7,
      nochesBloqueadasPorLimpiezaPendiente: 2,
    });
    expect(r.nochesDisponiblesVendibles).toBe(5);
    expect(r.revparAjustadoLimpiezaCentavos).toBe(20000); // 100000/5
    expect(r.revparCentavos).toBe(14286); // 100000/7, sin ajustar — se conserva sin cambios
  });

  it("nunca reporta menos noches vendibles que las ya ocupadas, incluso si la limpieza pendiente reportada excede el resto de noches libres", () => {
    // Caso límite: 3 ocupadas de 5 disponibles, y 4 noches marcadas como
    // bloqueadas por limpieza pendiente (dato inconsistente/solapado con
    // las ya ocupadas) — nochesDisponiblesVendibles nunca debe caer por
    // debajo de nochesOcupadas, una noche vendida siempre fue vendible.
    const r = calcularMetricasPeriodo({
      ingresosBrutosCentavos: 300_00,
      nochesOcupadas: 3,
      nochesDisponibles: 5,
      nochesBloqueadasPorLimpiezaPendiente: 4,
    });
    expect(r.nochesDisponiblesVendibles).toBe(3);
    expect(r.revparAjustadoLimpiezaCentavos).toBe(10000); // 30000/3
  });

  it("rechaza nochesBloqueadasPorLimpiezaPendiente negativas o mayores a nochesDisponibles", () => {
    expect(() =>
      calcularMetricasPeriodo({
        ingresosBrutosCentavos: 0,
        nochesOcupadas: 0,
        nochesDisponibles: 5,
        nochesBloqueadasPorLimpiezaPendiente: -1,
      }),
    ).toThrow();
    expect(() =>
      calcularMetricasPeriodo({
        ingresosBrutosCentavos: 0,
        nochesOcupadas: 0,
        nochesDisponibles: 5,
        nochesBloqueadasPorLimpiezaPendiente: 6,
      }),
    ).toThrow();
  });
});
