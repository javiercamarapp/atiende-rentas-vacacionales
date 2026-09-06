// Barril de `packages/domain/mensajeria` (Lote 6, BACKLOG E09, H-056 a
// H-061). Carpeta exclusiva de este lote (docs/fase2/LOTES.md) — mismo
// patrón que `./limpieza/index.ts` y `./finanzas/index.ts`: solo
// reexporta lo público de esta subcarpeta, `packages/domain/src/index.ts`
// recibe únicamente la línea de reexport de este archivo.
export type {
  CanalMensajeriaCodigo,
  IdiomaMensaje,
  DireccionMensaje,
  OrigenMensaje,
  EventoPlantilla,
  EstadoBorrador,
  SenalEscalamiento,
  MensajeEntradaHuesped,
  ContextoBorrador,
  ResultadoBorrador,
} from "./tipos.js";
export { CANALES_MENSAJERIA } from "./tipos.js";

export {
  POLITICAS_POR_CANAL,
  politicaDeCanal,
  MensajeExcedeLongitudError,
  ContenidoProhibidoError,
  detectarContactoOPago,
  contieneLenguajeExcluyente,
  validarMensajeSaliente,
} from "./politica.js";
export type {
  PoliticaCanalMensajeria,
  HallazgosContactoPago,
  EntradaValidarMensajeSaliente,
  ResultadoValidarMensajeSaliente,
} from "./politica.js";

export {
  EVENTOS_PLANTILLA,
  extraerVariables,
  renderizarPlantilla,
  exigirPlantillaAprobadaParaProgramar,
  VariablePlantillaFaltanteError,
  PlantillaNoAprobadaError,
} from "./plantillas.js";
export type { PlantillaMensaje } from "./plantillas.js";

export { detectarSenalesEscalamiento } from "./escalamiento.js";

export { GeneradorBorradorPlantillas } from "./borrador.js";
export type { GeneradorBorrador } from "./borrador.js";

export {
  aprobarBorrador,
  rechazarBorrador,
  marcarEnviadoTrasAprobacion,
  intentarEnvioAutomatico,
  AprobacionRequeridaError,
  TransicionBorradorInvalidaError,
} from "./colaAprobacion.js";
export type {
  BorradorEstado,
  ResultadoAprobarBorrador,
  ResultadoRechazarBorrador,
  ResultadoMarcarEnviado,
} from "./colaAprobacion.js";

export type { CanalMensajeria, ResultadoEnvioMensaje, EntradaEnviarMensajeAprobado } from "./canalMensajeria.js";
