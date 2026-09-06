import { ServidorIcalSimulado, type EscenarioIcalSimulado } from "../comun/servidorIcal.js";
import type { OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: "calendar link" de Agoda (Nivel A,
 * RV22 §2.8), funcionalmente equivalente a un feed iCal. Nunca representa
 * una conexión productiva (D-019); nombre de clase inequívoco a
 * propósito.
 */
export class AgodaIcalChannelSimulator extends ServidorIcalSimulado {
  constructor(opciones: OpcionesArranqueSimulador = {}) {
    super({ ...opciones, nombreCanal: "agoda-ical" });
  }
}

export type { EscenarioIcalSimulado };
