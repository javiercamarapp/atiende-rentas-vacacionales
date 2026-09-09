// Auditoría-3 / A3-auth-02
//
// Hallazgo: `apps/api/src/middleware/cookiesAuth.ts` implementa CSRF por
// "doble envío" (double-submit cookie): `rv_csrf` es un valor puramente
// aleatorio (`generarValorAleatorio(16)`, ver apps/api/src/routes/
// auth.ts:269,453) SIN ninguna relación criptográfica con la sesión
// (no es un HMAC del refresh token / id de sesión con una clave del
// servidor). `verificarCsrf()` (cookiesAuth.ts:82-95) solo comprueba que
// la cookie `rv_csrf` sea IGUAL a la cabecera `X-CSRF-Token` — nunca
// comprueba que ese token corresponda a la sesión (cookie `rv_refresh`)
// que acompaña la petición.
//
// Esto es una variante más débil que "doble envío firmado" (RFC 9700 /
// OWASP recomienda idealmente ligar el token CSRF a la sesión con HMAC).
// El vector de explotación real requiere que un atacante consiga, por
// cualquier otra vía (p. ej. una vulnerabilidad de "cookie tossing" desde
// un subdominio hermano, o cualquier debilidad que le permita escribir la
// cookie `rv_csrf` en el navegador de la víctima — la cookie NO es
// httpOnly a propósito, ver comentario líneas 17-25), fijar un valor de
// `rv_csrf` que él mismo conoce; en ese caso el servidor acepta CUALQUIER
// combinación de `rv_refresh` (sesión legítima de la víctima) + `rv_csrf`
// conocido por el atacante, sin importar que nunca se emitieron juntos.
//
// Esta prueba demuestra el hecho estructural, sin necesitar red ni BD:
// se toma el token CSRF válido emitido para la "sesión A" y se combina
// con la cookie de refresh de una "sesión B" completamente distinta — el
// middleware lo acepta igual, confirmando que no hay ningún vínculo
// criptográfico entre el CSRF token y la sesión concreta.
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { verificarCsrf, fijarCookieRefresh, fijarCookieCsrf } from "../../../apps/api/src/middleware/cookiesAuth.js";

function extraerCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cab of res.headers.getSetCookie?.() ?? []) {
    const [par] = cab.split(";");
    const [n, v] = par!.split("=");
    out[n!] = v!;
  }
  return out;
}

describe("A3-auth-02: token CSRF de doble envío no está ligado a la sesión", () => {
  it("acepta el CSRF token de la sesión A combinado con el refresh cookie de la sesión B", async () => {
    const app = new Hono();
    app.get("/emitir/:quien", (c) => {
      fijarCookieRefresh(c, `refresh-de-sesion-${c.req.param("quien")}`, { segura: false, maxAgeMs: 60_000 });
      fijarCookieCsrf(c, `csrf-de-sesion-${c.req.param("quien")}`, { segura: false, maxAgeMs: 60_000 });
      return c.json({ ok: true });
    });
    app.post("/mutar", verificarCsrf(), (c) => c.json({ mutado: true }));

    const emitidoA = await app.request("/emitir/A");
    const cookiesA = extraerCookies(emitidoA);
    const emitidoB = await app.request("/emitir/B");
    const cookiesB = extraerCookies(emitidoB);

    expect(cookiesA.rv_csrf).not.toBe(cookiesB.rv_csrf);
    expect(cookiesA.rv_refresh).not.toBe(cookiesB.rv_refresh);

    // Combinación cruzada: refresh de B (sesión "víctima") + csrf de A
    // (token que un atacante consiguió fijar/leer por otra vía) + cabecera
    // X-CSRF-Token = csrf de A. El middleware NO detecta que csrf-A nunca
    // se emitió junto con refresh-B.
    const resCruzada = await app.request("/mutar", {
      method: "POST",
      headers: {
        cookie: `rv_refresh=${cookiesB.rv_refresh}; rv_csrf=${cookiesA.rv_csrf}`,
        "x-csrf-token": decodeURIComponent(cookiesA.rv_csrf!),
      },
    });

    expect(resCruzada.status).toBe(200);
    expect(await resCruzada.json()).toEqual({ mutado: true });
  });
});
