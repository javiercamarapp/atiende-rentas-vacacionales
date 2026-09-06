import type { ChecklistItemContrato, ItemInventarioContrato, TareaOperativaContrato } from "../../contrato/tipos.js";

export interface FilaTareaOperativa {
  id: string;
  unidad_id: string;
  ocupacion_unidad_id: string | null;
  buffer_ocupacion_id: string | null;
  tipo: TareaOperativaContrato["tipo"];
  estado: TareaOperativaContrato["estado"];
  prioridad: TareaOperativaContrato["prioridad"];
  asignado_a: string | null;
  es_proveedor_externo: boolean;
  programada_para: string;
  sla_vence_en: string | null;
  completada_en: string | null;
  notas: string | null;
  /** Solo presente cuando la consulta hace JOIN con `unidad` (ver
   * `TAREA_SELECT_CON_UNIDAD`) — el rol `limpieza` no tiene acceso directo
   * a `GET /unidades` (RLS, packages/db migración 0015), así que el nombre
   * de la unidad se resuelve aquí, dentro de una consulta que SÍ está
   * autorizada para ese rol (RLS de `tarea_operativa`, migración 0036). */
  unidad_nombre?: string;
}

export function mapearTarea(fila: FilaTareaOperativa): TareaOperativaContrato {
  return {
    id: fila.id,
    unidadId: fila.unidad_id,
    unidadNombre: fila.unidad_nombre ?? null,
    ocupacionUnidadId: fila.ocupacion_unidad_id,
    bufferOcupacionId: fila.buffer_ocupacion_id,
    tipo: fila.tipo,
    estado: fila.estado,
    prioridad: fila.prioridad,
    asignadoA: fila.asignado_a,
    esProveedorExterno: fila.es_proveedor_externo,
    programadaPara: fila.programada_para,
    slaVenceEn: fila.sla_vence_en,
    completadaEn: fila.completada_en,
    notas: fila.notas,
  };
}

export interface FilaChecklistItem {
  id: string;
  tarea_id: string;
  descripcion: string;
  orden: number;
  completado: boolean;
  completado_en: string | null;
  completado_por: string | null;
}

export function mapearChecklistItem(fila: FilaChecklistItem): ChecklistItemContrato {
  return {
    id: fila.id,
    tareaId: fila.tarea_id,
    descripcion: fila.descripcion,
    orden: fila.orden,
    completado: fila.completado,
    completadoEn: fila.completado_en,
    completadoPor: fila.completado_por,
  };
}

export interface FilaItemInventario {
  id: string;
  unidad_id: string;
  nombre: string;
  categoria: ItemInventarioContrato["categoria"];
  cantidad_actual: string | number;
  umbral_minimo: string | number;
  unidad_medida: string;
}

export function mapearItemInventario(fila: FilaItemInventario): ItemInventarioContrato {
  const cantidadActual = Number(fila.cantidad_actual);
  const umbralMinimo = Number(fila.umbral_minimo);
  return {
    id: fila.id,
    unidadId: fila.unidad_id,
    nombre: fila.nombre,
    categoria: fila.categoria,
    cantidadActual,
    umbralMinimo,
    unidadMedida: fila.unidad_medida,
    stockBajo: cantidadActual < umbralMinimo,
  };
}

const TAREA_SELECT = `id, unidad_id, ocupacion_unidad_id, buffer_ocupacion_id, tipo, estado, prioridad,
  asignado_a, es_proveedor_externo, programada_para::text AS programada_para,
  sla_vence_en, completada_en, notas`;

/** Misma lista de columnas + `unidad_nombre_operacion(unidad_id)` (función
 * `SECURITY DEFINER`, packages/db migración 0039) en vez de un `JOIN unidad`
 * directo: RLS de la tabla `unidad` excluye por completo al rol `limpieza`
 * (migración 0015), y esa exclusión se evalúa sobre la tabla en sí — un
 * `JOIN` normal seguiría devolviendo 0 filas visibles para ese rol aunque
 * la propia fila de `tarea_operativa` sí sea suya. La función definer
 * expone ÚNICAMENTE el nombre, nunca el resto de columnas de `unidad`.
 * Nunca usable en una cláusula `RETURNING` (solo columnas de la propia
 * tabla insertada) — para POST se usa `TAREA_SELECT` y una relectura. */
const TAREA_SELECT_CON_UNIDAD = `id, unidad_id, ocupacion_unidad_id, buffer_ocupacion_id, tipo, estado, prioridad,
  asignado_a, es_proveedor_externo, programada_para::text AS programada_para,
  sla_vence_en, completada_en, notas, unidad_nombre_operacion(unidad_id) AS unidad_nombre`;

export { TAREA_SELECT, TAREA_SELECT_CON_UNIDAD };
