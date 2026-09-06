import type { CanalMensajeriaCodigo, EventoPlantilla, IdiomaMensaje } from "./tipos.js";

/**
 * Motor de plantillas por evento (H-056, REQ-099, REQ-101) — replica el
 * modelo de "quick replies" con marcadores de posición documentado en
 * RV10 (a)/(b) para Airbnb ([DATO], artículos 2897-2899): plantillas
 * reutilizables con variables `{{nombre}}`, por evento y por idioma.
 * Función pura: sin I/O, sin acceso a BD — persistencia vive en
 * `packages/db` (migración 0041), consumida por `apps/api`.
 */
export const EVENTOS_PLANTILLA = ["confirmacion", "pre_llegada", "check_in", "check_out", "resena"] as const;

export interface PlantillaMensaje {
  readonly id?: string;
  readonly evento: EventoPlantilla;
  readonly idioma: IdiomaMensaje;
  /** `null` = aplica a cualquier canal. */
  readonly canal: CanalMensajeriaCodigo | null;
  readonly cuerpo: string;
  /** `true` solo cuando un usuario autorizado del tenant aprobó
   * explícitamente esta plantilla — la programación automática (H-056)
   * SOLO puede usar plantillas con `aprobadaPorTenant: true` (nunca una en
   * borrador), independientemente de que esté `activa`. */
  readonly aprobadaPorTenant: boolean;
  readonly activa: boolean;
}

const PATRON_VARIABLE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extraerVariables(cuerpo: string): string[] {
  const vistas = new Set<string>();
  for (const m of cuerpo.matchAll(PATRON_VARIABLE)) vistas.add(m[1]!);
  return [...vistas];
}

export class VariablePlantillaFaltanteError extends Error {
  constructor(readonly variable: string) {
    // RV18 §5, punto 1: el motor nunca "adivina" un valor no suministrado
    // (fecha/precio/política) — declara el faltante de forma explícita en
    // vez de arriesgar una promesa falsa al huésped.
    super(`Falta la variable "${variable}" para renderizar la plantilla — no se inventa un valor`);
    this.name = "VariablePlantillaFaltanteError";
  }
}

export class PlantillaNoAprobadaError extends Error {
  constructor(readonly plantillaId: string | undefined) {
    super("Solo se pueden programar plantillas aprobadas explícitamente por el tenant (H-056)");
    this.name = "PlantillaNoAprobadaError";
  }
}

/**
 * Renderiza sustituyendo cada `{{variable}}` — lanza si falta alguna en
 * vez de dejarla vacía o rellenarla con un valor inventado.
 */
export function renderizarPlantilla(plantilla: PlantillaMensaje, variables: Readonly<Record<string, string>>): string {
  const requeridas = extraerVariables(plantilla.cuerpo);
  for (const variable of requeridas) {
    if (variables[variable] === undefined) throw new VariablePlantillaFaltanteError(variable);
  }
  return plantilla.cuerpo.replace(PATRON_VARIABLE, (_coincidencia, nombre: string) => variables[nombre]!);
}

/** H-056: la programación automática exige explícitamente una plantilla
 * aprobada por el tenant — nunca un borrador libre generado por
 * `GeneradorBorrador` (ese siempre pasa por la cola de aprobación humana
 * de `colaAprobacion.ts`, sea cual sea su origen). */
export function exigirPlantillaAprobadaParaProgramar(plantilla: PlantillaMensaje): void {
  if (!plantilla.aprobadaPorTenant || !plantilla.activa) {
    throw new PlantillaNoAprobadaError(plantilla.id);
  }
}
