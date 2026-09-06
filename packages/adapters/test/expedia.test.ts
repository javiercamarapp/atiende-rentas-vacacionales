import { describe, expect, it } from "vitest";
import {
  ExpediaChannelAdapter,
  CAPACIDADES_EXPEDIA,
  dividirEnLotesDisponibilidad,
  LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA,
  type ActualizacionDisponibilidadExpedia,
} from "../src/expedia/adapter.js";

describe("ExpediaChannelAdapter (Nivel B, RV22 F04-F13)", () => {
  it("declara capacidades completas (disponibilidad+tarifas+reservas), sin iCal ni mensajería", () => {
    expect(CAPACIDADES_EXPEDIA).toEqual({
      availabilityPush: true,
      ratesPush: true,
      reservationsPull: true,
      icalImportExport: false,
      messaging: false,
    });
  });

  it("nunca reporta 'sandbox'/'producción' sin partnerAprobado, aunque haya credenciales y sync reciente", () => {
    const adaptador = new ExpediaChannelAdapter({
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

  it("reporta 'sandbox' solo con partnerAprobado + esSandbox + sync reciente", () => {
    const adaptador = new ExpediaChannelAdapter({
      credencialesPresentes: true,
      esSimulador: false,
      ultimaSincronizacionExitosaEn: new Date().toISOString(),
      ventanaMaximaMs: 6 * 60 * 60 * 1000,
      partnerAprobado: true,
      esSandbox: true,
      tipoConexion: "api",
    });
    expect(adaptador.obtenerEstadoConexion()).toBe("sandbox");
  });
});

describe("dividirEnLotesDisponibilidad (F06: máximo 5,000 por mensaje)", () => {
  function actualizacion(i: number): ActualizacionDisponibilidadExpedia {
    return { expediaPropertyId: "p1", expediaRoomTypeId: "rt1", fecha: `2027-01-${(i % 28) + 1}`, disponible: 1, cerrado: false };
  }

  it("una lista vacía produce un único lote vacío (nunca 0 lotes)", () => {
    expect(dividirEnLotesDisponibilidad([])).toEqual([{ actualizaciones: [] }]);
  });

  it("una lista menor al límite queda en un solo lote", () => {
    const lista = Array.from({ length: 10 }, (_, i) => actualizacion(i));
    const lotes = dividirEnLotesDisponibilidad(lista);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]!.actualizaciones).toHaveLength(10);
  });

  it("una lista mayor al límite se divide en múltiples lotes de máximo 5,000", () => {
    const lista = Array.from({ length: LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA + 1 }, (_, i) => actualizacion(i));
    const lotes = dividirEnLotesDisponibilidad(lista);
    expect(lotes).toHaveLength(2);
    expect(lotes[0]!.actualizaciones).toHaveLength(LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA);
    expect(lotes[1]!.actualizaciones).toHaveLength(1);
    for (const lote of lotes) {
      expect(lote.actualizaciones.length).toBeLessThanOrEqual(LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA);
    }
  });
});
