import type { SeveridadIncidencia } from "./tipos.js";

/**
 * H-055 (REQ-118, RV11 §e): el vínculo "incidencia de mantenimiento →
 * bloqueo automático de calendario" NO tiene precedente confirmado en
 * ningún proveedor investigado — es una decisión de producto propia de
 * Atiende, implementada de forma explícita y auditable, NUNCA automática.
 * Esta función solo decide si una incidencia es candidata a *proponer* un
 * bloqueo de mantenimiento (severidad "grave") — la propuesta siempre
 * requiere confirmación humana explícita antes de que
 * `aplicacion/tareas.ts#confirmarBloqueoMantenimiento` invoque `crearBloqueo`
 * (Lote 1). Una incidencia nunca cierra ni cancela una reserva confirmada
 * (REQ-000, REQ-118).
 */
export function requiereConfirmacionHumanaParaBloqueo(severidad: SeveridadIncidencia): boolean {
  return severidad === "grave";
}
