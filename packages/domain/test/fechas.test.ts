import { describe, expect, it } from "vitest";
import {
  calcularNoches,
  clasificarModificacionRango,
  esRangoValido,
  fechaLocalDesdeInstante,
  nochesDelRango,
  rangoCubreNoche,
  rangosSeSuperponen,
  sonRangosContiguos,
  validarZonaHorariaIana,
} from "../src/fechas.js";

describe("validarZonaHorariaIana (D-013)", () => {
  it("acepta zonas IANA reales", () => {
    expect(validarZonaHorariaIana("America/Mexico_City")).toBe(true);
    expect(validarZonaHorariaIana("Europe/Madrid")).toBe(true);
    expect(validarZonaHorariaIana("America/Cancun")).toBe(true);
  });

  it("rechaza cadenas arbitrarias y offsets fijos", () => {
    expect(validarZonaHorariaIana("")).toBe(false);
    expect(validarZonaHorariaIana("GMT-6")).toBe(false);
    expect(validarZonaHorariaIana("Nowhere/Fake")).toBe(false);
  });
});

describe("esRangoValido (H-002)", () => {
  it("rechaza rangos vacíos o invertidos", () => {
    expect(esRangoValido({ inicio: "2026-01-05", fin: "2026-01-05" })).toBe(false);
    expect(esRangoValido({ inicio: "2026-01-05", fin: "2026-01-01" })).toBe(false);
  });

  it("acepta un rango de al menos una noche", () => {
    expect(esRangoValido({ inicio: "2026-01-05", fin: "2026-01-06" })).toBe(true);
  });
});

describe("calcularNoches / nochesDelRango", () => {
  it("cuenta noches como fin - inicio", () => {
    expect(calcularNoches({ inicio: "2026-06-01", fin: "2026-06-05" })).toBe(4);
    expect(nochesDelRango({ inicio: "2026-06-01", fin: "2026-06-05" })).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
  });

  it("una sola noche = 1", () => {
    expect(calcularNoches({ inicio: "2026-06-01", fin: "2026-06-02" })).toBe(1);
  });
});

describe("rangoCubreNoche", () => {
  it("cubre inicio (inclusivo) y no cubre fin (exclusivo)", () => {
    const rango = { inicio: "2026-06-01", fin: "2026-06-05" };
    expect(rangoCubreNoche(rango, "2026-06-01")).toBe(true);
    expect(rangoCubreNoche(rango, "2026-06-04")).toBe(true);
    expect(rangoCubreNoche(rango, "2026-06-05")).toBe(false);
    expect(rangoCubreNoche(rango, "2026-05-31")).toBe(false);
  });
});

describe("rangosSeSuperponen / sonRangosContiguos (caso adversarial 15)", () => {
  it("estancias contiguas (checkout=check-in) NO son solapamiento", () => {
    const a = { inicio: "2026-06-01", fin: "2026-06-05" };
    const b = { inicio: "2026-06-05", fin: "2026-06-08" };
    expect(rangosSeSuperponen(a, b)).toBe(false);
    expect(sonRangosContiguos(a, b)).toBe(true);
  });

  it("detecta solapamiento real", () => {
    const a = { inicio: "2026-06-01", fin: "2026-06-05" };
    const b = { inicio: "2026-06-04", fin: "2026-06-08" };
    expect(rangosSeSuperponen(a, b)).toBe(true);
    expect(sonRangosContiguos(a, b)).toBe(false);
  });

  it("no detecta solapamiento entre rangos disjuntos separados", () => {
    const a = { inicio: "2026-06-01", fin: "2026-06-05" };
    const b = { inicio: "2026-06-10", fin: "2026-06-12" };
    expect(rangosSeSuperponen(a, b)).toBe(false);
  });
});

describe("clasificarModificacionRango (H-019, BLUEPRINT §4.4)", () => {
  const original = { inicio: "2026-06-10", fin: "2026-06-15" };

  it("detecta ampliación (extiende ambos o un extremo)", () => {
    expect(clasificarModificacionRango(original, { inicio: "2026-06-08", fin: "2026-06-17" })).toBe(
      "ampliar",
    );
    expect(clasificarModificacionRango(original, { inicio: "2026-06-10", fin: "2026-06-20" })).toBe(
      "ampliar",
    );
  });

  it("detecta reducción", () => {
    expect(clasificarModificacionRango(original, { inicio: "2026-06-11", fin: "2026-06-14" })).toBe(
      "reducir",
    );
  });

  it("detecta desplazamiento (mover)", () => {
    expect(clasificarModificacionRango(original, { inicio: "2026-06-12", fin: "2026-06-18" })).toBe(
      "mover",
    );
  });

  it("detecta sin cambio", () => {
    expect(clasificarModificacionRango(original, { ...original })).toBe("sin_cambio");
  });
});

