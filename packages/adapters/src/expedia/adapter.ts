import {
  evaluarEstadoConexion,
  type ChannelAdapter,
  type ChannelCapabilities,
  type EstadoConexionCanal,
  type EvidenciaConexionCanal,
} from "@atiende-rv/domain";

/**
 * Adaptador real de Expedia Group Lodging Connectivity (Nivel B, RV22
 * F04-F13): Product/Availability & Rates push + Booking Retrieval/
 * Notification pull con confirmación. Construido contra la spec pública
 * (`ExpediaApiClient`, `./client.ts`), pero SIN credenciales de partner —
 * el estado honesto es SIEMPRE `partner_pendiente` hasta que el usuario
 * cargue credenciales de sandbox/producción reales aprobadas por Expedia
 * (D-017, RV22-R-06).
 *
 * RV22-R-05: este adaptador es EXCLUSIVO de la marca Expedia — Vrbo tiene
 * su propio stack REST/XML legacy heredado de HomeAway y NO comparte
 * superficie técnica ni credenciales con Expedia (F13); ver
 * `../vrbo/apiAdapter.ts` para el adaptador separado de Vrbo API.
 */
export const LATENCIA_EXPEDIA_API = {
  descripcion:
    "Sin SLA de latencia publicado para Availability & Rates (búsqueda exhaustiva sin resultado); " +
    "Booking Notification es un push único al crear la reserva, sin reenvío (API legacy en mantenimiento)",
  confianza: "baja" as const,
  minutosEstimados: null,
  fuente: "docs/investigacion/RV22-canales-mexico.md F06-F08",
};

export const CAPACIDADES_EXPEDIA: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: true,
  reservationsPull: true,
  icalImportExport: false,
  messaging: false,
};

export const MOTIVO_PARTNER_PENDIENTE_EXPEDIA =
  "Requiere PCI compliance (Attestation of Compliance anual), TLS 1.2+ y license agreement con Expedia Partner " +
  "Solutions; el proceso real de aplicación es un formulario comercial no público (RV22 F11)";

export class ExpediaChannelAdapter implements ChannelAdapter {
  readonly nombreCanal = "expedia";
  readonly capacidades = CAPACIDADES_EXPEDIA;
  readonly latenciaDeclarada = LATENCIA_EXPEDIA_API;
  readonly motivoPartnerPendiente = MOTIVO_PARTNER_PENDIENTE_EXPEDIA;

  constructor(private readonly evidencia: EvidenciaConexionCanal) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    return evaluarEstadoConexion(this.evidencia);
  }
}

export {
  ExpediaApiClient,
  ErrorClienteExpedia,
  dividirEnLotesDisponibilidad,
  HOST_SANDBOX_EXPEDIA,
  LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA,
  LIMITE_REGISTROS_POR_LLAMADA_BOOKING_RETRIEVAL,
} from "./client.js";
export type {
  CredencialesExpedia,
  ActualizacionDisponibilidadExpedia,
  LoteActualizacionDisponibilidad,
  ReservaExpedia,
  EstadoReservaExpedia,
  OpcionesClienteExpedia,
} from "./client.js";
