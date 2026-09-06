import { aplicarPorcentaje, restarCentavos, sumarCentavos } from "./redondeo.js";
import type { EntradaMovimientoReserva, MovimientoFinancieroReserva } from "./tipos.js";

/**
 * Calcula el movimiento financiero de UNA reserva (H-062/H-063, RV12 §2.1,
 * Finanzas-1). Punto crítico de diseño citado explícitamente en RV12 §2.1 y
 * en `docs/fase2/LOTES.md` (entregable verificable del Lote 7): si el canal
 * ya entrega el monto neto de su comisión (Airbnb confirmado, L-RV12-02),
 * este cálculo NUNCA vuelve a restar la comisión de canal sobre el bruto
 * original — parte directamente del monto ya recibido.
 */
export function calcularMovimientoReserva(entrada: EntradaMovimientoReserva): MovimientoFinancieroReserva {
  if (entrada.montoBrutoCentavos < 0) {
    throw new Error("montoBrutoCentavos no puede ser negativo");
  }

  const { comisionCanal } = entrada;
  let comisionCanalCentavos: number;
  let montoRecibidoCentavos: number;

  if (comisionCanal.yaNetoDeComision) {
    // Finanzas-1: no hay doble descuento. El monto de entrada YA es lo que
    // el gestor recibió; la comisión de canal no se resta de nuevo (se
    // reporta en 0, con la fuente documentada para trazabilidad, nunca
    // inventando un bruto anterior que Atiende no puede verificar).
    comisionCanalCentavos = 0;
    montoRecibidoCentavos = entrada.montoBrutoCentavos;
  } else {
    comisionCanalCentavos = aplicarPorcentaje(entrada.montoBrutoCentavos, comisionCanal.comisionBasisPoints);
    montoRecibidoCentavos = restarCentavos(entrada.montoBrutoCentavos, comisionCanalCentavos);
  }

  const baseComisionGestor =
    entrada.comisionGestor.base === "bruto" ? entrada.montoBrutoCentavos : montoRecibidoCentavos;
  const comisionGestorCentavos = aplicarPorcentaje(baseComisionGestor, entrada.comisionGestor.basisPoints);

  const gastosCentavos = sumarCentavos(...entrada.gastos.map((g) => g.montoCentavos));
  const impuestosCentavos = sumarCentavos(...entrada.impuestos.map((i) => i.montoCentavos));

  const netoCentavos = restarCentavos(montoRecibidoCentavos, comisionGestorCentavos, gastosCentavos, impuestosCentavos);

  return {
    ocupacionUnidadId: entrada.ocupacionUnidadId,
    moneda: entrada.moneda,
    ingresoBrutoCentavos: entrada.montoBrutoCentavos,
    montoRecibidoCentavos,
    comisionCanalCentavos,
    comisionCanalFuente: comisionCanal.fuente,
    comisionGestorCentavos,
    gastosCentavos,
    impuestosCentavos,
    netoCentavos,
  };
}
