import { describe, expect, it } from "vitest";
import { evaluarPublicacionTarifa, requiereDesactivarPricingNativo } from "../../src/pricing/publicacion.js";
import type { ChannelCapabilities } from "../../src/channelAdapter.js";

const CAPACIDADES_SIN_RATES: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: false,
  reservationsPull: true,
  icalImportExport: true,
  messaging: false,
};

const CAPACIDADES_CON_RATES: ChannelCapabilities = { ...CAPACIDADES_SIN_RATES, ratesPush: true };

describe("evaluarPublicacionTarifa — H-069 (solo hacia adaptadores con ratesPush:true)", () => {
  it("deniega publicación cuando el adaptador no declara ratesPush (caso real de Fase 2: ninguno)", () => {
    const evaluacion = evaluarPublicacionTarifa("airbnb", CAPACIDADES_SIN_RATES);
    expect(evaluacion.puedePublicar).toBe(false);
    expect(evaluacion.mensaje).toMatch(/no sincronizables por iCal/i);
  });

  it("deniega publicación sin capacidades registradas", () => {
    const evaluacion = evaluarPublicacionTarifa("booking", null);
    expect(evaluacion.puedePublicar).toBe(false);
  });

  it("permite publicación cuando el adaptador declara ratesPush:true", () => {
    const evaluacion = evaluarPublicacionTarifa("canal-hipotetico-con-api", CAPACIDADES_CON_RATES);
    expect(evaluacion.puedePublicar).toBe(true);
  });
});

describe("requiereDesactivarPricingNativo — H-070", () => {
  it("siempre exige desactivar el pricing nativo del canal antes de publicar el propio", () => {
    expect(requiereDesactivarPricingNativo("airbnb")).toMatch(/Smart Pricing/);
    expect(requiereDesactivarPricingNativo("vrbo")).toMatch(/MarketMaker/);
  });
});