describe("fechaLocalDesdeInstante y DST (caso adversarial 14, RV07 §14)", () => {
  it("America/Mexico_City: check-in a medianoche local antes/después del cambio de horario no produce off-by-one", () => {
    // México eliminó el horario de verano permanente para la mayoría del
    // territorio desde 2022 (America/Mexico_City = CST fijo, UTC-6 todo el
    // año); el caso sigue siendo válido para verificar que NO hay
    // desplazamiento de fecha en ninguna época del año.
    const medianocheInviernoUtc = "2026-01-15T06:00:00Z"; // 00:00 CST = 06:00 UTC
    const medianocheVeranoUtc = "2026-07-15T06:00:00Z"; // 00:00 CST = 06:00 UTC (sin DST)
    expect(fechaLocalDesdeInstante(medianocheInviernoUtc, "America/Mexico_City")).toBe(
      "2026-01-15",
    );
    expect(fechaLocalDesdeInstante(medianocheVeranoUtc, "America/Mexico_City")).toBe("2026-07-15");
  });

  it("Europe/Madrid: fecha local correcta a ambos lados del cambio de horario europeo de 2026", () => {
    // Cambio a horario de verano (CET→CEST): último domingo de marzo,
    // 2026-03-29 a las 01:00 UTC (=02:00 CET → 03:00 CEST).
    // Justo ANTES del cambio (00:30 UTC = 01:30 CET, invierno):
    expect(fechaLocalDesdeInstante("2026-03-29T00:30:00Z", "Europe/Madrid")).toBe("2026-03-29");
    // Justo DESPUÉS del cambio (01:30 UTC = 03:30 CEST, verano):
    expect(fechaLocalDesdeInstante("2026-03-29T01:30:00Z", "Europe/Madrid")).toBe("2026-03-29");
    // Medianoche local de un día de invierno vs. de verano, sin off-by-one:
    expect(fechaLocalDesdeInstante("2026-01-15T23:30:00Z", "Europe/Madrid")).toBe("2026-01-16");
    expect(fechaLocalDesdeInstante("2026-07-15T21:30:00Z", "Europe/Madrid")).toBe("2026-07-15");
    expect(fechaLocalDesdeInstante("2026-07-15T22:30:00Z", "Europe/Madrid")).toBe("2026-07-16");
  });

  it("cambio de horario de otoño en Europe/Madrid (retroceso, hora ambigua) no rompe el cálculo de fecha", () => {
    // Retroceso CEST→CET: último domingo de octubre 2026-10-25 a las
    // 01:00 UTC (=03:00 CEST → 02:00 CET). La hora 02:00-03:00 local
    // ocurre dos veces; para una fecha (no un instante exacto de esa hora
    // ambigua) el cálculo de PlainDate no se ve afectado.
    expect(fechaLocalDesdeInstante("2026-10-25T00:30:00Z", "Europe/Madrid")).toBe("2026-10-25");
    expect(fechaLocalDesdeInstante("2026-10-25T23:30:00Z", "Europe/Madrid")).toBe("2026-10-26");
  });

  it("rechaza zona horaria inválida", () => {
    expect(() => fechaLocalDesdeInstante("2026-01-01T00:00:00Z", "GMT-6")).toThrow();
  });
});

describe("calcularNoches es estable a través de cambios de DST (caso adversarial 14)", () => {
  it("una estancia que cruza el cambio de horario de marzo en Madrid cuenta las noches correctas", () => {
    // 2026-03-27 → 2026-03-31 cruza el cambio de horario del 29 de marzo;
    // al usar solo fechas de calendario (PlainDate), el resultado debe ser
    // exactamente 4 noches, sin importar el cambio de offset UTC.
    expect(calcularNoches({ inicio: "2026-03-27", fin: "2026-03-31" })).toBe(4);
  });

  it("una estancia que cruza el retroceso de octubre en Madrid cuenta las noches correctas", () => {
    expect(calcularNoches({ inicio: "2026-10-23", fin: "2026-10-27" })).toBe(4);
  });
});
