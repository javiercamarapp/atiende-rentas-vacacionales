import { describe, expect, it } from "vitest";
import { AgodaChannelAdapter, CAPACIDADES_AGODA, LATENCIA_AGODA_ICAL } from "../src/agoda/adapter.js";

describe("AgodaChannelAdapter (Nivel A, RV22 §2.8)", () => {
  it("declara capacidades honestas: solo disponibilidad, sin tarifas/reservas/mensajería", () => {
    expect(CAPACIDADES_AGODA).toEqual({
      availabilityPush: true,
      ratesPush: false,
      reservationsPull: false,
      icalImportExport: true,
      messaging: false,
    });
  });

  it("nunca reporta latencia con cifra numérica sin fuente oficial (confianza baja, sin minutos)", () => {
    expect(LATENCIA_AGODA_ICAL.confianza).toBe("baja");
    expect(LATENCIA_AGODA_ICAL.minutosEstimados).toBeNull();
  });

  it("reporta 'ical' con evidencia de sync reciente y tipoConexion=ical", () => {
    const adaptador = new AgodaChannelAdapter({
      credencialesPresentes: true,
      esSimulador: false,
      ultimaSincronizacionExitosaEn: new Date().toISOString(),
      ventanaMaximaMs: 6 * 60 * 60 * 1000,
      partnerAprobado: false,
      esSandbox: false,
      tipoConexion: "ical",
    });
    expect(adaptador.obtenerEstadoConexion()).toBe("ical");
  });

  it("reporta 'no_conectado' sin credenciales, nunca 'ical' por defecto", () => {
    const adaptador = new AgodaChannelAdapter({
      credencialesPresentes: false,
      esSimulador: false,
      ultimaSincronizacionExitosaEn: null,
      ventanaMaximaMs: 6 * 60 * 60 * 1000,
      partnerAprobado: false,
      esSandbox: false,
      tipoConexion: "ical",
    });
    expect(adaptador.obtenerEstadoConexion()).toBe("no_conectado");
  });

  it("reporta 'simulador' siempre que esSimulador=true, sin importar el resto de la evidencia", () => {
    const adaptador = new AgodaChannelAdapter({
      credencialesPresentes: true,
      esSimulador: true,
      ultimaSincronizacionExitosaEn: new Date().toISOString(),
      ventanaMaximaMs: 6 * 60 * 60 * 1000,
      partnerAprobado: true,
      esSandbox: false,
      tipoConexion: "ical",
    });
    expect(adaptador.obtenerEstadoConexion()).toBe("simulador");
  });
});
