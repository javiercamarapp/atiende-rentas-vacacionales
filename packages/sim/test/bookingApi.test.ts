import { describe, expect, it } from "vitest";
import { BookingApiSimulator } from "../src/booking-api/index.js";

describe("BookingApiSimulator — pull con ack y reenvío hasta confirmación (RV04)", () => {
  it("una reserva no confirmada se reenvía en llamadas sucesivas de pull()", () => {
    const sim = new BookingApiSimulator({ credenciales: "test" });
    const reserva = sim.encolarReserva({
      unidadExternaId: "unidad-1",
      checkIn: "2027-01-01",
      checkOut: "2027-01-05",
      estado: "CONFIRMADA",
    });

    const primerPull = sim.pull();
    const segundoPull = sim.pull();
    expect(primerPull.map((r) => r.id)).toContain(reserva.id);
    expect(segundoPull.map((r) => r.id)).toContain(reserva.id);
    expect(sim.vecesReenviada(reserva.id)).toBe(2);
  });

  it("tras ack(), la reserva deja de reenviarse", () => {
    const sim = new BookingApiSimulator({ credenciales: "test" });
    const reserva = sim.encolarReserva({
      unidadExternaId: "unidad-1",
      checkIn: "2027-02-01",
      checkOut: "2027-02-03",
      estado: "CONFIRMADA",
    });
    sim.pull();
    sim.ack([reserva.id]);
    const pullTrasAck = sim.pull();
    expect(pullTrasAck.map((r) => r.id)).not.toContain(reserva.id);
  });

  it("expone un endpoint HTTP real (pull/ack) además del API in-process", async () => {
    const sim = new BookingApiSimulator({ credenciales: "test" });
    const { urlBase } = await sim.iniciar();
    try {
      await fetch(`${urlBase}/interno/encolar`, {
        method: "POST",
        body: JSON.stringify({ unidadExternaId: "u1", checkIn: "2027-03-01", checkOut: "2027-03-02", estado: "CONFIRMADA" }),
      });
      const pullResp = await fetch(`${urlBase}/reservas/pull`);
      const { reservas } = (await pullResp.json()) as { reservas: Array<{ id: string }> };
      expect(reservas).toHaveLength(1);

      await fetch(`${urlBase}/reservas/ack`, { method: "POST", body: JSON.stringify({ ids: [reservas[0]!.id] }) });
      const pullTrasAck = await (await fetch(`${urlBase}/reservas/pull`)).json();
      expect((pullTrasAck as { reservas: unknown[] }).reservas).toHaveLength(0);
    } finally {
      await sim.detener();
    }
  });
});
