export {
  crearTrazador,
  sanitizarAtributos,
  MARCADOR_ATRIBUTO_REDACTADO,
  type Span,
  type SpanKind,
  type SpanFinalizado,
  type Trazador,
  type AtributosSpan,
  type ExportadorSpans,
} from "./otel.js";

export {
  Gauge,
  Counter,
  UpDownCounter,
  Histogram,
  RegistroMetricas,
  exponerFormatoPrometheus,
} from "./metricas.js";

export {
  exportadorConsola,
  exportadorArchivo,
  exportadorOtlpHttp,
  leerConfiguracionOtelEntorno,
  construirExportadoresDesdeEntorno,
  type ConfiguracionOtelEntorno,
} from "./exportadores.js";

export { crearMiddlewareObservabilidad } from "./middlewareHttp.js";

export { ejecutarCicloSyncInstrumentado, type OpcionesCicloSyncInstrumentado } from "./cicloSyncInstrumentado.js";

export {
  procesarPendientesOutbox,
  contarPendientesOutbox,
  edadPendienteMasViejoMs,
  type EventoOutboxPendiente,
  type AplicarEfectoOutbox,
  type OpcionesProcesarPendientesOutbox,
  type ResultadoProcesarLote,
} from "./outboxWorker.js";

export {
  evaluarAlertas,
  dispararAlertas,
  reconocerAlerta,
  resolverAlerta,
  UMBRALES_POR_DEFECTO,
  type TipoAlerta,
  type SeveridadAlerta,
  type UmbralesAlerta,
  type EntradaAlerta,
  type SenalSyncCanal,
  type SenalFeedCuarentena,
  type SenalConflictoPendiente,
  type SenalOutbox,
  type SenalDrift,
  type OpcionesEvaluarAlertas,
} from "./alertas.js";

export { rutasObservabilidad, crearEjecutorSoloLectura, type DependenciasRutasObservabilidad } from "./rutas.js";
