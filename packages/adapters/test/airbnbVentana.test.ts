import { describe, expect, it } from "vitest";
import { fueraDeVentanaImportacionAirbnb, VENTANA_IMPORTACION_AIRBNB_ANIOS } from "../src/airbnb/adapter.js";

// RV22-R-01 (F02): Airbnb documenta una ventana de importación de hasta 2
// años para calendarios importados por un anfitrión — este helper es
// puramente informativo (advertencia de UI), nunca trunca el export real.
describe("fueraDeVentanaImportacionAirbnb (RV22-R-01, F02)", () => {
  const ahora = new Date("2026-09-06T00:00:00Z");

  it("declara la ventana como 2 años", () => {
    expect(VENTANA_IMPORTACION_AIRBNB_ANIOS).toBe(2);
  });

  it("un rango dentro de 2 años NO está fuera de ventana", () => {
    expect(fueraDeVentanaImportacionAirbnb("2027-06-01", ahora)).toBe(false);
  });

  it("un rango justo en el límite de 2 años NO está fuera de ventana", () => {
    expect(fueraDeVentanaImportacionAirbnb("2028-09-05", ahora)).toBe(false);
  });

  it("un rango más allá de 2 años SÍ está fuera de ventana", () => {
    expect(fueraDeVentanaImportacionAirbnb("2029-01-01", ahora)).toBe(true);
  });
});
