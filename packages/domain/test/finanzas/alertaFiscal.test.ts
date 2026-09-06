import { describe, expect, it } from "vitest";
import { evaluarAlertaRetencionFiscal } from "../../src/finanzas/alertaFiscal.js";

describe("evaluarAlertaRetencionFiscal — H-067 (B-005, sin calcular impuestos)", () => {
  it("sin RFC: alerta de retención agravada, siempre marcada para revisión fiscal", () => {
    const alerta = evaluarAlertaRetencionFiscal(null);
    expect(alerta.rfcRegistrado).toBe(false);
    expect(alerta.requiereRevisionFiscal).toBe(true);
    expect(alerta.mensaje).toMatch(/retención agravada/i);
    expect(alerta.mensaje).not.toMatch(/\d+%/); // nunca cita un porcentaje como cifra definitiva
  });

  it("con RFC: sigue marcado para revisión fiscal, nunca calcula un monto", () => {
    const alerta = evaluarAlertaRetencionFiscal("XAXX010101000");
    expect(alerta.rfcRegistrado).toBe(true);
    expect(alerta.requiereRevisionFiscal).toBe(true);
    expect(alerta.mensaje).toMatch(/B-005/);
  });

  it("RFC vacío se trata como no registrado", () => {
    expect(evaluarAlertaRetencionFiscal("   ").rfcRegistrado).toBe(false);
  });
});
