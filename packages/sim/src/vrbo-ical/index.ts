import { ServidorIcalSimulado, type EscenarioIcalSimulado } from "../comun/servidorIcal.js";
import type { OpcionesArranqueSimulador } from "../comun/etiquetado.js";

/**
 * SIMULADOR — desarrollo/pruebas: feed iCal de Vrbo. Nunca representa una
 * conexión productiva (D-019).
 */
export class VrboIcalChannelSimulator extends ServidorIcalSimulado {
  constructor(opciones: OpcionesArranqueSimulador = {}) {
    super({ ...opciones, nombreCanal: "vrbo-ical" });
  }
}

export type { EscenarioIcalSimulado };
