import { describe, expect, it } from "vitest";
import { ProveedorLLMConFallback } from "../../src/agentes/proveedorFallback.js";
import type { ProveedorLLM, RespuestaLLM, SolicitudLLM } from "../../src/agentes/proveedorLLM.js";

const SOLICITUD_BASE: SolicitudLLM = {
  instruccionSistema: "prueba",
  toolsDisponibles: [],
  contenidoNoConfiable: null,
  contextoResumen: {},
};

function proveedorQueLanza(nombre: string): ProveedorLLM {
  return {
    nombre,
    etiquetado: true,
    async generar(): Promise<RespuestaLLM> {
      throw new Error(`${nombre} no disponible`);
    },
  };
}

function proveedorFijo(nombre: string, respuesta: Omit<RespuestaLLM, "modeloReal">): ProveedorLLM {
  return {
    nombre,
    etiquetado: true,
    async generar(): Promise<RespuestaLLM> {
      return { ...respuesta, modeloReal: nombre };
    },
  };
}

describe("ProveedorLLMConFallback (H-085, RV18-R-09)", () => {
  it("usa el primario cuando responde correctamente, atribuyendo el modelo real del primario", async () => {
    const primario = proveedorFijo("modelo-primario", { texto: "ok", toolInvocada: null, tokensSalida: 10, costoUsdEstimado: 0.001 });
    const secundario = proveedorFijo("modelo-secundario", { texto: "no debería usarse", toolInvocada: null, tokensSalida: 10, costoUsdEstimado: 0.001 });
    const proveedor = new ProveedorLLMConFallback(primario, secundario);

    const respuesta = await proveedor.generar(SOLICITUD_BASE);
    expect(respuesta.modeloReal).toBe("modelo-primario");
    expect(respuesta.texto).toBe("ok");
  });

  it("cae al secundario si el primario falla, atribuyendo el modelo real del secundario (no el nominal)", async () => {
    const primario = proveedorQueLanza("modelo-primario");
    const secundario = proveedorFijo("modelo-secundario", { texto: "respuesta de respaldo", toolInvocada: null, tokensSalida: 15, costoUsdEstimado: 0.002 });
    const proveedor = new ProveedorLLMConFallback(primario, secundario);

    const respuesta = await proveedor.generar(SOLICITUD_BASE);
    expect(respuesta.modeloReal).toBe("modelo-secundario");
    expect(respuesta.texto).toBe("respuesta de respaldo");
  });

  it("propaga el error si AMBOS proveedores fallan", async () => {
    const proveedor = new ProveedorLLMConFallback(proveedorQueLanza("a"), proveedorQueLanza("b"));
    await expect(proveedor.generar(SOLICITUD_BASE)).rejects.toThrow("b no disponible");
  });

  it("etiquetado solo es true si ambos proveedores lo son", () => {
    const simulado1: ProveedorLLM = { nombre: "sim1", etiquetado: true, generar: async () => ({ texto: null, toolInvocada: null, modeloReal: "sim1", tokensSalida: 0, costoUsdEstimado: 0 }) };
    const real: ProveedorLLM = { nombre: "real", etiquetado: false, generar: async () => ({ texto: null, toolInvocada: null, modeloReal: "real", tokensSalida: 0, costoUsdEstimado: 0 }) };
    expect(new ProveedorLLMConFallback(simulado1, real).etiquetado).toBe(false);
  });
});
