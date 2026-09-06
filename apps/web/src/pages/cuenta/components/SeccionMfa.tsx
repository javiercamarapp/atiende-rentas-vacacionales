import { useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { ErrorApi } from "../../../lib/api/cliente";
import { mfaConfirmar, mfaDeshabilitar, mfaIniciar } from "../../../auth/api";

type Estado =
  | { paso: "inicial" }
  | { paso: "configurando"; secretBase32: string; qrDataUrl: string; codigo: string }
  | { paso: "codigos"; codigosRecuperacion: string[] }
  | { paso: "deshabilitando"; password: string };

// Lote 3.2 (H-096+): habilitar MFA es un flujo de 2 pasos deliberado
// (iniciar genera el secreto pero NO lo activa; confirmar exige un código
// TOTP real antes de marcarlo habilitado) — ver comentario en
// apps/api/src/routes/auth.ts, POST /auth/mfa/iniciar.
export function SeccionMfa({ mfaHabilitadoInicial }: { mfaHabilitadoInicial: boolean }) {
  const [mfaHabilitado, setMfaHabilitado] = useState(mfaHabilitadoInicial);
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function iniciar() {
    setError(null);
    setEnviando(true);
    try {
      const { secretBase32, otpauthUrl } = await mfaIniciar();
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 });
      setEstado({ paso: "configurando", secretBase32, qrDataUrl, codigo: "" });
    } catch {
      setError("No se pudo iniciar la configuración de MFA.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (estado.paso !== "configurando") return;
    setError(null);
    setEnviando(true);
    try {
      const { codigosRecuperacion } = await mfaConfirmar(estado.codigo);
      setMfaHabilitado(true);
      setEstado({ paso: "codigos", codigosRecuperacion });
    } catch (err) {
      setError(err instanceof ErrorApi ? "Código incorrecto, verifica la hora de tu dispositivo e inténtalo de nuevo." : "No se pudo confirmar MFA.");
    } finally {
      setEnviando(false);
    }
  }

  async function deshabilitar(e: FormEvent) {
    e.preventDefault();
    if (estado.paso !== "deshabilitando") return;
    setError(null);
    setEnviando(true);
    try {
      await mfaDeshabilitar(estado.password);
      setMfaHabilitado(false);
      setEstado({ paso: "inicial" });
    } catch (err) {
      setError(err instanceof ErrorApi ? "Contraseña incorrecta." : "No se pudo deshabilitar MFA.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verificación en dos pasos (MFA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {estado.paso === "inicial" && mfaHabilitado && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">MFA está habilitado en tu cuenta.</p>
            <Button variant="outline" onClick={() => setEstado({ paso: "deshabilitando", password: "" })}>
              Deshabilitar MFA
            </Button>
          </div>
        )}

        {estado.paso === "inicial" && !mfaHabilitado && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Añade una capa extra de seguridad con una app de autenticación (Google Authenticator, 1Password, etc.).
            </p>
            <Button onClick={iniciar} disabled={enviando}>
              {enviando ? "Generando…" : "Habilitar MFA"}
            </Button>
          </div>
        )}

        {estado.paso === "configurando" && (
          <form onSubmit={confirmar} className="max-w-sm space-y-3" noValidate>
            <p className="text-sm text-muted-foreground">Escanea este código con tu app de autenticación:</p>
            <img src={estado.qrDataUrl} alt="Código QR para configurar MFA" width={200} height={200} />
            <p className="text-xs text-muted-foreground">
              O ingresa manualmente: <code className="break-all">{estado.secretBase32}</code>
            </p>
            <div className="space-y-1">
              <label htmlFor="codigoMfaConfirmar" className="text-xs font-medium text-muted-foreground">
                Código de 6 dígitos
              </label>
              <input
                id="codigoMfaConfirmar"
                type="text"
                inputMode="numeric"
                required
                autoFocus
                value={estado.codigo}
                onChange={(e) => setEstado({ ...estado, codigo: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Verificando…" : "Confirmar y habilitar"}
            </Button>
          </form>
        )}

        {estado.paso === "codigos" && (
          <div className="space-y-2">
            <p className="text-sm">MFA habilitado. Guarda estos códigos de recuperación en un lugar seguro — cada uno funciona una sola vez:</p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
              {estado.codigosRecuperacion.map((codigo) => (
                <li key={codigo} className="rounded bg-muted px-2 py-1">
                  {codigo}
                </li>
              ))}
            </ul>
            <Button onClick={() => setEstado({ paso: "inicial" })}>Listo</Button>
          </div>
        )}

        {estado.paso === "deshabilitando" && (
          <form onSubmit={deshabilitar} className="max-w-sm space-y-3" noValidate>
            <div className="space-y-1">
              <label htmlFor="passwordDeshabilitar" className="text-xs font-medium text-muted-foreground">
                Confirma tu contraseña para deshabilitar MFA
              </label>
              <input
                id="passwordDeshabilitar"
                type="password"
                required
                autoFocus
                value={estado.password}
                onChange={(e) => setEstado({ ...estado, password: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={enviando}>
                {enviando ? "Deshabilitando…" : "Confirmar"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEstado({ paso: "inicial" })}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
