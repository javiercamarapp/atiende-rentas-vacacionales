import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { ErrorDominio } from "../contrato/errores.js";

/**
 * Rate limiting básico (LOTES.md Lote 3: "rate limiting básico"): ventana
 * fija en memoria, por clave + ruta. Suficiente para un solo proceso de
 * apps/api (no distribuido) — documentado explícitamente como limitación:
 * un despliegue multi-instancia necesita un backend compartido (Redis u
 * otro), fuera de alcance de este lote (ver docs/PROGRESO.md).
 *
 * S-06 (docs/auditoria-2/seguridad.md): el rate limit original identificaba
 * al cliente SOLO por la cabecera `X-Forwarded-For`/`X-Real-IP`, que
 * cualquier cliente controla directamente — rotar esa cabecera en cada
 * request evadía el límite indefinidamente. Ahora:
 *   1. La clave de IP es SIEMPRE la del socket TCP real que conectó, salvo
 *      que esa IP de socket esté en una allow-list explícita de proxies de
 *      confianza (`proxiesDeConfianza`) — solo entonces se confía en las
 *      cabeceras para identificar al cliente real detrás de ese proxy.
 *      Vacía por defecto (fail-safe): sin proxy de confianza configurado,
 *      rotar `X-Forwarded-For` no tiene ningún efecto.
 *   2. `LimitadorVentana` es una primitiva reutilizable: además del límite
 *      genérico por IP de esta clase, `apps/api/src/routes/auth.ts` la usa
 *      para un límite INDEPENDIENTE por email/usuario en `/auth/login`, de
 *      forma que un atacante con muchas IPs distintas (o detrás de un NAT
 *      compartido con usuarios legítimos) tampoco pueda hacer fuerza bruta
 *      ilimitada contra una sola cuenta.
 */
interface Contador {
  cuenta: number;
  reiniciaEn: number;
}

export interface OpcionesRateLimit {
  ventanaMs: number;
  maximo: number;
}

/** Contador de ventana fija en memoria, reutilizable por cualquier clave
 * de negocio (IP+ruta, email normalizado, etc.). */
export class LimitadorVentana {
  private readonly contadores = new Map<string, Contador>();

  constructor(private readonly opciones: OpcionesRateLimit) {}

  /** Registra un intento para `clave`. Lanza `ErrorDominio("rate_limited",
   * ...)` si ya se alcanzó el máximo configurado dentro de la ventana
   * vigente; si no, incrementa el contador y retorna normalmente. */
  registrarIntento(clave: string): void {
    const ahora = Date.now();
    const existente = this.contadores.get(clave);

    if (!existente || existente.reiniciaEn <= ahora) {
      this.contadores.set(clave, { cuenta: 1, reiniciaEn: ahora + this.opciones.ventanaMs });
      return;
    }

    if (existente.cuenta >= this.opciones.maximo) {
      throw new ErrorDominio("rate_limited", "Demasiadas solicitudes, intenta de nuevo más tarde");
    }

    existente.cuenta += 1;
  }
}

/** IP real del socket TCP que conectó — nunca una cabecera que el cliente
 * controla. En un contexto sin socket real subyacente (p. ej. pruebas que
 * invocan `app.request()` directamente, sin pasar por `@hono/node-server`)
 * `getConnInfo` no puede resolver nada; se degrada a una clave constante
 * en vez de lanzar, para no romper ese modo de invocación — todas esas
 * peticiones comparten entonces la misma clave de limitación, lo cual es
 * la postura fail-safe correcta (nunca fail-open). */
function ipDelSocket(c: Context): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address ?? "socket-desconocido";
  } catch {
    return "socket-desconocido";
  }
}

/** S-06: solo se confía en `X-Forwarded-For`/`X-Real-IP` cuando la IP que
 * REALMENTE conectó el socket está en la allow-list de proxies de
 * confianza — nunca por defecto. */
function resolverIp(c: Context, proxiesDeConfianza: readonly string[]): string {
  const ipSocket = ipDelSocket(c);
  if (proxiesDeConfianza.length === 0 || !proxiesDeConfianza.includes(ipSocket)) {
    return ipSocket;
  }
  const primeraXff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (primeraXff) return primeraXff;
  const real = c.req.header("x-real-ip");
  if (real) return real;
  return ipSocket;
}

export interface OpcionesRateLimitMiddleware extends OpcionesRateLimit {
  /** IPs de proxy de confianza (balanceador/reverse proxy propio) que sí
   * pueden fijar `X-Forwarded-For`/`X-Real-IP` de forma confiable. Vacía
   * por defecto — fail-safe (S-06). */
  proxiesDeConfianza?: readonly string[];
}

export function crearRateLimit(opciones: OpcionesRateLimitMiddleware): MiddlewareHandler {
  const limitador = new LimitadorVentana(opciones);
  const proxiesDeConfianza = opciones.proxiesDeConfianza ?? [];

  return async (c, next) => {
    const clave = `${resolverIp(c, proxiesDeConfianza)}:${c.req.method}:${new URL(c.req.url).pathname}`;
    limitador.registrarIntento(clave);
    await next();
  };
}
