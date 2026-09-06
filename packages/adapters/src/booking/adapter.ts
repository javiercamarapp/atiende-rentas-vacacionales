import type { ChannelAdapter, ChannelCapabilities, EstadoConexionCanal } from "@atiende-rv/domain";

/**
 * Adaptador real de Booking.com (H-023, D-011). A diferencia de
 * Airbnb/Vrbo, Booking.com NO tiene una vía directa de disponibilidad para
 * este producto:
 *   - El Connectivity Partner Program de Booking.com está PAUSADO a nuevos
 *     proveedores ("we are pausing integrations with new connectivity
 *     providers until further notice", D-011, evidencia B-002 en vivo
 *     2026-09-05) — puerta cerrada HOY, no solo "sin aprobar".
 *   - Booking.com no acepta conexiones directas de propiedades/gestores
 *     individuales bajo ninguna circunstancia, aunque la pausa se
 *     levantara ("We don't accept direct connections from individual
 *     properties right now, but you can connect via a channel manager.").
 *   - El iCal de Booking.com no tiene NINGUNA evidencia primaria
 *     (`partner.booking.com`/`partnerhelp.booking.com` inaccesibles, cero
 *     capturas de Wayback Machine): elegibilidad, frecuencia y contenido
 *     del feed son DESCONOCIDOS, nunca se presenta una cifra de latencia
 *     para este canal.
 *
 * Actualización Lote 3.4 (RV22-R-03, Fase 3): el adaptador ahora está
 * COMPLETO contra la spec pública OTA/B.XML (RV04) — construcción de
 * `OTA_HotelAvailNotifRQ` para disponibilidad/restricciones/roomstosell,
 * `OTA_HotelRateAmountNotifRQ` opcional para tarifas, y pull de reservas
 * con `ack` (`./otaXml.ts`), funcional contra `BookingApiSimulator`
 * (`@atiende-rv/sim`) — pero `availabilityPush`/`ratesPush`/
 * `reservationsPull` se declaran `true` porque así lo documenta la SPEC
 * del canal (RV04 F09), no porque haya una conexión real: el
 * Connectivity Partner Program de Booking.com sigue PAUSADO a nuevos
 * proveedores (D-011, reconfirmado 2026-09-06, F03) y las propiedades
 * individuales nunca conectan directo bajo ninguna circunstancia — el
 * estado honesto (`obtenerEstadoConexion`) sigue siendo SIEMPRE
 * `partner_pendiente`, nunca `sandbox`/`producción`, independientemente
 * de que el código exista y esté probado contra el simulador (D-017).
 */
export const CAPACIDADES_BOOKING_DIRECTO: ChannelCapabilities = {
  availabilityPush: true,
  ratesPush: true,
  reservationsPull: true,
  icalImportExport: true,
  messaging: false,
};

export const MOTIVO_PARTNER_PENDIENTE_BOOKING =
  "Booking pausa nuevos connectivity providers (D-011, evidencia B-002 2026-09-05)";

export const AVISO_ICAL_BOOKING =
  "iCal de Booking.com: frecuencia y elegibilidad NO VERIFICADAS (sin fuente primaria, D-011). " +
  "No se presenta ninguna cifra de latencia para este canal.";

/**
 * Punto de extensión, sin implementación, para delegar disponibilidad a un
 * channel manager certificado de terceros (D-011, RV08 §2). Fase 2 no
 * implementa ningún channel manager — este tipo existe únicamente para que
 * un futuro adaptador concreto (`GuestyChannelManagerBridge`, etc.) pueda
 * satisfacerlo sin romper el contrato de Booking.com.
 */
export interface ChannelManagerCertificadoBridge {
  readonly nombreProveedor: string;
  push(unidadId: string): Promise<never>;
}

export class BookingChannelAdapter implements ChannelAdapter {
  readonly nombreCanal = "booking";
  readonly capacidades = CAPACIDADES_BOOKING_DIRECTO;
  readonly motivoPartnerPendiente = MOTIVO_PARTNER_PENDIENTE_BOOKING;
  readonly avisoIcal = AVISO_ICAL_BOOKING;

  /** Sin channel manager certificado configurado en Fase 2 (D-011): la
   * única salida honesta del estado de conexión es `partner_pendiente`,
   * nunca `sandbox`/`producción` sin evidencia real de un intermediario
   * certificado. */
  constructor(private readonly channelManagerBridge: ChannelManagerCertificadoBridge | null = null) {}

  obtenerEstadoConexion(): EstadoConexionCanal {
    if (this.channelManagerBridge) {
      // Punto de extensión futuro: aun con bridge configurado, sin
      // evidencia de sync real reciente el estado honesto sigue siendo
      // partner_pendiente (D-017) — no implementado en Fase 2.
      return "partner_pendiente";
    }
    return "partner_pendiente";
  }
}

export {
  construirOtaHotelAvailNotifRq,
  construirOtaHotelRateAmountNotifRq,
  mapearReservaSimuladaAOta,
  ROOMSTOSELL_MAXIMO,
  ROOMSTOSELL_ILIMITADO,
  RoomsToSellInvalidoError,
} from "./otaXml.js";
export type {
  RestriccionDisponibilidadBooking,
  TarifaBooking,
  ReservaBookingOta,
  EstadoReservaBookingOta,
  ReservaSimuladaComoOta,
} from "./otaXml.js";
