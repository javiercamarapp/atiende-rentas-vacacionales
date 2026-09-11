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
 *
 * Cierre de la brecha declarada en Lote 7 (`docs/fase2/BACKLOG.md` H-072:
 * "no cruza `tarea_limpieza` de Lote 5"): `nochesBloqueadasPorLimpiezaPendiente`
 * cruza el estado REAL de `tarea_operativa` (tipo='limpieza') — noches en
 * las que la unidad, dentro del periodo, sigue fuera de venta porque su
 * tarea de limpieza de turnover no se ha completado (`buffer_ocupacion_id`
 * en `tarea_operativa`, Lote 5) — nunca una cifra decorativa: si el
 * llamador no cruza este dato (valor por defecto 0), el resultado es
 * idéntico al de antes de H-072.
 */
export interface EntradaMetricasPeriodo {
  /** Ingreso bruto total del periodo, en centavos. */
  ingresosBrutosCentavos: number;
  /** Noches efectivamente ocupadas (capa='reserva', bloqueante=true). */
  nochesOcupadas: number;
  /** Noches disponibles totales (unidades activas × noches del periodo). */
  nochesDisponibles: number;
  /**
   * H-072: noches del periodo en las que la unidad está fuera de venta
   * porque una tarea de limpieza (`tarea_operativa.tipo = 'limpieza'`) que
   * la bloquea (su `buffer_ocupacion_id`) sigue sin completarse
   * (`estado NOT IN ('completada', 'cancelada')`) — dato real cruzado
   * desde Lote 5, nunca estimado. Opcional; por defecto 0.
   */
  nochesBloqueadasPorLimpiezaPendiente?: number;
}

export interface ResultadoMetricasPeriodo {
  /** Basis points: 10000 = 100% de ocupación. */
  ocupacionBasisPoints: number;
  /** ADR en centavos: ingresos / noches OCUPADAS (0 si no hubo ninguna). */
  adrCentavos: number;
  /** RevPAR en centavos: ingresos / noches DISPONIBLES (0 si no hay ninguna). */
  revparCentavos: number;
  /**
   * H-072: noches realmente vendibles del periodo = `nochesDisponibles`
   * menos las bloqueadas por limpieza pendiente — nunca por debajo de
   * `nochesOcupadas` (una noche ya vendida fue, por definición, vendible).
   */
  nochesDisponiblesVendibles: number;
  /**
   * H-072: RevPAR calculado sobre `nochesDisponiblesVendibles` en vez del
   * total de noches del periodo — ingresos por noche REALMENTE vendible,
   * penalizando el inventario que la limpieza pendiente deja fuera de
   * venta en vez de tratarlo como disponible. Igual a `revparCentavos`
   * cuando no hay noches bloqueadas por limpieza.
   */
  revparAjustadoLimpiezaCentavos: number;
}

export function calcularMetricasPeriodo(entrada: EntradaMetricasPeriodo): ResultadoMetricasPeriodo {
  const nochesBloqueadasPorLimpiezaPendiente = entrada.nochesBloqueadasPorLimpiezaPendiente ?? 0;
  if (entrada.nochesOcupadas < 0 || entrada.nochesDisponibles < 0 || nochesBloqueadasPorLimpiezaPendiente < 0) {
    throw new Error("nochesOcupadas/nochesDisponibles/nochesBloqueadasPorLimpiezaPendiente no pueden ser negativas");
  }
  if (entrada.nochesOcupadas > entrada.nochesDisponibles && entrada.nochesDisponibles > 0) {
    throw new Error("nochesOcupadas no puede exceder nochesDisponibles");
  }
  if (nochesBloqueadasPorLimpiezaPendiente > entrada.nochesDisponibles) {
    throw new Error("nochesBloqueadasPorLimpiezaPendiente no puede exceder nochesDisponibles");
  }

  const ocupacionBasisPoints =
    entrada.nochesDisponibles === 0
      ? 0
      : divisionExactaBasisPoints(entrada.nochesOcupadas, entrada.nochesDisponibles);

  const adrCentavos =
    entrada.nochesOcupadas === 0 ? 0 : Math.round(entrada.ingresosBrutosCentavos / entrada.nochesOcupadas);
  const revparCentavos =
    entrada.nochesDisponibles === 0 ? 0 : Math.round(entrada.ingresosBrutosCentavos / entrada.nochesDisponibles);

  const nochesDisponiblesVendibles = Math.max(
    entrada.nochesOcupadas,
    entrada.nochesDisponibles - nochesBloqueadasPorLimpiezaPendiente,
  );
  const revparAjustadoLimpiezaCentavos =
    nochesDisponiblesVendibles === 0 ? 0 : Math.round(entrada.ingresosBrutosCentavos / nochesDisponiblesVendibles);

  return { ocupacionBasisPoints, adrCentavos, revparCentavos, nochesDisponiblesVendibles, revparAjustadoLimpiezaCentavos };
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
