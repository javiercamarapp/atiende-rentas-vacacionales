import { describe, expect, it } from "vitest";
import { REGISTRO_ADAPTADORES, entradasPorCanal } from "../src/registro.js";

describe("REGISTRO_ADAPTADORES — descubribilidad de código, no fuente de verdad de UI", () => {
  it("Airbnb y Vrbo tienen dos entradas (iCal + API partner) con vía distinta (RV22-R-02/R-05)", () => {
    expect(entradasPorCanal("airbnb")).toHaveLength(2);
    expect(entradasPorCanal("vrbo")).toHaveLength(2);
    expect(entradasPorCanal("airbnb").map((e) => e.via).sort()).toEqual(["api_partner", "ical"]);
  });

  it("ningún canal Nivel C tiene entrada de adaptador (sin código de adaptador falso, RV22-R-06)", () => {
    const canalesNivelC = ["bestday", "tripadvisor_rentals", "flipkey", "hometogo", "marriott_hv", "plumguide", "hopper", "facebook_marketplace"];
    for (const canal of canalesNivelC) {
      expect(entradasPorCanal(canal)).toHaveLength(0);
    }
  });

  it("solo los canales con simulador etiquetado declaran tieneSimulador=true (Vrbo API/Airbnb API/Google VR: false)", () => {
    const sinSimulador = REGISTRO_ADAPTADORES.filter((e) => !e.tieneSimulador).map((e) => `${e.canalCodigo}:${e.via}`);
    expect(sinSimulador.sort()).toEqual(["airbnb:api_partner", "google_vr:api_partner", "vrbo:api_partner"]);
  });
});
