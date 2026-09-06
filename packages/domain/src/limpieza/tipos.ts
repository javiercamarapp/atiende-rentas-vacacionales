/**
 * Tipos de dominio de operación (limpieza/mantenimiento/inspección),
 * Lote 5 (BACKLOG E08, H-049 a H-055). Carpeta exclusiva de este lote
 * (`packages/domain/limpieza/`, docs/fase2/LOTES.md). Sin IO: solo formas
 * de datos + funciones puras, igual que el resto de `packages/domain`.
 */

export type TipoTareaOperativa = "limpieza" | "mantenimiento" | "inspeccion";

export type EstadoTareaOperativa =
  | "pendiente"
  | "asignada"
  | "en_progreso"
  | "completada"
  | "bloqueada"
  | "cancelada";

export type PrioridadTareaOperativa = "baja" | "media" | "alta" | "urgente";

export type SeveridadIncidencia = "leve" | "moderada" | "grave";

export type EstadoIncidencia =
  | "abierta"
  | "en_revision"
  | "bloqueo_propuesto"
  | "bloqueo_confirmado"
  | "resuelta"
  | "descartada";

export interface TareaOperativa {
  id: string;
  unidadId: string;
  /** Reserva (capa='reserva') que originó la tarea al confirmarse su
   * checkout — null para tareas creadas manualmente (mantenimiento,
   * inspección ad-hoc). */
  ocupacionUnidadId: string | null;
  tipo: TipoTareaOperativa;
  estado: EstadoTareaOperativa;
  prioridad: PrioridadTareaOperativa;
  asignadoA: string | null;
  esProveedorExterno: boolean;
  programadaPara: string; // FechaLocal YYYY-MM-DD
  slaVenceEn: string | null; // ISO instant
  completadaEn: string | null;
}

export interface ChecklistItemTarea {
  id: string;
  tareaId: string;
  descripcion: string;
  orden: number;
  completado: boolean;
  completadoEn: string | null;
  completadoPor: string | null;
}

export interface FotoChecklistItem {
  id: string;
  checklistItemId: string;
  rutaAlmacenamiento: string;
  /** Nunca "producción" en Fase 2: todo almacenamiento hoy es local de
   * desarrollo, etiquetado explícitamente (regla de oro DEFINICION-DE-HECHO
   * §1, aplicada aquí también a metadatos de archivos, no solo canales). */
  etiqueta: "dev-local";
  tomadaEn: string;
}

export interface ItemInventarioUnidad {
  id: string;
  unidadId: string;
  nombre: string;
  categoria: "ropa_blanca" | "consumible" | "otro";
  cantidadActual: number;
  umbralMinimo: number;
  unidadMedida: string;
}

export interface ConsumoInventario {
  itemInventarioId: string;
  cantidad: number;
}

export interface IncidenciaMantenimiento {
  id: string;
  unidadId: string;
  tareaOrigenId: string | null;
  severidad: SeveridadIncidencia;
  titulo: string;
  descripcion: string | null;
  estado: EstadoIncidencia;
  propuestaBloqueoRango: { inicio: string; fin: string } | null;
  bloqueoOcupacionId: string | null;
}

/** Configuración operativa por propiedad (H-050, H-054): buffer de limpieza
 * (en noches, unidad mínima del modelo de calendario, D-013) y SLA internos
 * por tipo de tarea (en horas). */
export interface ConfiguracionOperativaPropiedad {
  propiedadId: string;
  bufferLimpiezaNoches: number;
  slaLimpiezaHoras: number;
  slaMantenimientoHoras: number;
  notificacionesCanales: string[];
}

export const CONFIGURACION_OPERATIVA_DEFECTO: Omit<ConfiguracionOperativaPropiedad, "propiedadId"> = {
  bufferLimpiezaNoches: 1,
  slaLimpiezaHoras: 4,
  slaMantenimientoHoras: 24,
  notificacionesCanales: [],
};
