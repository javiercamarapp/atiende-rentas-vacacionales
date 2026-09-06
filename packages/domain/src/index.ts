export type {
  FechaLocal,
  Capa,
  Razon,
  EstadoOcupacion,
  RangoFechas,
  Ocupacion,
  TipoConflicto,
} from "./tipos.js";
export { PRECEDENCIA_RAZON } from "./tipos.js";

export {
  validarZonaHorariaIana,
  fechaLocalDesdeInstante,
  esRangoValido,
  calcularNoches,
  nochesDelRango,
  rangoCubreNoche,
  rangosSeSuperponen,
  sonRangosContiguos,
  clasificarModificacionRango,
} from "./fechas.js";
export type { TipoModificacionRango } from "./fechas.js";

export { estaOcupada, ocupacionesActivasEnNoche, razonDominante, participaDelExclude } from "./capas.js";

export { resolverVersion, calcularHashContenido } from "./resolucionVersion.js";
export type { VersionEvento, AccionResolucion, ResultadoResolucion } from "./resolucionVersion.js";

export { puedeTransicionar, transicionar } from "./estados.js";

export {
  evaluarEstadoConexion,
} from "./channelAdapter.js";
export type {
  EstadoConexionCanal,
  ChannelCapabilities,
  ChannelAdapter,
  EvidenciaConexionCanal,
} from "./channelAdapter.js";

export type { EjecutorTransaccional, FilaSql } from "./aplicacion/ejecutor.js";
export { esViolacionExclusion } from "./aplicacion/ejecutor.js";
export {
  crearReservaConfirmada,
  crearBloqueo,
  cancelarOcupacion,
  modificarFechasReserva,
} from "./aplicacion/reservas.js";
export type {
  InfoConflicto,
  EntradaCrearReserva,
  ResultadoCrearReserva,
  EntradaCrearBloqueo,
  ResultadoCrearBloqueo,
  ResultadoCancelarOcupacion,
  ResultadoModificarFechas,
} from "./aplicacion/reservas.js";

// Feature flags (Lote 10, H-089): registro tipado, default-off para
// funcionalidad de dinero/cancelación/contacto, auditoría de cambios.
export { CategoriaRiesgoFlag, RegistroFlags, FlagRiesgoDefaultActivoError, FlagNoRegistradoError } from "./flags/index.js";
export type { FlagId, FlagDefinicion, CambioFlagEntrada, AuditoriaFlagEntry } from "./flags/index.js";
export {
  FLAG_SYNC_PUSH_AUTOMATICO,
  FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA,
  CATALOGO_FLAGS_POR_DEFECTO,
} from "./flags/index.js";
