import { describe, expect, it } from "vitest";
import { checklistCompleto, plantillaChecklistPorTipo, puedeCompletarTarea } from "../../src/limpieza/checklist.js";
import type { ChecklistItemTarea } from "../../src/limpieza/tipos.js";

function item(completado: boolean): ChecklistItemTarea {
  return {
    id: "x",
    tareaId: "t",
    descripcion: "d",
    orden: 0,
    completado,
    completadoEn: completado ? "2026-01-01T00:00:00.000Z" : null,
    completadoPor: completado ? "u1" : null,
  };
}

describe("checklistCompleto (H-051, REQ-113)", () => {
  it("una tarea sin ítems se considera completa (mantenimiento/inspección sin checklist)", () => {
    expect(checklistCompleto([])).toBe(true);
  });

  it("todos los ítems completos → completo", () => {
    expect(checklistCompleto([item(true), item(true)])).toBe(true);
  });

  it("un solo ítem pendiente → incompleto, bloquea completar la tarea", () => {
    expect(checklistCompleto([item(true), item(false)])).toBe(false);
    expect(puedeCompletarTarea([item(true), item(false)])).toBe(false);
  });
});

describe("plantillaChecklistPorTipo (REQ-114)", () => {
  it("limpieza tiene una plantilla no vacía", () => {
    expect(plantillaChecklistPorTipo("limpieza").length).toBeGreaterThan(0);
  });
  it("mantenimiento tiene una plantilla no vacía", () => {
    expect(plantillaChecklistPorTipo("mantenimiento").length).toBeGreaterThan(0);
  });
  it("inspección no trae plantilla por defecto", () => {
    expect(plantillaChecklistPorTipo("inspeccion")).toEqual([]);
  });
});
