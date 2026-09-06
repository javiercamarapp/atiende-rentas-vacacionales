import { describe, expect, it } from "vitest";
import { resolverFechaLocal } from "../src/ical/resolverFecha.js";

/**
 * D-DSD-01 (regresión permanente): `resolverFechaLocal` para
 * `DATE-TIME;TZID=...` etiquetaba la hora de pared del evento (sin
 * offset) como si ya fuera un instante UTC y la reconvertía usando
 * `valor.tzid` (la zona del propio evento) en vez de
 * `zonaHorariaPropiedad` — matemáticamente incorrecto incluso cuando
 * ambas zonas coinciden. Corregido en
 * `packages/domain/src/fechas.ts` (`fechaLocalDesdeFechaHoraConZona`):
 * primero resuelve el instante UTC real contra la zona del EVENTO, y
 * solo entonces convierte ese instante a la zona de la PROPIEDAD.
 */
describe("resolverFechaLocal", () => {
  it("DATE se usa tal cual, sin ninguna conversión de zona", () => {
    expect(resolverFechaLocal({ tipo: "DATE", fecha: "2026-09-07" }, "America/New_York")).toBe("2026-09-07");
  });

  it("DATE-TIME-FLOTANTE toma la fecha de calendario de la hora local tal cual", () => {
    expect(
      resolverFechaLocal({ tipo: "DATE-TIME-FLOTANTE", fechaHoraLocal: "2026-09-07T23:30:00" }, "America/Cancun"),
    ).toBe("2026-09-07");
  });

  it("DATE-TIME-UTC convierte el instante UTC a la zona de la propiedad", () => {
    // 2026-09-07T02:00:00Z en America/New_York (EDT, UTC-4) es
    // 2026-09-06T22:00:00 hora local -> fecha de calendario 2026-09-06.
    expect(
      resolverFechaLocal({ tipo: "DATE-TIME-UTC", instanteIso: "2026-09-07T02:00:00Z" }, "America/New_York"),
    ).toBe("2026-09-06");
  });

  it("DATE-TIME-TZID con TZID == zona de la propiedad: una hora local temprana NO se corre al día anterior", () => {
    const resultado = resolverFechaLocal(
      { tipo: "DATE-TIME-TZID", tzid: "America/New_York", fechaHoraLocal: "2026-09-07T02:00:00" },
      "America/New_York",
    );
    expect(resultado).toBe("2026-09-07");
  });

  it("DATE-TIME-TZID con TZID distinto de la propiedad: resuelve el instante real contra TZID y LUEGO convierte a la propiedad", () => {
    // Auckland 2026-09-07T23:00:00+12:00 (NZST, sin DST) = UTC 2026-09-07T11:00:00Z.
    // Cancun (UTC-5, sin DST): 2026-09-07T06:00:00 -> fecha 2026-09-07.
    const resultado = resolverFechaLocal(
      { tipo: "DATE-TIME-TZID", tzid: "Pacific/Auckland", fechaHoraLocal: "2026-09-07T23:00:00" },
      "America/Cancun",
    );
    expect(resultado).toBe("2026-09-07");
  });

  it("DATE-TIME-TZID: una hora de pared que cruza medianoche al convertir de zona sí cambia de fecha (caso real de conversión, no bug)", () => {
    // Auckland 2026-09-07T01:00:00+12:00 = UTC 2026-09-06T13:00:00Z.
    // Cancun (UTC-5): 2026-09-06T08:00:00 -> fecha 2026-09-06 (un día
    // antes de la fecha de pared original en Auckland) — comportamiento
    // correcto de una conversión de zona real, no el bug de D-DSD-01.
    const resultado = resolverFechaLocal(
      { tipo: "DATE-TIME-TZID", tzid: "Pacific/Auckland", fechaHoraLocal: "2026-09-07T01:00:00" },
      "America/Cancun",
    );
    expect(resultado).toBe("2026-09-06");
  });
});
