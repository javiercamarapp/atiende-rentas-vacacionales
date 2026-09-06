import { describe, expect, it } from "vitest";
import { calcularDesgloseSuscripcion } from "../../src/facturacion/calculoSuscripcion.js";
import { buscarPlanPorDefecto, planesPorDefecto } from "../../src/facturacion/planes.js";
import type { PlanFacturacion } from "../../src/facturacion/tipos.js";

describe("calcularDesgloseSuscripcion — RV16-R-01 (escalones marginales por volumen)", () => {
  const esencial = buscarPlanPorDefecto("esencial")!;

  it("cobra el precio del primer escalón para unidades dentro de ese escalón", () => {
    const d = calcularDesgloseSuscripcion({ plan: esencial, unidadesActivas: 3, addOnsActivos: [] });
    expect(d.lineasEscalon).toEqual([
      { hastaUnidades: 5, unidades: 3, precioCentavosPorUnidad: 3500, subtotalCentavos: 10500 },
    ]);
    expect(d.subtotalUnidadesCentavos).toBe(10500);
    expect(d.totalCentavos).toBe(10500);
  });

  it("reparte las unidades entre escalones de forma MARGINAL, no 'todo al precio del escalón alcanzado'", () => {
    // esencial: hasta 5 unidades a $35.00, resto a $30.00 — con 8 unidades:
    // 5 * 3500 + 3 * 3000 = 17500 + 9000 = 26500
    const d = calcularDesgloseSuscripcion({ plan: esencial, unidadesActivas: 8, addOnsActivos: [] });
    expect(d.lineasEscalon).toEqual([
      { hastaUnidades: 5, unidades: 5, precioCentavosPorUnidad: 3500, subtotalCentavos: 17500 },
      { hastaUnidades: null, unidades: 3, precioCentavosPorUnidad: 3000, subtotalCentavos: 9000 },
    ]);
    expect(d.subtotalUnidadesCentavos).toBe(26500);
  });

  it("con 0 unidades activas, el subtotal de unidades es 0 y no genera líneas de escalón", () => {
    const d = calcularDesgloseSuscripcion({ plan: esencial, unidadesActivas: 0, addOnsActivos: [] });
    expect(d.lineasEscalon).toEqual([]);
    expect(d.subtotalUnidadesCentavos).toBe(0);
    expect(d.totalCentavos).toBe(0);
  });

  it("suma el add-on de IA activo aparte del subtotal de unidades (RV16-R-02)", () => {
    const d = calcularDesgloseSuscripcion({
      plan: esencial,
      unidadesActivas: 2,
      addOnsActivos: ["ia_conversacional_500"],
    });
    expect(d.subtotalAddOnsCentavos).toBe(1500);
    expect(d.totalCentavos).toBe(d.subtotalUnidadesCentavos + 1500);
  });

  it("cruzar tres escalones (plan portafolio) calcula cada tramo con su propio precio", () => {
    const portafolio = buscarPlanPorDefecto("portafolio")!;
    // 30 * 2000 + 70 * 1500 + 20 * 1000 = 60000 + 105000 + 20000 = 185000, con 120 unidades
    const d = calcularDesgloseSuscripcion({ plan: portafolio, unidadesActivas: 120, addOnsActivos: [] });
    expect(d.lineasEscalon.map((l) => l.subtotalCentavos)).toEqual([60000, 105000, 20000]);
    expect(d.subtotalUnidadesCentavos).toBe(185000);
  });

  it("rechaza un add-on que no pertenece al plan", () => {
    expect(() =>
      calcularDesgloseSuscripcion({ plan: esencial, unidadesActivas: 1, addOnsActivos: ["no-existe"] }),
    ).toThrow(/no está disponible/);
  });

  it("rechaza unidadesActivas negativas o no enteras", () => {
    expect(() => calcularDesgloseSuscripcion({ plan: esencial, unidadesActivas: -1, addOnsActivos: [] })).toThrow();
    expect(() => calcularDesgloseSuscripcion({ plan: esencial, unidadesActivas: 1.5, addOnsActivos: [] })).toThrow();
  });

  it("lanza si el catálogo de escalones no cubre las unidades (sin escalón final null)", () => {
    const planIncompleto: PlanFacturacion = {
      ...esencial,
      escalones: [{ hastaUnidades: 5, precioCentavosPorUnidad: 3500 }],
    };
    expect(() =>
      calcularDesgloseSuscripcion({ plan: planIncompleto, unidadesActivas: 10, addOnsActivos: [] }),
    ).toThrow(/no cubre/);
  });

  it("todos los planes por defecto son un borrador comercial etiquetado (RV16)", () => {
    for (const plan of planesPorDefecto) {
      expect(plan.etiquetaPrecio).toBe("borrador_comercial");
    }
  });
});
