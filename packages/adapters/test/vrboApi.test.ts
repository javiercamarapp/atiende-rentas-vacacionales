import { describe, expect, it } from "vitest";
import { VrboApiChannelAdapter, CAPACIDADES_VRBO_API } from "../src/vrbo/apiAdapter.js";
import { VrboChannelAdapter } from "../src/vrbo/adapter.js";

const EVIDENCIA_SIN_APROBAR = {
  credencialesPresentes: true,
  esSimulador: false,
  ultimaSincronizacionExitosaEn: new Date().toISOString(),
  ventanaMaximaMs: 6 * 60 * 60 * 1000,
  partnerAprobado: false,
  esSandbox: false,
  tipoConexion: "api" as const,
};

describe("VrboApiChannelAdapter (Nivel B esqueleto, RV22 F13) — separado del adaptador iCal", () => {
  it("usa el mismo código de canal 'vrbo' que el adaptador iCal, pero capacidades distintas (RV22-R-02/R-05)", () => {
    const api = new VrboApiChannelAdapter(EVIDENCIA_SIN_APROBAR);
    const ical = new VrboChannelAdapter({ ...EVIDENCIA_SIN_APROBAR, tipoConexion: "ical" });
    expect(api.nombreCanal).toBe("vrbo");
    expect(ical.nombreCanal).toBe("vrbo");
    expect(api.capacidades).not.toEqual(ical.capacidades);
  });

  it("nunca sale de partner_pendiente sin partnerAprobado real (D-017)", () => {
    expect(new VrboApiChannelAdapter(EVIDENCIA_SIN_APROBAR).obtenerEstadoConexion()).toBe("partner_pendiente");
  });

  it("declara icalImportExport=false (es la vía API, no iCal)", () => {
    expect(CAPACIDADES_VRBO_API.icalImportExport).toBe(false);
  });
});
