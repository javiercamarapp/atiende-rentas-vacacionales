import { afterEach, describe, expect, it } from "vitest";
import { fetchIcsSeguro, parsearIcs } from "@atiende-rv/adapters";
import { AgodaIcalChannelSimulator } from "../src/agoda-ical/index.js";

describe("AgodaIcalChannelSimulator (Nivel A, RV22 §2.8) — misma base que Airbnb/Vrbo", () => {
  let sim: AgodaIcalChannelSimulator | null = null;

  afterEach(async () => {
    if (sim) await sim.detener();
    sim = null;
  });

  it("arranca en entorno de pruebas y sirve el escenario ICS configurado", async () => {
    sim = new AgodaIcalChannelSimulator({ entorno: "pruebas" });
    const { url } = await sim.iniciar();
    const ics =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:agoda-1@simulador.local\r\n" +
      "DTSTAMP:20260901T000000Z\r\nDTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261005\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    sim.definirEscenario({ tipo: "ics", contenidoIcs: ics });

    const respuesta = await fetchIcsSeguro({ url, resolverPersonalizado: sim.resolverPersonalizado, permitirHttpSimuladorLocal: true });

    expect(respuesta.status).toBe(200);
    const parseado = parsearIcs(respuesta.cuerpo!);
    expect(parseado.eventos).toHaveLength(1);
    expect(parseado.eventos[0]!.uid).toBe("agoda-1@simulador.local");
  });

  it("nombre de canal etiquetado inequívocamente como agoda-ical (D-019)", async () => {
    sim = new AgodaIcalChannelSimulator({ entorno: "pruebas" });
    await sim.iniciar();
    expect(sim.nombreCanal).toBe("agoda-ical");
  });
});
