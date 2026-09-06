import type { ChecklistItemTarea } from "./tipos.js";

/**
 * Checklist con ítems/fotos/timestamps (H-051, REQ-113): "incompleto puede
 * bloquear la reapertura automática de disponibilidad". Puramente
 * informativo — la capa de aplicación (`aplicacion/tareas.ts`) decide qué
 * hacer con el resultado (p. ej. no marcar la tarea `completada`).
 */
export function checklistCompleto(items: readonly ChecklistItemTarea[]): boolean {
  if (items.length === 0) return true;
  return items.every((item) => item.completado);
}

/** Una tarea solo puede pasar a `completada` si TODOS sus ítems de
 * checklist están completos (REQ-113) — una tarea sin ningún ítem
 * (mantenimiento/inspección sin checklist asignado) siempre puede
 * completarse. */
export function puedeCompletarTarea(items: readonly ChecklistItemTarea[]): boolean {
  return checklistCompleto(items);
}

/** Plantilla mínima por defecto para tareas de limpieza (REQ-114: los
 * checklists son parametrizables por propiedad/tipo — esta es la base
 * reutilizable cuando la propiedad no definió una plantilla propia). */
export const PLANTILLA_CHECKLIST_LIMPIEZA_DEFECTO: readonly string[] = [
  "Ropa de cama y toallas cambiadas",
  "Baños limpios y desinfectados",
  "Cocina limpia, sin loza sucia",
  "Pisos aspirados/trapeados en todas las habitaciones",
  "Basura retirada de todos los botes",
  "Amenidades e insumos reabastecidos",
  "Revisión de daños/objetos olvidados",
  "Fotos finales de cada habitación",
];

export const PLANTILLA_CHECKLIST_MANTENIMIENTO_DEFECTO: readonly string[] = [
  "Diagnóstico inicial documentado con fotos",
  "Reparación/atención realizada",
  "Verificación de funcionamiento post-reparación",
];

export function plantillaChecklistPorTipo(tipo: "limpieza" | "mantenimiento" | "inspeccion"): readonly string[] {
  if (tipo === "limpieza") return PLANTILLA_CHECKLIST_LIMPIEZA_DEFECTO;
  if (tipo === "mantenimiento") return PLANTILLA_CHECKLIST_MANTENIMIENTO_DEFECTO;
  return [];
}
