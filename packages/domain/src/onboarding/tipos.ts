/**
 * Tipos base de onboarding conversacional (Patrón 7, rescatado de
 * Likida/atiende.ai). Carpeta exclusiva de este patrón — mismo criterio de
 * `packages/domain/mensajeria` (Lote 6): el "hecho ya conocido" es lo que
 * el SERVIDOR resolvió de tablas reales (`GET /onboarding/estado`, ver
 * `apps/api/src/routes/onboarding.ts`), nunca algo que el usuario haya
 * escrito en su mensaje.
 */

/** Mismas 6 claves que `EstadoOnboarding.pasos` en apps/web/src/pages/
 * onboarding/api.ts y en el `SELECT` de `GET /onboarding/estado` —
 * `packages/domain/test/onboarding/pasosSincronizados.test.ts` no puede
 * importar `apps/api`/`apps/web` (dirección de dependencia inversa
 * prohibida por el monorepo, mismo principio que `agentes/tipos.ts` con
 * `ROLES_AGENTE`), así que la sincronía se vigila con una prueba de
 * contrato del lado de `apps/api` que sí puede importar ambos. */
export const PASOS_ONBOARDING = [
  "empresaRegistrada",
  "correoVerificado",
  "primeraPropiedad",
  "primeraUnidad",
  "canalConectado",
  "colaboradorInvitado",
] as const;
export type PasoOnboarding = (typeof PASOS_ONBOARDING)[number];

export type EstadoPasosOnboarding = Readonly<Record<PasoOnboarding, boolean>>;

/** Contexto resuelto por el SERVIDOR a partir de tablas reales — nunca a
 * partir de lo que el usuario escribió en el mensaje del asistente
 * conversacional (mismo principio que `ContextoBorrador` de
 * `mensajeria/tipos.ts`, RV19-R-16/17). */
export interface ContextoOnboarding {
  readonly pasos: EstadoPasosOnboarding;
}

/** Mensaje libre del usuario tratado SIEMPRE como dato de SELECCIÓN de
 * intención (qué paso le interesa) — nunca como instrucción que pueda
 * declarar el onboarding completo por sí solo. */
export interface MensajeEntradaOnboarding {
  readonly texto: string;
}

export interface ResultadoPreguntaOnboarding {
  /** `true` ÚNICAMENTE cuando los 6 pasos de `ContextoOnboarding.pasos`
   * están en `true` — ver la guarda determinista en `preguntas.ts`. Nunca
   * se deriva del texto del usuario. */
  readonly onboardingCompleto: boolean;
  /** `null` cuando `onboardingCompleto` es `true`, o cuando
   * `datoFaltanteDeclarado` es `true` (no hay pregunta preparada). */
  readonly pasoObjetivo: PasoOnboarding | null;
  readonly pregunta: string;
  readonly ctaTexto: string | null;
  readonly ctaRuta: string | null;
  /** `true` cuando este generador NO tiene una pregunta preparada para el
   * paso pendiente real (esquema desincronizado entre `ORDEN_PASOS` y
   * `PASOS_ONBOARDING`) — declara la ausencia en vez de inventar una
   * pregunta genérica, mismo principio que
   * `ResultadoBorrador.datoFaltanteDeclarado` (RV18 §5, punto 1: nunca
   * "adivinar razonablemente"). */
  readonly datoFaltanteDeclarado: boolean;
}
