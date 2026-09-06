import { Badge, type BadgeProps } from "@atiende-rv/ui-atiende";
import type { EstadoTareaOperativa, PrioridadTareaOperativa, TipoTareaOperativa } from "../api";

const ETIQUETA_ESTADO: Record<EstadoTareaOperativa, string> = {
  pendiente: "Pendiente",
  asignada: "Asignada",
  en_progreso: "En progreso",
  completada: "Completada",
  bloqueada: "Bloqueada (checklist incompleto)",
  cancelada: "Cancelada",
};

const VARIANTE_ESTADO: Record<EstadoTareaOperativa, BadgeProps["variant"]> = {
  pendiente: "outline",
  asignada: "secondary",
  en_progreso: "default",
  completada: "produccion",
  bloqueada: "destructive",
  cancelada: "no-conectado",
};

export function EtiquetaEstadoTarea({ estado }: { estado: EstadoTareaOperativa }) {
  return <Badge variant={VARIANTE_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
}

const ETIQUETA_PRIORIDAD: Record<PrioridadTareaOperativa, string> = {
  baja: "Prioridad baja",
  media: "Prioridad media",
  alta: "Prioridad alta",
  urgente: "Urgente",
};

export function EtiquetaPrioridad({ prioridad }: { prioridad: PrioridadTareaOperativa }) {
  return (
    <Badge variant={prioridad === "urgente" ? "destructive" : "outline"}>{ETIQUETA_PRIORIDAD[prioridad]}</Badge>
  );
}

const ETIQUETA_TIPO: Record<TipoTareaOperativa, string> = {
  limpieza: "Limpieza",
  mantenimiento: "Mantenimiento",
  inspeccion: "Inspección",
};

export function EtiquetaTipoTarea({ tipo }: { tipo: TipoTareaOperativa }) {
  return <Badge variant="secondary">{ETIQUETA_TIPO[tipo]}</Badge>;
}
