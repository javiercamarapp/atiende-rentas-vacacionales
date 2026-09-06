import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import { ErrorApi } from "../../lib/api/cliente";
import { verificarCorreo } from "../../auth/api";

// Lote 3.2 (H-096+): confirma el token de un solo uso enviado por correo.
export function VerificarCorreoPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado("error");
      setMensajeError("Falta el token de verificación en el enlace.");
      return;
    }
    verificarCorreo(token)
      .then(() => setEstado("ok"))
      .catch((err) => {
        setEstado("error");
        setMensajeError(
          err instanceof ErrorApi ? "Este enlace de verificación es inválido o ya expiró." : "No se pudo verificar el correo.",
        );
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3">
          <AtiendeWordmark markClassName="h-7 w-auto" />
          <CardTitle className="text-base font-normal text-muted-foreground">Verificación de correo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {estado === "cargando" && <p>Verificando…</p>}
          {estado === "ok" && (
            <>
              <p>Tu correo quedó verificado.</p>
              <Button asChild className="w-full">
                <Link to="/login">Ir a iniciar sesión</Link>
              </Button>
            </>
          )}
          {estado === "error" && (
            <p role="alert" className="text-destructive">
              {mensajeError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
