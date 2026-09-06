import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { ColaboradorNivel, RolUsuario } from "../contrato/tipos.js";

/**
 * JWT propio con `jose` (H-040, D-009): claims compatibles en espíritu con
 * el patrón RLS real de `atiende-restaurantes` (`sub` = usuario, más los
 * claims propios de este dominio: `tenant_id`, `rol`, `colaborador_nivel`)
 * — la diferencia con Supabase es que aquí NO hay `auth.uid()`: es
 * apps/api quien verifica este JWT y quien fija `SET LOCAL app.user_id`
 * (packages/db/src/migrations/0014-0016) a partir del claim `sub` ya
 * verificado, nunca a partir de un valor sin firmar.
 */

export interface ClaimsAcceso {
  sub: string;
  tenant_id: string | null;
  rol: RolUsuario;
  colaborador_nivel: ColaboradorNivel | null;
  /** Cliente para el que se emitió este token (Lote 3.2, H-096): 'web'
   * (sesión de navegador, refresh en cookie httpOnly) o 'api' (bearer
   * puro — integraciones, apps/web anterior a Lote 3.2, pruebas). Nunca
   * se exige que coincida entre distintos endpoints de recursos (el
   * access token sigue siendo válido para cualquier ruta autenticada,
   * como antes) — solo documenta/audita de qué flujo de login nació. */
  aud: string;
}

const DURACION_ACCESS_TOKEN_SEGUNDOS = 15 * 60; // 15 minutos
export const DURACION_REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const DURACION_MFA_PENDIENTE_SEGUNDOS = 5 * 60; // 5 minutos

function obtenerSecreto(secretoEnv: string): Uint8Array {
  if (secretoEnv.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres (256 bits) para HS256");
  }
  return new TextEncoder().encode(secretoEnv);
}

export async function emitirAccessToken(
  claims: Omit<ClaimsAcceso, "aud"> & { aud?: string },
  secretoEnv: string,
): Promise<{ token: string; expiraEn: number }> {
  const secreto = obtenerSecreto(secretoEnv);
  const token = await new SignJWT({
    tenant_id: claims.tenant_id,
    rol: claims.rol,
    colaborador_nivel: claims.colaborador_nivel,
    aud: claims.aud ?? "api",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_ACCESS_TOKEN_SEGUNDOS}s`)
    .sign(secreto);
  return { token, expiraEn: DURACION_ACCESS_TOKEN_SEGUNDOS };
}

export async function verificarAccessToken(token: string, secretoEnv: string): Promise<ClaimsAcceso> {
  const secreto = obtenerSecreto(secretoEnv);
  const { payload } = await jwtVerify(token, secreto);
  if (typeof payload.sub !== "string") {
    throw new Error("token sin claim 'sub'");
  }
  return {
    sub: payload.sub,
    tenant_id: (payload.tenant_id as string | null) ?? null,
    rol: payload.rol as RolUsuario,
    colaborador_nivel: (payload.colaborador_nivel as ColaboradorNivel | null) ?? null,
    aud: typeof payload.aud === "string" ? payload.aud : "api",
  };
}

// --- Token intermedio de MFA (Lote 3.2, H-096) ---
//
// Emitido por POST /auth/login cuando la contraseña ya se verificó pero el
// usuario tiene MFA TOTP habilitado: NUNCA lleva rol/tenant/colaborador
// (no autoriza absolutamente nada por sí mismo, `requiereAutenticacion` lo
// rechaza porque no es el tipo de token que espera) — su ÚNICO uso posible
// es canjearse en `POST /auth/mfa/verificar` junto con el código TOTP/de
// recuperación, dentro de una ventana corta (5 minutos).
const TIPO_MFA_PENDIENTE = "mfa_pendiente";

export async function emitirMfaPendienteToken(usuarioId: string, secretoEnv: string): Promise<{ token: string; expiraEn: number }> {
  const secreto = obtenerSecreto(secretoEnv);
  const token = await new SignJWT({ tipo: TIPO_MFA_PENDIENTE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_MFA_PENDIENTE_SEGUNDOS}s`)
    .sign(secreto);
  return { token, expiraEn: DURACION_MFA_PENDIENTE_SEGUNDOS };
}

export async function verificarMfaPendienteToken(token: string, secretoEnv: string): Promise<string> {
  const secreto = obtenerSecreto(secretoEnv);
  const { payload } = await jwtVerify(token, secreto);
  if (payload.tipo !== TIPO_MFA_PENDIENTE || typeof payload.sub !== "string") {
    throw new Error("Token de MFA pendiente inválido");
  }
  return payload.sub;
}

/** El refresh token en sí es un secreto opaco de alta entropía (nunca un
 * JWT firmado): solo su HASH SHA-256 se guarda en `refresh_token`
 * (§RV19/21-7 — ni siquiera la propia base de datos de la aplicación
 * guarda el valor recuperable). */
export function generarRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, hash: hashearRefreshToken(token) };
}

export function hashearRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
