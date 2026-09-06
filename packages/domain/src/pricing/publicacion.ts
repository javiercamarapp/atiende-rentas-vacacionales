import type { ChannelCapabilities } from "../channelAdapter.js";

/**
 * H-069/H-070 (RV13 §3, D-011): publicación de tarifas SOLO hacia
 * adaptadores que declaren `ratesPush: true`. Hoy (Lote 2/3) ningún
 * adaptador real lo declara — iCal nunca transporta tarifas (confirmado con
 * fuente primaria: ausencia de mención en los artículos oficiales de
 * sincronización de calendario de Airbnb/Vrbo, RV13 §3) — así que esta
 * función siempre deniega la publicación hasta que un adaptador de canal
 * real declare la capacidad, y el mensaje se muestra literal en la UI
 * (nunca silenciosamente omitido).
 */
export interface EvaluacionPublicacionTarifa {
  puedePublicar: boolean;
  mensaje: string;
}

export function evaluarPublicacionTarifa(
  canalCodigo: string,
  capacidades: ChannelCapabilities | null,
): EvaluacionPublicacionTarifa {
  if (!capacidades) {
    return {
      puedePublicar: false,
      mensaje: `Canal "${canalCodigo}" sin adaptador de capacidades registrado — tarifas no sincronizables.`,
    };
  }
  if (!capacidades.ratesPush) {
    return {
      puedePublicar: false,
      mensaje:
        `Tarifas no sincronizables por iCal hacia "${canalCodigo}" — ningún adaptador real de Fase 2 declara ` +
        `ratesPush:true (RV13 §3: iCal solo transporta disponibilidad, nunca precio). Publica la tarifa ` +
        `manualmente en el canal, o espera a una integración API certificada (p. ej. Booking.com partner, ` +
        `PENDIENTE).`,
    };
  }
  return { puedePublicar: true, mensaje: `Tarifas sincronizables hacia "${canalCodigo}" vía integración API activa.` };
}

/**
 * H-070: al activar pricing dinámico propio sobre un canal, se debe
 * desactivar explícitamente el pricing nativo del canal (Smart Pricing /
 * MarketMaker), porque ambos anulan reglas externas si quedan activos
 * simultáneamente (RV13-R-04, Airbnb art. 1168/2061, Vrbo MarketMaker).
 * Función pura: solo decide el mensaje/():acción requerida, la mutación real
 * (si el canal la expone vía API) es responsabilidad del adaptador.
 */
export function requiereDesactivarPricingNativo(canalCodigo: string): string {
  return (
    `Antes de publicar tarifas propias en "${canalCodigo}", desactiva el pricing dinámico nativo del canal ` +
    `(Smart Pricing en Airbnb, MarketMaker en Vrbo) — ambos anulan reglas externas si quedan activos (RV13-R-04).`
  );
}
