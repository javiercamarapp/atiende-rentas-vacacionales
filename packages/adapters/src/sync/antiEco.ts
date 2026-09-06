import { esUidNamespacePropio } from "../ical/exportador.js";

/**
 * Anti-eco de 3 capas independientes (D-004, H-029, §Calendario-4):
 *   1. `UID`/namespace propio reconocible en el evento entrante.
 *   2. Hash de contenido `(unidad, DTSTART, DTEND, razón)` coincide con lo
 *      que nosotros mismos exportamos recientemente, A CUALQUIER CANAL, para
 *      esa unidad.
 *   3. Metadato "exportado_a": el bloqueo interno candidato (por rango
 *      exacto) ya declara que fue exportado a ALGÚN canal (no
 *      necesariamente el canal por el que estamos importando ahora).
 * Un evento entrante que coincide con CUALQUIERA de las tres nunca se
 * convierte en un nuevo bloqueo `RESERVA_CANAL` (D-004).
 *
 * D-DSD-04: las capas 2 y 3 comparaban originalmente solo contra el canal
 * de DESTINO de la importación actual, así que un bloqueo que exportamos a
 * un canal A y que un canal B nos devolvía reflejado (por ejemplo porque el
 * propietario también conectó B directamente contra A, fuera de nuestro
 * sistema — el escenario textual de D-004: "...o de otro canal a través de
 * él") nunca se detectaba como eco. Corregido: ambas capas ahora comparan
 * contra el conjunto de TODO lo exportado por nosotros a cualquier canal
 * para esa unidad — el canal de origen del rebote es irrelevante para
 * reconocer contenido que nosotros mismos generamos.
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
  /** Hashes de bloqueos que ESTE sistema exportó recientemente a
   * CUALQUIER canal para esta unidad (capa 2) — típicamente la columna
   * `hash_contenido` de `bloqueo_exportado` filtrada solo por unidad, sin
   * filtrar por canal (D-DSD-04: el rebote puede llegar por un canal
   * distinto de aquel al que se exportó). */
  hashesExportadosRecientes: readonly string[];
  /** Para cada bloqueo interno cuyo rango coincide exactamente con el
   * evento entrante, la lista de canales a los que se exportó (capa 3).
   * Basta con que la lista sea no vacía (se exportó a ALGÚN canal) para
   * considerarlo eco — no hace falta que sea el canal actual (D-DSD-04). */
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
      motivo: "hash de contenido coincide con un bloqueo que exportamos recientemente a algún canal",
    };
  }
  if (entrada.canalesExportadosDeRangoCoincidente.length > 0) {
    return {
      esEco: true,
      capa: 3,
      motivo: "el rango coincide exactamente con un bloqueo interno ya exportado a algún canal",
    };
  }
  return { esEco: false, capa: null, motivo: "no coincide con ninguna señal de eco" };
}
