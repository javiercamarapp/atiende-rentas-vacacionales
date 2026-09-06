import { describe, expect, it } from "vitest";
import { GoogleVacationRentalsAdapter, CAPACIDADES_GOOGLE_VR } from "../src/google-vr/adapter.js";

const EVIDENCIA_SIN_APROBAR = {
  credencialesPresentes: true,
  esSimulador: false,
  ultimaSincronizacionExitosaEn: new Date().toISOString(),
  ventanaMaximaMs: 6 * 60 * 60 * 1000,
  partnerAprobado: false,
  esSandbox: false,
  tipoConexion: "api" as const,
};

describe("GoogleVacationRentalsAdapter (Nivel B esqueleto, RV22 F29-F30) — invitación exclusiva", () => {
  it("nunca sale de partner_pendiente sin partnerAprobado real (invitación TAM, RV22-R-08)", () => {
    expect(new GoogleVacationRentalsAdapter(EVIDENCIA_SIN_APROBAR).obtenerEstadoConexion()).toBe("partner_pendiente");
  });

  it("declara reservationsPull=false (feed de contenido/pricing, sin retrieval de reservas documentado)", () => {
    expect(CAPACIDADES_GOOGLE_VR.reservationsPull).toBe(false);
    expect(CAPACIDADES_GOOGLE_VR.icalImportExport).toBe(false);
  });
});
