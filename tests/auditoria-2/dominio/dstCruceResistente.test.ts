import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { calcularNoches, nochesDelRango, rangosSeSuperponen, sonRangosContiguos } from "@atiende-rv/domain";

/**
 * Auditoría adversarial independiente — dominio/sync/datos (fase 2).
 *
 * Objetivo: intentar romper `calcularNoches`/`nochesDelRango`
 * (packages/domain/src/fechas.ts) con un rango de reserva real que cruza
 * un cambio de horario de verano (DST) verificable en una zona horaria
 * que SÍ observa DST en 2027 (a diferencia de `America/Mexico_City`, que
 * lo abolió en 2022). Se usan dos transiciones reales de 2027:
 *
 *   - `America/New_York`: adelanto de reloj (spring-forward, un día de
 *     23 horas) el domingo 14 de marzo de 2027 a las 02:00 EST -> 03:00 EDT.
 *   - `Europe/Madrid`: atraso de reloj (fall-back, un día de 25 horas) el
 *     domingo 31 de octubre de 2027 a las 03:00 CEST -> 02:00 CET.
 *
 * Hipótesis (H-004, comentario de diseño en fechas.ts líneas 4-21):
 * `Temporal.PlainDate` no tiene noción de hora ni de zona, así que restar
 * dos `PlainDate` SIEMPRE da un número entero de días de calendario,
 * nunca 23.958 o 25.042 días como pasaría si se operara con `Date` de JS
 * fijando una hora arbitraria y dejando que el offset de DST la corra al
 * día adyacente. Se espera que esta invariante RESISTA — es exactamente
 * el caso de uso para el que el código eligió `Temporal` sobre
 * `date-fns-tz` según su propio comentario de justificación.
 */
describe("calcularNoches / nochesDelRango resisten un cruce de DST real (2027)", () => {
  it("confirma con Temporal.ZonedDateTime que America/New_York sí tiene un cambio de DST el 2027-03-14 (spring-forward)", () => {
    // Verificación independiente del propio supuesto de la prueba: si esta
    // fecha dejara de ser válida (IANA tzdata actualizada), la prueba debe
    // fallar aquí explícitamente en vez de dar un falso positivo silencioso
    // más abajo.
    const antes = Temporal.ZonedDateTime.from("2027-03-14T01:59:00-05:00[America/New_York]");
    const despues = antes.add({ minutes: 2 });
    expect(antes.offset).toBe("-05:00"); // EST
    expect(despues.offset).toBe("-04:00"); // EDT — el reloj saltó de 02:00 a 03:00
  });

  it("una reserva de 10 noches que cruza el spring-forward de America/New_York (2027-03-14) cuenta exactamente 10 noches, ni 9.96 ni 11", () => {
    const rango = { inicio: "2027-03-10", fin: "2027-03-20" };
    expect(calcularNoches(rango)).toBe(10);
    const noches = nochesDelRango(rango);
    expect(noches).toHaveLength(10);
    expect(noches[0]).toBe("2027-03-10");
    expect(noches).toContain("2027-03-14"); // la noche del cambio de reloj sigue contando como una noche normal
    expect(noches[noches.length - 1]).toBe("2027-03-19"); // fin exclusivo: 03-20 no se incluye
  });

  it("confirma con Temporal.ZonedDateTime que Europe/Madrid sí tiene un cambio de DST el 2027-10-31 (fall-back, día de 25 horas)", () => {
    const antes = Temporal.ZonedDateTime.from("2027-10-31T02:59:00+02:00[Europe/Madrid]");
    const despues = antes.add({ minutes: 2 });
    expect(antes.offset).toBe("+02:00"); // CEST
    expect(despues.offset).toBe("+01:00"); // CET — el reloj retrocedió de 03:00 a 02:00
  });

  it("una reserva de 5 noches que cruza el fall-back de Europe/Madrid (2027-10-31, día de 25h) cuenta exactamente 5 noches", () => {
    const rango = { inicio: "2027-10-28", fin: "2027-11-02" };
    expect(calcularNoches(rango)).toBe(5);
    expect(nochesDelRango(rango)).toEqual([
      "2027-10-28",
      "2027-10-29",
      "2027-10-30",
      "2027-10-31",
      "2027-11-01",
    ]);
  });

  it("dos reservas contiguas (checkout=check-in) alrededor del cambio de DST no se marcan como solapadas", () => {
    const estanciaA = { inicio: "2027-03-10", fin: "2027-03-14" };
    const estanciaB = { inicio: "2027-03-14", fin: "2027-03-18" };
    expect(rangosSeSuperponen(estanciaA, estanciaB)).toBe(false);
    expect(sonRangosContiguos(estanciaA, estanciaB)).toBe(true);
  });
});
