import { randomBytes, createHash } from "node:crypto";
import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet, type KeyLike } from "jose";

/**
 * Proveedor OIDC SIMULADO (Lote 3.2, H-096+) — emisor local con su propio
 * par de claves y JWKS, para poder ejercitar el flujo Authorization Code +
 * PKCE completo (incluida la verificación de firma del `id_token` contra
 * un JWKS real servido por HTTP) en desarrollo/pruebas/E2E SIN depender de
 * la cuenta real de Google Cloud ni de red externa (RV19: nunca un
 * simulador se presenta como conexión productiva — el emisor se llama
 * literalmente "oidc_simulado", nunca "google" ni nada que pueda
 * confundirse con una identidad real).
 *
 * Fail-closed (D-019, mismo criterio que ServidorIcalSimulado/
 * SimuladorMensajeria): SOLO se monta si `entorno` es 'development' o
 * 'test' explícito — apps/api/src/app.ts nunca lo registra en producción,
 * sin importar qué rutas se pidan.
 *
 * Flujo simulado (sin UI real de Google): `GET /authorize` sirve un
 * formulario HTML mínimo para "elegir" una identidad de prueba (email +
 * si está verificado) — Playwright lo completa igual que completaría el
 * selector de cuenta real de Google en un E2E. Al enviarlo se emite un
 * `code` opaco de un solo uso, ligado a `code_challenge`/`nonce`/
 * `redirect_uri`/`client_id`; `POST /token` lo canjea por un `id_token`
 * firmado con la clave privada de este emisor.
 */

export interface OpcionesOidcSimulado {
  /** URL base pública donde queda montado (usada como `issuer` del
   * `id_token` y para construir `jwks_uri`/`token_endpoint`). */
  issuerBaseUrl: string;
}

interface CodigoPendiente {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
  email: string;
  emailVerificado: boolean;
  sub: string;
  hd: string | null;
  expiraEn: number;
  usado: boolean;
}

let parClaves: { privada: KeyLike; publica: KeyLike; kid: string } | undefined;

async function obtenerParClaves(): Promise<{ privada: KeyLike; publica: KeyLike; kid: string }> {
  if (!parClaves) {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    parClaves = { privada: privateKey, publica: publicKey, kid: randomBytes(8).toString("hex") };
  }
  return parClaves;
}

const codigosPendientes = new Map<string, CodigoPendiente>();
const TTL_CODIGO_MS = 5 * 60 * 1000;

function limpiarCodigosExpirados(): void {
  const ahora = Date.now();
  for (const [codigo, datos] of codigosPendientes) {
    if (datos.expiraEn < ahora) codigosPendientes.delete(codigo);
  }
}

/** Solo para pruebas: resetea el estado en memoria (par de claves +
 * códigos pendientes) entre suites que necesitan un emisor "limpio". */
export function reiniciarOidcSimulado(): void {
  parClaves = undefined;
  codigosPendientes.clear();
}

