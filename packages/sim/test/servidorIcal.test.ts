import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchIcsSeguro, parsearIcs, IcsParseError } from "@atiende-rv/adapters";
import { AirbnbIcalChannelSimulator } from "../src/airbnb-ical/index.js";

describe("ServidorIcalSimulado (vía AirbnbIcalChannelSimulator) — escenarios configurables", () => {
  let simulador: AirbnbIcalChannelSimulator;
  let url: string;

  beforeEach(async () => {
    simulador = new AirbnbIcalChannelSimulator({ credenciales: "test_ok" });
    const info = await simulador.iniciar();
    url = info.url;
  });

  afterEach(async () => {
    await simulador.detener();
  });

  it("escenario 'vacio': responde 200 con un feed sintácticamente válido y 0 eventos", async () => {
    simulador.definirEscenario({ tipo: "vacio" });
    const resp = await fetchIcsSeguro({ url, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true });
    expect(resp.status).toBe(200);
    const parseado = parsearIcs(resp.cuerpo!);
    expect(parseado.eventos).toHaveLength(0);
  });

  it("escenario 'malformado': el parser lo rechaza con IcsParseError", async () => {
    simulador.definirEscenario({ tipo: "malformado" });
    const resp = await fetchIcsSeguro({ url, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true });
    expect(() => parsearIcs(resp.cuerpo!)).toThrow(IcsParseError);
  });

  it("escenario 'inaccesible': responde con status HTTP de error", async () => {
    simulador.definirEscenario({ tipo: "inaccesible" });
    const resp = await fetchIcsSeguro({ url, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true });
    expect(resp.status).toBeGreaterThanOrEqual(500);
  });

  it("respeta ETag/If-None-Match: segunda llamada con el mismo ETag responde 304", async () => {
    simulador.definirEscenario({ tipo: "vacio" });
    const primera = await fetchIcsSeguro({ url, resolverPersonalizado: simulador.resolverPersonalizado, permitirHttpSimuladorLocal: true });
    const segunda = await fetchIcsSeguro({
      url,
      etag: primera.etag,
      resolverPersonalizado: simulador.resolverPersonalizado,
      permitirHttpSimuladorLocal: true,
    });
    expect(segunda.status).toBe(304);
    expect(segunda.noModificado).toBe(true);
  });

  it("resolverPersonalizado rechaza cualquier hostname distinto de simulador.local", () => {
    expect(() => simulador.resolverPersonalizado("otro-host.com")).toThrow();
  });
});
