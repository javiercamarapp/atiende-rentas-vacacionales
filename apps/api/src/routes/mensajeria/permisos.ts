import { ErrorDominio } from "../../contrato/errores.js";
import type { ContextoAuth } from "../../middleware/autenticacion.js";

/**
 * Permisos propios de Lote 6 (mensajería). Vive en la carpeta exclusiva de
 * este lote (`apps/api/src/routes/mensajeria/`) — nunca edita
 * `apps/api/src/middleware/roles.ts` (Lote 3). Regla explícita del
 * encargo: solo operador (colaborador_nivel <> 'solo_calendario') y
 * admin_gestora/superadmin del tenant pueden gestionar mensajería;
 * propietario y limpieza SIN acceso — este chequeo de aplicación es el
 * respaldo explícito, RLS (packages/db, migración 0043) es quien garantiza
 * el aislamiento incluso si este chequeo se olvidara.
 */
export function puedeGestionarMensajeria(auth: ContextoAuth): boolean {
  if (auth.rol === "superadmin" || auth.rol === "admin_gestora") return true;
  if (auth.rol === "operador") return auth.colaboradorNivel !== "solo_calendario";
  return false;
}

export function exigirPuedeGestionarMensajeria(auth: ContextoAuth): void {
  if (!puedeGestionarMensajeria(auth)) {
    throw new ErrorDominio("rol_forbidden", "Este rol/nivel de colaborador no puede gestionar mensajería");
  }
}

/** Solo admin/superadmin pueden crear/aprobar plantillas (H-056: "aprobadas
 * por el tenant" implica un rol de gestión, no cualquier operador del
 * día a día). */
export function exigirPuedeAprobarPlantilla(auth: ContextoAuth): void {
  if (auth.rol !== "superadmin" && auth.rol !== "admin_gestora") {
    throw new ErrorDominio("rol_forbidden", "Solo admin/superadmin pueden aprobar plantillas de mensajería (H-056)");
  }
}
