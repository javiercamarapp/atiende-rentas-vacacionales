import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

/**
 * Cliente OIDC genérico (Authorization Code + PKCE, RFC 7636 — "openid
 * email profile") usado tanto para Google en producción como para el
 * proveedor OIDC SIMULADO de desarrollo/E2E
 * (apps/api/src/seguridad/oidcSimulado.ts) — la validación de `id_token`
 * es exactamente la misma para ambos, solo cambia el `issuer`/JWKS.
 *
 * Nunca confía en nada del `id_token` antes de verificar su firma contra
 * el JWKS del propio proveedor: la firma se valida SIEMPRE antes de leer
 * cualquier claim (RV19/21-3, OIDC Core §3.1.3.7).
 */

export interface DocumentoDescubrimientoOidc {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const CACHE_DESCUBRIMIENTO = new Map<string, { documento: DocumentoDescubrimientoOidc; expiraEn: number }>();
const TTL_DESCUBRIMIENTO_MS = 60 * 60 * 1000; // 1 hora — el documento de descubrimiento cambia rarísima vez.

export async function descubrirOidc(
  issuerBaseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<DocumentoDescubrimientoOidc> {
  const cacheado = CACHE_DESCUBRIMIENTO.get(issuerBaseUrl);
  if (cacheado && cacheado.expiraEn > Date.now()) return cacheado.documento;

  const url = `${issuerBaseUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const respuesta = await fetchFn(url);
  if (!respuesta.ok) {
    throw new Error(`No se pudo obtener el documento de descubrimiento OIDC de ${issuerBaseUrl} (HTTP ${respuesta.status})`);
  }
  const documento = (await respuesta.json()) as DocumentoDescubrimientoOidc;
  CACHE_DESCUBRIMIENTO.set(issuerBaseUrl, { documento, expiraEn: Date.now() + TTL_DESCUBRIMIENTO_MS });
  return documento;
}

/** Invalida la caché de descubrimiento — solo para pruebas (evita que un
 * proveedor OIDC simulado levantado en un puerto nuevo en cada test
 * arrastre el `jwks_uri` de una instancia anterior). */
export function limpiarCacheDescubrimientoOidc(): void {
  CACHE_DESCUBRIMIENTO.clear();
}

// --- PKCE (RFC 7636) ---

export interface ParPkce {
  verifier: string;
  challenge: string;
  metodo: "S256";
}

export function generarPkce(): ParPkce {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, metodo: "S256" };
}

export function generarValorAleatorio(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// --- Verificación de id_token ---

export interface OpcionesValidarIdToken {
  issuer: string;
  audience: string;
  nonce: string;
  /** URL del JWKS remoto (Google) — mutuamente excluyente con `jwks`. */
  jwksUri?: string;
  /** JWKS ya conocido en memoria (proveedor OIDC simulado, o inyectado en
   * pruebas unitarias con un JWKS de prueba) — evita una llamada HTTP. */
  jwks?: JSONWebKeySet;
  /** Reloj inyectable para pruebas de expiración determinísticas. */
  ahoraMs?: number;
}

export interface ClaimsIdToken {
  sub: string;
  email: string;
  emailVerificado: boolean;
  hd: string | null;
  nombre: string | null;
}

// Un JWKS remoto por URL se reutiliza entre llamadas (jose ya cachea las
// claves dentro del `RemoteJWKSet` que devuelve, con revalidación cuando
// aparece un `kid` desconocido) — sin este mapa, cada login recrearía el
// caché desde cero. NOTA: esta versión de `jose` no admite inyectar un
// `fetch` propio en `createRemoteJWKSet` (a diferencia de
// `descubrirOidc`/`intercambiarCodigoPorTokens`, que sí reciben `fetchFn`
// explícito) — por eso las pruebas unitarias de validación de id_token
// (firma inválida/aud/nonce/expirado/email no verificado) usan la vía
// `jwks` (JSONWebKeySet en memoria, `createLocalJWKSet`, sin red) en vez
// de un JWKS remoto; las pruebas de integración del flujo OIDC completo
// SÍ hacen una petición HTTP real al proveedor OIDC simulado en
// localhost (apps/api/src/seguridad/oidcSimulado.ts), que es justamente
// lo que se quiere ejercitar ahí.
const JWKS_REMOTOS = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function obtenerJwksRemoto(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  const existente = JWKS_REMOTOS.get(jwksUri);
  if (existente) return existente;
  const nuevo = createRemoteJWKSet(new URL(jwksUri));
  JWKS_REMOTOS.set(jwksUri, nuevo);
  return nuevo;
}

/** Limpia la caché de JWKS remotos — solo para pruebas (un proveedor
 * simulado que se relanza en cada test usa una URL de jwks_uri nueva cada
 * vez, así que no debería hacer falta en la práctica, pero evita fugas de
 * memoria entre suites que sí reusan URLs). */
export function limpiarCacheJwksRemotos(): void {
  JWKS_REMOTOS.clear();
}

/**
 * Valida un `id_token` OIDC de punta a punta (OIDC Core §3.1.3.7):
 *   1. Firma verificada contra el JWKS del proveedor (nunca decodificado
 *      sin verificar antes de esto).
 *   2. `iss` coincide exactamente con el emisor esperado.
 *   3. `aud` incluye nuestro `client_id`.
 *   4. `exp`/`iat` (verificado por `jose` internamente).
 *   5. `nonce` coincide con el que generamos al iniciar el flujo (defensa
 *      contra replay del `id_token`).
 *   6. `email_verified` es `true` — un correo no verificado por el propio
 *      proveedor NUNCA se usa para vincular/crear una cuenta local (RV19/
 *      21-3: vincular por email requiere que el proveedor garantice que
 *      ese email es del dueño real de la cuenta).
 *
 * Lanza `Error` con un mensaje específico para cada motivo de rechazo —
 * apps/api/src/routes/auth.ts los traduce todos a un único
 * `ErrorDominio("oidc_invalido", ...)` genérico de cara al cliente (nunca
 * se le revela al llamador CUÁL validación falló, para no dar pistas a un
 * atacante que esté probando id_tokens forjados).
 */
export async function validarIdToken(idToken: string, opciones: OpcionesValidarIdToken): Promise<ClaimsIdToken> {
  const { issuer, audience, nonce, jwksUri, jwks, ahoraMs } = opciones;

  if (!jwksUri && !jwks) {
    throw new Error("validarIdToken requiere jwksUri o jwks");
  }
  const conjuntoClaves = jwks ? createLocalJWKSet(jwks) : obtenerJwksRemoto(jwksUri!);

  const { payload } = await jwtVerify(idToken, conjuntoClaves, {
    issuer,
    audience,
    currentDate: ahoraMs !== undefined ? new Date(ahoraMs) : undefined,
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("id_token sin claim 'sub'");
  }
  if (payload.nonce !== nonce) {
    throw new Error("id_token con 'nonce' inesperado (posible replay)");
  }
  if (typeof payload.email !== "string" || payload.email.length === 0) {
    throw new Error("id_token sin claim 'email'");
  }
  if (payload.email_verified !== true) {
    throw new Error("id_token con 'email_verified' distinto de true");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerificado: true,
    hd: typeof payload.hd === "string" ? payload.hd : null,
    nombre: typeof payload.name === "string" ? payload.name : null,
  };
}

// --- Intercambio del código de autorización ---

export interface RespuestaTokenOidc {
  idToken: string;
  accessToken?: string;
}

export async function intercambiarCodigoPorTokens(opciones: {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
}): Promise<RespuestaTokenOidc> {
  const { tokenEndpoint, code, codeVerifier, redirectUri, clientId, clientSecret, fetchFn = fetch } = opciones;
  const cuerpo = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
  });
  const respuesta = await fetchFn(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: cuerpo.toString(),
  });
  if (!respuesta.ok) {
    throw new Error(`El endpoint de token OIDC respondió HTTP ${respuesta.status}`);
  }
  const datos = (await respuesta.json()) as { id_token?: string; access_token?: string };
  if (!datos.id_token) {
    throw new Error("La respuesta del endpoint de token OIDC no incluye id_token");
  }
  return { idToken: datos.id_token, accessToken: datos.access_token };
}

export function construirUrlAutorizacion(opciones: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  scope?: string;
  hd?: string;
}): string {
  const {
    authorizationEndpoint,
    clientId,
    redirectUri,
    state,
    nonce,
    codeChallenge,
    scope = "openid email profile",
    hd,
  } = opciones;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  if (hd) params.set("hd", hd);
  return `${authorizationEndpoint}?${params.toString()}`;
}

export function hashearValorOidc(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}
