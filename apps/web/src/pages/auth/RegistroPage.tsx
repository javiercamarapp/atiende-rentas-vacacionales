import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { ErrorApi } from "../../lib/api/cliente";
import { obtenerConfigAuth, registrar, urlIniciarGoogle } from "../../auth/api";

// Lote 3.2 (H-096+): registro por invitación (?invitacion=<token>) o
// registro abierto (?tenantId=<uuid>, solo si ese tenant tiene
// permite_registro=true — el servidor rechaza cualquier otro caso con
// registro_no_permitido, nunca se asume aquí que va a funcionar).
export function RegistroPage() {
  const { autenticado } = useSesion();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invitacionToken = params.get("invitacion") ?? undefined;
  const tenantId = params.get("tenantId") ?? undefined;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<{ requiereVerificacionCorreo: boolean } | null>(null);
  const [googleHabilitado, setGoogleHabilitado] = useState(false);

  useEffect(() => {
    obtenerConfigAuth()
      .then((c) => setGoogleHabilitado(c.googleHabilitado))
      .catch(() => setGoogleHabilitado(false));
  }, []);

  if (autenticado) return <Navigate to="/calendario" replace />;

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const resultado = await registrar({ email, password, nombre: nombre || undefined, invitacionToken, tenantId });
      setListo({ requiereVerificacionCorreo: resultado.requiereVerificacionCorreo });
    } catch (err) {
      setError(
        err instanceof ErrorApi
          ? err.codigo === "registro_no_permitido"
            ? "Este enlace de registro no es válido o ya expiró."
            : err.message
          : "No se pudo completar el registro.",
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
          <CardTitle className="text-base font-normal text-muted-foreground">Crear cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          {listo ? (
            <div className="space-y-3 text-sm">
              <p>Tu cuenta fue creada.</p>
              {listo.requiereVerificacionCorreo ? (
                <p className="text-muted-foreground">
                  Te enviamos un correo para confirmar tu dirección antes de iniciar sesión.
                </p>
              ) : (
                <p className="text-muted-foreground">Ya puedes iniciar sesión.</p>
              )}
              <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
                Ir a iniciar sesión
              </Button>
            </div>
          ) : (
            <form onSubmit={alEnviar} className="space-y-3" noValidate>
              <div className="space-y-1">
                <label htmlFor="nombre" className="text-xs font-medium text-muted-foreground">
                  Nombre (opcional)
                </label>
                <input
                  id="nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
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
              <div className="space-y-1">
                <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Contraseña (mínimo 10 caracteres)
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
                {enviando ? "Creando cuenta…" : "Crear cuenta"}
              </Button>

              {googleHabilitado && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    window.location.href = urlIniciarGoogle({ invitacionToken, tenantId });
                  }}
                >
                  Continuar con Google
                </Button>
              )}

              <p className="text-center text-xs text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" className="underline">
                  Inicia sesión
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
