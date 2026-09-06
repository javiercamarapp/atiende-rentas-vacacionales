import { createHash, createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { crearPropiedad, crearTenant, crearUsuario } from "../soporte/fixtures.js";

/**
 * Lote 3.2 (H-096+) — pruebas de integración HTTP de la auth extendida
 * contra `embedded-postgres` real (D-022), cubriendo explícitamente lo
 * exigido por el encargo:
 *   1. Flujo OIDC completo (Authorization Code + PKCE) contra el
 *      proveedor OIDC simulado — sin red externa, sin depender de Google.
 *   2. Vinculación de cuenta por invitación vía ese mismo flujo.
 *   3. Vinculación a una cuenta local YA EXISTENTE por email verificado.
 *   4. Registro abierto de Google rechazado si la política del tenant es
 *      'invitado_solo' y no hay invitación ni cuenta previa.
 *   5. Reutilización de un refresh token ya rotado → revoca TODA la
 *      familia (el siguiente refresh con el token nuevo también falla).
 *   6. Restablecer contraseña invalida TODAS las sesiones existentes.
 *   7. Bloqueo temporal de cuenta tras N intentos fallidos consecutivos.
 *   8. RLS intacta tras un login por Google (el usuario creado por ese
 *      flujo solo ve los datos de SU tenant).
 *   9. MFA TOTP: habilitar, login de dos pasos, código incorrecto
 *      rechazado, código de recuperación de un solo uso, deshabilitar.
 *
 * A diferencia del resto de `test/integration/*.test.ts` (que llaman
 * `app.request(...)` en proceso), este archivo SÍ levanta un listener
 * HTTP real (`@hono/node-server`) porque el flujo OIDC hace peticiones
 * HTTP de verdad hacia su propio `issuerBaseUrl` (descubrimiento/JWKS/
 * autorización/token del proveedor simulado) — exactamente el mismo
 * patrón que `apps/web/e2e/servidor-api-e2e.ts` usa para Playwright.
 */

process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";
process.env.JWT_SECRET = "prueba-jwt-secret-lote3-2-al-menos-32-caracteres-00";
process.env.BLOQUEO_CUENTA_MAX_INTENTOS = "3";
process.env.BLOQUEO_CUENTA_DURACION_MS = "60000";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidorPg: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let cerrarHttp: () => Promise<void>;
let baseUrl: string;

function puertoAleatorio(): number {
  return 61000 + Math.floor(Math.random() * 3000);
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-lote3-2-test-"));
  const puertoPg = puertoAleatorio();
  servidorPg = new EmbeddedPostgres({
    databaseDir,
    port: puertoPg,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidorPg.initialise();
  await servidorPg.start();
  await servidorPg.createDatabase("atiende_rv_lote3_2_test");

  superusuario = servidorPg.getPgClient("atiende_rv_lote3_2_test");
  await superusuario.connect();
  await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

  const ejecutor: EjecutorSql = {
    async query(sql, params) {
      const r = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql) {
      await superusuario.query(sql);
    },
  };
  await aplicarMigraciones(ejecutor, migraciones);

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puertoPg,
    database: "atiende_rv_lote3_2_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });

  const puertoHttp = puertoAleatorio();
  baseUrl = `http://127.0.0.1:${puertoHttp}`;
  // El proveedor OIDC simulado se auto-referencia con `urlPublicaApi` —
  // debe apuntar al puerto donde ESTE proceso realmente escucha.
  process.env.API_PUBLIC_URL = baseUrl;

  const app = crearApp({ pool });
  const servidorHttp = serve({ fetch: app.fetch, port: puertoHttp });
  cerrarHttp = () => new Promise((resolve) => servidorHttp.close(() => resolve()));
}, 120_000);

afterAll(async () => {
  await cerrarHttp?.();
  await pool?.end().catch(() => undefined);
  await superusuario.end().catch(() => undefined);
  await servidorPg.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

// --- Helpers ---

function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

function extraerCookie(respuesta: Response, nombre: string): string | null {
  const cabeceras = respuesta.headers.getSetCookie?.() ?? [];
  for (const cabecera of cabeceras) {
    const [par] = cabecera.split(";");
    const [n, v] = par!.split("=");
    if (n === nombre) return decodeURIComponent(v ?? "");
  }
  return null;
}

function extraerCamposOcultos(html: string): Record<string, string> {
  const campos: Record<string, string> = {};
  const regex = /<input type="hidden" name="([^"]+)" value="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html))) {
    campos[m[1]!] = m[2]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  }
  return campos;
}

