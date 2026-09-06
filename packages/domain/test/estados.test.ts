import { describe, expect, it } from "vitest";
import { puedeTransicionar, transicionar } from "../src/estados.js";

describe("máquina de estados de ocupacion_unidad (REQ-091)", () => {
  it("provisional puede pasar a confirmado o cancelado", () => {
    expect(puedeTransicionar("provisional", "confirmado")).toBe(true);
    expect(puedeTransicionar("provisional", "cancelado")).toBe(true);
    expect(puedeTransicionar("provisional", "conflicto_pendiente")).toBe(false);
  });

  it("confirmado puede pasar a cancelado o conflicto_pendiente, nunca a provisional", () => {
    expect(puedeTransicionar("confirmado", "cancelado")).toBe(true);
    expect(puedeTransicionar("confirmado", "conflicto_pendiente")).toBe(true);
    expect(puedeTransicionar("confirmado", "provisional")).toBe(false);
  });

  it("cancelado es terminal: D-006, el sistema nunca reactiva una reserva cancelada automáticamente", () => {
    expect(puedeTransicionar("cancelado", "confirmado")).toBe(false);
    expect(puedeTransicionar("cancelado", "provisional")).toBe(false);
    expect(puedeTransicionar("cancelado", "conflicto_pendiente")).toBe(false);
  });

  it("conflicto_pendiente se resuelve a confirmado o cancelado por decisión humana", () => {
    expect(puedeTransicionar("conflicto_pendiente", "confirmado")).toBe(true);
    expect(puedeTransicionar("conflicto_pendiente", "cancelado")).toBe(true);
  });

  it("ninguna transición a sí mismo", () => {
    expect(puedeTransicionar("confirmado", "confirmado")).toBe(false);
  });

  it("transicionar lanza sobre transición no permitida", () => {
    expect(() => transicionar("cancelado", "confirmado")).toThrow();
    expect(transicionar("provisional", "confirmado")).toBe("confirmado");
  });
});
