// Barril de `packages/domain/onboarding` (Patrón 7, rescatado de
// Likida/atiende.ai). Carpeta exclusiva de este patrón — mismo patrón que
// `./mensajeria/index.ts`: solo reexporta lo público de esta subcarpeta,
// `packages/domain/src/index.ts` recibe únicamente la línea de reexport
// de este archivo.
export { PASOS_ONBOARDING } from "./tipos.js";
export type {
  PasoOnboarding,
  EstadoPasosOnboarding,
  ContextoOnboarding,
  MensajeEntradaOnboarding,
  ResultadoPreguntaOnboarding,
} from "./tipos.js";

export { GeneradorPreguntaOnboardingReglas } from "./preguntas.js";
export type { GeneradorPreguntaOnboarding } from "./preguntas.js";
