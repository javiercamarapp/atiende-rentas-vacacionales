// Llamadas de API propias de la operación de limpieza/mantenimiento (Lote 5,
// BACKLOG E08). Mismo patrón que apps/web/src/pages/calendario/api.ts: usa
// el cliente HTTP compartido (apps/web/src/lib/api/cliente.ts) y tipa
// localmente lo que no está todavía en el `zod` exportado de
// `@atiende-rv/api/contrato` (se importa lo que sí está: los enums/cuerpos
// de escritura de `apps/api/src/contrato/tipos.ts`).
import type {
  CuerpoAsignarTarea,
  CuerpoCompletarChecklistItem,
  CuerpoCompletarTarea,
  CuerpoConfirmarBloqueoMantenimiento,
  CuerpoCrearIncidencia,
  CuerpoCrearItemInventario,
  CuerpoCrearTareaOperativa,
} from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

export type TipoTareaOperativa = "limpieza" | "mantenimiento" | "inspeccion";
export type EstadoTareaOperativa = "pendiente" | "asignada" | "en_progreso" | "completada" | "bloqueada" | "cancelada";
export type PrioridadTareaOperativa = "baja" | "media" | "alta" | "urgente";

export interface TareaOperativa {
  id: string;
  unidadId: string;
  /** Resuelto server-side (packages/db función `unidad_nombre_operacion`,
   * migración 0039) — el rol `limpieza` no tiene acceso a `GET /unidades`
   * (RLS), así que esta página NUNCA debe volver a consultar esa ruta para
   * mostrar el nombre de la unidad de su propia tarea. */
  unidadNombre: string | null;
  ocupacionUnidadId: string | null;
  bufferOcupacionId: string | null;
  tipo: TipoTareaOperativa;
  estado: EstadoTareaOperativa;
  prioridad: PrioridadTareaOperativa;
  asignadoA: string | null;
  esProveedorExterno: boolean;
  programadaPara: string;
  slaVenceEn: string | null;
  completadaEn: string | null;
  notas: string | null;
}

export interface ChecklistItem {
  id: string;
  tareaId: string;
  descripcion: string;
  orden: number;
  completado: boolean;
  completadoEn: string | null;
  completadoPor: string | null;
}

export interface TareaConChecklist extends TareaOperativa {
  checklist: ChecklistItem[];
}

export interface TurnoDia {
  fecha: string;
  tareas: TareaOperativa[];
}

export interface Incidencia {
  id: string;
  unidadId: string;
  severidad: "leve" | "moderada" | "grave";
  titulo: string;
  descripcion: string | null;
  estado: string;
  requiereConfirmacionHumana: boolean;
}

export interface ItemInventario {
  id: string;
  unidadId: string;
  nombre: string;
  categoria: "ropa_blanca" | "consumible" | "otro";
  cantidadActual: number;
  umbralMinimo: number;
  unidadMedida: string;
  stockBajo: boolean;
}

export function listarTareas(filtros: { unidadId?: string; estado?: string } = {}): Promise<{ tareas: TareaOperativa[] }> {
  return peticion("/operacion/tareas", { query: filtros });
}

export function obtenerCalendarioTareas(desde: string, hasta: string, unidadId?: string): Promise<{ turnos: TurnoDia[] }> {
  return peticion("/operacion/tareas/calendario", { query: { desde, hasta, unidadId } });
}

export function obtenerTarea(id: string): Promise<TareaConChecklist> {
  return peticion(`/operacion/tareas/${id}`);
}

export function crearTareaManual(cuerpo: CuerpoCrearTareaOperativa): Promise<TareaOperativa> {
  return peticion("/operacion/tareas", { metodo: "POST", cuerpo });
}

export function asignarTarea(id: string, cuerpo: CuerpoAsignarTarea): Promise<{ id: string; asignadoA: string }> {
  return peticion(`/operacion/tareas/${id}/asignar`, { metodo: "PATCH", cuerpo });
}

export function completarChecklistItem(
  tareaId: string,
  itemId: string,
  cuerpo: CuerpoCompletarChecklistItem = {},
): Promise<void> {
  return peticion(`/operacion/tareas/${tareaId}/checklist/${itemId}/completar`, { metodo: "POST", cuerpo });
}

export function completarTarea(
  id: string,
  cuerpo: CuerpoCompletarTarea = {},
): Promise<{ id: string; estado: string; alertasStockBajo: string[] }> {
  return peticion(`/operacion/tareas/${id}/completar`, { metodo: "POST", cuerpo });
}

export interface ResultadoProcesarEventos {
  procesados: number;
  tareasCreadas: string[];
  tareasReprogramadas: string[];
  tareasCanceladas: string[];
}

export function procesarEventosCheckout(): Promise<ResultadoProcesarEventos> {
  return peticion("/operacion/tareas/procesar-eventos", { metodo: "POST" });
}

export function listarIncidencias(unidadId?: string): Promise<{ incidencias: Incidencia[] }> {
  return peticion("/operacion/incidencias", { query: { unidadId } });
}

export function crearIncidencia(cuerpo: CuerpoCrearIncidencia): Promise<Incidencia> {
  return peticion("/operacion/incidencias", { metodo: "POST", cuerpo });
}

export function confirmarBloqueoMantenimiento(
  id: string,
  cuerpo: CuerpoConfirmarBloqueoMantenimiento = {},
): Promise<{ id: string; estado: string; bloqueoOcupacionId: string; conflictosCapaCruzada: number }> {
  return peticion(`/operacion/incidencias/${id}/confirmar-bloqueo`, { metodo: "POST", cuerpo });
}

export function listarInventario(unidadId?: string): Promise<{ items: ItemInventario[] }> {
  return peticion("/operacion/inventario", { query: { unidadId } });
}

export function crearItemInventario(cuerpo: CuerpoCrearItemInventario): Promise<ItemInventario> {
  return peticion("/operacion/inventario", { metodo: "POST", cuerpo });
}