/** Recorre el flujo completo del proveedor OIDC simulado (equivalente al
 * consentimiento real de Google) y devuelve la respuesta del callback de
 * apps/api (sin seguir el último redirect, para poder inspeccionar
 * status/cookies). */
async function correrFlujoOidcSimulado(opciones: {
  invitacionToken?: string;
  tenantId?: string;
  email: string;
  emailVerificado?: boolean;
}): Promise<Response> {
  const qs = new URLSearchParams();
  if (opciones.invitacionToken) qs.set("invitacionToken", opciones.invitacionToken);
  if (opciones.tenantId) qs.set("tenantId", opciones.tenantId);

  const respInicio = await fetch(`${baseUrl}/auth/oidc-simulado-login/inicio?${qs.toString()}`, { redirect: "manual" });
  expect(respInicio.status).toBe(302);
  const urlAutorizar = respInicio.headers.get("location")!;

  const respFormulario = await fetch(urlAutorizar, { redirect: "manual" });
  expect(respFormulario.status).toBe(200);
  const html = await respFormulario.text();
  const campos = extraerCamposOcultos(html);

  const cuerpoConfirmar = new URLSearchParams({
    client_id: campos.client_id!,
    redirect_uri: campos.redirect_uri!,
    state: campos.state!,
    nonce: campos.nonce!,
    code_challenge: campos.code_challenge!,
    email: opciones.email,
    emailVerificado: opciones.emailVerificado === false ? "false" : "on",
  });
  // Mismo path que el GET (sin "/confirmar" al final): el formulario real
  // no lleva `action` explícito, así que el navegador lo somete a la URL
  // actual del documento — ver comentario en
  // apps/api/src/seguridad/oidcSimulado.ts sobre por qué un sub-path
  // habría sido inalcanzable desde un navegador de verdad.
  const respConfirmar = await fetch(urlAutorizar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: cuerpoConfirmar.toString(),
    redirect: "manual",
  });
  expect(respConfirmar.status).toBe(302);
  const urlCallback = respConfirmar.headers.get("location")!;

  return fetch(urlCallback, { redirect: "manual" });
}

async function login(email: string, password: string, cliente: "web" | "api" = "api") {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, cliente }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body, res };
}

function autorizado(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

// RFC 6238/4226 — reimplementación mínima e independiente SOLO para poder
// generar (no solo verificar) un código válido en las pruebas, sin
// exportar un "generador" desde el módulo de producción (que
// deliberadamente solo expone verificación — nunca generar códigos es una
// operación que el servidor necesite hacer por sí mismo).
function totpActualParaPrueba(secretoBase32: string): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const limpio = secretoBase32.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const char of limpio) {
    const indice = alfabeto.indexOf(char);
    if (indice === -1) continue;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const clave = Buffer.from(bytes);
  const contador = Math.floor(Date.now() / 1000 / 30);
  const bufferContador = Buffer.alloc(8);
  bufferContador.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac("sha1", clave).update(bufferContador).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binario =
    ((hmac[offset]! & 0x7f) << 24) | ((hmac[offset + 1]! & 0xff) << 16) | ((hmac[offset + 2]! & 0xff) << 8) | (hmac[offset + 3]! & 0xff);
  return (binario % 1_000_000).toString().padStart(6, "0");
}

