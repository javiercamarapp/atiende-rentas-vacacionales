import type { MiddlewareHandler } from "hono";

/**
 * Logger sin PII (H-047, §RV19/21-7, D-021: "ningún log interpola nombre/
 * documento/teléfono de huésped en el Body" es decisión de producto propia,
 * no garantía automática de la herramienta). Registra únicamente
 * metadatos operativos: método, ruta (sin querystring, que podría llevar
 * un email en un filtro), status, duración, `tenant_id`/`usuario_id`
 * (identificadores internos, no PII de huésped) cuando la request ya pasó
 * por autenticación. Nunca registra: cuerpo de la request/response,
 * cabeceras (podrían llevar el propio JWT o el `Authorization`), query
 * params completos, ni ningún campo de huésped (nombre/contacto).
 */
export function crearLogger(escribir: (linea: string) => void = console.log): MiddlewareHandler {
  return async (c, next) => {
    const inicio = Date.now();
    await next();
    const duracionMs = Date.now() - inicio;
    const auth = c.get("auth") as { tenantId?: string | null; usuarioId?: string } | undefined;

    const linea = {
      metodo: c.req.method,
      ruta: new URL(c.req.url).pathname,
      status: c.res.status,
      duracionMs,
      tenantId: auth?.tenantId ?? null,
      usuarioId: auth?.usuarioId ?? null,
    };
    escribir(JSON.stringify(linea));
  };
}
