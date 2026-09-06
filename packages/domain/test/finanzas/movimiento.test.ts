import { describe, expect, it } from "vitest";
import { calcularMovimientoReserva } from "../../src/finanzas/movimiento.js";
import type { EntradaMovimientoReserva } from "../../src/finanzas/tipos.js";

const FUENTE_AIRBNB = "RV12 L-RV12-02: airbnb.com/help/article/1857 (host-only 14-16%, 16% México)";

function entradaBase(overrides: Partial<EntradaMovimientoReserva> = {}): EntradaMovimientoReserva {
  return {
    ocupacionUnidadId: "res-1",
    moneda: "MXN",
    montoBrutoCentavos: 1_000_00,
    comisionCanal: { yaNetoDeComision: false, comisionBasisPoints: 1600, fuente: FUENTE_AIRBNB },
    comisionGestor: { basisPoints: 1000, base: "neto_de_canal" },
    gastos: [],
    impuestos: [],
    ...overrides,
  };
}

describe("calcularMovimientoReserva — Finanzas-1 (sin doble descuento)", () => {
  it("canal bruto: resta la comisión de canal sobre el bruto, luego la del gestor", () => {
    const m = calcularMovimientoReserva(entradaBase());
    expect(m.ingresoBrutoCentavos).toBe(100000);
    expect(m.comisionCanalCentavos).toBe(16000); // 16% de 100000
    expect(m.montoRecibidoCentavos).toBe(84000);
    expect(m.comisionGestorCentavos).toBe(8400); // 10% de 84000 (neto_de_canal)
    expect(m.netoCentavos).toBe(75600);
  });

  it("canal ya neto de comisión: NUNCA vuelve a restar la comisión de canal sobre el bruto (entregable del Lote 7)", () => {
    const entrada = entradaBase({
      montoBrutoCentavos: 84000, // este ya es el monto neto que Airbnb depositó
      comisionCanal: { yaNetoDeComision: true, comisionBasisPoints: 1600, fuente: FUENTE_AIRBNB },
    });
    const m = calcularMovimientoReserva(entrada);
    expect(m.comisionCanalCentavos).toBe(0);
    expect(m.montoRecibidoCentavos).toBe(84000);
    // Comparado con el caso "bruto" de arriba: mismo monto recibido (84000),
    // misma comisión de gestor resultante (8400) — la prueba explícita de
    // que no hay doble descuento es que montoRecibidoCentavos no vuelve a
    // perder otro 16%.
    expect(m.comisionGestorCentavos).toBe(8400);
    expect(m.netoCentavos).toBe(75600);
  });

  it("comisión del gestor sobre bruto (política de tenant distinta)", () => {
    const entrada = entradaBase({
      comisionGestor: { basisPoints: 1000, base: "bruto" },
    });
    const m = calcularMovimientoReserva(entrada);
    expect(m.comisionGestorCentavos).toBe(10000); // 10% de 100000 (bruto), no de 84000
  });

  it("descuenta gastos e impuestos del neto, sin afectar los totales de comisión", () => {
    const entrada = entradaBase({
      gastos: [
        { tipo: "limpieza", montoCentavos: 50000 },
        { tipo: "mantenimiento", montoCentavos: 10000 },
      ],
      impuestos: [{ tipo: "retencion_isr", montoCentavos: 5000, nota: "revisión fiscal B-005" }],
    });
    const m = calcularMovimientoReserva(entrada);
    expect(m.gastosCentavos).toBe(60000);
    expect(m.impuestosCentavos).toBe(5000);
    expect(m.netoCentavos).toBe(75600 - 60000 - 5000);
  });

  it("rechaza monto bruto negativo", () => {
    expect(() => calcularMovimientoReserva(entradaBase({ montoBrutoCentavos: -1 }))).toThrow();
  });
});
