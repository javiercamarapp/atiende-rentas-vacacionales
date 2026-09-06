/**
 * H-071 (BACKLOG E11, REQ-135, §Pricing-2, RV13-R-04/R-06): comparador de
 * PARIDAD DE PRECIOS entre canales. Dado el precio directo de referencia
 * (sin comisión de OTA) y el markup por comisión de RV13 que cada canal
 * debería llevar (`ReglaCanal.markupBasisPoints`, ya usado por
 * `calcularCotizacion` — ver `cotizacion.ts`), calcula el precio ESPERADO
 * por canal y lo compara contra el precio realmente PUBLICADO hoy en ese
 * canal (dato externo: viene de import de tarifas o de captura manual,
 * nunca de este módulo).
 *
 * Regla de oro explícita: esta función SOLO detecta y PROPONE — nunca
 * publica nada. `ViolacionParidad.propuesta` es un precio candidato para
 * que un humano (o `evaluarPublicacionTarifa`, que ya bloquea toda
 * publicación automática hasta que un canal real declare `ratesPush`)
 * decida qué hacer. No hay ninguna función en este archivo que escriba a
 * un canal.
 */
import { aplicarPorcentaje } from "../finanzas/redondeo.js";
import type { ReglaCanal } from "./tipos.js";

export interface PrecioPublicadoCanal {
  canalCodigo: string;
  /** Precio por noche que el canal muestra HOY al huésped (dato externo:
   * import de tarifas o captura manual — nunca calculado aquí). */
  precioNocheCentavos: number;
  /** Regla de markup RV13 que debería aplicar a este canal; `null` si el
   * canal no tiene regla configurada (se compara 1:1 contra el precio de
   * referencia, sin markup esperado). */
  reglaCanal: ReglaCanal | null;
}

export interface ConfiguracionParidad {
  /** Precio directo de referencia (canal propio/reserva directa, sin
   * comisión de ninguna OTA) contra el que se mide paridad. */
  precioReferenciaNocheCentavos: number;
  /**
   * Tolerancia máxima de desviación permitida antes de marcarla como
   * violación, en basis points sobre el precio ESPERADO (no sobre el de
   * referencia) — configurable por tenant/unidad, RV13-R-04 no fija un
   * número único de industria. Ej.: 300 = tolera hasta 3% de diferencia.
   */
  toleranciaBasisPoints: number;
}

export interface ViolacionParidad {
  canalCodigo: string;
  precioReferenciaNocheCentavos: number;
  /** Precio de referencia + markup RV13 de `reglaCanal` (o igual a la
   * referencia si el canal no tiene regla configurada). */
  precioEsperadoNocheCentavos: number;
  precioPublicadoNocheCentavos: number;
  /** Firmado: positivo = publicado por ENCIMA de lo esperado (probable
   * pérdida de paridad hacia el canal, riesgo de penalización algorítmica
   * en Airbnb/Vrbo por precio más caro que el directo); negativo = por
   * DEBAJO (subsidiando la comisión del canal sin querer). */
  diferenciaBasisPoints: number;
  propuesta: {
    /** Precio candidato que llevaría al canal exactamente al precio
     * esperado (markup RV13 correcto) — una PROPUESTA, nunca se publica
     * desde aquí. */
    precioPropuestoNocheCentavos: number;
    mensaje: string;
  };
}

function precioEsperado(precioReferenciaCentavos: number, reglaCanal: ReglaCanal | null): number {
  if (!reglaCanal || !reglaCanal.activo) return precioReferenciaCentavos;
  return precioReferenciaCentavos + aplicarPorcentaje(precioReferenciaCentavos, reglaCanal.markupBasisPoints);
}

/** Diferencia en basis points de `publicado` respecto a `esperado`,
 * redondeada al entero más cercano (half-up estándar de JS en valores
 * positivos; el signo se preserva para distinguir "más caro" de "más
 * barato" — ver `ViolacionParidad.diferenciaBasisPoints`). */
function diferenciaBasisPoints(publicadoCentavos: number, esperadoCentavos: number): number {
  if (esperadoCentavos === 0) return publicadoCentavos === 0 ? 0 : 10000;
  return Math.round(((publicadoCentavos - esperadoCentavos) / esperadoCentavos) * 10000);
}

/**
 * Detecta violaciones de paridad configurables. Nunca lanza, nunca
 * publica — solo compara y propone. El orden del resultado respeta el
 * orden de `entradas`.
 */
export function detectarViolacionesParidad(
  entradas: PrecioPublicadoCanal[],
  config: ConfiguracionParidad,
): ViolacionParidad[] {
  const violaciones: ViolacionParidad[] = [];
  for (const entrada of entradas) {
    const esperado = precioEsperado(config.precioReferenciaNocheCentavos, entrada.reglaCanal);
    const diferencia = diferenciaBasisPoints(entrada.precioNocheCentavos, esperado);
    if (Math.abs(diferencia) <= config.toleranciaBasisPoints) continue;

    const sentido = diferencia > 0 ? "por ENCIMA" : "por DEBAJO";
    violaciones.push({
      canalCodigo: entrada.canalCodigo,
      precioReferenciaNocheCentavos: config.precioReferenciaNocheCentavos,
      precioEsperadoNocheCentavos: esperado,
      precioPublicadoNocheCentavos: entrada.precioNocheCentavos,
      diferenciaBasisPoints: diferencia,
      propuesta: {
        precioPropuestoNocheCentavos: esperado,
        mensaje:
          `"${entrada.canalCodigo}" está ${sentido} del precio esperado por ` +
          `${Math.abs(diferencia)} bp (tolerancia configurada: ${config.toleranciaBasisPoints} bp). ` +
          `Propuesta: ajustar a ${(esperado / 100).toFixed(2)} por noche — requiere confirmación humana, ` +
          `esta función nunca publica automáticamente.`,
      },
    });
  }
  return violaciones;
}
