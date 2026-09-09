import type { EstadoConexionCanal, ChannelCapabilities } from "../channelAdapter.js";
import type { CanalMensajeriaCodigo } from "./tipos.js";

/**
 * Adaptador de envío de mensajería (H-... entregable de Lote 6: "estado
 * honesto sin canal de mensajería real conectado"). Extiende el mismo
 * principio de `ChannelAdapter` (packages/domain/src/channelAdapter.ts,
 * Lote 1/D-017): un `EstadoConexionCanal` nunca puede reportar
 * `"produccion"` sin evidencia verificable, y ningún simulador puede
 * disfrazarse de canal real (D-019).
 *
 * `enviarMensajeAprobado` exige `aprobadoPor` en la propia firma —no un
 * campo opcional— para que el TIPO del método haga imposible compilar una
 * llamada que no declare quién aprobó el envío (defensa adicional, no
 * sustituye la verificación real de estado que hace `packages/db`/RLS +
 * `colaAprobacion.marcarEnviadoTrasAprobacion` en `apps/api`).
 */
export interface ResultadoEnvioMensaje {
  readonly enviadoEn: string;
  readonly idExternoMensaje: string | null;
}

export interface EntradaEnviarMensajeAprobado {
  readonly borradorId: string;
  readonly texto: string;
  /** Usuario humano que aprobó este borrador — nunca `null`/`undefined`:
   * el llamador (apps/api) solo puede construir este objeto después de
   * `colaAprobacion.marcarEnviadoTrasAprobacion`. */
  readonly aprobadoPor: string;
  /** Identificadores del canal real (ej. `property_id`/`conversation_id`
   * de Booking.com) — `undefined` para `SimuladorMensajeria` (no los
   * necesita). Un adaptador real que los requiera (ver
   * `BookingMessagingChannelAdapter`) lanza un error tipado si faltan, en
   * vez de adivinar o construir una URL inválida en silencio. */
  readonly idExternoPropiedad?: string;
  readonly idExternoConversacion?: string;
}

export interface CanalMensajeria {
  readonly nombreCanal: CanalMensajeriaCodigo;
  readonly capacidades: ChannelCapabilities;
  obtenerEstadoConexion(): EstadoConexionCanal | Promise<EstadoConexionCanal>;
  enviarMensajeAprobado(entrada: EntradaEnviarMensajeAprobado): Promise<ResultadoEnvioMensaje>;
}

/**
 * Recepción de mensajes entrantes desde un canal real (Lote
 * "mensajería nativa por canal", RV10/RV22). Modela el patrón
 * "pull + confirmación explícita" que Booking.com documenta públicamente
 * para su Messaging API (`GET .../messages/latest` + `PUT .../messages`,
 * ver `packages/adapters/src/booking/mensajeria.ts`) — el mismo patrón de
 * idempotencia ya usado en este repo para el pull de reservas de Booking/
 * Expedia (`ExpediaApiClient.recuperarReservas`/`confirmarReserva`,
 * `BookingApiSimulator.pull`/`ack`): el canal REENVÍA los mismos mensajes
 * en cada llamada hasta recibir la confirmación explícita, así que un
 * fallo entre "recibir" y "confirmar" nunca pierde un mensaje (como mucho
 * lo reprocesa, nunca lo descarta en silencio).
 *
 * Deliberadamente NO implica ningún envío ni generación de respuesta: solo
 * expone el mensaje crudo del huésped como dato (RV19-R-16) para que la
 * capa de aplicación decida qué hacer (registrar como `mensaje` entrante,
 * generar un borrador, etc.) — ningún método de esta interfaz puede, por
 * su propia forma, enviar nada de vuelta al huésped.
 */
export interface MensajeCanalEntrante {
  /** Identificador del mensaje en el canal — usado para deduplicar contra
   * `mensaje`/`borrador_mensaje` si el mismo mensaje llega más de una vez
   * antes de confirmarse (reenvío del canal, ver doc de arriba). */
  readonly idExternoMensaje: string;
  /** Identificador de la conversación/hilo en el canal — el llamador lo usa
   * para resolver a qué `conversacion` interna corresponde (por
   * `external_conversation_id`, cuando esa columna exista) antes de
   * insertar el mensaje; nunca se asume que coincide con un UUID interno. */
  readonly idExternoConversacion: string;
  readonly texto: string;
  /** ISO 8601 — momento en que el CANAL reporta haber recibido el mensaje,
   * no el momento en que nuestro sistema hizo el pull. */
  readonly recibidoEn: string;
}

export interface ResultadoRecepcionMensajes {
  readonly mensajes: readonly MensajeCanalEntrante[];
  /** Cantidad a pasar tal cual a `confirmarRecepcion` — para el patrón
   * pull+confirm de Booking.com este valor viene literal del propio canal
   * (`number_of_messages` de la respuesta), nunca se recalcula a partir de
   * `mensajes.length` en el cliente (ver `BookingMessagingClient`). */
  readonly cantidadParaConfirmar: number;
}

export interface CanalMensajeriaEntrante {
  readonly nombreCanal: CanalMensajeriaCodigo;
  /** Pull: puede devolver mensajes ya devueltos en una llamada anterior si
   * nunca se llamó `confirmarRecepcion` para ellos (D-005: nunca se asume
   * éxito de una confirmación que no ocurrió). */
  recibirMensajesPendientes(): Promise<ResultadoRecepcionMensajes>;
  /** Confirma recepción de los últimos `cantidadParaConfirmar` mensajes
   * devueltos por `recibirMensajesPendientes` — después de esta llamada el
   * canal deja de reenviarlos. Nunca se infiere qué confirmar a partir de
   * IDs individuales: el contrato real de Booking.com confirma por
   * cantidad, no por lista de IDs (ver doc del cliente). */
  confirmarRecepcion(cantidad: number): Promise<void>;
}
