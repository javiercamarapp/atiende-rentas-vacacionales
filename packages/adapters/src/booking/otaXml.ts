/**
 * Construcción/parseo de la spec pública B.XML/OTA de Booking.com (Nivel
 * B, RV04): `roomstosell`, `closedonarrival`/`closedondeparture` (CTA/CTD
 * independientes), `minimumstay(_arrival)`/`maximumstay(_arrival)`,
 * `closed` (RV04 F09) — construido contra la spec, funcional contra
 * `BookingApiSimulator` (`@atiende-rv/sim`), pero SIN conexión real: el
 * Connectivity Partner Program de Booking.com está pausado a nuevos
 * proveedores (D-011, `MOTIVO_PARTNER_PENDIENTE_BOOKING` en
 * `./adapter.ts`). Nunca se envía a `connect.booking.com` sin
 * `partnerAprobado` real (D-017).
 *
 * RV04 F09 documenta el máximo de `roomstosell`: 254, con 255 usado como
 * "ilimitado" y cualquier valor mayor a 255 auto-reseteado a 254 por
 * Booking.com — este builder VALIDA ese límite en vez de confiar en que
 * el receptor lo corrija en silencio (mismo criterio de "nunca dato falso
 * al usuario" que el resto del proyecto).
 */
export const ROOMSTOSELL_MAXIMO = 254;
export const ROOMSTOSELL_ILIMITADO = 255;

export interface RestriccionDisponibilidadBooking {
  unidadExternaId: string;
  fecha: string; // ISO AAAA-MM-DD
  roomstosell: number; // 0-254, o ROOMSTOSELL_ILIMITADO
  closed: boolean;
  closedonarrival?: boolean;
  closedondeparture?: boolean;
  minimumstay?: number;
  maximumstay?: number;
  minimumstayArrival?: number;
  maximumstayArrival?: number;
}

export class RoomsToSellInvalidoError extends Error {}

function validarRoomstosell(valor: number): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new RoomsToSellInvalidoError(`roomstosell debe ser un entero >= 0, recibido ${valor}`);
  }
  if (valor > ROOMSTOSELL_ILIMITADO) {
    // RV04 F09: Booking.com auto-resetea a 254 cualquier valor > 255 — en
    // vez de dejar que el receptor "corrija en silencio" un dato que
    // nosotros mismos generamos mal, se rechaza aquí explícitamente.
    throw new RoomsToSellInvalidoError(
      `roomstosell=${valor} excede el máximo documentado (254, o 255="ilimitado"; RV04 F09) — Booking.com lo ` +
        `resetearía en silencio a 254, esta librería lo rechaza en vez de generar ese dato engañoso`,
    );
  }
}

