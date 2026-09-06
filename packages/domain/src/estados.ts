import type { EstadoOcupacion } from "./tipos.js";

/**
 * Máquina de estados de `ocupacion_unidad` (REQ-091, BLUEPRINT §3.2).
 * `cancelado` es terminal: el sistema nunca cancela una reserva de forma
 * automática (D-006, REQ-000), y una vez cancelada, una fila no vuelve a
 * ningún otro estado — un "reactivar" es, en el modelo de datos, una nueva
 * fila con nuevo `id` (versión), no una transición sobre la misma.
 */
const TRANSICIONES_PERMITIDAS: Record<EstadoOcupacion, readonly EstadoOcupacion[]> = {
  provisional: ["confirmado", "cancelado"],
  confirmado: ["cancelado", "conflicto_pendiente"],
  conflicto_pendiente: ["confirmado", "cancelado"],
  cancelado: [],
};

export function puedeTransicionar(desde: EstadoOcupacion, hacia: EstadoOcupacion): boolean {
  if (desde === hacia) return false;
  return TRANSICIONES_PERMITIDAS[desde].includes(hacia);
}

export function transicionar(desde: EstadoOcupacion, hacia: EstadoOcupacion): EstadoOcupacion {
  if (!puedeTransicionar(desde, hacia)) {
    throw new Error(`Transición de estado no permitida: "${desde}" → "${hacia}"`);
  }
  return hacia;
}
