import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ErrorDominio } from "../contrato/errores.js";
import { csrfTokenValidoParaRefresh } from "../seguridad/jwt.js";

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
 *   - `rv_csrf`: patrón de doble envío (double-submit cookie) — NO
 *     httpOnly (el JS de apps/web SÍ debe poder leerlo) y el cliente debe
 *     reenviar su valor en la cabecera `X-CSRF-Token` en cualquier método
 *     que mute estado. Un atacante que fuerza una petición cross-site
 *     puede hacer que el navegador adjunte `rv_refresh` automáticamente,
 *     pero NO puede leer `rv_csrf` de un origen distinto (same-origin
 *     policy) para replicarlo en la cabecera.
 *
 *     A diferencia de un doble-envío "clásico" (valor puramente
 *     aleatorio, independiente de la sesión — así estaba antes de
 *     A3-AUTH-02), el valor de `rv_csrf` se deriva como HMAC-SHA256 del
 *     propio `refreshToken` de esa sesión con una clave de servidor
 *     (`derivarTokenCsrf`/`csrfTokenValidoParaRefresh` en
 *     `../seguridad/jwt.ts`) — está ligado criptográficamente a la
 *     sesión, no solo comparado por igualdad cookie===cabecera. Esto
 *     cierra la vía residual que un doble-envío puro no cubre: un
 *     atacante que consigue fijar `rv_csrf` en el navegador de la
 *     víctima por otro medio (p. ej. "cookie tossing" desde un
 *     subdominio hermano, ver docs/auditoria-3/seguridad-auth.md
 *     A3-AUTH-02) y que controla la cabecera en su petición cross-site NO
 *     puede adivinar el HMAC correcto sin conocer `JWT_SECRET`, así que
 *     la verificación falla aunque cookie y cabecera coincidan entre sí.
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
 * Middleware CSRF (doble envío ligado a la sesión, A3-AUTH-02): solo
 * actúa cuando la petición TRAE la cookie `rv_refresh` (es decir, es un
 * cliente 'web') — un cliente 'api' autenticado por bearer puro nunca
 * lleva esa cookie y nunca necesita pasar por aquí (un bearer token no
 * viaja automáticamente en una petición cross-site forjada por un
 * navegador, así que no hay CSRF que mitigar en ese caso). Métodos de
 * solo lectura (GET/HEAD/OPTIONS) se excluyen siempre.
 *
 * Requiere el mismo secreto de servidor (`JWT_SECRET`, vía `jwtSecret`)
 * que firma los access tokens, para recalcular el HMAC esperado a partir
 * del `refreshToken` REAL que trae la petición (`rv_refresh`) y exigir
 * que tanto la cookie `rv_csrf` como la cabecera `X-CSRF-Token` coincidan
 * con ese valor — no basta con que cookie y cabecera coincidan ENTRE SÍ
 * (eso es lo que permitía la vía de "cookie tossing" descrita en
 * A3-AUTH-02: un atacante que fija su propio valor en ambas no puede
 * producir el HMAC correcto sin conocer el secreto).
 */
export function verificarCsrf(jwtSecret: string): MiddlewareHandler {
  return async (c, next) => {
    const metodo = c.req.method.toUpperCase();
    const refreshTokenActual = obtenerCookieRefresh(c);
    if (refreshTokenActual !== undefined && !["GET", "HEAD", "OPTIONS"].includes(metodo)) {
      const cookieCsrf = getCookie(c, NOMBRE_COOKIE_CSRF);
      const cabeceraCsrf = c.req.header("x-csrf-token");
      const cookieValida = cookieCsrf !== undefined && csrfTokenValidoParaRefresh(cookieCsrf, refreshTokenActual, jwtSecret);
      const cabeceraValida = cabeceraCsrf !== undefined && csrfTokenValidoParaRefresh(cabeceraCsrf, refreshTokenActual, jwtSecret);
      if (!cookieValida || !cabeceraValida) {
        throw new ErrorDominio("csrf_invalido", "Falta o no coincide el token CSRF (X-CSRF-Token)");
      }
    }
    await next();
  };
}
