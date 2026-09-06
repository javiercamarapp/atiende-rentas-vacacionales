import { Temporal } from "@js-temporal/polyfill";
import { aplicarPorcentaje, restarCentavos, sumarCentavos } from "../finanzas/redondeo.js";
import { nochesDelRango, rangoCubreNoche } from "../fechas.js";
import type {
  DesgloseNoche,
  EntradaCotizacion,
  ReglaMinStay,
  ResultadoCotizacion,
  ViolacionMinStay,
} from "./tipos.js";

/**
 * Cotización determinista de una estadía en reserva directa (H-068, RV13
 * §1). Puramente aditiva noche a noche (precio base o temporada) + un único
 * descuento por duración (el de mayor umbral de noches que se cumpla, sin
 * acumular varios — mismo criterio documentado por Airbnb rule-sets: "solo
 * se aplica el descuento mayor dentro de una misma categoría") + markup de
 * canal opcional. Nunca usa aritmética de punto flotante (packages/domain/
 * src/finanzas/redondeo.ts).
 */
export function calcularCotizacion(entrada: EntradaCotizacion): ResultadoCotizacion {
  const { contexto, rango, reglaCanal } = entrada;
  const noches = nochesDelRango(rango);
  if (noches.length === 0) {
    throw new Error("El rango de cotización no cubre ninguna noche");
  }

  const desgloseNoches: DesgloseNoche[] = noches.map((fecha) => {
    const temporada = contexto.temporadas.find((t) => rangoCubreNoche(t.rango, fecha));
    if (temporada) {
      return {
        fecha,
        precioCentavos: temporada.precioNocheCentavos,
        origen: "temporada" as const,
        temporadaNombre: temporada.nombre,
      };
    }
    return { fecha, precioCentavos: contexto.precioBaseNocheCentavos, origen: "base" as const };
  });

  const subtotalAntesDescuentoCentavos = sumarCentavos(...desgloseNoches.map((n) => n.precioCentavos));

  // Descuento por duración: el umbral de noches mínimas más alto que se
  // cumpla, nunca acumulado con otros (RV13-R-02).
  const descuentoElegible = [...contexto.descuentosDuracion]
    .filter((d) => noches.length >= d.nochesMinimas)
    .sort((a, b) => b.nochesMinimas - a.nochesMinimas)[0];

  const descuentoMontoCentavos = descuentoElegible
    ? aplicarPorcentaje(subtotalAntesDescuentoCentavos, descuentoElegible.porcentajeDescuentoBasisPoints)
    : 0;

  const subtotalConDescuentoCentavos = restarCentavos(subtotalAntesDescuentoCentavos, descuentoMontoCentavos);

  const markupCanalCentavos =
    reglaCanal && reglaCanal.activo
      ? aplicarPorcentaje(subtotalConDescuentoCentavos, reglaCanal.markupBasisPoints)
      : 0;

  const totalCentavos = sumarCentavos(subtotalConDescuentoCentavos, markupCanalCentavos);

  const violacionesMinStay = evaluarViolacionesMinStay(contexto.reglasMinStay, rango, noches.length);

  return {
    unidadId: contexto.unidadId,
    moneda: contexto.moneda,
    noches: noches.length,
    desgloseNoches,
    subtotalAntesDescuentoCentavos,
    descuentoAplicado: descuentoElegible
      ? {
          nochesMinimas: descuentoElegible.nochesMinimas,
          porcentajeDescuentoBasisPoints: descuentoElegible.porcentajeDescuentoBasisPoints,
          fuente: descuentoElegible.fuente,
          montoCentavos: descuentoMontoCentavos,
        }
      : null,
    subtotalConDescuentoCentavos,
    markupCanalCentavos,
    totalCentavos,
    violacionesMinStay,
  };
}

/**
 * Min-stay dinámico por fecha de check-in y día de la semana (RV13-R-03,
 * replicando a Vrbo: "the minimum night stay requirement is based on the
 * check-in date"). Solo evalúa reglas cuyo rango cubre la fecha de
 * check-in de la cotización — nunca informativo para fechas fuera del
 * rango solicitado.
 */
export function evaluarViolacionesMinStay(
  reglas: ReglaMinStay[],
  rango: { inicio: string; fin: string },
  nochesSolicitadas: number,
): ViolacionMinStay[] {
  const checkIn = Temporal.PlainDate.from(rango.inicio);
  const diaSemanaCheckIn = checkIn.dayOfWeek % 7; // Temporal: 1=lunes..7=domingo → 0=domingo..6=sábado

  return reglas
    .filter((r) => rangoCubreNoche(r.rango, rango.inicio))
    .filter((r) => r.diaSemanaCheckIn === null || r.diaSemanaCheckIn === diaSemanaCheckIn)
    .filter((r) => nochesSolicitadas < r.nochesMinimas)
    .map((regla) => ({ regla, nochesSolicitadas }));
}
