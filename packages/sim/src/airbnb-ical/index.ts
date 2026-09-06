import { ServidorIcalSimulado, type EscenarioIcalSimulado } from "../comun/servidorIcal.js";
import type { OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: feed iCal de Airbnb. Nunca representa una
 * conexión productiva (D-019); nombre de clase inequívoco a propósito.
 */
export class AirbnbIcalChannelSimulator extends ServidorIcalSimulado {
  constructor(opciones: OpcionesArranqueSimulador = {}) {
    super({ ...opciones, nombreCanal: "airbnb-ical" });
  }
}

export type { EscenarioIcalSimulado };
