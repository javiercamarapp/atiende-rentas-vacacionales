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
export {
  AirbnbChannelAdapter,
  CAPACIDADES_AIRBNB,
  LATENCIA_AIRBNB_ICAL,
  VENTANA_IMPORTACION_AIRBNB_ANIOS,
  fueraDeVentanaImportacionAirbnb,
} from "./airbnb/adapter.js";
export { VrboChannelAdapter, CAPACIDADES_VRBO, LATENCIA_VRBO_ICAL } from "./vrbo/adapter.js";
export {
  BookingChannelAdapter,
  CAPACIDADES_BOOKING_DIRECTO,
  MOTIVO_PARTNER_PENDIENTE_BOOKING,
  AVISO_ICAL_BOOKING,
} from "./booking/adapter.js";
export type { ChannelManagerCertificadoBridge } from "./booking/adapter.js";
export {
  construirOtaHotelAvailNotifRq,
  construirOtaHotelRateAmountNotifRq,
  mapearReservaSimuladaAOta,
  ROOMSTOSELL_MAXIMO,
  ROOMSTOSELL_ILIMITADO,
  RoomsToSellInvalidoError,
} from "./booking/otaXml.js";
export type {
  RestriccionDisponibilidadBooking,
  TarifaBooking,
  ReservaBookingOta,
  EstadoReservaBookingOta,
  ReservaSimuladaComoOta,
} from "./booking/otaXml.js";
// Mensajería nativa de Booking.com (fix/mensajeria-nativa-por-canal) — ver
// cabecera de `./booking/mensajeria.ts` para el estado "NO VERIFICADO
// contra el proveedor real" y qué credenciales hacen falta.
export {
  BookingMessagingClient,
  BookingMessagingChannelAdapter,
  ErrorClienteBookingMensajeria,
  ErrorHostNoPermitidoBooking,
  MensajeriaBookingFaltaIdentificadorExternoError,
  CAPACIDADES_BOOKING_MENSAJERIA,
  HOST_AUTENTICACION_BOOKING_MENSAJERIA,
  HOST_MENSAJERIA_BOOKING,
  ACCEPT_VERSION_MENSAJERIA_BOOKING,
} from "./booking/mensajeria.js";
export type {
  CredencialesBookingMensajeria,
  MensajeEntranteBookingApi,
  OpcionesClienteBookingMensajeria,
} from "./booking/mensajeria.js";

// Lote 3.4 (RV22, Fase 3): canales de distribución usados en México.
export {
  AgodaChannelAdapter,
  CAPACIDADES_AGODA,
  LATENCIA_AGODA_ICAL,
} from "./agoda/adapter.js";

export {
  ExpediaChannelAdapter,
  CAPACIDADES_EXPEDIA,
  LATENCIA_EXPEDIA_API,
  MOTIVO_PARTNER_PENDIENTE_EXPEDIA,
  ExpediaApiClient,
  ErrorClienteExpedia,
  dividirEnLotesDisponibilidad,
  HOST_SANDBOX_EXPEDIA,
  LIMITE_ACTUALIZACIONES_POR_MENSAJE_EXPEDIA,
  LIMITE_REGISTROS_POR_LLAMADA_BOOKING_RETRIEVAL,
} from "./expedia/adapter.js";
export type {
  CredencialesExpedia,
  ActualizacionDisponibilidadExpedia,
  LoteActualizacionDisponibilidad,
  ReservaExpedia,
  EstadoReservaExpedia,
  OpcionesClienteExpedia as OpcionesClienteExpediaApi,
} from "./expedia/adapter.js";

export {
  SiteMinderPmsXchangeAdapter,
  CAPACIDADES_SITEMINDER,
  LATENCIA_SITEMINDER_PMSXCHANGE,
  MOTIVO_PARTNER_PENDIENTE_SITEMINDER,
  CANALES_CUBIERTOS_SITEMINDER,
  SiteMinderPmsXchangeClient,
  ErrorClientePmsXchange,
} from "./siteminder/adapter.js";
export type {
  ActualizacionInventarioPmsXchange,
  ReservaPmsXchange,
  EstadoReservaPmsXchange,
  OpcionesClientePmsXchange,
} from "./siteminder/adapter.js";

export {
  VrboApiChannelAdapter,
  CAPACIDADES_VRBO_API,
  LATENCIA_VRBO_API,
  MOTIVO_PARTNER_PENDIENTE_VRBO_API,
} from "./vrbo/apiAdapter.js";

export {
  AirbnbApiChannelAdapter,
  CAPACIDADES_AIRBNB_API,
  LATENCIA_AIRBNB_API,
  MOTIVO_PARTNER_PENDIENTE_AIRBNB_API,
} from "./airbnb/apiAdapter.js";

export {
  GoogleVacationRentalsAdapter,
  CAPACIDADES_GOOGLE_VR,
  LATENCIA_GOOGLE_VR,
  MOTIVO_PARTNER_PENDIENTE_GOOGLE_VR,
} from "./google-vr/adapter.js";

export { REGISTRO_ADAPTADORES, entradasPorCanal } from "./registro.js";
export type { EntradaRegistroAdaptador, NivelRv22 } from "./registro.js";
