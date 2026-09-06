import { Temporal } from "@js-temporal/polyfill";
import type { FechaLocal, RangoFechas } from "../tipos.js";

/**
 * Buffer de limpieza checkout↔check-in (H-050, REQ-054/REQ-112): capa
 * `BUFFER_LIMPIEZA` propia del calendario (`packages/domain/src/tipos.ts`,
 * ya existente desde Lote 1), configurable por propiedad
 * (`bufferLimpiezaNoches`, 0 = sin buffer). El rango resultante se inserta
 * siempre vía `crearBloqueo` (Lote 1, `aplicacion/reservas.ts`) — este
 * módulo solo calcula el rango `[checkout, checkout + n noches)`, nunca toca
 * base de datos.
 */
export function calcularRangoBuffer(fechaCheckout: FechaLocal, bufferNoches: number): RangoFechas | null {
  if (bufferNoches <= 0) return null;
  const inicio = Temporal.PlainDate.from(fechaCheckout);
  const fin = inicio.add({ days: bufferNoches });
  return { inicio: inicio.toString(), fin: fin.toString() };
}
