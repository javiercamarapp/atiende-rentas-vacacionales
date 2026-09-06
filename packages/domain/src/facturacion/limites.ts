import type { LimitesPlan, MedicionUsoTenant, RecursoLimitado, ResultadoLimite } from "./tipos.js";

/**
 * Evalúa los 3 límites de plan (RV16: "unidades activas, mensajes IA,
 * cuentas de canal") contra la medición de uso actual del tenant.
 * SIEMPRE se llama del lado del SERVIDOR antes de permitir la acción que
 * consumiría el recurso (alta de unidad, envío de mensaje IA, alta de
 * cuenta de canal) — nunca solo en la UI, que un cliente podría saltarse.
 * Ver `apps/api/src/middleware/limitesPlan.ts` para el punto de
 * aplicación real (402/403 tipado, nunca un 500 genérico).
 *
 * Un límite `null` significa "sin tope" — siempre `permitido: true` para
 * ese recurso sin importar el uso actual.
 */
export function evaluarLimitesPlan(params: {
  limites: LimitesPlan;
  uso: MedicionUsoTenant;
}): ResultadoLimite[] {
  const { limites, uso } = params;

  return [
    evaluarUnRecurso("unidades_activas", uso.unidadesActivas, limites.unidadesActivasMax, "unidades activas"),
    evaluarUnRecurso("mensajes_ia", uso.mensajesIaMes, limites.mensajesIaMesMax, "mensajes de IA este mes"),
    evaluarUnRecurso("cuentas_canal", uso.cuentasCanal, limites.cuentasCanalMax, "cuentas de canal"),
  ];
}

/** Evalúa un único recurso contra un límite — separado de
 * `evaluarLimitesPlan` para que `evaluarAntesDeIncrementar` (abajo) pueda
 * reusarlo sin recalcular los otros dos recursos que no cambian. */
function evaluarUnRecurso(
  recurso: RecursoLimitado,
  usoActual: number,
  limite: number | null,
  etiquetaHumana: string,
): ResultadoLimite {
  if (limite === null) {
    return { recurso, permitido: true, usoActual, limite: null, motivo: `Sin límite de ${etiquetaHumana} en este plan.` };
  }
  const permitido = usoActual < limite;
  return {
    recurso,
    permitido,
    usoActual,
    limite,
    motivo: permitido
      ? `${usoActual}/${limite} ${etiquetaHumana} — dentro del límite del plan.`
      : `Límite de ${etiquetaHumana} alcanzado (${usoActual}/${limite}) — actualiza tu plan para continuar.`,
  };
}

/**
 * Variante usada justo ANTES de incrementar un contador en 1 (p. ej. dar
 * de alta una unidad nueva, o registrar el envío de un mensaje de IA):
 * evalúa el límite como si el incremento YA hubiera ocurrido
 * (`usoActual + 1`), para bloquear la acción ANTES de que el recurso
 * exista, nunca después (evita el "alta que se crea y luego se rechaza a
 * medias").
 */
export function evaluarAntesDeIncrementar(params: {
  recurso: RecursoLimitado;
  limites: LimitesPlan;
  uso: MedicionUsoTenant;
}): ResultadoLimite {
  const { recurso, limites, uso } = params;
  const limitePorRecurso: Record<RecursoLimitado, { limite: number | null; etiqueta: string }> = {
    unidades_activas: { limite: limites.unidadesActivasMax, etiqueta: "unidades activas" },
    mensajes_ia: { limite: limites.mensajesIaMesMax, etiqueta: "mensajes de IA este mes" },
    cuentas_canal: { limite: limites.cuentasCanalMax, etiqueta: "cuentas de canal" },
  };
  const usoActualPorRecurso: Record<RecursoLimitado, number> = {
    unidades_activas: uso.unidadesActivas,
    mensajes_ia: uso.mensajesIaMes,
    cuentas_canal: uso.cuentasCanal,
  };
  const { limite, etiqueta } = limitePorRecurso[recurso];
  const usoTrasIncremento = usoActualPorRecurso[recurso] + 1;
  if (limite === null) {
    return {
      recurso,
      permitido: true,
      usoActual: usoActualPorRecurso[recurso],
      limite: null,
      motivo: `Sin límite de ${etiqueta} en este plan.`,
    };
  }
  const permitido = usoTrasIncremento <= limite;
  return {
    recurso,
    permitido,
    usoActual: usoActualPorRecurso[recurso],
    limite,
    motivo: permitido
      ? `${usoTrasIncremento}/${limite} ${etiqueta} tras esta alta — dentro del límite del plan.`
      : `Esta acción excedería el límite de ${etiqueta} del plan (${usoActualPorRecurso[recurso]}/${limite}) — actualiza tu plan para continuar.`,
  };
}