function paginaFormularioAutorizacion(query: Record<string, string>): string {
  const campos = Object.entries(query)
    .map(([clave, valor]) => `<input type="hidden" name="${clave}" value="${escaparHtml(valor)}" />`)
    .join("\n");
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>Proveedor OIDC simulado — Atiende</title></head>
<body style="font-family: sans-serif; max-width: 420px; margin: 4rem auto;">
  <p style="color:#a33; font-weight:bold;">Proveedor OIDC SIMULADO — solo desarrollo/pruebas, nunca una cuenta real de Google.</p>
  <h1>Elegir identidad de prueba</h1>
  <form method="post">
    ${campos}
    <label style="display:block;margin-top:1rem;">Correo
      <input type="email" name="email" value="persona@ejemplo.test" required style="display:block;width:100%;" />
    </label>
    <label style="display:block;margin-top:0.5rem;">
      <input type="checkbox" name="emailVerificado" checked /> Correo verificado por el proveedor
    </label>
    <label style="display:block;margin-top:0.5rem;">Dominio de Workspace (hd, opcional)
      <input type="text" name="hd" value="" style="display:block;width:100%;" />
    </label>
    <button type="submit" style="margin-top:1rem;">Continuar</button>
  </form>
</body>
</html>`;
}

function escaparHtml(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function crearOidcSimulado(opciones: OpcionesOidcSimulado): Hono {
  const app = new Hono();
  const { issuerBaseUrl } = opciones;

  app.get("/.well-known/openid-configuration", (c) =>
    c.json({
      issuer: issuerBaseUrl,
      authorization_endpoint: `${issuerBaseUrl}/authorize`,
      token_endpoint: `${issuerBaseUrl}/token`,
      jwks_uri: `${issuerBaseUrl}/jwks.json`,
    }),
  );

  app.get("/jwks.json", async (c) => {
    const { publica, kid } = await obtenerParClaves();
    const jwk = await exportJWK(publica);
    const jwks: JSONWebKeySet = { keys: [{ ...jwk, kid, use: "sig", alg: "RS256" }] };
    return c.json(jwks);
  });

  app.get("/authorize", (c) => {
    const query = c.req.query();
    if (!query.client_id || !query.redirect_uri || !query.state || !query.nonce || !query.code_challenge) {
      return c.text("Parámetros de autorización incompletos", 400);
    }
    return c.html(paginaFormularioAutorizacion(query));
  });

  // Mismo path que el `GET /authorize` de arriba (nunca "/authorize/
  // confirmar"): el formulario del navegador no lleva `action` explícito
  // — por spec HTML, eso lo somete a la URL actual del documento — y esa
  // URL actual es justo `.../authorize` (con querystring). Usar un
  // sub-path aquí requeriría un `action` explícito, y la resolución de
  // URLs relativas de un `action` sin "/" inicial es relativa al último
  // segmento tratado como ARCHIVO (RFC 3986 §5.3) — "confirmar" resolvería
  // a un hermano de "authorize", no a un hijo, un error real que dejaba
  // esta ruta inalcanzable desde un navegador de verdad (nunca detectado
  // por las pruebas de integración, que arman la URL de confirmación a
  // mano en vez de dejar que el navegador la resuelva).
  app.post("/authorize", async (c) => {
    const form = await c.req.formData();
    const clientId = String(form.get("client_id") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const state = String(form.get("state") ?? "");
    const nonce = String(form.get("nonce") ?? "");
    const codeChallenge = String(form.get("code_challenge") ?? "");
    const email = String(form.get("email") ?? "");
    const emailVerificado = form.get("emailVerificado") === "on" || form.get("emailVerificado") === "true";
    const hd = form.get("hd") ? String(form.get("hd")) : null;

    if (!clientId || !redirectUri || !email) {
      return c.text("Formulario incompleto", 400);
    }

    limpiarCodigosExpirados();
    const codigo = randomBytes(24).toString("base64url");
    codigosPendientes.set(codigo, {
      clientId,
      redirectUri,
      codeChallenge,
      nonce,
      email,
      emailVerificado,
      // `sub` estable por email dentro de este emisor simulado — mismo
      // email siempre resuelve al mismo `sub`, igual que Google.
      sub: `oidc-simulado-${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24)}`,
      hd,
      expiraEn: Date.now() + TTL_CODIGO_MS,
      usado: false,
    });

    const destino = new URL(redirectUri);
    destino.searchParams.set("code", codigo);
    destino.searchParams.set("state", state);
    return c.redirect(destino.toString(), 302);
  });

  app.post("/token", async (c) => {
    const cuerpo = await c.req.parseBody();
    const code = String(cuerpo.code ?? "");
    const codeVerifier = String(cuerpo.code_verifier ?? "");
    const redirectUri = String(cuerpo.redirect_uri ?? "");
    const clientId = String(cuerpo.client_id ?? "");

    const pendiente = codigosPendientes.get(code);
    if (!pendiente || pendiente.usado) {
      return c.json({ error: "invalid_grant", error_description: "Código inválido o ya usado" }, 400);
    }
    if (pendiente.clientId !== clientId || pendiente.redirectUri !== redirectUri) {
      return c.json({ error: "invalid_grant", error_description: "client_id/redirect_uri no coinciden" }, 400);
    }
    const challengeEsperado = createHash("sha256").update(codeVerifier).digest("base64url");
    if (challengeEsperado !== pendiente.codeChallenge) {
      return c.json({ error: "invalid_grant", error_description: "code_verifier no coincide con code_challenge (PKCE)" }, 400);
    }
    pendiente.usado = true;

    const { privada, kid } = await obtenerParClaves();
    const idToken = await new SignJWT({
      email: pendiente.email,
      email_verified: pendiente.emailVerificado,
      nonce: pendiente.nonce,
      name: pendiente.email.split("@")[0],
      ...(pendiente.hd ? { hd: pendiente.hd } : {}),
    })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(issuerBaseUrl)
      .setAudience(pendiente.clientId)
      .setSubject(pendiente.sub)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privada);

    return c.json({ id_token: idToken, access_token: randomBytes(16).toString("hex"), token_type: "Bearer", expires_in: 300 });
  });

  return app;
}
