import type { Context, MiddlewareHandler } from "hono";
import { ErrorDominio } from "../contrato/errores.js";
import type { ColaboradorNivel, RolUsuario } from "../contrato/tipos.js";
import type { ContextoAuth } from "./autenticacion.js";

/**
 * H-044: escalada de privilegios rechazada en la CAPA DE SERVICIO, no solo
 * en la UI (caso adversarial 19). RLS (packages/db migraciones 0014-0015)
 * es el respaldo de base de datos; estas funciones son el chequeo
 * explícito de cada endpoint que exige un rol/nivel — nunca se confía en
 * que el cliente no vaya a intentar, por ejemplo, un DELETE /bloqueos/:id
 * siendo un colaborador 'solo_calendario'.
 */
export function exigirRol(auth: ContextoAuth, ...permitidos: RolUsuario[]): void {
  if (!permitidos.includes(auth.rol)) {
    throw new ErrorDominio("rol_forbidden", `Rol "${auth.rol}" no autorizado para esta acción`);
  }
}

/** `true` si el usuario puede mutar calendario (crear/modificar bloqueos o
 * reservas directas): superadmin/admin_gestora siempre, operador solo si
 * su nivel no es 'solo_calendario' (RV01/RV03 §3). */
export function puedeEscribirCalendario(auth: ContextoAuth): boolean {
  if (auth.rol === "superadmin" || auth.rol === "admin_gestora") return true;
  if (auth.rol === "operador") {
    return auth.colaboradorNivel === "acceso_total" || auth.colaboradorNivel === "calendario_mensajeria";
  }
  return false;
}

export function exigirEscrituraCalendario(auth: ContextoAuth): void {
  if (!puedeEscribirCalendario(auth)) {
    throw new ErrorDominio(
      "rol_forbidden",
      "Este rol/nivel de colaborador no puede crear ni modificar el calendario",
    );
  }
}

/** Cancelar una reserva/bloqueo (destructivo) exige el nivel más alto de
 * colaborador (§Roles-1: solo "acceso total" cancela; "calendario y
 * mensajería" puede ver/mensajear pero no cancelar). */
export function exigirPuedeCancelar(auth: ContextoAuth): void {
  const permitido =
    auth.rol === "superadmin" ||
    auth.rol === "admin_gestora" ||
    (auth.rol === "operador" && auth.colaboradorNivel === "acceso_total");
  if (!permitido) {
    throw new ErrorDominio("rol_forbidden", "Solo acceso total puede cancelar reservas o bloqueos");
  }
}

export function requiereRol(...permitidos: RolUsuario[]): MiddlewareHandler {
  return async (c: Context, next) => {
    const auth = c.get("auth");
    exigirRol(auth, ...permitidos);
    await next();
  };
}

export type { ColaboradorNivel };
