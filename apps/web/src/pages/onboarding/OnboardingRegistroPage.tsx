import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, AtiendeWordmark } from "@atiende-rv/ui-atiende";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { ErrorApi } from "../../lib/api/cliente";
import { registrarEmpresa } from "./api";

// Lote 3.3 — paso 1 del onboarding self-serve: registro público de la
// empresa gestora + su primer usuario admin. Los pasos siguientes
// (verificar correo, propiedad/unidad, canal, colaboradores) ocurren
// DESPUÉS del login, ya autenticado — ver
// apps/web/src/pages/onboarding/OnboardingAsistentePage.tsx.
export function OnboardingRegistroPage() {
  const { autenticado } = useSesion();
  const [params] = useSearchParams();
  const planCodigo = params.get("plan") ?? undefined;

  const [empresaNombre, setEmpresaNombre] = useState("");
  const [empresaRazonSocial, setEmpresaRazonSocial] = useState("");
  const [adminCorreo, setAdminCorreo] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  if (autenticado) return <Navigate to="/calendario" replace />;

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await registrarEmpresa({ empresaNombre, empresaRazonSocial, adminCorreo, adminPassword, planCodigo });
      setListo(true);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo completar el registro.");
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center space-y-3">
            <AtiendeWordmark markClassName="h-7 w-auto" />
            <CardTitle className="text-base font-normal">Revisa tu correo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
            <p>
              Te enviamos un enlace de verificación a <strong className="text-foreground">{adminCorreo}</strong>
              . Confírmalo y luego inicia sesión para continuar el asistente (conectar tu primer canal,
              invitar a tu equipo).
            </p>
            <Button asChild className="w-full">
              <Link to="/login">Ir a iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-3">
          <AtiendeWordmark markClassName="h-7 w-auto" />
          <CardTitle className="text-base font-normal text-muted-foreground">
            Crea tu cuenta — {planCodigo ? `plan ${planCodigo}` : "14 días de prueba gratuita"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={alEnviar} className="space-y-3" noValidate>
            <div className="space-y-1">
              <label htmlFor="empresaNombre" className="text-xs font-medium text-muted-foreground">
                Nombre comercial de tu empresa
              </label>
              <input
                id="empresaNombre"
                required
                value={empresaNombre}
                onChange={(e) => setEmpresaNombre(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="empresaRazonSocial" className="text-xs font-medium text-muted-foreground">
                Razón social
              </label>
              <input
                id="empresaRazonSocial"
                required
                value={empresaRazonSocial}
                onChange={(e) => setEmpresaRazonSocial(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="adminCorreo" className="text-xs font-medium text-muted-foreground">
                Tu correo (serás el administrador de la cuenta)
              </label>
              <input
                id="adminCorreo"
                type="email"
                autoComplete="email"
                required
                value={adminCorreo}
                onChange={(e) => setAdminCorreo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="adminPassword" className="text-xs font-medium text-muted-foreground">
                Contraseña (mínimo 10 caracteres)
              </label>
              <input
                id="adminPassword"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? "Creando cuenta…" : "Crear mi cuenta"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              ¿Ya tienes cuenta? <Link to="/login" className="underline">Inicia sesión</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
