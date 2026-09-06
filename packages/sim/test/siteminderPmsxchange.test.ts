import { afterEach, describe, expect, it } from "vitest";
import { SiteMinderPmsXchangeClient } from "@atiende-rv/adapters";
import { SiteMinderPmsXchangeSimulator } from "../src/siteminder-pmsxchange/index.js";

describe("SiteMinderPmsXchangeSimulator + cliente — contrato (Nivel B puente, RV22 F24-F25)", () => {
  let sim: SiteMinderPmsXchangeSimulator | null = null;

  afterEach(async () => {
    if (sim) await sim.detener();
    sim = null;
  });

  it("empuja inventario hacia varios canales downstream y hace pull de reservas", async () => {
    sim = new SiteMinderPmsXchangeSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    const cliente = new SiteMinderPmsXchangeClient({ baseUrl: urlBase });

    await cliente.empujarInventario("apikey-test", [
      { canalDestino: "BDC", unidadExternaId: "u1", fecha: "2027-01-01", disponible: 0, cerrado: true },
      { canalDestino: "DDC", unidadExternaId: "u1", fecha: "2027-01-01", disponible: 0, cerrado: true },
    ]);
    expect(sim.inventarioRecibidoTotal).toHaveLength(2);

    const reservas = await cliente.recuperarReservas("apikey-test");
    expect(reservas).toEqual([]);
  });

  it("caso adversarial: el puente reexporta nuestro propio cierre como una 'reserva' entrante", async () => {
    sim = new SiteMinderPmsXchangeSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    const cliente = new SiteMinderPmsXchangeClient({ baseUrl: urlBase });

    await cliente.empujarInventario("apikey-test", [
      { canalDestino: "EXP", unidadExternaId: "u1", fecha: "2027-03-01", disponible: 0, cerrado: true },
    ]);

    sim.reexportarUltimoInventarioComoReserva("eco-1");
    const reservas = await cliente.recuperarReservas("apikey-test");
    expect(reservas).toHaveLength(1);
    expect(reservas[0]).toMatchObject({ id: "eco-1", canalOrigen: "EXP", unidadExternaId: "u1" });
  });
});
