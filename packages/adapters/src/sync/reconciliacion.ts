/**
 * Reconciliación incremental/completa y backoff (H-032, H-034, §Operación-2,
 * caso adversarial 17). Funciones puras: la orquestación real (fetch +
 * escritura transaccional) vive en `motor.ts`.
 */

export interface OpcionesBackoff {
  baseMs: number;
  maxMs: number;
  factor: number;
}

export const OPCIONES_BACKOFF_POR_DEFECTO: OpcionesBackoff = {
  baseMs: 1_000,
  maxMs: 5 * 60_000,
  factor: 2,
};

/** Backoff exponencial con tope, respetando `Retry-After` (segundos) si el
 * canal lo emite en un 429 — nunca reintenta más agresivo que lo que el
 * canal pide explícitamente (H-034, caso adversarial 17: "sin bucle de
 * reintento agresivo"). */
export function calcularBackoffMs(
  intentoNumero: number,
  opciones: OpcionesBackoff = OPCIONES_BACKOFF_POR_DEFECTO,
  retryAfterSegundos?: number | null,
): number {
  if (retryAfterSegundos !== undefined && retryAfterSegundos !== null && retryAfterSegundos >= 0) {
    return Math.min(retryAfterSegundos * 1000, opciones.maxMs);
  }
  const exponencial = opciones.baseMs * Math.pow(opciones.factor, Math.max(0, intentoNumero - 1));
  return Math.min(exponencial, opciones.maxMs);
}

export interface UidActivoInterno {
  ocupacionUnidadId: string;
  uidCanal: string;
}

export interface ResultadoReconciliacionCompleta {
  /** UIDs activos internamente para ese canal/unidad que YA NO aparecen en
   * el feed más reciente — candidatos a cancelación implícita (sujeta
   * siempre a la regla de no reapertura de noches, que aplica
   * `cancelarOcupacion` del dominio por construcción). */
  candidatosACancelarPorAusencia: UidActivoInterno[];
  /** Conteo de discrepancias — expuesto como métrica de "drift" (H-032,
   * RV07 §14). */
  drift: number;
}

/** Reconciliación completa (H-032, RV07 §15): compara el conjunto de UIDs
 * activos internamente contra el conjunto de UIDs presentes en el feed
 * actual. La reconciliación INCREMENTAL (upsert por evento) se hace
 * directamente con `resolverVersion` de `@atiende-rv/domain` por cada
 * evento del feed — no necesita una función dedicada aquí. */
export function reconciliarCompleto(
  activosInternos: readonly UidActivoInterno[],
  uidsPresentesEnFeedActual: ReadonlySet<string>,
): ResultadoReconciliacionCompleta {
  const candidatosACancelarPorAusencia = activosInternos.filter(
    (a) => !uidsPresentesEnFeedActual.has(a.uidCanal),
  );
  return {
    candidatosACancelarPorAusencia,
    drift: candidatosACancelarPorAusencia.length,
  };
}
