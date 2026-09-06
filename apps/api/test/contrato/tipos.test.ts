import { describe, expect, it } from "vitest";
import { CuerpoCrearAccesoRomperCristal } from "../../src/contrato/tipos.js";

/**
 * Regresión permanente S-21 (docs/auditoria-2/seguridad.md): un motivo
 * compuesto solo por espacios debe rechazarse en la capa de contrato
 * (422 validacion), nunca llegar hasta el CHECK de base de datos
 * (packages/db/src/migrations/0061_acceso_romper_cristal.ts) — eso
 * clasificaba el rechazo como 500 error_interno en vez de 422.
 */
describe("CuerpoCrearAccesoRomperCristal — motivo (S-21)", () => {
  const base = { tenantId: "11111111-1111-1111-1111-111111111111" };

  it("rechaza un motivo compuesto solo por espacios", () => {
    const resultado = CuerpoCrearAccesoRomperCristal.safeParse({ ...base, motivo: "   " });
    expect(resultado.success).toBe(false);
  });

  it("rechaza un motivo vacío", () => {
    const resultado = CuerpoCrearAccesoRomperCristal.safeParse({ ...base, motivo: "" });
    expect(resultado.success).toBe(false);
  });

  it("acepta un motivo real y lo recorta (trim)", () => {
    const resultado = CuerpoCrearAccesoRomperCristal.safeParse({ ...base, motivo: "  Investigar incidente  " });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.motivo).toBe("Investigar incidente");
    }
  });
});
