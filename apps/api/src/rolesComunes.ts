import type { RolUsuario } from "./contrato/tipos.js";

/**
 * Auditoría 2 — Q-04 (`docs/auditoria-2/calidad-codigo.md`): 30 sitios en
 * `apps/api/src/routes/*.ts` repetían el literal
 * `exigirRol(auth, "superadmin", "admin_gestora")` (más otras tuplas
 * menos frecuentes) sin una única fuente de verdad. Este archivo NO
 * define lógica de autorización nueva — `exigirRol`/`requiereRol` siguen
 * viviendo en `middleware/roles.ts` (fuera del alcance de este lote,
 * reservado a Lote 3.2 en curso) — solo nombra los grupos de roles que ya
 * existían como literales dispersos, para que cambiar quién puede hacer
 * qué sea una edición en un solo lugar en vez de un `grep`+reemplazo
 * multi-archivo.
 *
 * Deliberadamente en la raíz de `src/` (no en `middleware/` ni
 * `seguridad/`): ambos directorios están en edición activa del Lote 3.2
 * (autenticación completa + Google OIDC) al momento de este lote — ver
 * aviso de concurrencia en `docs/PROGRESO.md`.
 */
export const ROLES_ADMIN: readonly RolUsuario[] = ["superadmin", "admin_gestora"] as const;
export const ROLES_SUPERADMIN: readonly RolUsuario[] = ["superadmin"] as const;
export const ROLES_ADMIN_OPERADOR: readonly RolUsuario[] = ["superadmin", "admin_gestora", "operador"] as const;
export const ROLES_ADMIN_CONTADOR: readonly RolUsuario[] = ["superadmin", "admin_gestora", "contador"] as const;
export const ROLES_ADMIN_CONTADOR_OPERADOR: readonly RolUsuario[] = [
  "superadmin",
  "admin_gestora",
  "contador",
  "operador",
] as const;
export const ROLES_ADMIN_CONTADOR_PROPIETARIO: readonly RolUsuario[] = [
  "superadmin",
  "admin_gestora",
  "contador",
  "propietario",
] as const;
