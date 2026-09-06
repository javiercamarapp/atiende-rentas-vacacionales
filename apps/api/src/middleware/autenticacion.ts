import type { MiddlewareHandler } from "hono";
import { errors as erroresJose } from "jose";
import { ErrorDominio } from "../contrato/errores.js";
import { verificarAccessToken } from "../seguridad/jwt.js";
import type { ColaboradorNivel, RolUsuario } from "../contrato/tipos.js";

export interface ContextoAuth {
  usuarioId: string;
  tenantId: string | null;
  rol: RolUsuario;
  colaboradorNivel: ColaboradorNivel | null;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: ContextoAuth;
  }
}

/**
 * Middleware de autenticación (H-040): exige `Authorization: Bearer <jwt>`,
 * verifica firma/expiración con `jose` y adjunta los claims ya verificados
 * a `c.set('auth', ...)`. Nunca registra el token ni el header completo
 * (§RV19/21-7) — solo el resultado de verificarlo.
 */
export function requiereAutenticacion(jwtSecret: string): MiddlewareHandler {
  return async (c, next) => {
    const cabecera = c.req.header("authorization") ?? c.req.header("Authorization");
    if (!cabecera || !cabecera.startsWith("Bearer ")) {
      throw new ErrorDominio("token_invalido", "Falta el encabezado Authorization: Bearer <token>");
    }
    const token = cabecera.slice("Bearer ".length).trim();

    try {
      const claims = await verificarAccessToken(token, jwtSecret);
      c.set("auth", {
        usuarioId: claims.sub,
        tenantId: claims.tenant_id,
        rol: claims.rol,
        colaboradorNivel: claims.colaborador_nivel,
      });
    } catch (error) {
      if (error instanceof erroresJose.JWTExpired) {
        throw new ErrorDominio("token_expirado", "El token de acceso expiró, usa /auth/refresh");
      }
      throw new ErrorDominio("token_invalido", "Token de acceso inválido");
    }

    await next();
  };
}
