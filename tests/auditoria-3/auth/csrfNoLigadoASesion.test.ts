// Auditoría-3 / A3-AUTH-02 — CORREGIDO.
//
// Hallazgo original: `apps/api/src/middleware/cookiesAuth.ts` implementaba
// CSRF por "doble envío" (double-submit cookie) con `rv_csrf` como un
// valor PURAMENTE ALEATORIO (`generarValorAleatorio(16)`, emitido en
// `apps/api/src/routes/auth.ts:269,453` de entonces) SIN ninguna relación
// criptográfica con la sesión (no era un HMAC del refresh token / id de
// sesión con una clave del servidor). `verificarCsrf()` solo comparaba
// `cookie rv_csrf === cabecera X-CSRF-Token`, nunca verificaba que ese
// CSRF se hubiera emitido junto con la sesión (`rv_refresh`) que
// acompañaba la petición.
//
// Esto era una variante más débil que "doble envío firmado" (RFC 9700 /
// OWASP recomienda ligar el token CSRF a la sesión con HMAC). El riesgo
// entonces era teórico/defensa en profundidad (documentado en
// docs/auditoria-3/seguridad-auth.md): explotarlo exigía otra vía
// adicional para que un atacante fijara `rv_csrf` en el navegador de la
// víctima (la cookie no es httpOnly a propósito) — p. ej. "cookie
// tossing" desde un subdominio hermano. No se encontró tal vía en el
// repo, pero el hallazgo real (la falta de ligadura criptográfica) sí se
// cierra aquí, no solo se documenta.
//
// Corrección: `apps/api/src/seguridad/jwt.ts` añade `derivarTokenCsrf` /
// `csrfTokenValidoParaRefresh` — `rv_csrf` ahora es HMAC-SHA256 del
// `refreshToken` de ESA sesión con una subclave derivada de `JWT_SECRET`
// (nunca un valor independiente). `verificarCsrf(jwtSecret)`
// (`cookiesAuth.ts`) recalcula ese HMAC a partir del `rv_refresh` REAL que
// trae la petición y exige que TANTO la cookie `rv_csrf` COMO la cabecera
// `X-CSRF-Token` coincidan con el valor esperado — ya no basta con que
// cookie y cabecera coincidan entre sí.
//
// Este archivo tiene DOS bloques:
//   1. El original, adaptado: reproduce la combinación cruzada
//      "CSRF de la sesión A + refresh de la sesión B" y confirma que
//      AHORA se rechaza (antes pasaba — ver el hallazgo original arriba).
//   2. Uno nuevo que reproduce el vector de explotación real descrito en
//      el hallazgo ("cookie tossing"): un atacante fija su propio valor,
//      IGUAL en cookie y cabecera, sobre el `rv_refresh` real de la
//      víctima — con el código viejo esto pasaba (cookie===cabecera); con
//      el fix se rechaza, porque ese valor no es el HMAC correcto para el
//      refresh token real de la víctima y el atacante no conoce
//      `JWT_SECRET` para producirlo.
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  verificarCsrf,
  fijarCookieRefresh,
  fijarCookieCsrf,
  obtenerCookieRefresh,
} from "../../../apps/api/src/middleware/cookiesAuth.js";
import { derivarTokenCsrf, csrfTokenValidoParaRefresh } from "../../../apps/api/src/seguridad/jwt.js";
import { cuerpoError, ErrorDominio } from "../../../apps/api/src/contrato/errores.js";

const SECRETO_SERVIDOR = "a".repeat(32); // 32 chars, cumple el mínimo de JWT_SECRET
const SECRETO_SERVIDOR_DISTINTO = "b".repeat(32);

function extraerCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cab of res.headers.getSetCookie?.() ?? []) {
    const [par] = cab.split(";");
    const [n, v] = par!.split("=");
    out[n!] = v!;
  }
  return out;
}

/** App de prueba que reproduce exactamente el flujo real: al "emitir
 * sesión" (equivalente a `entregarSesion` en auth.ts) fija `rv_refresh`
 * con un refresh token opaco y `rv_csrf` con `derivarTokenCsrf(refresh,
 * secreto)` — nunca un valor independiente. */
function crearAppDePrueba(secreto: string): Hono {
  const app = new Hono();
  app.get("/emitir/:quien", (c) => {
    const refreshToken = `refresh-de-sesion-${c.req.param("quien")}-${crypto.randomUUID()}`;
    fijarCookieRefresh(c, refreshToken, { segura: false, maxAgeMs: 60_000 });
    fijarCookieCsrf(c, derivarTokenCsrf(refreshToken, secreto), { segura: false, maxAgeMs: 60_000 });
    return c.json({ ok: true, refreshToken });
  });
  app.post("/mutar", verificarCsrf(secreto), (c) => c.json({ mutado: true }));
  // Mismo manejador central de errores que apps/api/src/app.ts: un
  // `ErrorDominio` (p. ej. `csrf_invalido`, lanzado por `verificarCsrf`)
  // debe mapear a su `httpStatus`/`codigo` fijo, no a un 500 genérico.
  app.onError((err, c) => {
    if (err instanceof ErrorDominio) {
      return c.json(cuerpoError(err), err.httpStatus as never);
    }
    throw err;
  });
  return app;
}

