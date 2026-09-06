import { describe, expect, it } from "vitest";
import { CATALOGO_TOOLS_AGENTE, buscarToolPorNombre } from "../../src/agentes/catalogo.js";
import { construirMatrizCompleta, toolPermitidaParaActor, toolsDisponiblesParaActor } from "../../src/agentes/matrizRoles.js";
import { ROLES_AGENTE } from "../../src/agentes/tipos.js";

describe("Matriz rol×tool (H-078, RV18-R-04)", () => {
  it("construye una fila por cada combinación rol/tool (incluyendo niveles de colaborador para operador)", () => {
    const filas = construirMatrizCompleta(ROLES_AGENTE);
    expect(filas.length).toBeGreaterThan(CATALOGO_TOOLS_AGENTE.length);
    // Cada fila referencia una tool real del catálogo.
    for (const fila of filas) {
      expect(buscarToolPorNombre(fila.tool)).toBeDefined();
    }
  });

  it("contador nunca tiene acceso a ninguna tool (regla transversal: contador solo ve finanzas, nunca calendario/mensajería/limpieza)", () => {
    for (const tool of CATALOGO_TOOLS_AGENTE) {
      expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "contador", colaboradorNivel: null })).toBe(false);
    }
  });

  it("superadmin nunca genera contenido para huéspedes de terceros (RV18 §3.1: excepción explícita sobre mensajeria_proponer_borrador)", () => {
    const tool = buscarToolPorNombre("mensajeria_proponer_borrador")!;
    expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "superadmin", colaboradorNivel: null })).toBe(false);
  });

  it("operador con nivel 'solo_calendario' no puede proponer borradores de mensajería (RV18 §3.1)", () => {
    const tool = buscarToolPorNombre("mensajeria_proponer_borrador")!;
    expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "operador", colaboradorNivel: "solo_calendario" })).toBe(false);
  });

  it("operador con nivel 'acceso_total' sí puede proponer borradores de mensajería", () => {
    const tool = buscarToolPorNombre("mensajeria_proponer_borrador")!;
    expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "operador", colaboradorNivel: "acceso_total" })).toBe(true);
  });

  it("operador sin colaboradorNivel (null) es tratado como no autorizado en tools que exigen nivel específico", () => {
    const tool = buscarToolPorNombre("precio_sugerir_ajuste")!;
    expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "operador", colaboradorNivel: null })).toBe(false);
  });

  it("propietario puede consultar disponibilidad (lectura) pero limpieza no", () => {
    const tool = buscarToolPorNombre("inventario_consultar_disponibilidad")!;
    expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "propietario", colaboradorNivel: null })).toBe(true);
    expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "limpieza", colaboradorNivel: null })).toBe(false);
  });

  it("toolsDisponiblesParaActor nunca incluye una tool no permitida para ese rol", () => {
    const disponibles = toolsDisponiblesParaActor({ usuarioId: "u", rol: "limpieza", colaboradorNivel: null });
    for (const tool of disponibles) {
      expect(toolPermitidaParaActor(tool, { usuarioId: "u", rol: "limpieza", colaboradorNivel: null })).toBe(true);
    }
    // limpieza solo tiene acceso a proponer tareas de limpieza en este catálogo.
    expect(disponibles.map((t) => t.nombre)).toEqual(["limpieza_proponer_tarea"]);
  });
});
