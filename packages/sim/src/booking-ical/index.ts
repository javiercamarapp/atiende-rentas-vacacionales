import { ServidorIcalSimulado, type EscenarioIcalSimulado } from "../comun/servidorIcal.js";
import type { OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: feed iCal de Booking.com. Nunca
 * representa una conexión productiva (D-019). A diferencia de
 * Airbnb/Vrbo, el comportamiento real de este feed NO ESTÁ VERIFICADO
 * (D-011): este simulador es una aproximación de ingeniería para poder
 * probar el motor de sincronización contra ALGÚN feed de Booking.com,
 * nunca una representación fiel de un comportamiento observado. Toda
 * superficie que consuma este simulador debe seguir mostrando el aviso
 * "frecuencia/elegibilidad no verificadas" (`AVISO_ICAL_BOOKING` en
 * `@atiende-rv/adapters`), nunca tratar sus escenarios como equivalentes a
 * evidencia real de Booking.com.
 */
export class BookingIcalChannelSimulator extends ServidorIcalSimulado {
  constructor(opciones: OpcionesArranqueSimulador = {}) {
    super({ ...opciones, nombreCanal: "booking-ical (frecuencia/elegibilidad NO verificadas)" });
  }
}

export type { EscenarioIcalSimulado };
