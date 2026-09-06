import { afterEach, describe, expect, it } from "vitest";
import { ExpediaApiClient } from "@atiende-rv/adapters";
import { ExpediaApiSimulator } from "../src/expedia-api/index.js";

describe("ExpediaApiSimulator + ExpediaApiClient — contrato (Nivel B, RV22 F04-F13)", () => {
  let sim: ExpediaApiSimulator | null = null;

  afterEach(async () => {
    if (sim) await sim.detener();
    sim = null;
  });

  it("autentica, empuja disponibilidad, hace pull de reservas y confirma (ack) — deja de reenviarse", async () => {
    sim = new ExpediaApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    const cliente = new ExpediaApiClient({ baseUrl: urlBase });

    const { accessToken } = await cliente.autenticar({ clientId: "test", clientSecret: "test" });
    expect(accessToken).toMatch(/^SIMULADOR-/);

    await cliente.empujarDisponibilidad(accessToken, [
      { expediaPropertyId: "p1", expediaRoomTypeId: "rt1", fecha: "2027-01-01", disponible: 2, cerrado: false },
    ]);
    expect(sim.lotesDeDisponibilidadRecibidos).toEqual([1]);

    sim.encolarReserva({ hotelReservationId: "res-1", expediaPropertyId: "p1", checkIn: "2027-02-01", checkOut: "2027-02-05", estado: "nueva" });

    const primerPull = await cliente.recuperarReservas(accessToken);
    const segundoPull = await cliente.recuperarReservas(accessToken);
    expect(primerPull.map((r) => r.hotelReservationId)).toContain("res-1");
    expect(segundoPull.map((r) => r.hotelReservationId)).toContain("res-1");
    expect(sim.vecesReenviada("res-1")).toBe(2);

    await cliente.confirmarReserva(accessToken, "res-1");
    const pullTrasConfirmar = await cliente.recuperarReservas(accessToken);
    expect(pullTrasConfirmar.map((r) => r.hotelReservationId)).not.toContain("res-1");
  });

  it("rechaza un lote de disponibilidad mayor a 5,000 actualizaciones (F06)", async () => {
    sim = new ExpediaApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();

    const actualizaciones = Array.from({ length: 5001 }, (_, i) => ({
      actualizaciones: [{ expediaPropertyId: "p1", expediaRoomTypeId: "rt1", fecha: `2027-01-01`, disponible: 1, cerrado: false }],
    }));
    // Enviamos directo (bypass del cliente, que ya divide en lotes) para
    // verificar que el simulador también rechaza si algo se salta el límite.
    const resp = await fetch(`${urlBase}/supply/lodging/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actualizaciones: actualizaciones.flatMap((a) => a.actualizaciones) }),
    });
    expect(resp.status).toBe(400);
  });
});
