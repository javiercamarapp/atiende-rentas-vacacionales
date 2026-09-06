import { useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { ErrorApi } from "../../../lib/api/cliente";
import { cambiarPassword } from "../../../auth/api";

export function SeccionPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    setEnviando(true);
    try {
      await cambiarPassword(actual, nueva);
      setOk(true);
      setActual("");
      setNueva("");
    } catch (err) {
      setError(
        err instanceof ErrorApi
          ? err.codigo === "credenciales_invalidas"
            ? "Tu contraseña actual no es correcta."
            : err.message
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={alEnviar} className="max-w-sm space-y-3" noValidate>
          <div className="space-y-1">
            <label htmlFor="passwordActual" className="text-xs font-medium text-muted-foreground">
              Contraseña actual
            </label>
            <input
              id="passwordActual"
              type="password"
              required
              autoComplete="current-password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="passwordNueva" className="text-xs font-medium text-muted-foreground">
              Nueva contraseña (mínimo 10 caracteres)
            </label>
            <input
              id="passwordNueva"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {ok && <p className="text-sm text-muted-foreground">Contraseña actualizada. Tus demás sesiones se cerraron.</p>}
          <Button type="submit" disabled={enviando}>
            {enviando ? "Guardando…" : "Cambiar contraseña"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
