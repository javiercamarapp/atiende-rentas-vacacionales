import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { ErrorDominio } from "../contrato/errores.js";

/**
 * Rate limiting básico (LOTES.md Lote 3: "rate limiting básico"): ventana
 * fija en memoria, por clave + ruta. Suficiente para un solo proceso —
 * NO distribuido, documentado explícitamente como limitación de esta
 * primitiva desde su origen.
 *
 * Patrón 3 (rescatado de Likida/atiende.ai, ver
 * apps/api/src/seguridad/rateLimitPostgres.ts): tras confirmarse que el
 * despliegue real es Vercel serverless (multi-instancia, con cold starts
 * que arrancan un proceso Node nuevo y por tanto un `Map` vacío), tanto el
 * middleware GLOBAL (`app.ts`, `app.use("*", ...)`) como el límite por
 * email de `/auth/login` (`routes/auth.ts`) se migraron de
 * `LimitadorVentana`/`crearRateLimit` (este archivo) a
 * `LimitadorVentanaPostgres`/`crearRateLimitPostgres`
 * (./rateLimitPostgres.ts), que persiste el contador en la tabla
 * `rate_limit_bucket` y por tanto SÍ se comparte entre instancias. Esta
 * clase y este middleware YA NO tienen ningún consumidor en producción —
 * se conservan (con sus pruebas propias, `test/seguridad/rateLimit.test.ts`
 * y la regresión histórica `tests/auditoria-3/auth/
 * rateLimitNoDistribuido.test.ts`) como primitiva reutilizable para un
 * límite puramente local sin Postgres (p. ej. una herramienta de un solo
 * proceso, o un test que no quiere levantar `embedded-postgres`).
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
 *   2. `LimitadorVentana` es una primitiva reutilizable: la misma lógica de
 *      resolución de IP (`resolverIp`, exportada más abajo) la reutiliza
 *      `crearRateLimitPostgres` para no duplicar S-06 en dos archivos que
 *      podrían divergir.
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
 * confianza — nunca por defecto. Exportada (patrón 3) para que
 * `crearRateLimitPostgres` resuelva la IP con la MISMA lógica exacta que
 * este middleware. */
export function resolverIp(c: Context, proxiesDeConfianza: readonly string[]): string {
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
