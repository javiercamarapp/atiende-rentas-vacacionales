import { describe, expect, it } from "vitest";
import { requiereConfirmacionHumanaParaBloqueo } from "../../src/limpieza/incidencias.js";

describe("requiereConfirmacionHumanaParaBloqueo (H-055, REQ-118)", () => {
  it("severidad grave requiere confirmación humana antes de proponer bloqueo", () => {
    expect(requiereConfirmacionHumanaParaBloqueo("grave")).toBe(true);
  });
  it("leve/moderada nunca proponen bloqueo automático", () => {
    expect(requiereConfirmacionHumanaParaBloqueo("leve")).toBe(false);
    expect(requiereConfirmacionHumanaParaBloqueo("moderada")).toBe(false);
  });
});
