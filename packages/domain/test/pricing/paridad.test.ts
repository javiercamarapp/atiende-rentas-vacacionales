import { describe, expect, it } from "vitest";
import { detectarViolacionesParidad } from "../../src/pricing/paridad.js";
import type { ReglaCanal } from "../../src/pricing/tipos.js";

const REGLA_AIRBNB: ReglaCanal = { canalCodigo: "airbnb", markupBasisPoints: 1500, activo: true }; // 15%
const REGLA_VRBO: ReglaCanal = { canalCodigo: "vrbo", markupBasisPoints: 1000, activo: true }; // 10%

describe("detectarViolacionesParidad — H-071 (RV13-R-04/R-06)", () => {
  it("no marca violación si el precio publicado coincide con el esperado (referencia + markup)", () => {
    const violaciones = detectarViolacionesParidad(
      [{ canalCodigo: "airbnb", precioNocheCentavos: 115000, reglaCanal: REGLA_AIRBNB }], // 1000 + 15% = 1150
      { precioReferenciaNocheCentavos: 100000, toleranciaBasisPoints: 100 },
    );
    expect(violaciones).toHaveLength(0);
  });

  it("no marca violación dentro de la tolerancia configurada", () => {
    const violaciones = detectarViolacionesParidad(
      [{ canalCodigo: "airbnb", precioNocheCentavos: 116000, reglaCanal: REGLA_AIRBNB }], // ~0.87% sobre 115000
      { precioReferenciaNocheCentavos: 100000, toleranciaBasisPoints: 100 },
    );
    expect(violaciones).toHaveLength(0);
  });

  it("marca violación 'por ENCIMA' cuando el canal publica más caro que lo esperado, con propuesta de ajuste", () => {
    const violaciones = detectarViolacionesParidad(
      [{ canalCodigo: "airbnb", precioNocheCentavos: 130000, reglaCanal: REGLA_AIRBNB }], // esperado 115000
      { precioReferenciaNocheCentavos: 100000, toleranciaBasisPoints: 200 },
    );
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]!.diferenciaBasisPoints).toBeGreaterThan(0);
    expect(violaciones[0]!.precioEsperadoNocheCentavos).toBe(115000);
    expect(violaciones[0]!.propuesta.precioPropuestoNocheCentavos).toBe(115000);
    expect(violaciones[0]!.propuesta.mensaje).toContain("por ENCIMA");
    expect(violaciones[0]!.propuesta.mensaje).toContain("nunca publica automáticamente");
  });

  it("marca violación 'por DEBAJO' cuando el canal publica más barato que lo esperado", () => {
    const violaciones = detectarViolacionesParidad(
      [{ canalCodigo: "vrbo", precioNocheCentavos: 90000, reglaCanal: REGLA_VRBO }], // esperado 110000
      { precioReferenciaNocheCentavos: 100000, toleranciaBasisPoints: 200 },
    );
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]!.diferenciaBasisPoints).toBeLessThan(0);
    expect(violaciones[0]!.propuesta.mensaje).toContain("por DEBAJO");
  });

  it("sin ReglaCanal (null), compara 1:1 contra el precio de referencia (sin markup esperado)", () => {
    const violaciones = detectarViolacionesParidad(
      [{ canalCodigo: "booking", precioNocheCentavos: 120000, reglaCanal: null }],
      { precioReferenciaNocheCentavos: 100000, toleranciaBasisPoints: 500 },
    );
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]!.precioEsperadoNocheCentavos).toBe(100000);
  });

  it("una ReglaCanal inactiva se trata igual que null (sin markup esperado)", () => {
    const violaciones = detectarViolacionesParidad(
      [{ canalCodigo: "airbnb", precioNocheCentavos: 100000, reglaCanal: { ...REGLA_AIRBNB, activo: false } }],
      { precioReferenciaNocheCentavos: 100000, toleranciaBasisPoints: 0 },
    );
    expect(violaciones).toHaveLength(0);
  });

  it("evalúa múltiples canales de forma independiente, preservando el orden de entrada", () => {
    const violaciones = detectarViolacionesParidad(
      [
        { canalCodigo: "airbnb", precioNocheCentavos: 115000, reglaCanal: REGLA_AIRBNB }, // sin violación
        { canalCodigo: "vrbo", precioNocheCentavos: 150000, reglaCanal: REGLA_VRBO }, // violación
      ],
      { precioReferenciaNocheCentavos: 100000, toleranciaBasisPoints: 100 },
    );
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]!.canalCodigo).toBe("vrbo");
  });

  it("nunca publica nada — el módulo no expone ninguna función de escritura/publicación", async () => {
    const modulo = await import("../../src/pricing/paridad.js");
    const nombresExportados = Object.keys(modulo);
    expect(nombresExportados).toEqual(["detectarViolacionesParidad"]);
  });
});
