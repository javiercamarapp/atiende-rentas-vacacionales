import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import type { UsuarioSesion } from "@atiende-rv/api/contrato";
import { guardarToken, peticion } from "../../lib/api/cliente";

const CLAVE_USUARIO = "atiende-rv-usuario-sesion";

interface RespuestaRefreshWeb {
  accessToken: string;
  expiraEn: number;
  usuario: UsuarioSesion;
}

// Lote 3.2 (H-096+): destino del redirect final de
// GET /auth/google/callback (y del proveedor OIDC simulado en E2E) — en
// ese punto el navegador YA tiene la cookie httpOnly de refresh fijada
// por la propia respuesta del callback; esta página solo canjea esa
// cookie por un access token en memoria (mismo mecanismo que
// SesionProvider.login para el cliente 'web'), sin que el token nunca
// haya viajado en la URL (evita dejarlo en el historial/referrer).
export function GoogleCompletadoPage() {
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  useEffect(() => {
    peticion<RespuestaRefreshWeb>("/auth/refresh", { metodo: "POST" })
      .then((respuesta) => {
        guardarToken(respuesta.accessToken);
        try {
          localStorage.setItem(CLAVE_USUARIO, JSON.stringify(respuesta.usuario));
        } catch {
          // sesión solo en memoria si localStorage no está disponible.
        }
        setEstado("ok");
      })
      .catch(() => setEstado("error"));
  }, []);

  if (estado === "ok") return <Navigate to="/calendario" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3">
          <AtiendeWordmark markClassName="h-7 w-auto" />
          <CardTitle className="text-base font-normal text-muted-foreground">Continuando con Google…</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {estado === "cargando" && <p>Un momento…</p>}
          {estado === "error" && (
            <p role="alert" className="text-destructive">
              No se pudo completar el inicio de sesión con Google.{" "}
              <Link to="/login" className="underline">
                Volver a intentar
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
