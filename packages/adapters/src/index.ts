// Parser ICS (H-023)
export {
  parsearIcs,
  IcsParseError,
  LIMITES_ICS_POR_DEFECTO,
} from "./ical/parser.js";
export type {
  CalendarioIcsNormalizado,
  VEventNormalizado,
  ValorFechaIcs,
  EstadoEventoIcs,
  LimitesParserIcs,
  CodigoErrorIcs,
} from "./ical/tipos.js";
export { resolverFechaLocal } from "./ical/resolverFecha.js";

// Export ICS (H-026, D-004 capa 1)
export {
  exportarFeedIcs,
  construirUidExportado,
  esUidNamespacePropio,
  NAMESPACE_UID_EXPORT,
} from "./ical/exportador.js";
export type { BloqueoExportable, FeedExportado } from "./ical/exportador.js";

// SSRF (H-024, H-025)
export { fetchIcsSeguro } from "./net/fetchSsrf.js";
export type { OpcionesFetchIcs, ResultadoFetchIcs } from "./net/fetchSsrf.js";
export {
  SsrfError,
  validarIpPermitida,
  validarTodasLasIps,
  redactarUrlParaLog,
} from "./net/ssrf.js";
export type { MotivoRechazoSsrf, ResultadoValidacionIp } from "./net/ssrf.js";

// Anti-eco (D-004, H-029)
export { detectarEco } from "./sync/antiEco.js";
export type { CapaAntiEco, ResultadoDeteccionEco, EntradaDeteccionEco } from "./sync/antiEco.js";

// Cuarentena (D-005, H-031)
export {
  aplicarResultadoCiclo,
  ESTADO_FEED_INICIAL,
  OPCIONES_CUARENTENA_POR_DEFECTO,
} from "./sync/cuarentena.js";
export type {
  ResultadoCicloFetch,
  EstadoFeedCanal,
  AlertaCuarentena,
  ResultadoAplicarCiclo,
  OpcionesCuarentena,
} from "./sync/cuarentena.js";

// Reconciliación/backoff (H-032, H-034)
export {
  calcularBackoffMs,
  reconciliarCompleto,
  OPCIONES_BACKOFF_POR_DEFECTO,
} from "./sync/reconciliacion.js";
export type {
  OpcionesBackoff,
  UidActivoInterno,
  ResultadoReconciliacionCompleta,
} from "./sync/reconciliacion.js";

// Motor de sincronización
export {
  ejecutarCicloImport,
  exportarFeedParaCanal,
  contarBloqueosActivos,
} from "./sync/motor.js";
export type { ContextoSincronizacion, ResultadoImportarCiclo } from "./sync/motor.js";

// Adaptadores reales por canal (H-023)
export { AirbnbChannelAdapter, CAPACIDADES_AIRBNB, LATENCIA_AIRBNB_ICAL } from "./airbnb/adapter.js";
export { VrboChannelAdapter, CAPACIDADES_VRBO, LATENCIA_VRBO_ICAL } from "./vrbo/adapter.js";
export {
  BookingChannelAdapter,
  CAPACIDADES_BOOKING_DIRECTO,
  MOTIVO_PARTNER_PENDIENTE_BOOKING,
  AVISO_ICAL_BOOKING,
} from "./booking/adapter.js";
export type { ChannelManagerCertificadoBridge } from "./booking/adapter.js";
