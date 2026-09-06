import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { ErrorApi } from "../../lib/api/cliente";
import { obtenerConfigAuth, urlIniciarGoogle } from "../../auth/api";

// Lote 3.2 (H-096+): login completo — email/contraseña con paso 2 de MFA,
// "Continuar con Google" (deshabilitado con motivo si no está configurado,
// GET /auth/config — nunca un error 500), y enlaces a registro/olvidé mi
// contraseña. Sustituye el "login mínimo" de Lote 4.
export function LoginPage() {
  const { autenticado, login, completarLoginConMfa } = useSesion();
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigoMfa, setCodigoMfa] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [googleHabilitado, setGoogleHabilitado] = useState(false);
  const [googleMotivo, setGoogleMotivo] = useState<string | null>(null);

  useEffect(() => {
    obtenerConfigAuth()
      .then((config) => {
        setGoogleHabilitado(config.googleHabilitado);
        setGoogleMotivo(config.googleMotivoDeshabilitado);
      })
      .catch(() => {
        setGoogleHabilitado(false);
        setGoogleMotivo("No se pudo consultar la configuración de auth.");
      });
  }, []);

  if (autenticado) {
    const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? "/calendario";
    return <Navigate to={destino} replace />;
  }

  function mensajeDeError(err: unknown): string {
    if (!(err instanceof ErrorApi)) return "No se pudo iniciar sesión.";
    switch (err.codigo) {
      case "credenciales_invalidas":
        return "Correo o contraseña incorrectos.";
      case "cuenta_bloqueada_temporalmente":
        return "Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta más tarde.";
      case "mfa_invalido":
        return "Código de verificación inválido.";
      default:
        return err.message;
    }
  }

  async function alEnviarLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const resultado = await login(email, password);
      if (resultado.estado === "mfa_requerido") {
        setMfaToken(resultado.mfaToken);
      } else {
        navigate("/calendario", { replace: true });
      }
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function alEnviarMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setEnviando(true);
    try {
      await completarLoginConMfa(mfaToken, codigoMfa);
      navigate("/calendario", { replace: true });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3">
          <AtiendeWordmark markClassName="h-7 w-auto" />
          <CardTitle className="text-base font-normal text-muted-foreground">
            {mfaToken ? "Verificación en dos pasos" : "Acceso al panel de operación"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mfaToken ? (
            <form onSubmit={alEnviarMfa} className="space-y-3" noValidate>
              <div className="space-y-1">
                <label htmlFor="codigoMfa" className="text-xs font-medium text-muted-foreground">
                  Código de tu app de autenticación o código de recuperación
                </label>
                <input
                  id="codigoMfa"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={codigoMfa}
                  onChange={(e) => setCodigoMfa(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? "Verificando…" : "Verificar"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground underline"
                onClick={() => {
                  setMfaToken(null);
                  setCodigoMfa("");
                  setError(null);
                }}
              >
                Volver
              </button>
            </form>
          ) : (
            <form onSubmit={alEnviarLogin} className="space-y-3" noValidate>
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
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                    Contraseña
                  </label>
                  <Link to="/olvide-password" className="text-xs text-muted-foreground underline">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
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
                {enviando ? "Entrando…" : "Entrar"}
              </Button>

              <div className="relative py-1 text-center text-xs text-muted-foreground">
                <span className="bg-card px-2 relative z-10">o</span>
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!googleHabilitado}
                title={googleHabilitado ? undefined : (googleMotivo ?? "Google Sign-In no disponible")}
                onClick={() => {
                  window.location.href = urlIniciarGoogle();
                }}
              >
                Continuar con Google
              </Button>
              {!googleHabilitado && googleMotivo && (
                <p className="text-center text-xs text-muted-foreground">{googleMotivo}</p>
              )}

              <p className="text-center text-xs text-muted-foreground">
                ¿No tienes cuenta?{" "}
                <Link to="/registro" className="underline">
                  Regístrate
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
