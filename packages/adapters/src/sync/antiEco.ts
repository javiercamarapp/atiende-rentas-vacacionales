import { esUidNamespacePropio } from "../ical/exportador.js";

/**
 * Anti-eco de 3 capas independientes (D-004, H-029, §Calendario-4):
 *   1. `UID`/namespace propio reconocible en el evento entrante.
 *   2. Hash de contenido `(unidad, DTSTART, DTEND, razón)` coincide con lo
 *      que nosotros mismos exportamos recientemente a ese canal/unidad.
 *   3. Metadato "exportado_a": el bloqueo interno candidato (por rango
 *      exacto) ya declara que fue exportado a ese canal.
 * Un evento entrante que coincide con CUALQUIERA de las tres nunca se
 * convierte en un nuevo bloqueo `RESERVA_CANAL` (D-004).
 */

export type CapaAntiEco = 1 | 2 | 3;

export interface ResultadoDeteccionEco {
  esEco: boolean;
  capa: CapaAntiEco | null;
  motivo: string;
}

export interface EntradaDeteccionEco {
  uidEntrante: string;
  hashContenidoEntrante: string;
  canalId: string;
  /** Hashes de bloqueos que ESTE sistema exportó recientemente a este
   * canal/unidad (capa 2) — típicamente la columna `hash_contenido` de
   * `bloqueo_exportado` filtrada por canal/unidad. */
  hashesExportadosRecientes: readonly string[];
  /** Para cada bloqueo interno cuyo rango coincide exactamente con el
   * evento entrante, la lista de canales a los que se exportó (capa 3). */
  canalesExportadosDeRangoCoincidente: readonly string[];
}

export function detectarEco(entrada: EntradaDeteccionEco): ResultadoDeteccionEco {
  if (esUidNamespacePropio(entrada.uidEntrante)) {
    return { esEco: true, capa: 1, motivo: "UID entrante lleva el namespace propio de exportación" };
  }
  if (entrada.hashesExportadosRecientes.includes(entrada.hashContenidoEntrante)) {
    return {
      esEco: true,
      capa: 2,
      motivo: "hash de contenido coincide con un bloqueo exportado recientemente a este canal",
    };
  }
  if (entrada.canalesExportadosDeRangoCoincidente.includes(entrada.canalId)) {
    return {
      esEco: true,
      capa: 3,
      motivo: "metadato 'exportado_a' del bloqueo de rango coincidente incluye este canal",
    };
  }
  return { esEco: false, capa: null, motivo: "no coincide con ninguna señal de eco" };
}
