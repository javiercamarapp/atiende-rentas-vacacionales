/**
 * Tipos base de mensajería (Lote 6, BACKLOG E09, H-056 a H-061). Carpeta
 * exclusiva de este lote (docs/fase2/LOTES.md). Fuente de las políticas de
 * canal: `docs/investigacion/RV10-mensajes-huesped.md` — cada constante
 * documenta si su origen es `[DATO]` (fuente primaria verificada),
 * `[R]` (fuente secundaria de proveedor, confianza media-baja) o `[E]`
 * (supuesto/decisión de producto de Atiende sin fuente publicada), nunca
 * se afirma como hecho verificado lo que RV10 marcó como laguna.
 */

/** Solo los tres canales para los que RV10 documenta mensajería con
 * huésped — "manual" (bloqueo interno, migración 0004) nunca es un canal
 * de mensajería real. */
export const CANALES_MENSAJERIA = ["airbnb", "vrbo", "booking"] as const;
export type CanalMensajeriaCodigo = (typeof CANALES_MENSAJERIA)[number];

export type IdiomaMensaje = "es" | "en";

export type DireccionMensaje = "entrante" | "saliente";

/** `canal`: llegó vía el simulador de canal etiquetado (D-019) o, en su
 * ausencia, un adaptador real (ninguno existe hoy, packages/adapters no
 * declara `messaging`). `manual`: un operador transcribe un mensaje
 * recibido fuera de banda (ej. llamada telefónica) — nunca un mensaje que
 * la IA generó y envió por su cuenta, eso no existe (D-006). */
export type OrigenMensaje = "canal" | "simulador" | "manual";

export type EventoPlantilla = "confirmacion" | "pre_llegada" | "check_in" | "check_out" | "resena";

export type EstadoBorrador = "pendiente_aprobacion" | "aprobado" | "rechazado" | "enviado";

export type SenalEscalamiento = "queja" | "emergencia" | "reembolso" | "vip";

/** Mensaje entrante del huésped tratado SIEMPRE como dato estructurado
 * (RV19-R-16): ningún campo de esta interfaz se interpreta como
 * instrucción de sistema ni cambia qué funciones puede invocar el
 * generador de borradores. */
export interface MensajeEntradaHuesped {
  readonly texto: string;
  readonly idioma: IdiomaMensaje;
}

/** Contexto de la reserva/propiedad — resuelto por el SERVIDOR desde la
 * sesión/conversación autenticada (RV18 §6.2, RV19-R-17), nunca a partir de
 * lo que el huésped escribió en su mensaje. Ninguna función de este
 * paquete acepta `tenantId`/`propiedadId`/`huespedId` como argumento
 * derivado del texto del huésped. */
export interface ContextoBorrador {
  readonly nombreHuesped: string | null;
  readonly propiedadNombre: string;
  readonly fechaCheckIn: string | null;
  readonly fechaCheckOut: string | null;
  readonly reservaConfirmada: boolean;
  readonly canal: CanalMensajeriaCodigo;
}

export interface ResultadoBorrador {
  readonly texto: string;
  readonly necesitaEscalamiento: boolean;
  readonly senales: readonly SenalEscalamiento[];
  /** `true` cuando el borrador declaró explícitamente "no tengo esta
   * información" en vez de inventar un dato ausente del contexto (RV18 §5,
   * punto 1: nunca "adivinar razonablemente"). */
  readonly datoFaltanteDeclarado: boolean;
}
