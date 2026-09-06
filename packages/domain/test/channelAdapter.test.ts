import { describe, expect, it } from "vitest";
import { evaluarEstadoConexion, type EvidenciaConexionCanal } from "../src/channelAdapter.js";

function evidencia(parcial: Partial<EvidenciaConexionCanal> = {}): EvidenciaConexionCanal {
  return {
    credencialesPresentes: false,
    esSimulador: false,
    ultimaSincronizacionExitosaEn: null,
    ventanaMaximaMs: 3 * 60 * 60 * 1000,
    partnerAprobado: false,
    esSandbox: false,
    ...parcial,
  };
}

describe("evaluarEstadoConexion (H-014, D-017) — nunca 'produccion' sin evidencia", () => {
  it("sin credenciales → no_conectado", () => {
    expect(evaluarEstadoConexion(evidencia())).toBe("no_conectado");
  });

  it("un simulador nunca se reporta como otra cosa, incluso con 'evidencia' de sync (D-019)", () => {
    expect(
      evaluarEstadoConexion(
        evidencia({
          esSimulador: true,
          credencialesPresentes: true,
          partnerAprobado: true,
          ultimaSincronizacionExitosaEn: new Date().toISOString(),
        }),
      ),
    ).toBe("simulador");
  });

  it("credenciales presentes pero partner no aprobado → partner_pendiente", () => {
    expect(
      evaluarEstadoConexion(evidencia({ credencialesPresentes: true, partnerAprobado: false })),
    ).toBe("partner_pendiente");
  });

  it("caso central D-017: credenciales presentes, SIN sync reciente → nunca 'produccion'", () => {
    const resultado = evaluarEstadoConexion(
      evidencia({
        credencialesPresentes: true,
        partnerAprobado: true,
        ultimaSincronizacionExitosaEn: null,
      }),
    );
    expect(resultado).not.toBe("produccion");
    expect(resultado).toBe("partner_pendiente");
  });

  it("sync exitoso pero fuera de la ventana máxima → nunca 'produccion'", () => {
    const haceOchoHoras = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const resultado = evaluarEstadoConexion(
      evidencia({
        credencialesPresentes: true,
        partnerAprobado: true,
        ultimaSincronizacionExitosaEn: haceOchoHoras,
        ventanaMaximaMs: 3 * 60 * 60 * 1000,
      }),
    );
    expect(resultado).not.toBe("produccion");
  });

  it("sandbox se reporta como sandbox aunque haya sync reciente", () => {
    expect(
      evaluarEstadoConexion(
        evidencia({
          credencialesPresentes: true,
          partnerAprobado: true,
          esSandbox: true,
          ultimaSincronizacionExitosaEn: new Date().toISOString(),
        }),
      ),
    ).toBe("sandbox");
  });

  it("solo 'produccion' con partner aprobado, no-sandbox, y sync exitoso dentro de la ventana", () => {
    expect(
      evaluarEstadoConexion(
        evidencia({
          credencialesPresentes: true,
          partnerAprobado: true,
          esSandbox: false,
          ultimaSincronizacionExitosaEn: new Date().toISOString(),
        }),
      ),
    ).toBe("produccion");
  });
});
