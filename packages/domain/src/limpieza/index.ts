// Barril de `packages/domain/limpieza` (Lote 5, BACKLOG E08, H-049 a H-055).
// Carpeta exclusiva de este lote (docs/fase2/LOTES.md) — no reexporta nada
// de fuera de esta subcarpeta salvo lo que ya publica `packages/domain`
// desde su índice raíz (import directo de `../aplicacion/*`).
export type {
  TipoTareaOperativa,
  EstadoTareaOperativa,
  PrioridadTareaOperativa,
  SeveridadIncidencia,
  EstadoIncidencia,
  TareaOperativa,
  ChecklistItemTarea,
  FotoChecklistItem,
  ItemInventarioUnidad,
  ConsumoInventario,
  IncidenciaMantenimiento,
  ConfiguracionOperativaPropiedad,
} from "./tipos.js";
export { CONFIGURACION_OPERATIVA_DEFECTO } from "./tipos.js";

export { calcularRangoBuffer } from "./buffer.js";
export { calcularVencimientoSla, tareaVencida } from "./sla.js";
export {
  checklistCompleto,
  puedeCompletarTarea,
  plantillaChecklistPorTipo,
  PLANTILLA_CHECKLIST_LIMPIEZA_DEFECTO,
  PLANTILLA_CHECKLIST_MANTENIMIENTO_DEFECTO,
} from "./checklist.js";
export { aplicarConsumo, stockBajo, type ResultadoConsumoInventario } from "./inventario.js";
export { requiereConfirmacionHumanaParaBloqueo } from "./incidencias.js";

export {
  crearTareaLimpiezaPorCheckout,
  reprogramarTareaPorCambioReserva,
  cancelarTareaPorCancelacionReserva,
  procesarEventosCheckoutPendientes,
  asignarTarea,
  completarChecklistItem,
  completarTarea,
  registrarIncidencia,
  confirmarBloqueoMantenimiento,
} from "./aplicacion/tareas.js";
export type {
  ResultadoCrearTareaCheckout,
  ResultadoProcesarEventos,
  ResultadoConfirmarBloqueoMantenimiento,
} from "./aplicacion/tareas.js";
