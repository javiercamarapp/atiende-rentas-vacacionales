import { describe, expect, it } from "vitest";
import {
  AprobacionRequeridaError,
  TransicionBorradorInvalidaError,
  aprobarBorrador,
  intentarEnvioAutomatico,
  marcarEnviadoTrasAprobacion,
  rechazarBorrador,
} from "../../src/mensajeria/colaAprobacion.js";

describe("cola de aprobación humana (H-059, D-006)", () => {
  it("aprueba un borrador pendiente y registra quién aprobó", () => {
    const resultado = aprobarBorrador({ id: "b1", estado: "pendiente_aprobacion" }, "usuario-1");
    expect(resultado).toMatchObject({ estado: "aprobado", aprobadoPor: "usuario-1" });
  });

  it("rechaza un borrador pendiente con motivo obligatorio", () => {
    const resultado = rechazarBorrador({ id: "b1", estado: "pendiente_aprobacion" }, "usuario-1", "tono inapropiado");
    expect(resultado).toMatchObject({ estado: "rechazado", rechazadoPor: "usuario-1", motivo: "tono inapropiado" });
    expect(() => rechazarBorrador({ id: "b1", estado: "pendiente_aprobacion" }, "usuario-1", "  ")).toThrow(
      TransicionBorradorInvalidaError,
    );
  });

  it("no permite aprobar/rechazar dos veces (ya no está pendiente)", () => {
    expect(() => aprobarBorrador({ id: "b1", estado: "aprobado" }, "usuario-1")).toThrow(
      TransicionBorradorInvalidaError,
    );
    expect(() => rechazarBorrador({ id: "b1", estado: "rechazado" }, "usuario-1", "motivo")).toThrow(
      TransicionBorradorInvalidaError,
    );
  });

  it("marcarEnviadoTrasAprobacion exige estado 'aprobado'", () => {
    expect(marcarEnviadoTrasAprobacion({ id: "b1", estado: "aprobado" })).toEqual({ estado: "enviado" });
    expect(() => marcarEnviadoTrasAprobacion({ id: "b1", estado: "pendiente_aprobacion" })).toThrow(
      AprobacionRequeridaError,
    );
  });

  /**
   * Evidencia directa del entregable de DEFINICION-DE-HECHO: "borrador no
   * se envía sin aprobación (intento automático → error tipado y
   * auditoría)". `intentarEnvioAutomatico` es el punto que cualquier
   * worker/scheduler debe invocar para un envío no disparado por un clic
   * humano — SIEMPRE falla, incluso sobre un borrador ya aprobado, porque
   * la regla de negocio (D-006) prohíbe cualquier ruta de envío directo
   * para procesos automáticos, no solo los borradores sin aprobar.
   */
  it("intentarEnvioAutomatico SIEMPRE lanza AprobacionRequeridaError — no existe ruta de envío directo para procesos automáticos", () => {
    expect(() => intentarEnvioAutomatico({ id: "b-pendiente", estado: "pendiente_aprobacion" })).toThrow(
      AprobacionRequeridaError,
    );
    expect(() => intentarEnvioAutomatico({ id: "b-aprobado", estado: "aprobado" })).toThrow(AprobacionRequeridaError);
    try {
      intentarEnvioAutomatico({ id: "b-aprobado", estado: "aprobado" });
    } catch (err) {
      expect(err).toBeInstanceOf(AprobacionRequeridaError);
      expect((err as AprobacionRequeridaError).message).toMatch(/requiere "aprobado" por un humano/);
    }
  });
});
