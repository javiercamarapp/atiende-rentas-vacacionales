import { describe, expect, it } from "vitest";
import { estaOcupada, ocupacionesActivasEnNoche, participaDelExclude, razonDominante } from "../src/capas.js";
import type { Ocupacion } from "../src/tipos.js";

function ocupacion(parcial: Partial<Ocupacion> & Pick<Ocupacion, "rango" | "capa" | "razon">): Ocupacion {
  return {
    id: parcial.id ?? crypto.randomUUID(),
    unidadId: "unidad-1",
    estado: "confirmado",
    bloqueante: true,
    ...parcial,
  };
}

describe("estaOcupada / razonDominante — precedencia D-002", () => {
  it("una reserva confirmada ocupa sus noches", () => {
    const reserva = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      capa: "reserva",
      razon: "RESERVA_CANAL",
    });
    expect(estaOcupada([reserva], "2026-06-02")).toBe(true);
    expect(estaOcupada([reserva], "2026-06-05")).toBe(false);
  });

  it("caso adversarial 5 / H-018: cancelar la reserva no reabre la noche si un bloqueo de propietario la sigue cubriendo", () => {
    const reserva = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      capa: "reserva",
      razon: "RESERVA_CANAL",
      estado: "cancelado",
    });
    const bloqueoPropietario = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      capa: "bloqueo",
      razon: "BLOQUEO_PROPIETARIO",
    });
    expect(estaOcupada([reserva, bloqueoPropietario], "2026-06-02")).toBe(true);
    expect(razonDominante([reserva, bloqueoPropietario], "2026-06-02")?.razon).toBe(
      "BLOQUEO_PROPIETARIO",
    );
  });

  it("mantenimiento superpuesto a una reserva confirmada: la noche sigue ocupada por la reserva (mayor precedencia)", () => {
    const reserva = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-10" },
      capa: "reserva",
      razon: "RESERVA_CANAL",
    });
    const mantenimiento = ocupacion({
      rango: { inicio: "2026-06-03", fin: "2026-06-04" },
      capa: "bloqueo",
      razon: "MANTENIMIENTO",
    });
    expect(razonDominante([reserva, mantenimiento], "2026-06-03")?.razon).toBe("RESERVA_CANAL");
    expect(ocupacionesActivasEnNoche([reserva, mantenimiento], "2026-06-03")).toHaveLength(2);
  });

  it("una reserva provisional no bloqueante (Booking INQUIRY, REQ-068) nunca cuenta como ocupación", () => {
    const inquiry = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      capa: "reserva",
      razon: "RESERVA_CANAL",
      estado: "provisional",
      bloqueante: false,
    });
    expect(estaOcupada([inquiry], "2026-06-02")).toBe(false);
  });

  it("una reserva provisional bloqueante (Airbnb hold, REQ-048) sí cuenta como ocupación", () => {
    const hold = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      capa: "reserva",
      razon: "RESERVA_CANAL",
      estado: "provisional",
      bloqueante: true,
    });
    expect(estaOcupada([hold], "2026-06-02")).toBe(true);
  });

  it("precedencia entre bloqueos: propietario > mantenimiento > buffer", () => {
    const propietario = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      capa: "bloqueo",
      razon: "BLOQUEO_PROPIETARIO",
    });
    const buffer = ocupacion({
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      capa: "bloqueo",
      razon: "BUFFER_LIMPIEZA",
    });
    expect(razonDominante([propietario, buffer], "2026-06-02")?.razon).toBe("BLOQUEO_PROPIETARIO");
  });

  it("noche libre devuelve null", () => {
    expect(razonDominante([], "2026-06-02")).toBeNull();
  });
});

describe("participaDelExclude (D-012)", () => {
  it("solo reserva+bloqueante+no-cancelado participa", () => {
    expect(participaDelExclude({ capa: "reserva", estado: "confirmado", bloqueante: true })).toBe(
      true,
    );
    expect(participaDelExclude({ capa: "reserva", estado: "provisional", bloqueante: false })).toBe(
      false,
    );
    expect(participaDelExclude({ capa: "reserva", estado: "cancelado", bloqueante: true })).toBe(
      false,
    );
    expect(participaDelExclude({ capa: "bloqueo", estado: "confirmado", bloqueante: true })).toBe(
      false,
    );
  });
});
