import type { BorradorMensajeContrato, ConversacionResumenContrato, MensajeContrato } from "../../contrato/tipos.js";

/**
 * Filas SQL crudas → contrato tipado (mismo patrón que
 * `apps/api/src/routes/limpieza/mapeo.ts`, Lote 5). Nunca se expone una
 * fila cruda de `pg` directamente en un `c.json(...)`.
 */
export interface FilaMensaje {
  id: string;
  conversacion_id: string;
  direccion: "entrante" | "saliente";
  origen: "canal" | "simulador" | "manual";
  texto: string;
  redactado: boolean;
  creado_en: string;
}

export function mapearMensaje(fila: FilaMensaje): MensajeContrato {
  return {
    id: fila.id,
    conversacionId: fila.conversacion_id,
    direccion: fila.direccion,
    origen: fila.origen,
    texto: fila.texto,
    redactado: fila.redactado,
    creadoEn: new Date(fila.creado_en).toISOString(),
  };
}

export interface FilaBorrador {
  id: string;
  conversacion_id: string;
  texto: string;
  canal_codigo: "airbnb" | "vrbo" | "booking";
  estado: "pendiente_aprobacion" | "aprobado" | "rechazado" | "enviado";
  generado_por: "motor_borrador" | "plantilla" | "manual" | "agente_llm";
  redactado: boolean;
  aprobado_por: string | null;
  rechazado_por: string | null;
  motivo_rechazo: string | null;
  creado_en: string;
}

export function mapearBorrador(fila: FilaBorrador): BorradorMensajeContrato {
  return {
    id: fila.id,
    conversacionId: fila.conversacion_id,
    texto: fila.texto,
    canalCodigo: fila.canal_codigo,
    estado: fila.estado,
    generadoPor: fila.generado_por,
    redactado: fila.redactado,
    aprobadoPor: fila.aprobado_por,
    rechazadoPor: fila.rechazado_por,
    motivoRechazo: fila.motivo_rechazo,
    creadoEn: new Date(fila.creado_en).toISOString(),
  };
}

export interface FilaConversacionResumen {
  id: string;
  unidad_id: string;
  unidad_nombre: string | null;
  canal_codigo: "airbnb" | "vrbo" | "booking";
  ultimo_mensaje_en: string | null;
  borradores_pendientes: string; // COUNT(*) llega como string desde pg
}

export function mapearConversacionResumen(fila: FilaConversacionResumen): ConversacionResumenContrato {
  return {
    id: fila.id,
    unidadId: fila.unidad_id,
    unidadNombre: fila.unidad_nombre,
    canalCodigo: fila.canal_codigo,
    ultimoMensajeEn: fila.ultimo_mensaje_en ? new Date(fila.ultimo_mensaje_en).toISOString() : null,
    borradoresPendientes: Number(fila.borradores_pendientes),
  };
}

/** Log de aplicación SIN PII (§RV19/21-7): nunca imprime el texto crudo de
 * un mensaje/borrador de huésped, solo longitud y metadatos — usado por
 * cada ruta de este módulo en vez de `console.log(texto)`. */
export function resumenSinPii(texto: string): { longitud: number } {
  return { longitud: texto.length };
}
