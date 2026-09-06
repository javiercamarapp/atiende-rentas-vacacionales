import { ErrorDominio } from "../../contrato/errores.js";
import type { ContextoAuth } from "../../middleware/autenticacion.js";

/**
 * Permisos propios de Lote 5 (operación). Vive en la carpeta exclusiva de
 * este lote (`apps/api/src/routes/limpieza/`) — nunca edita
 * `apps/api/src/middleware/roles.ts` (carpeta exclusiva de Lote 3). Mismo
 * espíritu que `middleware/roles.ts` (H-044): el chequeo de aplicación es
 * el respaldo explícito, RLS (packages/db, migración 0036) es quien
 * garantiza el aislamiento incluso si este chequeo se olvidara.
 */
export function puedeGestionarOperacion(auth: ContextoAuth): boolean {
  if (auth.rol === "superadmin" || auth.rol === "admin_gestora") return true;
  if (auth.rol === "operador") return auth.colaboradorNivel !== "solo_calendario";
  return false;
}

/** `true` si `auth` es el personal de limpieza (interno o proveedor
 * externo, H-053) asignado exactamente a esa tarea. */
export function esLimpiezaAsignada(auth: ContextoAuth, asignadoA: string | null): boolean {
  return auth.rol === "limpieza" && asignadoA !== null && asignadoA === auth.usuarioId;
}

/** Puede operar (ver/actualizar checklist/completar) una tarea concreta:
 * admin/superadmin/operador (no solo_calendario) siempre, o el personal de
 * limpieza asignado a esa tarea exacta — H-053: "portal de proveedor
 * externo con acceso acotado a su tarea asignada". */
export function exigirPuedeOperarTarea(auth: ContextoAuth, asignadoA: string | null): void {
  if (!puedeGestionarOperacion(auth) && !esLimpiezaAsignada(auth, asignadoA)) {
    throw new ErrorDominio("rol_forbidden", "No tienes acceso a esta tarea operativa");
  }
}

export function exigirPuedeGestionarOperacion(auth: ContextoAuth): void {
  if (!puedeGestionarOperacion(auth)) {
    throw new ErrorDominio("rol_forbidden", "Este rol/nivel de colaborador no puede gestionar operación");
  }
}
