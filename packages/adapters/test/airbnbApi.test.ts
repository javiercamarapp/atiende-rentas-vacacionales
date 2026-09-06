import { describe, expect, it } from "vitest";
import { AirbnbApiChannelAdapter, CAPACIDADES_AIRBNB_API } from "../src/airbnb/apiAdapter.js";
import { AirbnbChannelAdapter } from "../src/airbnb/adapter.js";

const EVIDENCIA_SIN_APROBAR = {
  credencialesPresentes: true,
  esSimulador: false,
  ultimaSincronizacionExitosaEn: new Date().toISOString(),
  ventanaMaximaMs: 6 * 60 * 60 * 1000,
  partnerAprobado: false,
  esSandbox: false,
  tipoConexion: "api" as const,
};

describe("AirbnbApiChannelAdapter (Nivel B esqueleto, RV03/RV22 F01) — separado del adaptador iCal", () => {
  it("usa el mismo código de canal 'airbnb' que el adaptador iCal, pero capacidades distintas", () => {
    const api = new AirbnbApiChannelAdapter(EVIDENCIA_SIN_APROBAR);
    const ical = new AirbnbChannelAdapter({ ...EVIDENCIA_SIN_APROBAR, tipoConexion: "ical" });
    expect(api.nombreCanal).toBe("airbnb");
    expect(ical.nombreCanal).toBe("airbnb");
    expect(api.capacidades).not.toEqual(ical.capacidades);
  });

  it("nunca sale de partner_pendiente sin partnerAprobado real (NDA, D-017)", () => {
    expect(new AirbnbApiChannelAdapter(EVIDENCIA_SIN_APROBAR).obtenerEstadoConexion()).toBe("partner_pendiente");
  });

  it("declara messaging=true (Homes/Activities API incluye mensajería) e icalImportExport=false", () => {
    expect(CAPACIDADES_AIRBNB_API.messaging).toBe(true);
    expect(CAPACIDADES_AIRBNB_API.icalImportExport).toBe(false);
  });
});
