import { afterEach, describe, expect, it } from "vitest";
import { construirOtaHotelAvailNotifRq } from "@atiende-rv/adapters";
import { BookingApiSimulator } from "../src/booking-api/index.js";

/** Prueba de contrato: el XML que construye @atiende-rv/adapters contra la
 * spec pública (RV04 F09) es aceptado por el endpoint OTA del simulador
 * (RV22-R-03: "adaptador... completo contra la spec pública... simulador
 * extendido; pruebas de contrato"). */
describe("Booking.com — contrato OTA_HotelAvailNotifRQ contra BookingApiSimulator", () => {
  let sim: BookingApiSimulator | null = null;

  afterEach(async () => {
    if (sim) await sim.detener();
    sim = null;
  });

  it("el simulador recibe y guarda el XML de disponibilidad/roomstosell/restricciones construido por el adaptador", async () => {
    sim = new BookingApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();

    const xml = construirOtaHotelAvailNotifRq([
      { unidadExternaId: "unidad-1", fecha: "2027-05-01", roomstosell: 0, closed: true, minimumstay: 2 },
    ]);

    const resp = await fetch(`${urlBase}/ota/HotelAvailNotif`, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: xml,
    });

    expect(resp.status).toBe(200);
    expect(sim.xmlAvailNotifRecibidosTotal).toHaveLength(1);
    expect(sim.xmlAvailNotifRecibidosTotal[0]).toContain('roomstosell="0"');
    expect(sim.xmlAvailNotifRecibidosTotal[0]).toContain('closed="1"');
  });
});
