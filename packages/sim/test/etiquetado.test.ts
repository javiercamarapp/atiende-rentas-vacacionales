import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

/**
 * Regresión permanente — hallazgo NUEVO de la reverificación independiente
 * (docs/auditoria-2/REVERIFICACION.md §3): sin `entorno`/`ATIENDE_ENTORNO`
 * explícitos (camino real: apps/api/src/routes/mensajeria/borradores.ts,
 * `new SimuladorMensajeria(...)`), el fallback heredado leía `NODE_ENV`
 * directamente de `process.env`. `NODE_ENV=""` (definida pero vacía) NO es
 * lo mismo que `NODE_ENV` ausente — es un valor "desconocido" y debe
 * bloquear el arranque del simulador (fail-closed), igual que
 * "production". Antes de esta corrección no lanzaba: el simulador
 * arrancaba en silencio con `NODE_ENV=""`.
 */
describe("D-019 — hallazgo nuevo: NODE_ENV=\"\" (vacío/solo-espacios) es 'desconocido', bloquea el arranque del simulador", () => {
  const nodeEnvOriginal = process.env.NODE_ENV;
  const atiendeEntornoOriginal = process.env.ATIENDE_ENTORNO;

  beforeEach(() => {
    delete process.env.ATIENDE_ENTORNO;
  });

  afterEach(() => {
    if (nodeEnvOriginal === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnvOriginal;
    if (atiendeEntornoOriginal === undefined) delete process.env.ATIENDE_ENTORNO;
    else process.env.ATIENDE_ENTORNO = atiendeEntornoOriginal;
  });

  it("rechaza el arranque si NODE_ENV='' (cadena vacía definida, sin ATIENDE_ENTORNO)", () => {
    process.env.NODE_ENV = "";
    expect(() => new AirbnbIcalChannelSimulator({})).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("rechaza el arranque si NODE_ENV='   ' (solo espacios, sin ATIENDE_ENTORNO)", () => {
    process.env.NODE_ENV = "   ";
    expect(() => new AirbnbIcalChannelSimulator({})).toThrow(CredencialesSospechosasDeProduccionError);
  });

  it("permite el arranque si NODE_ENV está genuinamente AUSENTE (undefined, no vacío)", () => {
    delete process.env.NODE_ENV;
    expect(() => new AirbnbIcalChannelSimulator({})).not.toThrow();
  });

  it("permite el arranque con NODE_ENV='development'/'test' explícitos", () => {
    process.env.NODE_ENV = "development";
    expect(() => new AirbnbIcalChannelSimulator({})).not.toThrow();
    process.env.NODE_ENV = "test";
    expect(() => new AirbnbIcalChannelSimulator({})).not.toThrow();
  });

  it("rechaza el arranque con NODE_ENV='production'/'producción' explícitos", () => {
    process.env.NODE_ENV = "production";
    expect(() => new AirbnbIcalChannelSimulator({})).toThrow(CredencialesSospechosasDeProduccionError);
    process.env.NODE_ENV = "producción";
    expect(() => new AirbnbIcalChannelSimulator({})).toThrow(CredencialesSospechosasDeProduccionError);
  });
});
