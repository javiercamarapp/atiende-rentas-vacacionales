import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import { ErrorApi } from "../../lib/api/cliente";
import { restablecerPassword } from "../../auth/api";

// Lote 3.2 (H-096+): al completarse, el servidor invalida TODAS las
// sesiones existentes de esa cuenta — el usuario debe volver a iniciar
// sesión aquí mismo, nunca queda una sesión vieja vigente en segundo plano.
export function RestablecerPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Falta el token de restablecimiento en el enlace.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await restablecerPassword(token, password);
      setListo(true);
    } catch (err) {
      setError(
        err instanceof ErrorApi ? "Este enlace es inválido o ya expiró — solicita uno nuevo." : "No se pudo restablecer la contraseña.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3">
          <AtiendeWordmark markClassName="h-7 w-auto" />
          <CardTitle className="text-base font-normal text-muted-foreground">Nueva contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          {listo ? (
            <div className="space-y-3 text-sm">
              <p>Tu contraseña fue actualizada. Cerramos todas tus sesiones anteriores por seguridad.</p>
              <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
                Ir a iniciar sesión
              </Button>
            </div>
          ) : (
            <form onSubmit={alEnviar} className="space-y-3" noValidate>
              <div className="space-y-1">
                <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Nueva contraseña (mínimo 10 caracteres)
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? "Guardando…" : "Restablecer contraseña"}
              </Button>
            </form>
          )}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <Link to="/login" className="underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