function xmlEscape(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Construye el cuerpo `OTA_HotelAvailNotifRQ` de disponibilidad/
 * restricciones/roomstosell (RV04 F09) para un lote de fechas — la
 * variante OTA exacta de campo por campo no fue confirmada con el mismo
 * detalle que B.XML en la investigación (RV04 §8.5), así que este builder
 * usa los NOMBRES DE CAMPO citados textualmente en la fuente
 * (`roomstosell`, `closedonarrival`, `closedondeparture`, `minimumstay`,
 * `maximumstay`, `closed`) dentro de un envoltorio `OTA_HotelAvailNotifRQ`
 * — el nombre del mensaje pedido por esta construcción — sin inventar
 * ningún atributo adicional no citado por la fuente.
 */
export function construirOtaHotelAvailNotifRq(restricciones: readonly RestriccionDisponibilidadBooking[]): string {
  const filas = restricciones
    .map((r) => {
      validarRoomstosell(r.roomstosell);
      const atributos: string[] = [
        `RoomExternalId="${xmlEscape(r.unidadExternaId)}"`,
        `Fecha="${r.fecha}"`,
        `roomstosell="${r.roomstosell}"`,
        `closed="${r.closed ? "1" : "0"}"`,
      ];
      if (r.closedonarrival !== undefined) atributos.push(`closedonarrival="${r.closedonarrival ? "1" : "0"}"`);
      if (r.closedondeparture !== undefined) atributos.push(`closedondeparture="${r.closedondeparture ? "1" : "0"}"`);
      if (r.minimumstay !== undefined) atributos.push(`minimumstay="${r.minimumstay}"`);
      if (r.maximumstay !== undefined) atributos.push(`maximumstay="${r.maximumstay}"`);
      if (r.minimumstayArrival !== undefined) atributos.push(`minimumstay_arrival="${r.minimumstayArrival}"`);
      if (r.maximumstayArrival !== undefined) atributos.push(`maximumstay_arrival="${r.maximumstayArrival}"`);
      return `    <AvailStatusMessage ${atributos.join(" ")} />`;
    })
    .join("\n");
  return `<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05">\n  <AvailStatusMessages>\n${filas}\n  </AvailStatusMessages>\n</OTA_HotelAvailNotifRQ>`;
}

export interface TarifaBooking {
  unidadExternaId: string;
  fecha: string;
  montoBase: number;
  moneda: string;
}

/**
 * `OTA_HotelRateAmountNotifRQ` opcional (RV22, tarifas) — igual criterio
 * de nombres de campo citados textualmente por la fuente, sin inventar
 * atributos adicionales.
 */
export function construirOtaHotelRateAmountNotifRq(tarifas: readonly TarifaBooking[]): string {
  const filas = tarifas
    .map(
      (t) =>
        `    <Rate RoomExternalId="${xmlEscape(t.unidadExternaId)}" Fecha="${t.fecha}" ` +
        `BaseAmount="${t.montoBase.toFixed(2)}" CurrencyCode="${xmlEscape(t.moneda)}" />`,
    )
    .join("\n");
  return `<OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05">\n  <RateAmountMessages>\n${filas}\n  </RateAmountMessages>\n</OTA_HotelRateAmountNotifRQ>`;
}

export type EstadoReservaBookingOta = "new" | "modified" | "cancelled";

export interface ReservaBookingOta {
  reservationId: string;
  unidadExternaId: string;
  checkIn: string;
  checkOut: string;
  status: EstadoReservaBookingOta;
  totalCancellationFee?: number;
}

/** Forma mínima que expone `BookingApiSimulator` (`@atiende-rv/sim`,
 * `packages/sim/src/booking-api/index.ts`) — JSON en vez de XML real por
 * simplicidad de implementación del simulador (documentado ahí). Este
 * módulo NO importa `@atiende-rv/sim` (dirección de dependencia inversa:
 * sim depende de adapters, nunca al revés) — declara su propia forma
 * estructural equivalente. */
export interface ReservaSimuladaComoOta {
  id: string;
  unidadExternaId: string;
  checkIn: string;
  checkOut: string;
  estado: "CONFIRMADA" | "CANCELADA";
}

/**
 * Traduce la forma simplificada del simulador a `ReservaBookingOta` — el
 * mismo tipo que usaría un parser real de `GET OTA_HotelResNotif` (RV04
 * F06/F07), con los NOMBRES de campo citados textualmente por la fuente
 * (`status` con `new`/`modified`/`cancelled`). Punto de reemplazo único
 * cuando exista un parser XML real contra credenciales de partner: el
 * resto del adaptador consume siempre `ReservaBookingOta`, nunca la forma
 * del simulador directamente.
 */
export function mapearReservaSimuladaAOta(reserva: ReservaSimuladaComoOta): ReservaBookingOta {
  return {
    reservationId: reserva.id,
    unidadExternaId: reserva.unidadExternaId,
    checkIn: reserva.checkIn,
    checkOut: reserva.checkOut,
    status: reserva.estado === "CANCELADA" ? "cancelled" : "new",
  };
}
