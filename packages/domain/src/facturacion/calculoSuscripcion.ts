import { sumarCentavos } from "../finanzas/redondeo.js";
import type { AddOnIa, DesgloseSuscripcion, PlanFacturacion } from "./tipos.js";

/**
 * Calcula el cargo mensual de una suscripción: unidades activas
 * distribuidas por escalón (precio marginal decreciente, RV16-R-01) +
 * add-ons de IA activos (RV16-R-02) — TODO en centavos enteros, cero
 * punto flotante (reusa `sumarCentavos` de `finanzas/redondeo.ts`, el
 * mismo formateador único de dinero de todo el repo).
 *
 * Criterio de escalones — "marginal", no "todo al precio del escalón
 * alcanzado": las primeras `hastaUnidades` unidades pagan el precio de
 * ESE escalón, las siguientes pagan el del escalón siguiente, etc. (el
 * mismo patrón que un impuesto progresivo) — nunca "si tienes 31
 * unidades, las 31 pagan el precio del escalón de 30+", que penalizaría
 * absurdamente cruzar un umbral por una sola unidad.
 */
export function calcularDesgloseSuscripcion(params: {
  plan: PlanFacturacion;
  unidadesActivas: number;
  addOnsActivos: string[];
}): DesgloseSuscripcion {
  const { plan, unidadesActivas, addOnsActivos } = params;

  if (!Number.isInteger(unidadesActivas) || unidadesActivas < 0) {
    throw new Error(`unidadesActivas debe ser un entero >= 0, recibido: ${unidadesActivas}`);
  }

  const lineasEscalon: DesgloseSuscripcion["lineasEscalon"] = [];
  let unidadesRestantes = unidadesActivas;
  let pisoAnterior = 0;

  for (const escalon of plan.escalones) {
    if (unidadesRestantes <= 0) break;
    const techoEscalon = escalon.hastaUnidades ?? Number.POSITIVE_INFINITY;
    const capacidadEscalon = techoEscalon - pisoAnterior;
    const unidadesEnEscalon = Math.min(unidadesRestantes, capacidadEscalon);

    if (unidadesEnEscalon > 0) {
      lineasEscalon.push({
        hastaUnidades: escalon.hastaUnidades,
        unidades: unidadesEnEscalon,
        precioCentavosPorUnidad: escalon.precioCentavosPorUnidad,
        subtotalCentavos: unidadesEnEscalon * escalon.precioCentavosPorUnidad,
      });
    }

    unidadesRestantes -= unidadesEnEscalon;
    pisoAnterior = techoEscalon;
  }

  if (unidadesRestantes > 0) {
    throw new Error(
      `El catálogo de escalones de "${plan.codigo}" no cubre ${unidadesActivas} unidades — falta un ` +
        `escalón final con hastaUnidades: null. Revisa packages/domain/src/facturacion/planes.ts o la fila ` +
        `de plan_facturacion en base de datos.`,
    );
  }

  const subtotalUnidadesCentavos = sumarCentavos(...lineasEscalon.map((l) => l.subtotalCentavos));

  const addOnsPorCodigo = new Map<string, AddOnIa>(plan.addOnsDisponibles.map((a) => [a.codigo, a]));
  const lineasAddOns: DesgloseSuscripcion["lineasAddOns"] = [];
  for (const codigo of addOnsActivos) {
    const addOn = addOnsPorCodigo.get(codigo);
    if (!addOn) {
      throw new Error(`Add-on "${codigo}" no está disponible en el plan "${plan.codigo}"`);
    }
    lineasAddOns.push({ codigo: addOn.codigo, nombre: addOn.nombre, precioCentavosMes: addOn.precioCentavosMes });
  }
  const subtotalAddOnsCentavos = sumarCentavos(...lineasAddOns.map((l) => l.precioCentavosMes));

  return {
    planCodigo: plan.codigo,
    unidadesFacturadas: unidadesActivas,
    lineasEscalon,
    subtotalUnidadesCentavos,
    lineasAddOns,
    subtotalAddOnsCentavos,
    totalCentavos: sumarCentavos(subtotalUnidadesCentavos, subtotalAddOnsCentavos),
    moneda: plan.moneda,
  };
}