describe("Google/OIDC simulado — flujo completo, vinculación e invitación", () => {
  it("vincula por invitación: crea la cuenta, marca el correo verificado, acepta la invitación y respeta RLS", async () => {
    const tenantId = await crearTenant(superusuario, "T-OIDC-Invitacion");
    await crearPropiedad(superusuario, tenantId, { nombre: "Propiedad tenant invitación" });
    const tenantAjeno = await crearTenant(superusuario, "T-OIDC-Ajeno");
    await crearPropiedad(superusuario, tenantAjeno, { nombre: "Propiedad tenant ajeno" });

    const tokenInvitacion = "token-invitacion-oidc-prueba-1234567890";
    const hashInvitacion = sha256Hex(tokenInvitacion);
    const email = "invitado.google@oidc-test.local";
    await superusuario.query(
      `INSERT INTO invitacion_usuario (tenant_id, email, rol, colaborador_nivel, token_hash, expira_en)
       VALUES ($1, $2, 'operador', 'solo_calendario', $3, now() + interval '1 day')`,
      [tenantId, email, hashInvitacion],
    );

    const respCallback = await correrFlujoOidcSimulado({ invitacionToken: tokenInvitacion, email });
    expect(respCallback.status).toBe(302);
    expect(respCallback.headers.get("location")).toContain("/auth/google/completado");
    const cookieRefresh = extraerCookie(respCallback, "rv_refresh");
    const cookieCsrf = extraerCookie(respCallback, "rv_csrf");
    expect(cookieRefresh).toBeTruthy();
    expect(cookieCsrf).toBeTruthy();

    const { rows: invRows } = await superusuario.query("SELECT aceptada_en FROM invitacion_usuario WHERE token_hash = $1", [hashInvitacion]);
    expect(invRows[0].aceptada_en).not.toBeNull();

    const { rows: usuarioRows } = await superusuario.query(
      "SELECT id, tenant_id, rol, colaborador_nivel, email_verificado_en FROM usuario WHERE lower(email) = lower($1)",
      [email],
    );
    expect(usuarioRows).toHaveLength(1);
    expect(usuarioRows[0].tenant_id).toBe(tenantId);
    expect(usuarioRows[0].rol).toBe("operador");
    expect(usuarioRows[0].email_verificado_en).not.toBeNull();

    const { rows: identidadRows } = await superusuario.query("SELECT proveedor FROM identidad_oidc WHERE usuario_id = $1", [usuarioRows[0].id]);
    expect(identidadRows.map((r: { proveedor: string }) => r.proveedor)).toContain("oidc_simulado");

    // RLS intacta: intercambia la cookie por un access token y confirma
    // que SOLO ve la propiedad de su propio tenant.
    const respRefresh = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `rv_refresh=${cookieRefresh}; rv_csrf=${cookieCsrf}`,
        "x-csrf-token": cookieCsrf!,
      },
      body: "{}",
    });
    expect(respRefresh.status).toBe(200);
    const { accessToken } = (await respRefresh.json()) as { accessToken: string };

    const respPropiedades = await fetch(`${baseUrl}/propiedades`, { headers: autorizado(accessToken) });
    expect(respPropiedades.status).toBe(200);
    const { propiedades } = (await respPropiedades.json()) as { propiedades: Array<{ nombre: string; tenantId: string }> };
    expect(propiedades.length).toBeGreaterThan(0);
    expect(propiedades.every((p) => p.tenantId === tenantId)).toBe(true);
    expect(propiedades.some((p) => p.nombre === "Propiedad tenant ajeno")).toBe(false);
  });

  it("vincula a una cuenta local YA EXISTENTE por email verificado, sin importar la política del tenant", async () => {
    const tenantId = await crearTenant(superusuario, "T-OIDC-Vinculacion");
    // Política por defecto (invitado_solo, la más restrictiva) — vincular
    // a una cuenta EXISTENTE debe funcionar de todas formas.
    const email = "yaexiste@oidc-test.local";
    await crearUsuario(superusuario, { tenantId, email, rol: "admin_gestora", password: "clave-existente-segura-99" });

    const respCallback = await correrFlujoOidcSimulado({ email });
    expect(respCallback.status).toBe(302);
    expect(respCallback.headers.get("location")).toContain("/auth/google/completado");

    const { rows } = await superusuario.query(
      "SELECT u.id FROM identidad_oidc i JOIN usuario u ON u.id = i.usuario_id WHERE lower(u.email) = lower($1)",
      [email],
    );
    expect(rows).toHaveLength(1);
  });

  it("registro abierto: 'abierto' permite crear cuenta nueva; 'invitado_solo' (por defecto) la rechaza", async () => {
    const tenantAbierto = await crearTenant(superusuario, "T-OIDC-Abierto");
    await superusuario.query("UPDATE tenant SET politica_vinculacion_google = 'abierto' WHERE id = $1", [tenantAbierto]);
    const emailNuevo = "nuevo.abierto@oidc-test.local";
    const respOk = await correrFlujoOidcSimulado({ tenantId: tenantAbierto, email: emailNuevo });
    expect(respOk.status).toBe(302);
    const { rows } = await superusuario.query("SELECT rol, colaborador_nivel FROM usuario WHERE lower(email) = lower($1)", [emailNuevo]);
    expect(rows[0]).toMatchObject({ rol: "operador", colaborador_nivel: "solo_calendario" });

    const tenantCerrado = await crearTenant(superusuario, "T-OIDC-Cerrado");
    const respRechazada = await correrFlujoOidcSimulado({ tenantId: tenantCerrado, email: "otro.nuevo@oidc-test.local" });
    expect(respRechazada.status).toBe(403);
    const cuerpo = (await respRechazada.json()) as { error: { codigo: string } };
    expect(cuerpo.error.codigo).toBe("google_vinculacion_no_permitida");
  });

  it("sin tenantId ni invitación y sin cuenta previa, rechaza con motivo explícito (nunca crea una cuenta implícita)", async () => {
    const resp = await correrFlujoOidcSimulado({ email: "huerfano@oidc-test.local" });
    expect(resp.status).toBe(403);
    const cuerpo = (await resp.json()) as { error: { codigo: string } };
    expect(cuerpo.error.codigo).toBe("google_vinculacion_no_permitida");
  });

  it("rechaza email_verified=false del proveedor (nunca vincula/crea con un correo no verificado)", async () => {
    const tenantId = await crearTenant(superusuario, "T-OIDC-NoVerificado");
    await superusuario.query("UPDATE tenant SET politica_vinculacion_google = 'abierto' WHERE id = $1", [tenantId]);
    const resp = await correrFlujoOidcSimulado({ tenantId, email: "no-verificado@oidc-test.local", emailVerificado: false });
    expect(resp.status).toBe(401);
    const cuerpo = (await resp.json()) as { error: { codigo: string } };
    expect(cuerpo.error.codigo).toBe("oidc_invalido");
  });
});

