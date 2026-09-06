import { describe, expect, it } from "vitest";
import {
  SiteMinderPmsXchangeAdapter,
  CAPACIDADES_SITEMINDER,
  CANALES_CUBIERTOS_SITEMINDER,
} from "../src/siteminder/adapter.js";

describe("SiteMinderPmsXchangeAdapter (Nivel B, puente — RV22 F24-F25)", () => {
  it("cubre exactamente los canales confirmados por la tabla de códigos de SiteMinder (Best Day NO incluido)", () => {
    expect(CANALES_CUBIERTOS_SITEMINDER).toEqual(["booking", "expedia", "vrbo", "despegar", "pricetravel"]);
    expect(CANALES_CUBIERTOS_SITEMINDER).not.toContain("bestday");
  });

  it("declara capacidades completas de puente (disponibilidad+tarifas+reservas)", () => {
    expect(CAPACIDADES_SITEMINDER).toEqual({
      availabilityPush: true,
      ratesPush: true,
      reservationsPull: true,
      icalImportExport: false,
      messaging: false,
    });
  });

  it("nunca reporta estado distinto de partner_pendiente sin partnerAprobado real", () => {
    const adaptador = new SiteMinderPmsXchangeAdapter({
      credencialesPresentes: true,
      esSimulador: false,
      ultimaSincronizacionExitosaEn: new Date().toISOString(),
      ventanaMaximaMs: 6 * 60 * 60 * 1000,
      partnerAprobado: false,
      esSandbox: false,
      tipoConexion: "api",
    });
    expect(adaptador.obtenerEstadoConexion()).toBe("partner_pendiente");
  });
});
