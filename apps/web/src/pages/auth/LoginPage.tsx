import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AtiendeMark, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { ErrorApi } from "../../lib/api/cliente";
import { obtenerConfigAuth, urlIniciarGoogle } from "../../auth/api";
import "./login.css";

// Lote 3.2 (H-096+): login completo — email/contraseña con paso 2 de MFA,
// "Continuar con Google" (deshabilitado con motivo si no está configurado,
// GET /auth/config — nunca un error 500), y enlaces a registro/olvidé mi
// contraseña. Sustituye el "login mínimo" de Lote 4.
//
// Layout a pantalla partida (mismo pedido que en hoteles/citas-reservaciones/
// licitaciones): la anatomía visual completa se porta de
// atiende-restaurantes/src/pages/AdminLogin.tsx + login.css (login-entra/
// login-kicker/login-serif/login-lamina/login-velo/login-foto-marca/
// login-btn/login-campo/login-glifo) — pero AQUÍ el login real es
// email+contraseña con MFA de 2 pasos y Google opcional, no el magic-link
// de un solo campo del origen, así que solo se porta el envoltorio visual;
// toda la lógica de abajo (estado, handlers, mensajeDeError) es exactamente
// la misma que ya existía antes de este cambio.
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
    <main className="login min-h-screen lg:grid lg:grid-cols-2">
      {/* Columna del formulario — un solo eje óptico, max-w-[392px]. */}
      <section className="flex min-h-screen flex-col px-6 py-7 sm:px-10 lg:px-14 lg:py-10">
        <div className="mx-auto flex w-full max-w-[392px] flex-1 flex-col">
          <header className="login-entra flex items-center">
            <AtiendeWordmark />
          </header>

          <div className="flex flex-1 items-center py-12">
            <div className="w-full">
              <p className="login-entra login-kicker" style={{ animationDelay: "40ms" }}>
                Acceso al panel
              </p>
              <h1
                className="login-entra login-serif mt-5 text-[34px] text-foreground sm:text-[40px]"
                style={{ animationDelay: "90ms" }}
              >
                {mfaToken ? "Verificación en dos pasos" : "Bienvenido de vuelta"}
              </h1>
              <p
                className="login-entra mt-4 text-[15px] leading-[1.6] text-muted-foreground"
                style={{ animationDelay: "140ms" }}
              >
                {mfaToken
                  ? "Escribe el código de tu app de autenticación o un código de recuperación."
                  : "El panel de operación de tu portafolio de rentas vacacionales."}
              </p>

              <div className="login-entra mt-9" style={{ animationDelay: "190ms" }}>
                {mfaToken ? (
                  <form onSubmit={alEnviarMfa} className="flex flex-col gap-3" noValidate>
                    <div className="space-y-1 text-left">
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
                        className="login-campo"
                      />
                    </div>
                    {error && (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <button type="submit" disabled={enviando} className="login-btn login-btn-tinta mt-1">
                      <span aria-hidden className="login-glifo">
                        <AtiendeMark className="h-[17px] w-auto brightness-0 invert" />
                      </span>
                      <span>{enviando ? "Verificando…" : "Verificar"}</span>
                    </button>
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
                  <form onSubmit={alEnviarLogin} className="flex flex-col gap-3" noValidate>
                    <div className="space-y-1 text-left">
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
                        className="login-campo"
                      />
                    </div>
                    <div className="space-y-1 text-left">
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
                        className="login-campo"
                      />
                    </div>
                    {error && (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <button type="submit" disabled={enviando} className="login-btn login-btn-tinta mt-1">
                      <span aria-hidden className="login-glifo">
                        <AtiendeMark className="h-[17px] w-auto brightness-0 invert" />
                      </span>
                      <span>{enviando ? "Entrando…" : "Entrar"}</span>
                    </button>

                    <div className="my-6 flex items-center gap-4">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[13px] lowercase text-muted-foreground">o</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>

                    <button
                      type="button"
                      disabled={!googleHabilitado}
                      title={googleHabilitado ? undefined : (googleMotivo ?? "Google Sign-In no disponible")}
                      onClick={() => {
                        window.location.href = urlIniciarGoogle();
                      }}
                      className="login-btn login-btn-borde"
                    >
                      Continuar con Google
                    </button>
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
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* La lámina — mismo material que .login-lamina de Likida/Restaurantes,
          foto real ya descargada (Higgsfield) para esta vertical. */}
      <aside aria-hidden="true" className="hidden lg:flex lg:flex-col lg:py-10 lg:pl-6 lg:pr-10">
        <figure className="login-lamina relative min-h-0 flex-1">
          <img
            src={`${import.meta.env.BASE_URL}images/login-hero.png`}
            alt=""
            className="login-foto-marca absolute inset-0 h-full w-full object-cover"
          />
          <div className="login-velo" />
          <figcaption className="absolute inset-x-0 bottom-0 z-10 p-9">
            <p className="login-kicker" style={{ color: "color-mix(in srgb, white 78%, transparent)" }}>
              Rentas vacacionales
            </p>
            <p className="login-serif relative mt-3.5 text-white" style={{ fontSize: "clamp(20px, 1.9vw, 27px)" }}>
              Calendarios, canales y mensajes.
              <br />
              En un solo panel.
            </p>
          </figcaption>
        </figure>
      </aside>
    </main>
  );
}
