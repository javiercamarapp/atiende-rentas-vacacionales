import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import type { UsuarioSesion } from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";
import { useSesion } from "../../lib/sesion/SesionProvider";

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
//
// El canje se hace vía `useSesion().establecerSesion(...)`, NUNCA
// escribiendo `localStorage`/`guardarToken` directamente desde aquí: eso
// dejaría el estado de React de `SesionProvider` (lo que `RutaProtegida`
// realmente consulta) intacto en "sin sesión" — el resultado observado
// era que `<Navigate to="/calendario">` sí navegaba, pero `RutaProtegida`
// rebotaba de inmediato de vuelta a /login porque `autenticado` seguía
// en `false` (bug real encontrado al ejecutar el E2E, nunca solo un
// problema de la doble invocación de efectos de StrictMode).
export function GoogleCompletadoPage() {
  const { establecerSesion } = useSesion();
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  // Guarda contra una doble invocación del efecto (React 18 StrictMode en
  // desarrollo monta/desmonta/remonta a propósito para detectar efectos
  // no idempotentes) — sin esto, dos POST /auth/refresh casi simultáneos
  // usan el MISMO refresh token todavía sin rotar: el primero en llegar
  // al servidor rota con éxito, pero el segundo llega con un token que el
  // servidor ya ve como revocado y lo trata como reutilización (H-096),
  // revocando TODA la familia — incluida la sesión que el primer POST
  // acababa de crear. Nunca ocurre en producción (sin StrictMode), pero
  // rompía el login con Google en desarrollo/E2E.
  const yaEjecutado = useRef(false);

  useEffect(() => {
    if (yaEjecutado.current) return;
    yaEjecutado.current = true;
    peticion<RespuestaRefreshWeb>("/auth/refresh", { metodo: "POST" })
      .then((respuesta) => {
        establecerSesion(respuesta.accessToken, respuesta.usuario);
        setEstado("ok");
      })
      .catch(() => setEstado("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `establecerSesion` es estable (useCallback sin deps); solo debe correr una vez al montar.
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
