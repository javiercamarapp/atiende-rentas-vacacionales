import { describe, expect, it } from "vitest";
import { AirbnbIcalChannelSimulator } from "../src/airbnb-ical/index.js";
import { CredencialesSospechosasDeProduccionError } from "../src/comun/etiquetado.js";

describe("D-019 — arranque de simulador rechazado con credenciales sospechosas (§Operación-4)", () => {
  it("rechaza el arranque si entorno declarado es 'production'", () => {
    expect(() => new AirbnbIcalChannelSimulator({ entorno: "production" })).toThrow(
      CredencialesSospechosasDeProduccionError,
    );
  });

  it("rechaza el arranque si entorno declarado es 'produccion'", () => {
    expect(() => new AirbnbIcalChannelSimulator({ entorno: "produccion" })).toThrow(
      CredencialesSospechosasDeProduccionError,
    );
  });

  it("rechaza credenciales con patrón de token real (live_/prod_/sk_live_)", () => {
    expect(() => new AirbnbIcalChannelSimulator({ credenciales: "live_abc123" })).toThrow(
      CredencialesSospechosasDeProduccionError,
    );
    expect(() => new AirbnbIcalChannelSimulator({ credenciales: "sk_live_xyz" })).toThrow(
      CredencialesSospechosasDeProduccionError,
    );
  });

  it("permite el arranque con credenciales de prueba normales", () => {
    expect(() => new AirbnbIcalChannelSimulator({ credenciales: "test_credencial_falsa", entorno: "test" })).not.toThrow();
  });
});
