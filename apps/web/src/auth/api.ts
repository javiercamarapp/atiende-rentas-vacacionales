// Lote 3.2 (H-096+): cliente tipado de los endpoints de auth extendida
// (Google/OIDC, registro, verificación de correo, olvidé/restablecer
// contraseña, MFA TOTP, sesiones activas) — complementa, sin reemplazar,
// `lib/sesion/SesionProvider.tsx` (login/logout mínimos de Lote 3/4) y
// `lib/api/cliente.ts` (transporte compartido). Mismo patrón de error
// tipado (`ErrorApi`) que el resto de `pages/*/api.ts`.
import { BASE_URL, peticion } from "../lib/api/cliente";

export interface RespuestaConfigAuth {
  googleHabilitado: boolean;
  googleMotivoDeshabilitado: string | null;
  registroAbierto: boolean;
}

export function obtenerConfigAuth(): Promise<RespuestaConfigAuth> {
  return peticion<RespuestaConfigAuth>("/auth/config");
}

/** URL de inicio del flujo de Google — es una navegación de página
 * completa (redirect 302 a Google), no una llamada `fetch`. */
export function urlIniciarGoogle(opciones: { invitacionToken?: string; tenantId?: string } = {}): string {
  const params = new URLSearchParams();
  if (opciones.invitacionToken) params.set("invitacionToken", opciones.invitacionToken);
  if (opciones.tenantId) params.set("tenantId", opciones.tenantId);
  const qs = params.toString();
  const base = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  return `${base}/auth/google/inicio${qs ? `?${qs}` : ""}`;
}

export interface CuerpoRegistro {
  email: string;
  password: string;
  nombre?: string;
  invitacionToken?: string;
  tenantId?: string;
}

export function registrar(cuerpo: CuerpoRegistro): Promise<{ id: string; requiereVerificacionCorreo: boolean }> {
  return peticion("/auth/registro", { metodo: "POST", cuerpo });
}

export function verificarCorreo(token: string): Promise<{ verificado: true }> {
  return peticion("/auth/verificar-correo", { metodo: "POST", cuerpo: { token } });
}

export function reenviarVerificacion(email: string): Promise<{ enviado: true }> {
  return peticion("/auth/reenviar-verificacion", { metodo: "POST", cuerpo: { email } });
}

export function olvidePassword(email: string): Promise<{ enviado: true }> {
  return peticion("/auth/olvide-password", { metodo: "POST", cuerpo: { email } });
}

export function restablecerPassword(token: string, password: string): Promise<{ restablecido: true }> {
  return peticion("/auth/restablecer-password", { metodo: "POST", cuerpo: { token, password } });
}

export function cambiarPassword(passwordActual: string, passwordNueva: string): Promise<{ cambiada: true }> {
  return peticion("/auth/cambiar-password", { metodo: "POST", cuerpo: { passwordActual, passwordNueva } });
}

export interface RespuestaMfaIniciar {
  secretBase32: string;
  otpauthUrl: string;
}

export function mfaIniciar(): Promise<RespuestaMfaIniciar> {
  return peticion("/auth/mfa/iniciar", { metodo: "POST" });
}

export function mfaConfirmar(codigo: string): Promise<{ habilitado: true; codigosRecuperacion: string[] }> {
  return peticion("/auth/mfa/confirmar", { metodo: "POST", cuerpo: { codigo } });
}

export function mfaDeshabilitar(password: string): Promise<{ deshabilitado: true }> {
  return peticion("/auth/mfa/deshabilitar", { metodo: "POST", cuerpo: { password } });
}

export interface SesionActiva {
  id: string;
  creadoEn: string;
  expiraEn: string;
  aud: "api" | "web";
  dispositivoEtiqueta: string | null;
  actual: boolean;
}

export function listarSesiones(): Promise<{ sesiones: SesionActiva[] }> {
  return peticion("/auth/sesiones");
}

export function revocarSesion(id: string): Promise<{ revocada: true }> {
  return peticion(`/auth/sesiones/${id}`, { metodo: "DELETE" });
}

export function logoutGlobal(): Promise<void> {
  return peticion("/auth/logout-global", { metodo: "POST" });
}
