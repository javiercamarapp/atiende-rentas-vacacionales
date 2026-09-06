import { describe, expect, it } from "vitest";
import { resolverFechaLocal } from "@atiende-rv/adapters";

/**
 * D-nn — auditoría dominio/sync/datos (fase 2).
 *
 * Hipótesis: `resolverFechaLocal` (packages/adapters/src/ical/resolverFecha.ts)
 * para el caso `DATE-TIME-TZID` ignora por completo el parámetro
 * `zonaHorariaPropiedad` y además interpreta mal el propio TZID del evento:
 * concatena "Z" a la hora local (tratándola como si ya fuera UTC) y luego
 * la reconvierte usando `valor.tzid` (nunca la zona de la propiedad) como
 * si fuera la zona destino. Esto puede producir una fecha de calendario
 * distinta a la real, incluso cuando TZID del evento == zona de la
 * propiedad.
 */
describe("resolverFechaLocal — DATE-TIME-TZID (D-nn)", () => {
  it("con TZID == zona de la propiedad, una hora local temprana (madrugada) se corre al día anterior", () => {
    // 2026-09-07T02:00:00 hora de Nueva York (EDT, UTC-4) — DTSTART real
    // debería resolver a la fecha de calendario 2026-09-07 (es la hora de
    // pared tal cual, TZID coincide con la propiedad).
    const resultado = resolverFechaLocal(
      { tipo: "DATE-TIME-TZID", tzid: "America/New_York", fechaHoraLocal: "2026-09-07T02:00:00" },
      "America/New_York",
    );
    expect(resultado).toBe("2026-09-07");
  });

  it("con TZID distinto de la propiedad, la fecha calculada ignora la zona de la propiedad y puede quedar mal", () => {
    // Evento generado con TZID=Pacific/Auckland (NZST, UTC+12 en sept 2026,
    // invierno austral, sin DST). fechaHoraLocal = 2026-09-07T23:00:00
    // (hora de pared en Auckland). La propiedad está en America/Cancun
    // (UTC-5, sin DST). Cálculo correcto de referencia:
    //   Auckland 2026-09-07T23:00:00+12:00 = UTC 2026-09-07T11:00:00Z
    //   Cancun (UTC-5): 2026-09-07T06:00:00 -> fecha de calendario 2026-09-07
    const resultado = resolverFechaLocal(
      { tipo: "DATE-TIME-TZID", tzid: "Pacific/Auckland", fechaHoraLocal: "2026-09-07T23:00:00" },
      "America/Cancun",
    );
    expect(resultado).toBe("2026-09-07");
  });
});
