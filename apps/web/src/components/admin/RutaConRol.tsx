import type { ReactNode } from "react";
import type { RolUsuario } from "@atiende-rv/api/contrato";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { PantallaSinAcceso } from "./PantallaSinAcceso";

/**
 * Auditoría 2, P-08: guarda de rol a nivel de RUTA (no a nivel de cada
 * llamada a la API dentro de la página). Si el rol de la sesión no está
 * en `roles`, `children` nunca se monta — ni la página ni sus hooks de
 * datos llegan a ejecutarse — y se muestra una única `PantallaSinAcceso`.
 *
 * Esto es una mejora de UX, no la defensa real: el backend (`exigirRol`
 * en cada endpoint + RLS) sigue siendo la única barrera que importa para
 * seguridad — ver `apps/api/src/rolesComunes.ts`. Esta guarda del lado
 * cliente solo evita el ruido de 2-3 cajas de error 403 apiladas cuando
 * alguien llega por URL directa a una sección que el propio menú ya
 * oculta para su rol (`AdminSidebar.tsx`, grupo `soloAdmin`).
 */
export function RutaConRol({ roles, children }: { roles: readonly RolUsuario[]; children: ReactNode }) {
  const { usuario } = useSesion();
  if (!usuario || !roles.includes(usuario.rol)) {
    return <PantallaSinAcceso />;
  }
  return <>{children}</>;
}
