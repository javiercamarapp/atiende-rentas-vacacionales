import { Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { SeccionPassword } from "./components/SeccionPassword";
import { SeccionMfa } from "./components/SeccionMfa";
import { SeccionSesiones } from "./components/SeccionSesiones";

// Lote 3.2 (H-096+): "Mi cuenta" — perfil (solo lectura, la edición de rol/
// tenant es de backoffice, fuera de alcance de este lote), contraseña,
// MFA (QR + códigos de recuperación) y sesiones activas.
export function CuentaPage() {
  const { usuario } = useSesion();

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Mi cuenta</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Rol: </span>
            {usuario?.rol}
            {usuario?.colaboradorNivel ? ` (${usuario.colaboradorNivel})` : ""}
          </p>
        </CardContent>
      </Card>

      <SeccionPassword />
      <SeccionMfa mfaHabilitadoInicial={usuario?.mfaHabilitado ?? false} />
      <SeccionSesiones />
    </div>
  );
}