describe("A3-AUTH-02 — CORREGIDO: CSRF de doble envío ahora ligado criptográficamente a la sesión", () => {
  it("acepta el par legítimo: csrf y refresh emitidos juntos para la MISMA sesión", async () => {
    const app = crearAppDePrueba(SECRETO_SERVIDOR);
    const emitido = await app.request("/emitir/legitimo");
    const cookies = extraerCookies(emitido);

    const res = await app.request("/mutar", {
      method: "POST",
      headers: {
        cookie: `rv_refresh=${cookies.rv_refresh}; rv_csrf=${cookies.rv_csrf}`,
        "x-csrf-token": decodeURIComponent(cookies.rv_csrf!),
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mutado: true });
  });

  it("RECHAZA (antes aceptaba) el CSRF token de la sesión A combinado con el refresh cookie de la sesión B", async () => {
    const app = crearAppDePrueba(SECRETO_SERVIDOR);

    const emitidoA = await app.request("/emitir/A");
    const cookiesA = extraerCookies(emitidoA);
    const emitidoB = await app.request("/emitir/B");
    const cookiesB = extraerCookies(emitidoB);

    expect(cookiesA.rv_csrf).not.toBe(cookiesB.rv_csrf);
    expect(cookiesA.rv_refresh).not.toBe(cookiesB.rv_refresh);

    // Combinación cruzada: refresh de B (sesión "víctima") + csrf de A
    // (token que un atacante consiguió fijar/leer por otra vía) + cabecera
    // X-CSRF-Token = csrf de A. Con el código viejo esto pasaba (200); con
    // el fix, el servidor recalcula el HMAC a partir del refresh REAL (B)
    // y csrf-A nunca coincide con él.
    const resCruzada = await app.request("/mutar", {
      method: "POST",
      headers: {
        cookie: `rv_refresh=${cookiesB.rv_refresh}; rv_csrf=${cookiesA.rv_csrf}`,
        "x-csrf-token": decodeURIComponent(cookiesA.rv_csrf!),
      },
    });

    expect(resCruzada.status).toBe(403);
    const cuerpo = (await resCruzada.json()) as { error: { codigo: string } };
    expect(cuerpo.error.codigo).toBe("csrf_invalido");
  });

  it("RECHAZA el vector de explotación real (cookie tossing): valor propio del atacante igual en cookie y cabecera, sobre el refresh REAL de la víctima", async () => {
    const app = crearAppDePrueba(SECRETO_SERVIDOR);

    // La víctima ya tiene una sesión legítima activa (su rv_refresh real).
    const emitidoVictima = await app.request("/emitir/victima");
    const cookiesVictima = extraerCookies(emitidoVictima);

    // El atacante, por una vía externa a este middleware (p. ej. "cookie
    // tossing" desde un subdominio hermano — el escenario que el propio
    // hallazgo A3-AUTH-02 señala como la vía real de explotación),
    // consigue escribir SU PROPIO valor en `rv_csrf` en el navegador de
    // la víctima, y por supuesto conoce ese valor porque lo eligió él
    // mismo — así que también lo pone en la cabecera `X-CSRF-Token` de la
    // petición cross-site que fuerza. El navegador de la víctima sigue
    // adjuntando su `rv_refresh` real automáticamente.
    const valorElegidoPorElAtacante = "valor-arbitrario-elegido-por-el-atacante";

    const resAtaque = await app.request("/mutar", {
      method: "POST",
      headers: {
        cookie: `rv_refresh=${cookiesVictima.rv_refresh}; rv_csrf=${valorElegidoPorElAtacante}`,
        "x-csrf-token": valorElegidoPorElAtacante,
      },
    });

    // Con el código viejo (solo cookie===cabecera) esto pasaba (200) — es
    // exactamente el riesgo que el hallazgo describía. Con el fix, el
    // servidor exige que ese valor sea el HMAC del refresh REAL de la
    // víctima, que el atacante no puede producir sin conocer JWT_SECRET.
    expect(resAtaque.status).toBe(403);
    const cuerpoAtaque = (await resAtaque.json()) as { error: { codigo: string } };
    expect(cuerpoAtaque.error.codigo).toBe("csrf_invalido");
  });

  it("derivarTokenCsrf/csrfTokenValidoParaRefresh: el mismo refresh token con secretos de servidor distintos produce tokens CSRF distintos y no intercambiables", () => {
    const refreshToken = "un-refresh-token-cualquiera";
    const csrfConSecretoA = derivarTokenCsrf(refreshToken, SECRETO_SERVIDOR);
    const csrfConSecretoB = derivarTokenCsrf(refreshToken, SECRETO_SERVIDOR_DISTINTO);

    expect(csrfConSecretoA).not.toBe(csrfConSecretoB);
    expect(csrfTokenValidoParaRefresh(csrfConSecretoA, refreshToken, SECRETO_SERVIDOR)).toBe(true);
    expect(csrfTokenValidoParaRefresh(csrfConSecretoA, refreshToken, SECRETO_SERVIDOR_DISTINTO)).toBe(false);
    expect(csrfTokenValidoParaRefresh(csrfConSecretoB, refreshToken, SECRETO_SERVIDOR)).toBe(false);
  });

  it("csrfTokenValidoParaRefresh: no acepta un token derivado de un refresh token distinto, aunque el secreto sea el correcto", () => {
    const csrfDeOtroRefresh = derivarTokenCsrf("otro-refresh-token", SECRETO_SERVIDOR);
    expect(csrfTokenValidoParaRefresh(csrfDeOtroRefresh, "un-refresh-token-cualquiera", SECRETO_SERVIDOR)).toBe(false);
  });

  it("sanity: obtenerCookieRefresh sigue leyendo la cookie rv_refresh (sin cambios de contrato)", async () => {
    const app = new Hono();
    app.get("/leer", (c) => c.json({ refresh: obtenerCookieRefresh(c) ?? null }));
    const res = await app.request("/leer", { headers: { cookie: "rv_refresh=abc123" } });
    expect(await res.json()).toEqual({ refresh: "abc123" });
  });
});
