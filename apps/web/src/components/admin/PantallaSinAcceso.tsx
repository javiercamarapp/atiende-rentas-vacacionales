import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

/**
 * Auditoría 2, P-08 (`docs/auditoria-2/producto-ux-operacion.md`): navegar
 * por URL directa a una ruta restringida (p. ej. `/administracion` como
 * `operador`, `/cuentas-canal` como `propietario`) montaba el shell
 * completo de la página, que a su vez disparaba 2-3 llamadas a la API que
 * respondían 403 `rol_forbidden` — cada una con su propia caja de error
 * apilada. Nunca fue un riesgo de seguridad (RLS + `exigirRol` en el
 * backend ya bloqueaban todo dato real), solo ruido de UX.
 *
 * Esta pantalla es la ÚNICA reacción visible cuando `RutaConRol` decide
 * que el rol de la sesión no está en la lista permitida — la página real
 * (y sus llamadas a la API) nunca llega a montarse, así que no hay nada
 * que apilar.
 */
export function PantallaSinAcceso() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center" role="alert">
      <ShieldAlert className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-base font-display font-semibold">Sin acceso</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Tu rol no tiene permiso para ver esta sección. Si crees que es un error, contacta a un administrador.
      </p>
      <Link to="/calendario" className="text-sm underline font-medium">
        Volver al calendario
      </Link>
    </div>
  );
}
