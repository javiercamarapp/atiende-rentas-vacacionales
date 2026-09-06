/**
 * H-072/H-073 (RV17 §12, BACKLOG E12, Reporting): métricas estándar de
 * revenue management — ocupación, ADR (Average Daily Rate) y RevPAR
 * (Revenue Per Available Room/unit) — calculadas SOLO a partir de
 * agregados ya derivados de `reserva`/`reserva_financiero` (nunca
 * duplicando la lógica de cálculo del movimiento financiero: estas
 * funciones reciben totales ya sumados por la capa de aplicación, no
 * vuelven a leer filas de canal/comisión).
 *
 * Todas trabajan en centavos enteros (sin float) para los montos; la
 * ocupación se expresa en basis points (10000 = 100.00%) por consistencia
 * con el resto del motor de finanzas.
 */
export interface EntradaMetricasPeriodo {
  /** Ingreso bruto total del periodo, en centavos. */
  ingresosBrutosCentavos: number;
  /** Noches efectivamente ocupadas (capa='reserva', bloqueante=true). */
  nochesOcupadas: number;
  /** Noches disponibles totales (unidades activas × noches del periodo). */
  nochesDisponibles: number;
}

export interface ResultadoMetricasPeriodo {
  /** Basis points: 10000 = 100% de ocupación. */
  ocupacionBasisPoints: number;
  /** ADR en centavos: ingresos / noches OCUPADAS (0 si no hubo ninguna). */
  adrCentavos: number;
  /** RevPAR en centavos: ingresos / noches DISPONIBLES (0 si no hay ninguna). */
  revparCentavos: number;
}

export function calcularMetricasPeriodo(entrada: EntradaMetricasPeriodo): ResultadoMetricasPeriodo {
  if (entrada.nochesOcupadas < 0 || entrada.nochesDisponibles < 0) {
    throw new Error("nochesOcupadas/nochesDisponibles no pueden ser negativas");
  }
  if (entrada.nochesOcupadas > entrada.nochesDisponibles && entrada.nochesDisponibles > 0) {
    throw new Error("nochesOcupadas no puede exceder nochesDisponibles");
  }

  const ocupacionBasisPoints =
    entrada.nochesDisponibles === 0
      ? 0
      : divisionExactaBasisPoints(entrada.nochesOcupadas, entrada.nochesDisponibles);

  const adrCentavos =
    entrada.nochesOcupadas === 0 ? 0 : Math.round(entrada.ingresosBrutosCentavos / entrada.nochesOcupadas);
  const revparCentavos =
    entrada.nochesDisponibles === 0 ? 0 : Math.round(entrada.ingresosBrutosCentavos / entrada.nochesDisponibles);

  return { ocupacionBasisPoints, adrCentavos, revparCentavos };
}

/** `Math.round((a/b)*10000)` expresado con enteros para no depender de la
 * precisión de punto flotante de la división directa en casos límite. */
function divisionExactaBasisPoints(a: number, b: number): number {
  const numerador = BigInt(a) * 10000n;
  const denominador = BigInt(b);
  const cociente = numerador / denominador;
  const resto = numerador % denominador;
  return Number(resto * 2n >= denominador ? cociente + 1n : cociente);
}
