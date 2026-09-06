import { fechaLocalDesdeInstante, fechaLocalDesdeFechaHoraConZona, type FechaLocal } from "@atiende-rv/domain";
import type { ValorFechaIcs } from "./tipos.js";

/**
 * Resuelve un `ValorFechaIcs` a la fecha de calendario local de la
 * PROPIEDAD (REQ-032, RV06-R-08) — nunca a la del servidor ni a UTC sin
 * más. `DATE` ya es una fecha de calendario pura (sin huso) y se usa tal
 * cual (RV06 §10). `DATE-TIME` con TZID o UTC se convierte a la zona de la
 * propiedad; `DATE-TIME` flotante (sin TZID ni `Z`) se interpreta,
 * conservadoramente, como si ya estuviera en la zona de la propiedad (RFC
 * 5545 §3.3.5: una fecha flotante "no está atada a ninguna zona en
 * particular" — la lectura razonable en un feed de disponibilidad de una
 * sola propiedad es que el emisor ya la generó en la hora local del
 * inmueble).
 */
export function resolverFechaLocal(valor: ValorFechaIcs, zonaHorariaPropiedad: string): FechaLocal {
  switch (valor.tipo) {
    case "DATE":
      return valor.fecha;
    case "DATE-TIME-UTC":
      return fechaLocalDesdeInstante(valor.instanteIso, zonaHorariaPropiedad);
    case "DATE-TIME-TZID":
      // D-DSD-01: `fechaHoraLocal` es la hora de pared del evento tal cual
      // viene en el `.ics`, SIN offset — nunca se etiqueta como si fuera
      // un instante UTC. Se resuelve primero contra `valor.tzid` (la zona
      // del propio evento) para obtener el instante UTC real, y SOLO
      // entonces se convierte a `zonaHorariaPropiedad` (nunca se reusa
      // `valor.tzid` como zona destino, aunque coincida con la de la
      // propiedad: la conversión hora-de-pared→instante no es una
      // operación identidad).
      return fechaLocalDesdeFechaHoraConZona(valor.fechaHoraLocal, valor.tzid, zonaHorariaPropiedad);
    case "DATE-TIME-FLOTANTE":
      return valor.fechaHoraLocal.slice(0, 10);
  }
}
