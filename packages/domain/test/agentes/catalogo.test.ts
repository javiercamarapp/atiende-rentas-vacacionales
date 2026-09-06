import { describe, expect, it } from "vitest";
import { CATALOGO_TOOLS_AGENTE, NOMBRES_TOOLS_PROHIBIDAS } from "../../src/agentes/catalogo.js";
import { contieneAccionProhibida, esCampoIdentificadorProhibido } from "../../src/agentes/patronesIdentificador.js";

/**
 * H-077 / LOTES.md Lote 9 ("entregable verificable"): "un test que
 * enumera el registro completo de tools falla si aparece alguna cuyo
 * `input_schema.properties` incluya un campo `*_id`/`tenant*`/
 * `propiedad*`/`huesped*`/`reserva*`, o si aparece una tool de
 * cancelación/envío directo." Este archivo ES ese test — literal, no una
 * aproximación — y forma parte de `npm run test -- --filter=agentes`.
 */
describe("Catálogo de tools de agente (H-077, D-008, RV18 §8 mecanismo 1)", () => {
  it("el catálogo no está vacío", () => {
    expect(CATALOGO_TOOLS_AGENTE.length).toBeGreaterThan(0);
  });

  it("ninguna tool declara un campo de identificador en input_schema.properties", () => {
    for (const tool of CATALOGO_TOOLS_AGENTE) {
      for (const nombreCampo of Object.keys(tool.inputSchema.properties)) {
        expect(
          esCampoIdentificadorProhibido(nombreCampo),
          `La tool "${tool.nombre}" declara el campo "${nombreCampo}", que coincide con un patrón de identificador prohibido`,
        ).toBe(false);
      }
    }
  });

  it("ninguna tool acepta additionalProperties (siempre additionalProperties: false)", () => {
    for (const tool of CATALOGO_TOOLS_AGENTE) {
      expect(tool.inputSchema.additionalProperties, `La tool "${tool.nombre}" no fija additionalProperties: false`).toBe(false);
    }
  });

  it("input_schema.type siempre es 'object'", () => {
    for (const tool of CATALOGO_TOOLS_AGENTE) {
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("ninguna tool del catálogo tiene nombre/descripción que implique cancelación o envío directo", () => {
    for (const tool of CATALOGO_TOOLS_AGENTE) {
      expect(contieneAccionProhibida(tool.nombre), `Nombre de tool sospechoso: "${tool.nombre}"`).toBe(false);
      expect(contieneAccionProhibida(tool.descripcion), `Descripción de tool sospechosa: "${tool.nombre}"`).toBe(false);
    }
  });

  it("ninguna de las tools prohibidas por diseño existe en el catálogo (D-006, RV18-R-03)", () => {
    const nombresCatalogo = new Set(CATALOGO_TOOLS_AGENTE.map((t) => t.nombre));
    for (const nombreProhibido of NOMBRES_TOOLS_PROHIBIDAS) {
      expect(nombresCatalogo.has(nombreProhibido), `La tool prohibida "${nombreProhibido}" existe en el catálogo`).toBe(false);
    }
  });

  it("las tools con prefijo de mutación sensible (inventario_*, calendario_*, precio_aplicar_*, mensajeria_enviar_*) no tienen campos no vacíos con identificadores", () => {
    const prefijosSensibles = ["inventario_", "calendario_", "precio_aplicar_", "mensajeria_enviar_"];
    for (const tool of CATALOGO_TOOLS_AGENTE) {
      if (!prefijosSensibles.some((p) => tool.nombre.startsWith(p))) continue;
      for (const nombreCampo of Object.keys(tool.inputSchema.properties)) {
        expect(esCampoIdentificadorProhibido(nombreCampo)).toBe(false);
      }
    }
  });

  it("no existe ninguna tool 'calendario_cerrar_disponibilidad' invocable por un agente (RV18 §3.1: solo la dispara el motor de sync)", () => {
    expect(CATALOGO_TOOLS_AGENTE.some((t) => t.nombre === "calendario_cerrar_disponibilidad")).toBe(false);
  });

  it("cada tool tiene al menos un rol permitido y límites positivos", () => {
    for (const tool of CATALOGO_TOOLS_AGENTE) {
      expect(tool.rolesPermitidos.length).toBeGreaterThan(0);
      expect(tool.limites.maxLlamadasPorConversacion).toBeGreaterThan(0);
    }
  });
});
