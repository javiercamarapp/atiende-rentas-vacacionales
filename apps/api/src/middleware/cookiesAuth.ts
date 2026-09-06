import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ErrorDominio } from "../contrato/errores.js";

/**
 * Cookies de sesión para el cliente 'web' (Lote 3.2, H-096) — el cliente
 * 'api' (bearer puro, compatibilidad con Lote 3/Lote 9/apps/web anterior a
 * este lote) nunca usa nada de este archivo.
 *
 * Dos cookies:
 *   - `rv_refresh`: el refresh token en sí, httpOnly (inaccesible a JS,
 *     mitiga robo por XSS), `Secure` (nunca viaja en claro salvo en
 *     desarrollo local por http — ver `cookieSecura`), `SameSite=Lax`
 *     (suficiente para un flujo de navegación normal + permite el redirect
 *     de vuelta de Google OAuth, que es top-level GET; `Strict` rompería
 *     ese callback).
 *   - `rv_csrf`: patrón de doble envío (double-submit cookie) — un valor
 *     aleatorio NO httpOnly (el JS de apps/web SÍ debe poder leerlo) que
 *     el cliente debe reenviar en la cabecera `X-CSRF-Token` en cualquier
 *     método que mute estado. Un atacante que fuerza una petición
 *     cross-site puede hacer que el navegador adjunte `rv_refresh`
 *     automáticamente, pero NO puede leer `rv_csrf` de un origen distinto
 *     (same-origin policy) para replicarlo en la cabecera — por eso el
 *     doble envío neutraliza CSRF sin necesitar estado de sesión en el
 *     servidor.
 */

const NOMBRE_COOKIE_REFRESH = "rv_refresh";
const NOMBRE_COOKIE_CSRF = "rv_csrf";

/** `Secure` deshabilitado SOLO en desarrollo/pruebas explícitos (mismo
 * criterio fail-closed que el resto de `config/env.ts`: cualquier otro
 * valor de entorno exige `Secure`, nunca al revés) — un navegador ignora
 * una cookie `Secure` servida por http, así que en `localhost:8787` sin
 * TLS de desarrollo la cookie de refresh nunca llegaría al cliente si
 * `Secure` estuviera siempre activo. */
export function cookieEsSegura(entorno: "development" | "test" | "production"): boolean {
  return entorno === "production";
}

export function fijarCookieRefresh(c: Context, refreshToken: string, opciones: { segura: boolean; maxAgeMs: number }): void {
  setCookie(c, NOMBRE_COOKIE_REFRESH, refreshToken, {
    httpOnly: true,
    secure: opciones.segura,
    sameSite: "Lax",
    path: "/auth",
    maxAge: Math.floor(opciones.maxAgeMs / 1000),
  });
}

export function limpiarCookieRefresh(c: Context, opciones: { segura: boolean }): void {
  deleteCookie(c, NOMBRE_COOKIE_REFRESH, { path: "/auth", secure: opciones.segura, sameSite: "Lax" });
}

export function obtenerCookieRefresh(c: Context): string | undefined {
  return getCookie(c, NOMBRE_COOKIE_REFRESH);
}

export function fijarCookieCsrf(c: Context, token: string, opciones: { segura: boolean; maxAgeMs: number }): void {
  setCookie(c, NOMBRE_COOKIE_CSRF, token, {
    httpOnly: false,
    secure: opciones.segura,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(opciones.maxAgeMs / 1000),
  });
}

export function limpiarCookieCsrf(c: Context, opciones: { segura: boolean }): void {
  deleteCookie(c, NOMBRE_COOKIE_CSRF, { path: "/", secure: opciones.segura, sameSite: "Lax" });
}

/**
 * Middleware CSRF (doble envío): solo actúa cuando la petición TRAE la
 * cookie `rv_refresh` (es decir, es un cliente 'web') — un cliente 'api'
 * autenticado por bearer puro nunca lleva esa cookie y nunca necesita
 * pasar por aquí (un bearer token no viaja automáticamente en una
 * petición cross-site forjada por un navegador, así que no hay CSRF que
 * mitigar en ese caso). Métodos de solo lectura (GET/HEAD/OPTIONS) se
 * excluyen siempre.
 */
export function verificarCsrf(): MiddlewareHandler {
  return async (c, next) => {
    const metodo = c.req.method.toUpperCase();
    const tieneCookieRefresh = obtenerCookieRefresh(c) !== undefined;
    if (tieneCookieRefresh && !["GET", "HEAD", "OPTIONS"].includes(metodo)) {
      const cookieCsrf = getCookie(c, NOMBRE_COOKIE_CSRF);
      const cabeceraCsrf = c.req.header("x-csrf-token");
      if (!cookieCsrf || !cabeceraCsrf || cookieCsrf !== cabeceraCsrf) {
        throw new ErrorDominio("csrf_invalido", "Falta o no coincide el token CSRF (X-CSRF-Token)");
      }
    }
    await next();
  };
}
