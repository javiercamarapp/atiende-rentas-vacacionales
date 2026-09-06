import { describe, expect, it } from "vitest";
import {
  construirOtaHotelAvailNotifRq,
  construirOtaHotelRateAmountNotifRq,
  mapearReservaSimuladaAOta,
  ROOMSTOSELL_MAXIMO,
  ROOMSTOSELL_ILIMITADO,
  RoomsToSellInvalidoError,
  CAPACIDADES_BOOKING_DIRECTO,
  BookingChannelAdapter,
} from "../src/booking/adapter.js";

describe("construirOtaHotelAvailNotifRq (RV04 F09: roomstosell/CTA/CTD/min-max stay)", () => {
  it("construye un OTA_HotelAvailNotifRQ válido con los campos citados por la fuente", () => {
    const xml = construirOtaHotelAvailNotifRq([
      {
        unidadExternaId: "unidad-1",
        fecha: "2027-01-01",
        roomstosell: 2,
        closed: false,
        closedonarrival: true,
        closedondeparture: false,
        minimumstay: 2,
        maximumstay: 14,
      },
    ]);
    expect(xml).toContain("<OTA_HotelAvailNotifRQ");
    expect(xml).toContain('RoomExternalId="unidad-1"');
    expect(xml).toContain('roomstosell="2"');
    expect(xml).toContain('closedonarrival="1"');
    expect(xml).toContain('closedondeparture="0"');
    expect(xml).toContain('minimumstay="2"');
    expect(xml).toContain('maximumstay="14"');
  });

  it("acepta roomstosell=255 como 'ilimitado' (RV04 F09)", () => {
    expect(() =>
      construirOtaHotelAvailNotifRq([{ unidadExternaId: "u1", fecha: "2027-01-01", roomstosell: ROOMSTOSELL_ILIMITADO, closed: false }]),
    ).not.toThrow();
  });

  it("rechaza roomstosell > 255 en vez de dejar que Booking.com lo resetee en silencio (RV04 F09)", () => {
    expect(() =>
      construirOtaHotelAvailNotifRq([{ unidadExternaId: "u1", fecha: "2027-01-01", roomstosell: ROOMSTOSELL_MAXIMO + 2, closed: false }]),
    ).toThrow(RoomsToSellInvalidoError);
  });

  it("rechaza roomstosell negativo o no entero", () => {
    expect(() => construirOtaHotelAvailNotifRq([{ unidadExternaId: "u1", fecha: "2027-01-01", roomstosell: -1, closed: false }])).toThrow(
      RoomsToSellInvalidoError,
    );
  });

  it("escapa caracteres XML especiales en el id de unidad", () => {
    const xml = construirOtaHotelAvailNotifRq([{ unidadExternaId: 'u<1>&"2"', fecha: "2027-01-01", roomstosell: 1, closed: true }]);
    expect(xml).not.toContain("u<1>&\"2\"");
    expect(xml).toContain("u&lt;1&gt;&amp;&quot;2&quot;");
  });
});

describe("construirOtaHotelRateAmountNotifRq (tarifas opcionales)", () => {
  it("construye un mensaje de tarifas con moneda", () => {
    const xml = construirOtaHotelRateAmountNotifRq([{ unidadExternaId: "u1", fecha: "2027-01-01", montoBase: 1500.5, moneda: "MXN" }]);
    expect(xml).toContain("<OTA_HotelRateAmountNotifRQ");
    expect(xml).toContain('BaseAmount="1500.50"');
    expect(xml).toContain('CurrencyCode="MXN"');
  });
});

describe("mapearReservaSimuladaAOta", () => {
  it("mapea CONFIRMADA a status=new y CANCELADA a status=cancelled", () => {
    expect(
      mapearReservaSimuladaAOta({ id: "r1", unidadExternaId: "u1", checkIn: "2027-01-01", checkOut: "2027-01-03", estado: "CONFIRMADA" }),
    ).toEqual({ reservationId: "r1", unidadExternaId: "u1", checkIn: "2027-01-01", checkOut: "2027-01-03", status: "new" });

    expect(
      mapearReservaSimuladaAOta({ id: "r2", unidadExternaId: "u1", checkIn: "2027-01-01", checkOut: "2027-01-03", estado: "CANCELADA" }),
    ).toMatchObject({ status: "cancelled" });
  });
});

describe("BookingChannelAdapter — capacidades completas de spec, estado siempre partner_pendiente (D-011)", () => {
  it("declara availabilityPush/ratesPush/reservationsPull = true (la SPEC los soporta)", () => {
    expect(CAPACIDADES_BOOKING_DIRECTO).toEqual({
      availabilityPush: true,
      ratesPush: true,
      reservationsPull: true,
      icalImportExport: true,
      messaging: false,
    });
  });

  it("obtenerEstadoConexion() siempre partner_pendiente, con o sin bridge configurado", () => {
    expect(new BookingChannelAdapter().obtenerEstadoConexion()).toBe("partner_pendiente");
    expect(new BookingChannelAdapter({ nombreProveedor: "x", push: () => Promise.reject(new Error("no impl")) }).obtenerEstadoConexion()).toBe(
      "partner_pendiente",
    );
  });
});
