import type { MiddlewareHandler } from "hono";
import { ErrorDominio } from "../contrato/errores.js";

/**
 * Rate limiting básico (LOTES.md Lote 3: "rate limiting básico"): ventana
 * fija en memoria, por IP + ruta. Suficiente para un solo proceso de
 * apps/api (no distribuido) — documentado explícitamente como limitación:
 * un despliegue multi-instancia necesita un backend compartido (Redis u
 * otro), fuera de alcance de este lote (ver docs/PROGRESO.md).
 */
interface Contador {
  cuenta: number;
  reiniciaEn: number;
}

export interface OpcionesRateLimit {
  ventanaMs: number;
  maximo: number;
}

function obtenerIp(c: { req: { header: (nombre: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "desconocida"
  );
}

export function crearRateLimit(opciones: OpcionesRateLimit): MiddlewareHandler {
  const contadores = new Map<string, Contador>();

  return async (c, next) => {
    const clave = `${obtenerIp(c)}:${c.req.method}:${new URL(c.req.url).pathname}`;
    const ahora = Date.now();
    const existente = contadores.get(clave);

    if (!existente || existente.reiniciaEn <= ahora) {
      contadores.set(clave, { cuenta: 1, reiniciaEn: ahora + opciones.ventanaMs });
      await next();
      return;
    }

    if (existente.cuenta >= opciones.maximo) {
      throw new ErrorDominio("rate_limited", "Demasiadas solicitudes, intenta de nuevo más tarde");
    }

    existente.cuenta += 1;
    await next();
  };
}