describe("Refresh rotativo — reutilización revoca la familia completa", () => {
  it("reutilizar un refresh token ya rotado revoca TODA la familia (el token nuevo también deja de servir)", async () => {
    const tenantId = await crearTenant(superusuario, "T-Refresh-Reuso");
    const email = "refresh.reuso@auth-test.local";
    const password = "clave-refresh-reuso-segura-1";
    await crearUsuario(superusuario, { tenantId, email, rol: "admin_gestora", password });

    const { status, body } = await login(email, password);
    expect(status).toBe(200);
    const refreshOriginal = (body as { refreshToken: string }).refreshToken;

    const respRotado = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshOriginal }),
    });
    expect(respRotado.status).toBe(200);
    const { refreshToken: refreshRotado } = (await respRotado.json()) as { refreshToken: string };

    // Reutilizar el ORIGINAL (ya revocado por la rotación anterior).
    const respReuso = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshOriginal }),
    });
    expect(respReuso.status).toBe(401);
    const cuerpoReuso = (await respReuso.json()) as { error: { codigo: string } };
    expect(cuerpoReuso.error.codigo).toBe("token_invalido");

    // El token NUEVO (nacido de la rotación) también quedó revocado.
    const respTrasReuso = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshRotado }),
    });
    expect(respTrasReuso.status).toBe(401);

    const { rows } = await superusuario.query(
      "SELECT count(*) FILTER (WHERE revocado_en IS NULL) AS activos FROM refresh_token r JOIN usuario u ON u.id = r.usuario_id WHERE lower(u.email) = lower($1)",
      [email],
    );
    expect(Number(rows[0].activos)).toBe(0);
  });
});

