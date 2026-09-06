import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import { olvidePassword } from "../../auth/api";

// Lote 3.2 (H-096+): siempre responde "enviado" (S-13: nunca revela si el
// correo existe) — mismo criterio ya aplicado en /auth/login.
export function OlvidePasswordPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await olvidePassword(email);
    } catch {
      // deliberadamente silencioso — ver comentario de cabecera.
    } finally {
      setEnviando(false);
      setEnviado(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3">
          <AtiendeWordmark markClassName="h-7 w-auto" />
          <CardTitle className="text-base font-normal text-muted-foreground">Restablecer contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          {enviado ? (
            <p className="text-sm">
              Si ese correo tiene una cuenta, te enviamos un enlace para restablecer tu contraseña.
            </p>
          ) : (
            <form onSubmit={alEnviar} className="space-y-3" noValidate>
              <div className="space-y-1">
                <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                  Correo
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar enlace"}
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
