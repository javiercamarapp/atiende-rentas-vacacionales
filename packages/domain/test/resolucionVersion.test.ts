import { describe, expect, it } from "vitest";
import { calcularHashContenido, resolverVersion, type VersionEvento } from "../src/resolucionVersion.js";

const HASH_A = calcularHashContenido({
  unidadId: "u1",
  dtstart: "2026-06-01",
  dtend: "2026-06-05",
  razon: "RESERVA_CANAL",
});
const HASH_B = calcularHashContenido({
  unidadId: "u1",
  dtstart: "2026-06-02",
  dtend: "2026-06-06",
  razon: "RESERVA_CANAL",
});

function version(parcial: Partial<VersionEvento>): VersionEvento {
  return { uid: "uid-1", sequence: 0, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_A, ...parcial };
}

describe("resolverVersion — motor UID→SEQUENCE→DTSTAMP+hash (H-006)", () => {
  it("aplica siempre cuando no hay versión previa", () => {
    expect(resolverVersion(null, version({})).accion).toBe("aplicar");
  });

  it("lanza si los UID no coinciden (contrato del llamador)", () => {
    expect(() => resolverVersion(version({ uid: "a" }), version({ uid: "b" }))).toThrow();
  });

  it("caso adversarial 1: mismo UID+SEQUENCE, contenido distinto → DTSTAMP decide", () => {
    const actual = version({ sequence: 3, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_A });
    const entranteMasNuevo = version({ sequence: 3, dtstamp: "2026-06-02T00:00:00Z", hash: HASH_B });
    expect(resolverVersion(actual, entranteMasNuevo).accion).toBe("aplicar");

    const entranteMasViejo = version({ sequence: 3, dtstamp: "2026-05-30T00:00:00Z", hash: HASH_B });
    expect(resolverVersion(actual, entranteMasViejo).accion).toBe("descartar");
  });

  it("caso adversarial 3: SEQUENCE mayor gana aunque el evento llegue fuera de orden (CANCEL prematuro)", () => {
    // Un CREATE/UPDATE con SEQUENCE=5 ya se aplicó; llega tarde un CANCEL
    // con SEQUENCE=2 (evento antiguo desordenado) — nunca debe aplicarse.
    const actual = version({ sequence: 5, dtstamp: "2026-06-10T00:00:00Z", hash: HASH_A });
    const cancelPrematuro = version({ sequence: 2, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_B });
    expect(resolverVersion(actual, cancelPrematuro).accion).toBe("descartar");
  });

  it("SEQUENCE mayor con DTSTAMP también mayor: se aplica normalmente", () => {
    const actual = version({ sequence: 1, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_A });
    const entrante = version({ sequence: 2, dtstamp: "2026-06-02T00:00:00Z", hash: HASH_B });
    expect(resolverVersion(actual, entrante).accion).toBe("aplicar");
  });

  it("caso adversarial 7: reimportación exacta (mismo hash) es no-op, nunca duplica", () => {
    const actual = version({ sequence: 1, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_A });
    const entranteIdentico = version({ sequence: 1, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_A });
    expect(resolverVersion(actual, entranteIdentico).accion).toBe("sin_cambio");
  });

  it("hash idéntico gana incluso si SEQUENCE es distinto (reimportación sin cambio real de contenido)", () => {
    const actual = version({ sequence: 1, hash: HASH_A });
    const entrante = version({ sequence: 4, hash: HASH_A });
    expect(resolverVersion(actual, entrante).accion).toBe("sin_cambio");
  });

  it("caso adversarial 13: UID reciclado — SEQUENCE mayor pero DTSTAMP anterior, contenido distinto → revisión humana", () => {
    const actual = version({ sequence: 3, dtstamp: "2026-06-10T00:00:00Z", hash: HASH_A });
    const reciclado = version({ sequence: 9, dtstamp: "2026-01-01T00:00:00Z", hash: HASH_B });
    expect(resolverVersion(actual, reciclado).accion).toBe("revisar_uid_reciclado");
  });

  it("SEQUENCE y DTSTAMP idénticos con hash distinto: ambigüedad genuina → revisión humana, nunca fusión silenciosa", () => {
    const actual = version({ sequence: 2, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_A });
    const entrante = version({ sequence: 2, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_B });
    expect(resolverVersion(actual, entrante).accion).toBe("revisar_uid_reciclado");
  });

  it("SEQUENCE no confiable (null en alguno de los dos) recae en DTSTAMP", () => {
    const actual = version({ sequence: null, dtstamp: "2026-06-01T00:00:00Z", hash: HASH_A });
    const entrante = version({ sequence: 5, dtstamp: "2026-06-05T00:00:00Z", hash: HASH_B });
    expect(resolverVersion(actual, entrante).accion).toBe("aplicar");
  });

  describe("D-DSD-03 (regresión): UID reciclado sin SEQUENCE comparable, usando el rango de fechas como señal independiente", () => {
    it("SEQUENCE ausente en ambos + DTSTAMP más reciente + rango COMPLETAMENTE DISJUNTO Y NO CONTIGUO → revisión humana, nunca fusión silenciosa", () => {
      // Reserva real, huésped A, 2027-01-10..2027-01-15.
      const actual = version({
        sequence: null,
        dtstamp: "2026-12-01T00:00:00Z",
        hash: HASH_A,
        rango: { inicio: "2027-01-10", fin: "2027-01-15" },
      });
      // El canal recicla el mismo UID meses después para una reserva
      // totalmente distinta (huésped B, fechas sin ninguna relación).
      const entrante = version({
        sequence: null,
        dtstamp: "2027-06-01T00:00:00Z",
        hash: HASH_B,
        rango: { inicio: "2027-11-20", fin: "2027-11-22" },
      });
      expect(resolverVersion(actual, entrante).accion).toBe("revisar_uid_reciclado");
    });

    it("SEQUENCE ausente en ambos + DTSTAMP más reciente + rango SOLAPADO (ampliación/reducción real) → se aplica normalmente", () => {
      const actual = version({
        sequence: null,
        dtstamp: "2026-12-01T00:00:00Z",
        hash: HASH_A,
        rango: { inicio: "2027-01-10", fin: "2027-01-15" },
      });
      // Modificación legítima de la MISMA reserva: se amplía una noche.
      const entrante = version({
        sequence: null,
        dtstamp: "2026-12-02T00:00:00Z",
        hash: HASH_B,
        rango: { inicio: "2027-01-10", fin: "2027-01-16" },
      });
      expect(resolverVersion(actual, entrante).accion).toBe("aplicar");
    });

    it("SEQUENCE ausente en ambos + DTSTAMP más reciente + rango CONTIGUO (checkout=check-in) → se aplica normalmente", () => {
      const actual = version({
        sequence: null,
        dtstamp: "2026-12-01T00:00:00Z",
        hash: HASH_A,
        rango: { inicio: "2027-01-10", fin: "2027-01-15" },
      });
      const entrante = version({
        sequence: null,
        dtstamp: "2026-12-02T00:00:00Z",
        hash: HASH_B,
        rango: { inicio: "2027-01-15", fin: "2027-01-18" },
      });
      expect(resolverVersion(actual, entrante).accion).toBe("aplicar");
    });

    it("sin información de rango en alguno de los dos lados, conserva el comportamiento anterior (aplicar) — sin regresión para llamadores que no pasan rango", () => {
      const actual = version({ sequence: null, dtstamp: "2026-12-01T00:00:00Z", hash: HASH_A });
      const entrante = version({
        sequence: null,
        dtstamp: "2027-06-01T00:00:00Z",
        hash: HASH_B,
        rango: { inicio: "2027-11-20", fin: "2027-11-22" },
      });
      expect(resolverVersion(actual, entrante).accion).toBe("aplicar");
    });
  });
});

describe("calcularHashContenido", () => {
  it("es determinista para los mismos campos", () => {
    const a = calcularHashContenido({ unidadId: "u1", dtstart: "2026-01-01", dtend: "2026-01-02", razon: "RESERVA_CANAL" });
    const b = calcularHashContenido({ unidadId: "u1", dtstart: "2026-01-01", dtend: "2026-01-02", razon: "RESERVA_CANAL" });
    expect(a).toBe(b);
  });

  it("cambia si cambia cualquier campo", () => {
    const base = { unidadId: "u1", dtstart: "2026-01-01", dtend: "2026-01-02", razon: "RESERVA_CANAL" };
    const distinto = calcularHashContenido({ ...base, dtend: "2026-01-03" });
    expect(calcularHashContenido(base)).not.toBe(distinto);
  });
});