describe("Restablecer contraseña invalida todas las sesiones existentes", () => {
  it("tras restablecer, un refresh token emitido ANTES deja de servir", async () => {
    const tenantId = await crearTenant(superusuario, "T-Reset-Password");
    const email = "reset.password@auth-test.local";
    const passwordOriginal = "clave-original-super-segura-1";
    const passwordNueva = "clave-nueva-super-segura-2222";
    await crearUsuario(superusuario, { tenantId, email, rol: "admin_gestora", password: passwordOriginal });

    const { body } = await login(email, passwordOriginal);
    const refreshPrevio = (body as { refreshToken: string }).refreshToken;

    const tokenReset = "token-reset-de-prueba-1234567890";
    const { rows: usuarioRows } = await superusuario.query("SELECT id FROM usuario WHERE lower(email) = lower($1)", [email]);
    await superusuario.query(
      "INSERT INTO token_un_uso (usuario_id, tipo, token_hash, expira_en) VALUES ($1, 'restablecer_password', $2, now() + interval '1 hour')",
      [usuarioRows[0].id, sha256Hex(tokenReset)],
    );

    const respReset = await fetch(`${baseUrl}/auth/restablecer-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: tokenReset, password: passwordNueva }),
    });
    expect(respReset.status).toBe(200);

    const respRefreshPrevio = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshPrevio }),
    });
    expect(respRefreshPrevio.status).toBe(401);

    const { status: statusViejo } = await login(email, passwordOriginal);
    expect(statusViejo).toBe(401);
    const { status: statusNuevo } = await login(email, passwordNueva);
    expect(statusNuevo).toBe(200);
  });
});

describe("Bloqueo temporal de cuenta tras intentos fallidos consecutivos", () => {
  it(`bloquea tras ${process.env.BLOQUEO_CUENTA_MAX_INTENTOS} intentos fallidos, incluso con la contraseña correcta después`, async () => {
    const tenantId = await crearTenant(superusuario, "T-Bloqueo");
    const email = "bloqueo@auth-test.local";
    const password = "clave-bloqueo-super-segura-123";
    await crearUsuario(superusuario, { tenantId, email, rol: "admin_gestora", password });

    const maxIntentos = Number(process.env.BLOQUEO_CUENTA_MAX_INTENTOS);
    for (let i = 0; i < maxIntentos; i++) {
      const { status } = await login(email, "password-incorrecta-xyz");
      expect(status).toBe(401);
    }

    const { status, body } = await login(email, password);
    expect(status).toBe(423);
    expect((body as { error: { codigo: string } }).error.codigo).toBe("cuenta_bloqueada_temporalmente");
  });
});

describe("MFA TOTP — habilitar, login de dos pasos, código de recuperación", () => {
  it("flujo completo: iniciar/confirmar, login exige código, código incorrecto rechazado, recovery code de un solo uso, deshabilitar", async () => {
    const tenantId = await crearTenant(superusuario, "T-MFA");
    const email = "mfa@auth-test.local";
    const password = "clave-mfa-super-segura-1234567";
    await crearUsuario(superusuario, { tenantId, email, rol: "admin_gestora", password });

    const { body: loginBody } = await login(email, password);
    const accessToken = (loginBody as { accessToken: string }).accessToken;

    const respIniciar = await fetch(`${baseUrl}/auth/mfa/iniciar`, { method: "POST", headers: autorizado(accessToken) });
    expect(respIniciar.status).toBe(200);
    const { secretBase32 } = (await respIniciar.json()) as { secretBase32: string };

    const respConfirmarMal = await fetch(`${baseUrl}/auth/mfa/confirmar`, {
      method: "POST",
      headers: autorizado(accessToken),
      body: JSON.stringify({ codigo: "000000" }),
    });
    expect(respConfirmarMal.status).toBe(401);

    const codigoValido = totpActualParaPrueba(secretBase32);
    const respConfirmar = await fetch(`${baseUrl}/auth/mfa/confirmar`, {
      method: "POST",
      headers: autorizado(accessToken),
      body: JSON.stringify({ codigo: codigoValido }),
    });
    expect(respConfirmar.status).toBe(200);
    const { codigosRecuperacion } = (await respConfirmar.json()) as { codigosRecuperacion: string[] };
    expect(codigosRecuperacion).toHaveLength(10);

    // Login ahora exige el segundo paso.
    const { status: statusLogin2, body: bodyLogin2 } = await login(email, password);
    expect(statusLogin2).toBe(200);
    const { mfaRequerido, mfaToken } = bodyLogin2 as { mfaRequerido: boolean; mfaToken: string };
    expect(mfaRequerido).toBe(true);

    const respCodigoMalo = await fetch(`${baseUrl}/auth/mfa/verificar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mfaToken, codigo: "000000" }),
    });
    expect(respCodigoMalo.status).toBe(401);

    const respCodigoBueno = await fetch(`${baseUrl}/auth/mfa/verificar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mfaToken, codigo: totpActualParaPrueba(secretBase32) }),
    });
    expect(respCodigoBueno.status).toBe(200);
    const { accessToken: accessToken2 } = (await respCodigoBueno.json()) as { accessToken: string };

    // Código de recuperación: funciona una vez, la segunda vez falla.
    const { body: bodyLogin3 } = await login(email, password);
    const mfaToken3 = (bodyLogin3 as { mfaToken: string }).mfaToken;
    const recoveryCode = codigosRecuperacion[0]!;
    const respRecovery1 = await fetch(`${baseUrl}/auth/mfa/verificar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mfaToken: mfaToken3, codigo: recoveryCode }),
    });
    expect(respRecovery1.status).toBe(200);

    const { body: bodyLogin4 } = await login(email, password);
    const mfaToken4 = (bodyLogin4 as { mfaToken: string }).mfaToken;
    const respRecovery2 = await fetch(`${baseUrl}/auth/mfa/verificar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mfaToken: mfaToken4, codigo: recoveryCode }),
    });
    expect(respRecovery2.status).toBe(401);

    // Deshabilitar MFA — el siguiente login ya no exige segundo paso.
    const respDeshabilitar = await fetch(`${baseUrl}/auth/mfa/deshabilitar`, {
      method: "POST",
      headers: autorizado(accessToken2),
      body: JSON.stringify({ password }),
    });
    expect(respDeshabilitar.status).toBe(200);

    const { status: statusFinal, body: bodyFinal } = await login(email, password);
    expect(statusFinal).toBe(200);
    expect((bodyFinal as { mfaRequerido?: boolean }).mfaRequerido).toBeUndefined();
  });
});

describe("Sesiones activas — listar y revocar", () => {
  it("lista sesiones activas y revocar una impide su próximo refresh", async () => {
    const tenantId = await crearTenant(superusuario, "T-Sesiones");
    const email = "sesiones@auth-test.local";
    const password = "clave-sesiones-super-segura-12";
    await crearUsuario(superusuario, { tenantId, email, rol: "admin_gestora", password });

    const { body: b1 } = await login(email, password);
    const { accessToken, refreshToken } = b1 as { accessToken: string; refreshToken: string };

    const respLista = await fetch(`${baseUrl}/auth/sesiones`, { headers: autorizado(accessToken) });
    expect(respLista.status).toBe(200);
    const { sesiones } = (await respLista.json()) as { sesiones: Array<{ id: string }> };
    expect(sesiones.length).toBeGreaterThan(0);

    const respRevocar = await fetch(`${baseUrl}/auth/sesiones/${sesiones[0]!.id}`, { method: "DELETE", headers: autorizado(accessToken) });
    expect(respRevocar.status).toBe(200);

    const respRefreshTrasRevocar = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(respRefreshTrasRevocar.status).toBe(401);
  });
});
