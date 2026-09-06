import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSesion } from "../../lib/sesion/SesionProvider";

/** Redirige a `/login` (con la ruta original en `state.desde`) si no hay
 * sesión — cada pantalla de este lote habla con la API real de Lote 3 y no
 * tiene sentido renderizarla sin `accessToken`. */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const { autenticado } = useSesion();
  const ubicacion = useLocation();
  if (!autenticado) {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  }
  return <>{children}</>;
}
