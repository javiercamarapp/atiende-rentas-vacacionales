import { describe, expect, it } from "vitest";
import { buscarToolPorNombre, CATALOGO_TOOLS_AGENTE } from "../../src/agentes/catalogo.js";
import {
  complejidadMaximaDeRonda,
  elegirModeloParaRonda,
  MODELOS_POR_COMPLEJIDAD,
} from "../../src/agentes/enrutadorModelo.js";
import type { ToolDefinicion } from "../../src/agentes/tipos.js";

/**
 * REQ-177: router dinámico de modelo LLM por tipo/complejidad de tarea.
 * Antes de este módulo, `AGENTES_MODELO_LLM` fijaba un único modelo para
 * TODO el tráfico de agentes (`apps/api/src/agentes/proveedorClaude.ts`)
 * sin importar la complejidad real de la ronda — estas pruebas verifican
 * el criterio de aceptación real: rondas de distinta complejidad deben
 * producir modelos DISTINTOS, y el modelo más caro nunca se usa cuando la
 * ronda no lo necesita.
 */
describe("enrutadorModelo — router dinámico de modelo LLM por complejidad de tarea (REQ-177)", () => {
  const toolMensajeria = buscarToolPorNombre("mensajeria_proponer_borrador")!;
  const toolIncidencia = buscarToolPorNombre("incidencia_resumir")!;
  const toolLimpieza = buscarToolPorNombre("limpieza_proponer_tarea")!;
  const toolDisponibilidad = buscarToolPorNombre("inventario_consultar_disponibilidad")!; // requiereLlm: false

  it("una ronda sin tools disponibles es clasificación simple → el modelo más barato", () => {
    expect(complejidadMaximaDeRonda([])).toBe("clasificacion");
    expect(elegirModeloParaRonda([])).toBe(MODELOS_POR_COMPLEJIDAD.clasificacion);
  });

  it("una ronda con solo tools deterministas (requiereLlm: false) sigue siendo clasificación simple", () => {
    expect(complejidadMaximaDeRonda([toolDisponibilidad])).toBe("clasificacion");
    expect(elegirModeloParaRonda([toolDisponibilidad])).toBe(MODELOS_POR_COMPLEJIDAD.clasificacion);
  });

  it("una ronda con la tool de borrador de mensajería (cara al huésped) usa el modelo más caro", () => {
    expect(complejidadMaximaDeRonda([toolMensajeria])).toBe("generacion_compleja");
    expect(elegirModeloParaRonda([toolMensajeria])).toBe(MODELOS_POR_COMPLEJIDAD.generacion_compleja);
  });

  it("una ronda con solo tools de generación interna (resumen/limpieza) usa el modelo intermedio, NUNCA el más caro", () => {
    expect(complejidadMaximaDeRonda([toolIncidencia, toolLimpieza])).toBe("generacion_simple");
    expect(elegirModeloParaRonda([toolIncidencia, toolLimpieza])).toBe(MODELOS_POR_COMPLEJIDAD.generacion_simple);
  });

  it("mezclar una tool determinista con una de generación compleja no baja la complejidad", () => {
    expect(complejidadMaximaDeRonda([toolDisponibilidad, toolMensajeria])).toBe("generacion_compleja");
  });

  it("la complejidad es el MÁXIMO entre las tools disponibles, no la primera ni la última", () => {
    expect(complejidadMaximaDeRonda([toolMensajeria, toolIncidencia])).toBe("generacion_compleja");
    expect(complejidadMaximaDeRonda([toolIncidencia, toolMensajeria])).toBe("generacion_compleja");
  });

  it("un override explícito (AGENTES_MODELO_LLM) fuerza el modelo sin importar la complejidad real de la ronda", () => {
    expect(elegirModeloParaRonda([toolMensajeria], "claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(elegirModeloParaRonda([], "claude-opus-5")).toBe("claude-opus-5");
  });

  it("una tool con requiereLlm:true no catalogada en el router falla CERRADO hacia el modelo más caro, nunca hacia el más barato", () => {
    const toolNoCatalogada: ToolDefinicion = {
      ...toolIncidencia,
      nombre: "dominio_nuevo_tool_no_catalogada_aun",
    };
    expect(complejidadMaximaDeRonda([toolNoCatalogada])).toBe("generacion_compleja");
  });

  it("los tres niveles de complejidad usan modelos DISTINTOS entre sí (condición necesaria de un router real, no uno decorativo)", () => {
    const modelos = new Set(Object.values(MODELOS_POR_COMPLEJIDAD));
    expect(modelos.size).toBe(3);
  });

  it("el catálogo real de tools que requieren LLM es exactamente el conjunto ya revisado por el router — si alguien añade una tool nueva a catalogo.ts sin actualizar enrutadorModelo.ts, esta prueba debe fallar para forzar la revisión", () => {
    const nombresToolsLlmDelCatalogo = new Set(CATALOGO_TOOLS_AGENTE.filter((t) => t.requiereLlm).map((t) => t.nombre));
    const nombresRevisadosPorElRouter = new Set([
      "mensajeria_proponer_borrador",
      "incidencia_resumir",
      "limpieza_proponer_tarea",
      "precio_sugerir_ajuste",
    ]);
    expect(nombresToolsLlmDelCatalogo).toEqual(nombresRevisadosPorElRouter);
  });
});
