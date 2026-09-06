import { describe, expect, it } from "vitest";
import { calcularCotizacion, evaluarViolacionesMinStay } from "../../src/pricing/cotizacion.js";
import type { ContextoPricingUnidad } from "../../src/pricing/tipos.js";

const FUENTE_RV13 = "RV13: Airbnb art. 1344 (7+ noches semanal), Vrbo Manage rates";

function contexto(overrides: Partial<ContextoPricingUnidad> = {}): ContextoPricingUnidad {
  return {
    unidadId: "unidad-1",
    moneda: "MXN",
    precioBaseNocheCentavos: 100000, // $1,000.00/noche
    temporadas: [],
    descuentosDuracion: [],
    reglasMinStay: [],
    ...overrides,
  };
}

describe("calcularCotizacion — H-068 (determinista, precio base + estacionalidad + duración)", () => {
  it("suma el precio base por cada noche del rango", () => {
    const resultado = calcularCotizacion({
      contexto: contexto(),
      rango: { inicio: "2026-10-01", fin: "2026-10-04" }, // 3 noches
    });
    expect(resultado.noches).toBe(3);
    expect(resultado.subtotalAntesDescuentoCentavos).toBe(300000);
    expect(resultado.totalCentavos).toBe(300000);
  });

  it("usa el precio de temporada cuando la noche cae dentro de su rango", () => {
    const resultado = calcularCotizacion({
      contexto: contexto({
        temporadas: [
          { nombre: "Alta", rango: { inicio: "2026-12-15", fin: "2027-01-05" }, precioNocheCentavos: 200000 },
        ],
      }),
      rango: { inicio: "2026-12-20", fin: "2026-12-23" }, // 3 noches en temporada alta
    });
    expect(resultado.desgloseNoches.every((n) => n.origen === "temporada")).toBe(true);
    expect(resultado.subtotalAntesDescuentoCentavos).toBe(600000);
  });

  it("aplica el descuento por duración de mayor umbral cumplido, sin acumular con otros (RV13-R-02)", () => {
    const resultado = calcularCotizacion({
      contexto: contexto({
        descuentosDuracion: [
          { nochesMinimas: 7, porcentajeDescuentoBasisPoints: 1000, fuente: FUENTE_RV13 },
          { nochesMinimas: 28, porcentajeDescuentoBasisPoints: 2000, fuente: FUENTE_RV13 },
        ],
      }),
      rango: { inicio: "2026-10-01", fin: "2026-10-08" }, // 7 noches → solo el umbral de 7
    });
    expect(resultado.descuentoAplicado?.nochesMinimas).toBe(7);
    expect(resultado.descuentoAplicado?.montoCentavos).toBe(70000); // 10% de 700000
    expect(resultado.subtotalConDescuentoCentavos).toBe(630000);
  });

  it("con 28+ noches usa el umbral mensual, no el semanal", () => {
    const resultado = calcularCotizacion({
      contexto: contexto({
        descuentosDuracion: [
          { nochesMinimas: 7, porcentajeDescuentoBasisPoints: 1000, fuente: FUENTE_RV13 },
          { nochesMinimas: 28, porcentajeDescuentoBasisPoints: 2000, fuente: FUENTE_RV13 },
        ],
      }),
      rango: { inicio: "2026-01-01", fin: "2026-01-29" }, // 28 noches
    });
    expect(resultado.descuentoAplicado?.nochesMinimas).toBe(28);
  });

  it("aplica markup de canal sobre el subtotal ya descontado", () => {
    const resultado = calcularCotizacion({
      contexto: contexto(),
      rango: { inicio: "2026-10-01", fin: "2026-10-02" }, // 1 noche
      reglaCanal: { canalCodigo: "airbnb", markupBasisPoints: 500, activo: true },
    });
    expect(resultado.markupCanalCentavos).toBe(5000); // 5% de 100000
    expect(resultado.totalCentavos).toBe(105000);
  });

  it("regla de canal inactiva no aplica markup", () => {
    const resultado = calcularCotizacion({
      contexto: contexto(),
      rango: { inicio: "2026-10-01", fin: "2026-10-02" },
      reglaCanal: { canalCodigo: "airbnb", markupBasisPoints: 500, activo: false },
    });
    expect(resultado.markupCanalCentavos).toBe(0);
  });

  it("dos cotizaciones idénticas producen exactamente el mismo resultado (determinismo)", () => {
    const entrada = { contexto: contexto(), rango: { inicio: "2026-11-01", fin: "2026-11-05" } };
    expect(calcularCotizacion(entrada)).toEqual(calcularCotizacion(entrada));
  });

  it("rechaza un rango sin noches", () => {
    expect(() =>
      calcularCotizacion({ contexto: contexto(), rango: { inicio: "2026-10-01", fin: "2026-10-01" } }),
    ).toThrow();
  });
});

describe("evaluarViolacionesMinStay — H-068/RV13-R-03 (min-stay por fecha de check-in y día de semana)", () => {
  it("detecta violación cuando las noches solicitadas son menos que el mínimo del rango", () => {
    const violaciones = evaluarViolacionesMinStay(
      [{ rango: { inicio: "2026-12-01", fin: "2027-01-01" }, diaSemanaCheckIn: null, nochesMinimas: 5 }],
      { inicio: "2026-12-10", fin: "2026-12-12" },
      2,
    );
    expect(violaciones).toHaveLength(1);
  });

  it("solo aplica la regla de día de semana si el check-in cae en ese día", () => {
    // 2026-12-11 es viernes (dayOfWeek Temporal = 5) → JS-style 5.
    const reglaViernes = { rango: { inicio: "2026-12-01", fin: "2027-01-01" }, diaSemanaCheckIn: 5, nochesMinimas: 3 };
    const violacionesViernes = evaluarViolacionesMinStay([reglaViernes], { inicio: "2026-12-11", fin: "2026-12-12" }, 1);
    expect(violacionesViernes).toHaveLength(1);

    const violacionesLunes = evaluarViolacionesMinStay([reglaViernes], { inicio: "2026-12-14", fin: "2026-12-15" }, 1);
    expect(violacionesLunes).toHaveLength(0);
  });

  it("sin violaciones cuando las noches cumplen el mínimo", () => {
    const violaciones = evaluarViolacionesMinStay(
      [{ rango: { inicio: "2026-12-01", fin: "2027-01-01" }, diaSemanaCheckIn: null, nochesMinimas: 2 }],
      { inicio: "2026-12-10", fin: "2026-12-12" },
      2,
    );
    expect(violaciones).toHaveLength(0);
  });
});
