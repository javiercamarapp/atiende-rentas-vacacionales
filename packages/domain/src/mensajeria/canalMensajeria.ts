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
}

export interface CanalMensajeria {
  readonly nombreCanal: CanalMensajeriaCodigo;
  readonly capacidades: ChannelCapabilities;
  obtenerEstadoConexion(): EstadoConexionCanal | Promise<EstadoConexionCanal>;
  enviarMensajeAprobado(entrada: EntradaEnviarMensajeAprobado): Promise<ResultadoEnvioMensaje>;
}
