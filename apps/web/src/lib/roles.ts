import type { RolUsuario } from "@atiende-rv/api/contrato";

/**
 * Espejo, del lado del cliente, del grupo `ROLES_ADMIN` de
 * `apps/api/src/rolesComunes.ts` — las 5 rutas de `PLATAFORMA`
 * (`AdminSidebar.tsx`, grupo `soloAdmin`) exigen exactamente
 * superadmin/admin_gestora en el backend. Duplicado deliberadamente
 * (el bundle de `apps/web` no importa código de `apps/api`, solo tipos
 * del contrato) — si el backend cambia este grupo, `RutaConRol` en las
 * rutas de plataforma debe actualizarse a mano; documentado aquí para
 * que ese acoplamiento sea explícito, no accidental.
 */
export const ROLES_ADMIN: readonly RolUsuario[] = ["superadmin", "admin_gestora"];
