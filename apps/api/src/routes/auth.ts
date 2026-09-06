import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import type pg from "pg";
import type { PoolClient } from "pg";
import {
  CuerpoCambiarPassword,
  CuerpoLoginExtendido,
  CuerpoMfaConfirmar,
  CuerpoMfaDeshabilitar,
  CuerpoMfaVerificar,
  CuerpoOlvidePassword,
  CuerpoRefreshExtendido,
  CuerpoRegistro,
  CuerpoRestablecerPassword,
  CuerpoVerificarCorreo,
} from "../contrato/tipos.js";
import { ErrorDominio } from "../contrato/errores.js";
import { conConexion, conSesion, enTransaccion, fijarSesion, limpiarSesion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import {
  cookieEsSegura,
  fijarCookieCsrf,
  fijarCookieRefresh,
  limpiarCookieCsrf,
  limpiarCookieRefresh,
  obtenerCookieRefresh,
  verificarCsrf,
} from "../middleware/cookiesAuth.js";
import type { KeyringCifradoCanal } from "../seguridad/cifrado.js";
import { hashContrasena, verificarContrasena } from "../seguridad/contrasenas.js";
import { correoRestablecerPassword, correoVerificacion, type InterfazCorreo } from "../seguridad/correo.js";
import {
  DURACION_REFRESH_TOKEN_MS,
  emitirAccessToken,
  emitirMfaPendienteToken,
  generarRefreshToken,
  hashearRefreshToken,
  verificarMfaPendienteToken,
} from "../seguridad/jwt.js";
import {
  construirUrlAutorizacion,
  generarPkce,
  generarValorAleatorio,
  hashearValorOidc,
  intercambiarCodigoPorTokens,
  validarIdToken,
} from "../seguridad/oidc.js";
import { crearOidcSimulado } from "../seguridad/oidcSimulado.js";
import { validarPoliticaContrasena } from "../seguridad/passwordPolicy.js";
import {
  consumirCodigoRecuperacion,
  generarCodigosRecuperacion,
  generarSecretoTotp,
  hashearCodigoRecuperacion,
  otpauthUrl,
  verificarTotp,
  type CodigoRecuperacionAlmacenado,
} from "../seguridad/totp.js";
import { LimitadorVentana, type OpcionesRateLimit } from "../seguridad/rateLimit.js";
import type { ColaboradorNivel, RolUsuario } from "../contrato/tipos.js";

// S-13 (docs/auditoria-2/seguridad.md): hash "señuelo" con el mismo
// formato/parámetros que `hashContrasena` (scrypt N=16384/r=8/p=1),
// generado una sola vez al cargar el módulo — NUNCA corresponde a ninguna
// contraseña real, su salt/derivada son bytes aleatorios sin significado.
// Se usa exclusivamente para que `verificarContrasena` pague el MISMO
// costo computacional de scrypt cuando el usuario no existe (o está
// inactivo/sin hash) que cuando sí existe pero la contraseña es
// incorrecta — sin esto, el camino "usuario inexistente" retorna
// inmediatamente sin ejecutar scrypt, creando un canal lateral de tiempo
// medible que permite enumerar usuarios (RV19/21-7, ASVS 2.1.11 exige
// mensaje idéntico Y tiempo de respuesta equivalente).
const HASH_SENUELO_TIMING = `scrypt$16384$8$1$${randomBytes(16).toString("base64")}$${randomBytes(64).toString("base64")}`;

// Centinela de `password_hash` para cuentas creadas SOLO por Google (sin
// contraseña local) — nunca coincide con el formato
// "scrypt$N$r$p$sal$derivada" que exige `verificarContrasena`, así que
// intentar iniciar sesión con contraseña en una de estas cuentas siempre
// falla de forma segura (documentado en packages/db/src/migrations/
// 0106_auth_funciones_extendidas.ts).
const PASSWORD_HASH_SOLO_GOOGLE = "google_oauth_sin_password";

const TTL_TOKEN_VERIFICACION_MS = 24 * 60 * 60 * 1000; // 24 horas
const TTL_TOKEN_RESET_MS = 60 * 60 * 1000; // 1 hora
const TTL_OIDC_FLOW_MS = 10 * 60 * 1000; // 10 minutos
const ISSUER_GOOGLE = "https://accounts.google.com";
const JWKS_URI_GOOGLE = "https://www.googleapis.com/oauth2/v3/certs";
const AUTHORIZATION_ENDPOINT_GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT_GOOGLE = "https://oauth2.googleapis.com/token";
const SCOPE_GOOGLE = "openid email profile";

interface FilaUsuarioAuth {
  id: string;
  tenant_id: string | null;
  rol: RolUsuario;
  colaborador_nivel: ColaboradorNivel | null;
  owner_id: string | null;
  password_hash?: string;
  activo: boolean;
  email?: string;
  email_verificado_en?: string | null;
  mfa_totp_habilitado?: boolean;
  mfa_totp_secret_cifrado?: Buffer | null;
  mfa_totp_secret_iv?: Buffer | null;
  mfa_totp_secret_tag?: Buffer | null;
  mfa_totp_secret_clave_version?: string | null;
  mfa_recovery_codes?: CodigoRecuperacionAlmacenado[];
  intentos_fallidos?: number;
  bloqueado_hasta?: string | null;
}

function usuarioSesionDe(usuario: FilaUsuarioAuth) {
  return {
    id: usuario.id,
    tenantId: usuario.tenant_id,
    rol: usuario.rol,
    colaboradorNivel: usuario.colaborador_nivel,
    mfaHabilitado: usuario.mfa_totp_habilitado ?? false,
  };
}

function descifrarSecretoMfa(keyring: KeyringCifradoCanal, usuario: FilaUsuarioAuth): string | null {
  if (
    !usuario.mfa_totp_secret_cifrado ||
    !usuario.mfa_totp_secret_iv ||
    !usuario.mfa_totp_secret_tag ||
    !usuario.mfa_totp_secret_clave_version
  ) {
    return null;
  }
  try {
    return keyring.descifrar({
      cifrado: usuario.mfa_totp_secret_cifrado,
      iv: usuario.mfa_totp_secret_iv,
      tag: usuario.mfa_totp_secret_tag,
      claveVersion: usuario.mfa_totp_secret_clave_version,
    });
  } catch {
    return null;
  }
}

export interface DependenciasAuth {
  pool: pg.Pool;
  jwtSecret: string;
  /** Reutilizado para cifrar el secreto TOTP en reposo (AES-256-GCM) —
   * mismo esquema que las credenciales de canal, ver
   * apps/api/src/seguridad/cifrado.ts. */
  keyring: KeyringCifradoCanal;
  correo: InterfazCorreo;
  rateLimitLoginPorEmail: OpcionesRateLimit;
  urlPublicaApi: string;
  urlPublicaWeb: string;
  google: { clientId: string | null; clientSecret: string | null; redirectUri: string | null };
  oidcSimuladoHabilitado: boolean;
  politicaContrasenaHibp: boolean;
  bloqueoCuenta: { maxIntentos: number; duracionMs: number };
  entorno: "development" | "test" | "production";
}

export function crearRutasAuth(deps: DependenciasAuth): Hono {
  const {
    pool,
    jwtSecret,
    keyring,
    correo,
    rateLimitLoginPorEmail,
    urlPublicaApi,
    urlPublicaWeb,
    google,
    oidcSimuladoHabilitado,
    politicaContrasenaHibp,
    bloqueoCuenta,
    entorno,
  } = deps;
  const app = new Hono();
  const cookieSegura = cookieEsSegura(entorno);

  // S-06: límite adicional por email/usuario, independiente del rate
  // limit genérico por IP (apps/api/src/seguridad/rateLimit.ts).
  const limitadorPorEmail = new LimitadorVentana(rateLimitLoginPorEmail);

  const googleHabilitado = Boolean(google.clientId && google.clientSecret && google.redirectUri);

  function motivoGoogleDeshabilitado(): string | null {
    if (googleHabilitado) return null;
    return "Google Sign-In no está configurado en este entorno (faltan GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)";
  }

  function ipHashDeRequest(c: Context): string | null {
    try {
      const info = getConnInfo(c);
      const ip = info.remote.address;
      return ip ? createHash("sha256").update(ip).digest("hex") : null;
    } catch {
      return null;
    }
  }

  async function registrarEventoAuth(
    cliente: PoolClient,
    datos: { usuarioId?: string | null; tenantId?: string | null; tipo: string; ipHash?: string | null; metadata?: Record<string, unknown> },
  ): Promise<void> {
    await cliente.query(
      `INSERT INTO auditoria_auth_evento (usuario_id, tenant_id, tipo, ip_hash, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [datos.usuarioId ?? null, datos.tenantId ?? null, datos.tipo, datos.ipHash ?? null, JSON.stringify(datos.metadata ?? {})],
    );
  }

  interface OpcionesEmitirTokens {
    aud: "web" | "api";
    familiaId?: string;
    dispositivoEtiqueta?: string | null;
    ipHash?: string | null;
    reemplazaTokenId?: string;
  }

  async function emitirParDeTokens(
    cliente: PoolClient,
    usuario: FilaUsuarioAuth,
    opciones: OpcionesEmitirTokens,
  ): Promise<{ accessToken: string; refreshToken: string; expiraEn: number }> {
    await fijarSesion(cliente, {
      usuarioId: usuario.id,
      tenantId: usuario.tenant_id,
      rol: usuario.rol,
      colaboradorNivel: usuario.colaborador_nivel,
    });

    const { token: accessToken, expiraEn } = await emitirAccessToken(
      { sub: usuario.id, tenant_id: usuario.tenant_id, rol: usuario.rol, colaborador_nivel: usuario.colaborador_nivel, aud: opciones.aud },
      jwtSecret,
    );

    const { token: refreshToken, hash } = generarRefreshToken();
    const familiaId = opciones.familiaId ?? randomUUID();
    await enTransaccion(cliente, async () => {
      const { rows } = await cliente.query<{ id: string }>(
        `INSERT INTO refresh_token (usuario_id, token_hash, expira_en, familia_id, aud, dispositivo_etiqueta, creado_ip_hash)
         VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval, $4, $5, $6, $7)
         RETURNING id`,
        [usuario.id, hash, DURACION_REFRESH_TOKEN_MS, familiaId, opciones.aud, opciones.dispositivoEtiqueta ?? null, opciones.ipHash ?? null],
      );
      if (opciones.reemplazaTokenId) {
        await cliente.query("UPDATE refresh_token SET reemplazado_por = $1 WHERE id = $2", [rows[0]!.id, opciones.reemplazaTokenId]);
      }
    });

    return { accessToken, refreshToken, expiraEn };
  }

  /** Entrega la sesión al cliente: 'api' recibe el refresh token en el
   * cuerpo JSON (compatibilidad, integraciones); 'web' lo recibe SOLO
   * como cookie httpOnly+Secure+SameSite + una cookie CSRF de doble envío
   * — el refresh token NUNCA aparece en el cuerpo de la respuesta para
   * 'web' (H-096, defensa en profundidad contra XSS: JS de la propia
   * página no puede leerlo). */
  function entregarSesion(
    c: Context,
    cliente: "web" | "api",
    tokens: { accessToken: string; refreshToken: string; expiraEn: number },
    usuario: ReturnType<typeof usuarioSesionDe>,
  ) {
    if (cliente === "web") {
      fijarCookieRefresh(c, tokens.refreshToken, { segura: cookieSegura, maxAgeMs: DURACION_REFRESH_TOKEN_MS });
      fijarCookieCsrf(c, generarValorAleatorio(16), { segura: cookieSegura, maxAgeMs: DURACION_REFRESH_TOKEN_MS });
      return c.json({ accessToken: tokens.accessToken, expiraEn: tokens.expiraEn, usuario }, 200);
    }
    return c.json({ ...tokens, usuario }, 200);
  }

  async function enviarCorreoVerificacion(usuarioId: string, email: string): Promise<void> {
    const token = generarValorAleatorio(32);
    const hash = hashearValorOidc(token);
    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      await cliente.query(
        "INSERT INTO token_un_uso (usuario_id, tipo, token_hash, expira_en) VALUES ($1, 'verificacion_email', $2, now() + ($3 || ' milliseconds')::interval)",
        [usuarioId, hash, TTL_TOKEN_VERIFICACION_MS],
      );
    });
    const url = `${urlPublicaWeb}/verificar-correo?token=${encodeURIComponent(token)}`;
    const { asunto, textoPlano } = correoVerificacion(url);
    await correo.enviar({ para: email, asunto, textoPlano });
  }

  async function verificarContrasenaActual(usuarioId: string, passwordActual: string): Promise<boolean> {
    const { rows } = await pool.query<{ email: string }>("SELECT * FROM autenticar_buscar_usuario_por_id($1)", [usuarioId]);
    const email = rows[0]?.email;
    if (!email) return false;
    const { rows: conHash } = await pool.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario($1)", [email]);
    const usuario = conHash[0];
    if (!usuario || !usuario.password_hash) return false;
    return verificarContrasena(passwordActual, usuario.password_hash);
  }

  /**
   * Resuelve el callback de un flujo OIDC (Google o el proveedor
   * simulado, misma lógica para ambos): consume el `oidc_flow`, canjea el
   * código por un `id_token`, lo valida y decide crear/vincular/loguear
   * la cuenta local — deja las cookies de sesión fijadas en `c` cuando
   * termina con éxito (el llamador solo hace el redirect final).
   */
  async function manejarCallbackOidc(
    c: Context,
    opciones: { proveedor: string; issuer: string; jwksUri: string; clientId: string; clientSecret: string; tokenEndpoint: string },
  ): Promise<void> {
    const state = c.req.query("state");
    const code = c.req.query("code");
    if (!state || !code) throw new ErrorDominio("oidc_invalido", "Faltan parámetros de callback OIDC");
    const stateHash = hashearValorOidc(state);

    const flujo = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query(
        "SELECT * FROM oidc_flow WHERE state_hash = $1 AND consumido_en IS NULL AND expira_en > now()",
        [stateHash],
      );
      const fila = rows[0];
      if (!fila) throw new ErrorDominio("oidc_invalido", "Flujo OIDC inválido, expirado o ya usado");
      await cliente.query("UPDATE oidc_flow SET consumido_en = now() WHERE id = $1", [fila.id]);
      return fila;
    });

    let claims;
    try {
      const tokenResp = await intercambiarCodigoPorTokens({
        tokenEndpoint: opciones.tokenEndpoint,
        code,
        codeVerifier: flujo.code_verifier,
        redirectUri: flujo.redirect_uri,
        clientId: opciones.clientId,
        clientSecret: opciones.clientSecret,
      });
      claims = await validarIdToken(tokenResp.idToken, {
        issuer: opciones.issuer,
        audience: opciones.clientId,
        nonce: flujo.nonce,
        jwksUri: opciones.jwksUri,
      });
    } catch {
      throw new ErrorDominio("oidc_invalido", "No se pudo validar la identidad del proveedor");
    }

    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows: identidadExistente } = await cliente.query<{ usuario_id: string }>(
        "SELECT usuario_id FROM identidad_oidc WHERE proveedor = $1 AND sub = $2",
        [opciones.proveedor, claims.sub],
      );

      let usuarioId: string;
      if (identidadExistente[0]) {
        usuarioId = identidadExistente[0].usuario_id;
      } else if (flujo.invitacion_token_hash) {
        const { rows } = await cliente.query("SELECT * FROM autenticar_buscar_invitacion($1)", [flujo.invitacion_token_hash]);
        const inv = rows[0];
        if (!inv || inv.revocada_en || inv.aceptada_en || new Date(inv.expira_en).getTime() < Date.now()) {
          throw new ErrorDominio("token_invalido", "Invitación inválida, expirada o ya usada");
        }
        if (inv.email.toLowerCase() !== claims.email.toLowerCase()) {
          throw new ErrorDominio("google_vinculacion_no_permitida", "El correo de la identidad no coincide con el de la invitación");
        }
        usuarioId = (
          await cliente.query("SELECT autenticar_registrar_usuario($1,$2,$3,$4,$5,$6,$7) AS id", [
            inv.tenant_id,
            claims.email,
            PASSWORD_HASH_SOLO_GOOGLE,
            inv.rol,
            inv.colaborador_nivel,
            inv.owner_id,
            true,
          ])
        ).rows[0].id;
        await cliente.query("SELECT autenticar_aceptar_invitacion($1)", [inv.id]);
        await cliente.query("INSERT INTO identidad_oidc (usuario_id, proveedor, sub, email, hd) VALUES ($1,$2,$3,$4,$5)", [
          usuarioId,
          opciones.proveedor,
          claims.sub,
          claims.email,
          claims.hd,
        ]);
      } else {
        const { rows: existentePorEmail } = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario($1)", [claims.email]);
        if (existentePorEmail[0]) {
          // Vincular la identidad a una cuenta local YA EXISTENTE con el
          // mismo correo verificado: siempre permitido (no otorga ningún
          // acceso nuevo, solo un método de login adicional) — la
          // política del tenant solo gobierna la CREACIÓN de cuentas
          // nuevas, nunca vincular a una cuenta que ya existía.
          usuarioId = existentePorEmail[0].id;
          await cliente.query("INSERT INTO identidad_oidc (usuario_id, proveedor, sub, email, hd) VALUES ($1,$2,$3,$4,$5)", [
            usuarioId,
            opciones.proveedor,
            claims.sub,
            claims.email,
            claims.hd,
          ]);
        } else {
          if (!flujo.tenant_id_registro) {
            throw new ErrorDominio(
              "google_vinculacion_no_permitida",
              "No existe una cuenta con este correo; usa una invitación o un enlace de registro abierto",
            );
          }
          const { rows: filasPolitica } = await cliente.query("SELECT * FROM autenticar_buscar_politica_tenant($1)", [flujo.tenant_id_registro]);
          const pol = filasPolitica[0];
          if (!pol) throw new ErrorDominio("google_vinculacion_no_permitida", "Tenant de registro inválido");
          const dominio = (claims.hd ?? claims.email.split("@")[1] ?? "").toLowerCase();
          const dominiosPermitidos: string[] = pol.dominios_google_permitidos ?? [];
          const permitidoPorPolitica =
            pol.politica_vinculacion_google === "abierto" ||
            (pol.politica_vinculacion_google === "dominio_permitido" && dominiosPermitidos.map((d) => d.toLowerCase()).includes(dominio));
          if (!permitidoPorPolitica) {
            throw new ErrorDominio("google_vinculacion_no_permitida", "Este tenant no permite crear cuentas nuevas con Google");
          }
          usuarioId = (
            await cliente.query("SELECT autenticar_registrar_usuario($1,$2,$3,$4,$5,$6,$7) AS id", [
              flujo.tenant_id_registro,
              claims.email,
              PASSWORD_HASH_SOLO_GOOGLE,
              "operador",
              "solo_calendario",
              null,
              true,
            ])
          ).rows[0].id;
          await cliente.query("INSERT INTO identidad_oidc (usuario_id, proveedor, sub, email, hd) VALUES ($1,$2,$3,$4,$5)", [
            usuarioId,
            opciones.proveedor,
            claims.sub,
            claims.email,
            claims.hd,
          ]);
        }
      }

      const { rows } = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario_por_id($1)", [usuarioId]);
      const usuario = rows[0];
      if (!usuario || !usuario.activo) {
        throw new ErrorDominio("credenciales_invalidas", "Cuenta inactiva");
      }

      // Login federado: MFA local no se exige (Google/el proveedor OIDC ya
      // actúa como un segundo factor de facto sobre esa identidad) —
      // decisión documentada aquí explícitamente.
      const tokens = await emitirParDeTokens(cliente, usuario, { aud: "web" });
      await registrarEventoAuth(cliente, { usuarioId: usuario.id, tenantId: usuario.tenant_id, tipo: `login_${opciones.proveedor}_exitoso` });
      fijarCookieRefresh(c, tokens.refreshToken, { segura: cookieSegura, maxAgeMs: DURACION_REFRESH_TOKEN_MS });
      fijarCookieCsrf(c, generarValorAleatorio(16), { segura: cookieSegura, maxAgeMs: DURACION_REFRESH_TOKEN_MS });
    });
  }

  // ---------------------------------------------------------------------
  // Config pública (sin auth) — decide si el botón de Google se muestra.
  // ---------------------------------------------------------------------
  app.get("/config", async (c) => {
    const registroAbierto = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<{ v: boolean }>("SELECT autenticar_existe_tenant_con_registro_abierto() AS v");
      return rows[0]?.v ?? false;
    });
    return c.json({
      googleHabilitado,
      googleMotivoDeshabilitado: motivoGoogleDeshabilitado(),
      registroAbierto,
    });
  });

  // ---------------------------------------------------------------------
  // Login (email/password) — con bloqueo temporal + MFA de dos pasos.
  // ---------------------------------------------------------------------
  app.post("/login", async (c) => {
    const cuerpo = CuerpoLoginExtendido.parse(await c.req.json());
    limitadorPorEmail.registrarIntento(`login:${cuerpo.email.trim().toLowerCase()}`);
    const ipHash = ipHashDeRequest(c);

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario($1)", [cuerpo.email]);
      const usuario = rows[0];
      // Mensaje idéntico exista o no el email (nunca revelar cuál de los
      // dos falló — enumeración de usuarios, ASVS 2.1.11/§RV19/21-7).
      if (!usuario || !usuario.activo || !usuario.password_hash) {
        await verificarContrasena(cuerpo.password, HASH_SENUELO_TIMING);
        await registrarEventoAuth(cliente, { tipo: "login_fallido", ipHash, metadata: { motivo: "usuario_no_encontrado" } });
        throw new ErrorDominio("credenciales_invalidas", "Email o contraseña incorrectos");
      }

      if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta).getTime() > Date.now()) {
        await registrarEventoAuth(cliente, { usuarioId: usuario.id, tenantId: usuario.tenant_id, tipo: "login_bloqueado", ipHash });
        throw new ErrorDominio("cuenta_bloqueada_temporalmente", "Cuenta bloqueada temporalmente por demasiados intentos fallidos");
      }

      const claveValida = await verificarContrasena(cuerpo.password, usuario.password_hash);
      if (!claveValida) {
        await cliente.query("SELECT autenticar_registrar_intento_fallido($1, $2, $3)", [
          usuario.id,
          bloqueoCuenta.maxIntentos,
          bloqueoCuenta.duracionMs,
        ]);
        await registrarEventoAuth(cliente, {
          usuarioId: usuario.id,
          tenantId: usuario.tenant_id,
          tipo: "login_fallido",
          ipHash,
          metadata: { motivo: "password_incorrecta" },
        });
        throw new ErrorDominio("credenciales_invalidas", "Email o contraseña incorrectos");
      }
      await cliente.query("SELECT autenticar_resetear_intentos($1)", [usuario.id]);

      if (usuario.mfa_totp_habilitado) {
        const { token: mfaToken, expiraEn } = await emitirMfaPendienteToken(usuario.id, jwtSecret);
        await registrarEventoAuth(cliente, { usuarioId: usuario.id, tenantId: usuario.tenant_id, tipo: "mfa_pendiente", ipHash });
        return { mfaRequerido: true as const, mfaToken, expiraEn };
      }

      const tokens = await emitirParDeTokens(cliente, usuario, { aud: cuerpo.cliente, ipHash });
      await registrarEventoAuth(cliente, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        tipo: "login_exitoso",
        ipHash,
        metadata: { aud: cuerpo.cliente },
      });
      return { mfaRequerido: false as const, tokens, usuario: usuarioSesionDe(usuario) };
    });

    if (resultado.mfaRequerido) {
      return c.json({ mfaRequerido: true, mfaToken: resultado.mfaToken, expiraEn: resultado.expiraEn }, 200);
    }
    return entregarSesion(c, cuerpo.cliente, resultado.tokens, resultado.usuario);
  });

  // ---------------------------------------------------------------------
  // Paso 2 de login con MFA: código TOTP o código de recuperación.
  // ---------------------------------------------------------------------
  app.post("/mfa/verificar", async (c) => {
    const cuerpo = CuerpoMfaVerificar.parse(await c.req.json());
    const ipHash = ipHashDeRequest(c);

    let usuarioId: string;
    try {
      usuarioId = await verificarMfaPendienteToken(cuerpo.mfaToken, jwtSecret);
    } catch {
      throw new ErrorDominio("token_invalido", "Token de MFA pendiente inválido o expirado");
    }

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario_por_id($1)", [usuarioId]);
      const usuario = rows[0];
      if (!usuario || !usuario.activo || !usuario.mfa_totp_habilitado) {
        throw new ErrorDominio("mfa_invalido", "MFA no habilitado para esta cuenta");
      }

      let codigoValido = false;
      let nuevosRecoveryCodes: CodigoRecuperacionAlmacenado[] | undefined;
      if (/^\d{6}$/.test(cuerpo.codigo)) {
        const secreto = descifrarSecretoMfa(keyring, usuario);
        codigoValido = secreto !== null && verificarTotp(secreto, cuerpo.codigo);
      }
      if (!codigoValido) {
        const actualizados = consumirCodigoRecuperacion(usuario.mfa_recovery_codes ?? [], cuerpo.codigo);
        if (actualizados) {
          codigoValido = true;
          nuevosRecoveryCodes = actualizados;
        }
      }
      if (!codigoValido) {
        await registrarEventoAuth(cliente, { usuarioId: usuario.id, tenantId: usuario.tenant_id, tipo: "mfa_fallido", ipHash });
        throw new ErrorDominio("mfa_invalido", "Código de verificación inválido");
      }

      if (nuevosRecoveryCodes) {
        await cliente.query("SELECT autenticar_marcar_recovery_codes($1, $2)", [usuario.id, JSON.stringify(nuevosRecoveryCodes)]);
      }

      const tokens = await emitirParDeTokens(cliente, usuario, { aud: cuerpo.cliente, ipHash });
      await registrarEventoAuth(cliente, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        tipo: "login_exitoso",
        ipHash,
        metadata: { aud: cuerpo.cliente, mfa: true },
      });
      return { tokens, usuario: usuarioSesionDe(usuario) };
    });

    return entregarSesion(c, cuerpo.cliente, resultado.tokens, resultado.usuario);
  });

  // ---------------------------------------------------------------------
  // Refresh — rotación con detección de reutilización (revoca familia).
  // ---------------------------------------------------------------------
  app.post("/refresh", verificarCsrf(), async (c) => {
    const cuerpo = CuerpoRefreshExtendido.parse(await c.req.json().catch(() => ({})));
    const refreshTokenCrudo = cuerpo.refreshToken ?? obtenerCookieRefresh(c);
    if (!refreshTokenCrudo) {
      throw new ErrorDominio("token_invalido", "Falta el refresh token (cuerpo o cookie)");
    }
    const clientePeticion: "web" | "api" = cuerpo.refreshToken ? "api" : "web";
    const hash = hashearRefreshToken(refreshTokenCrudo);
    const ipHash = ipHashDeRequest(c);

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<{
        id: string;
        usuario_id: string;
        expira_en: string;
        revocado_en: string | null;
        familia_id: string;
        aud: string;
      }>("SELECT * FROM autenticar_buscar_refresh_token($1)", [hash]);
      const fila = rows[0];
      if (!fila) {
        throw new ErrorDominio("token_invalido", "Refresh token inválido o expirado");
      }

      const usuarios = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario_por_id($1)", [fila.usuario_id]);
      const usuario = usuarios.rows[0];

      if (fila.revocado_en !== null) {
        // H-096: reutilización de un refresh token ya revocado — señal de
        // robo (alguien más ya lo canjeó, o un atacante está reproduciendo
        // un token capturado). Se revoca TODA la familia, no solo este
        // token, para cortar cualquier token hijo que ese robo ya haya
        // generado.
        if (usuario) {
          await fijarSesion(cliente, {
            usuarioId: usuario.id,
            tenantId: usuario.tenant_id,
            rol: usuario.rol,
            colaboradorNivel: usuario.colaborador_nivel,
          });
          await enTransaccion(cliente, async () => {
            await cliente.query(
              "UPDATE refresh_token SET revocado_en = now(), revocado_motivo = 'reutilizacion_detectada' WHERE familia_id = $1 AND revocado_en IS NULL",
              [fila.familia_id],
            );
          });
          await registrarEventoAuth(cliente, {
            usuarioId: usuario.id,
            tenantId: usuario.tenant_id,
            tipo: "refresh_reutilizado_familia_revocada",
            ipHash,
          });
        }
        throw new ErrorDominio("token_invalido", "Refresh token ya usado — sesión revocada por seguridad, vuelve a iniciar sesión");
      }
      if (new Date(fila.expira_en).getTime() < Date.now()) {
        throw new ErrorDominio("token_invalido", "Refresh token inválido o expirado");
      }
      if (!usuario || !usuario.activo) {
        throw new ErrorDominio("token_invalido", "Usuario inactivo");
      }

      await fijarSesion(cliente, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        rol: usuario.rol,
        colaboradorNivel: usuario.colaborador_nivel,
      });
      await enTransaccion(cliente, async () => {
        await cliente.query("UPDATE refresh_token SET revocado_en = now(), revocado_motivo = 'rotado' WHERE id = $1", [fila.id]);
      });

      const tokens = await emitirParDeTokens(cliente, usuario, {
        aud: fila.aud === "web" ? "web" : "api",
        familiaId: fila.familia_id,
        ipHash,
        reemplazaTokenId: fila.id,
      });
      return { tokens, usuario: usuarioSesionDe(usuario) };
    });

    return entregarSesion(c, clientePeticion, resultado.tokens, resultado.usuario);
  });

  // ---------------------------------------------------------------------
  // Logout — revoca un refresh token (cookie o cuerpo).
  // ---------------------------------------------------------------------
  app.post("/logout", verificarCsrf(), async (c) => {
    const cuerpo = CuerpoRefreshExtendido.parse(await c.req.json().catch(() => ({})));
    const refreshTokenCrudo = cuerpo.refreshToken ?? obtenerCookieRefresh(c);
    if (!refreshTokenCrudo) {
      limpiarCookieRefresh(c, { segura: cookieSegura });
      limpiarCookieCsrf(c, { segura: cookieSegura });
      return c.body(null, 204);
    }
    const hash = hashearRefreshToken(refreshTokenCrudo);

    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<{ id: string; usuario_id: string }>(
        "SELECT id, usuario_id FROM autenticar_buscar_refresh_token($1)",
        [hash],
      );
      const fila = rows[0];
      if (!fila) return;

      const usuarios = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario_por_id($1)", [fila.usuario_id]);
      const usuario = usuarios.rows[0];
      if (!usuario) return;

      await fijarSesion(cliente, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        rol: usuario.rol,
        colaboradorNivel: usuario.colaborador_nivel,
      });
      await enTransaccion(cliente, async () => {
        await cliente.query("UPDATE refresh_token SET revocado_en = now(), revocado_motivo = 'logout' WHERE id = $1", [fila.id]);
      });
    });

    limpiarCookieRefresh(c, { segura: cookieSegura });
    limpiarCookieCsrf(c, { segura: cookieSegura });
    return c.body(null, 204);
  });

  // ---------------------------------------------------------------------
  // Registro (invitación o registro abierto) + verificación de correo.
  // ---------------------------------------------------------------------
  app.post("/registro", async (c) => {
    const cuerpo = CuerpoRegistro.parse(await c.req.json());
    if (cuerpo.invitacionToken && cuerpo.tenantId) {
      throw new ErrorDominio("validacion", "invitacionToken y tenantId son mutuamente excluyentes");
    }
    const politica = await validarPoliticaContrasena(cuerpo.password, { hibpHabilitado: politicaContrasenaHibp });
    if (!politica.valida) {
      throw new ErrorDominio("validacion", politica.motivo ?? "Contraseña inválida");
    }
    const passwordHash = await hashContrasena(cuerpo.password);
    const ipHash = ipHashDeRequest(c);

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);

      if (cuerpo.invitacionToken) {
        const hash = hashearValorOidc(cuerpo.invitacionToken);
        const { rows } = await cliente.query("SELECT * FROM autenticar_buscar_invitacion($1)", [hash]);
        const inv = rows[0];
        if (!inv || inv.revocada_en || inv.aceptada_en || new Date(inv.expira_en).getTime() < Date.now()) {
          throw new ErrorDominio("token_invalido", "Invitación inválida, expirada o ya usada");
        }
        if (inv.email.toLowerCase() !== cuerpo.email.toLowerCase()) {
          throw new ErrorDominio("validacion", "El correo no coincide con el de la invitación");
        }
        const usuarioId: string = (
          await cliente.query("SELECT autenticar_registrar_usuario($1,$2,$3,$4,$5,$6,$7) AS id", [
            inv.tenant_id,
            cuerpo.email,
            passwordHash,
            inv.rol,
            inv.colaborador_nivel,
            inv.owner_id,
            true,
          ])
        ).rows[0].id;
        await cliente.query("SELECT autenticar_aceptar_invitacion($1)", [inv.id]);
        await registrarEventoAuth(cliente, { usuarioId, tenantId: inv.tenant_id, tipo: "registro_invitacion", ipHash });
        return { usuarioId, emailVerificado: true };
      }

      if (!cuerpo.tenantId) {
        throw new ErrorDominio("registro_no_permitido", "Se requiere invitacionToken o tenantId");
      }
      const { rows: filasPolitica } = await cliente.query("SELECT * FROM autenticar_buscar_politica_tenant($1)", [cuerpo.tenantId]);
      const pol = filasPolitica[0];
      if (!pol || !pol.permite_registro) {
        throw new ErrorDominio("registro_no_permitido", "Este tenant no permite registro abierto");
      }
      const usuarioId: string = (
        await cliente.query("SELECT autenticar_registrar_usuario($1,$2,$3,$4,$5,$6,$7) AS id", [
          cuerpo.tenantId,
          cuerpo.email,
          passwordHash,
          "operador",
          "solo_calendario",
          null,
          false,
        ])
      ).rows[0].id;
      await registrarEventoAuth(cliente, { usuarioId, tenantId: cuerpo.tenantId, tipo: "registro_abierto", ipHash });
      return { usuarioId, emailVerificado: false };
    });

    if (!resultado.emailVerificado) {
      await enviarCorreoVerificacion(resultado.usuarioId, cuerpo.email);
    }

    return c.json({ id: resultado.usuarioId, requiereVerificacionCorreo: !resultado.emailVerificado }, 201);
  });

  app.post("/reenviar-verificacion", async (c) => {
    const cuerpo = CuerpoOlvidePassword.parse(await c.req.json());
    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario($1)", [cuerpo.email]);
      const usuario = rows[0];
      // Nunca revela si el correo existe o ya está verificado.
      if (usuario && usuario.activo && !usuario.email_verificado_en) {
        await enviarCorreoVerificacion(usuario.id, cuerpo.email);
      }
    });
    return c.json({ enviado: true });
  });

  app.post("/verificar-correo", async (c) => {
    const cuerpo = CuerpoVerificarCorreo.parse(await c.req.json());
    const hash = hashearValorOidc(cuerpo.token);
    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<{ id: string; usuario_id: string; usado_en: string | null; expira_en: string }>(
        "SELECT id, usuario_id, usado_en, expira_en FROM token_un_uso WHERE token_hash = $1 AND tipo = 'verificacion_email'",
        [hash],
      );
      const fila = rows[0];
      if (!fila || fila.usado_en !== null || new Date(fila.expira_en).getTime() < Date.now()) {
        throw new ErrorDominio("token_invalido", "Token de verificación inválido o expirado");
      }
      await enTransaccion(cliente, async () => {
        await cliente.query("UPDATE token_un_uso SET usado_en = now() WHERE id = $1", [fila.id]);
        await cliente.query("SELECT autenticar_marcar_email_verificado($1)", [fila.usuario_id]);
      });
    });
    return c.json({ verificado: true });
  });

  // ---------------------------------------------------------------------
  // Olvidé / restablecer contraseña — restablecer invalida TODAS las
  // sesiones existentes (H-096: si alguien más tenía acceso, se corta).
  // ---------------------------------------------------------------------
  app.post("/olvide-password", async (c) => {
    const cuerpo = CuerpoOlvidePassword.parse(await c.req.json());
    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario($1)", [cuerpo.email]);
      const usuario = rows[0];
      // Nunca revela si el correo existe (mismo criterio S-13 que /login).
      if (usuario && usuario.activo) {
        const token = generarValorAleatorio(32);
        const hash = hashearValorOidc(token);
        await cliente.query(
          "INSERT INTO token_un_uso (usuario_id, tipo, token_hash, expira_en) VALUES ($1, 'restablecer_password', $2, now() + ($3 || ' milliseconds')::interval)",
          [usuario.id, hash, TTL_TOKEN_RESET_MS],
        );
        const url = `${urlPublicaWeb}/restablecer-password?token=${encodeURIComponent(token)}`;
        const { asunto, textoPlano } = correoRestablecerPassword(url);
        await correo.enviar({ para: cuerpo.email, asunto, textoPlano });
      }
    });
    return c.json({ enviado: true });
  });

  app.post("/restablecer-password", async (c) => {
    const cuerpo = CuerpoRestablecerPassword.parse(await c.req.json());
    const politica = await validarPoliticaContrasena(cuerpo.password, { hibpHabilitado: politicaContrasenaHibp });
    if (!politica.valida) throw new ErrorDominio("validacion", politica.motivo ?? "Contraseña inválida");
    const hash = hashearValorOidc(cuerpo.token);
    const nuevoHash = await hashContrasena(cuerpo.password);

    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<{ id: string; usuario_id: string; usado_en: string | null; expira_en: string }>(
        "SELECT id, usuario_id, usado_en, expira_en FROM token_un_uso WHERE token_hash = $1 AND tipo = 'restablecer_password'",
        [hash],
      );
      const fila = rows[0];
      if (!fila || fila.usado_en !== null || new Date(fila.expira_en).getTime() < Date.now()) {
        throw new ErrorDominio("token_invalido", "Token de restablecimiento inválido o expirado");
      }
      const usuarios = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario_por_id($1)", [fila.usuario_id]);
      const usuario = usuarios.rows[0];
      if (!usuario) throw new ErrorDominio("token_invalido", "Token de restablecimiento inválido o expirado");

      await cliente.query("UPDATE token_un_uso SET usado_en = now() WHERE id = $1", [fila.id]);
      await cliente.query("SELECT autenticar_actualizar_password($1, $2)", [usuario.id, nuevoHash]);

      // Invalida TODAS las sesiones existentes de este usuario (H-096).
      await fijarSesion(cliente, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        rol: usuario.rol,
        colaboradorNivel: usuario.colaborador_nivel,
      });
      await enTransaccion(cliente, async () => {
        await cliente.query(
          "UPDATE refresh_token SET revocado_en = now(), revocado_motivo = 'reset_password' WHERE usuario_id = $1 AND revocado_en IS NULL",
          [usuario.id],
        );
      });
      await registrarEventoAuth(cliente, { usuarioId: usuario.id, tenantId: usuario.tenant_id, tipo: "password_restablecida" });
    });

    return c.json({ restablecido: true });
  });

  // ---------------------------------------------------------------------
  // Rutas autenticadas: cambiar password, MFA, sesiones, logout global.
  // ---------------------------------------------------------------------
  // Middleware aplicado explícitamente por ruta (nunca un `use("*", ...)`
  // montado en un sub-router en "/"): un wildcard así, dependiendo del
  // orden de registro relativo a otras rutas de este mismo `app`
  // (/google/inicio, /oidc-simulado/*), puede terminar interceptando
  // rutas públicas que NO deben exigir autenticación — se prefiere ser
  // explícito en cada ruta antes que depender de ese orden.
  const auth1 = requiereAutenticacion(jwtSecret);
  const auth2 = verificarCsrf();

  app.post("/cambiar-password", auth1, auth2, async (c) => {
    const auth = c.get("auth");
    const cuerpo = CuerpoCambiarPassword.parse(await c.req.json());
    const politica = await validarPoliticaContrasena(cuerpo.passwordNueva, { hibpHabilitado: politicaContrasenaHibp });
    if (!politica.valida) throw new ErrorDominio("validacion", politica.motivo ?? "Contraseña inválida");

    const claveActualValida = await verificarContrasenaActual(auth.usuarioId, cuerpo.passwordActual);
    if (!claveActualValida) {
      throw new ErrorDominio("credenciales_invalidas", "Contraseña actual incorrecta");
    }
    const nuevoHash = await hashContrasena(cuerpo.passwordNueva);

    await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      await cliente.query("SELECT autenticar_actualizar_password($1, $2)", [auth.usuarioId, nuevoHash]);
      await enTransaccion(cliente, async () => {
        await cliente.query(
          "UPDATE refresh_token SET revocado_en = now(), revocado_motivo = 'cambio_password' WHERE usuario_id = $1 AND revocado_en IS NULL",
          [auth.usuarioId],
        );
      });
      await registrarEventoAuth(cliente, { usuarioId: auth.usuarioId, tenantId: auth.tenantId, tipo: "password_cambiada" });
    });

    limpiarCookieRefresh(c, { segura: cookieSegura });
    limpiarCookieCsrf(c, { segura: cookieSegura });
    return c.json({ cambiada: true });
  });

  app.post("/mfa/iniciar", auth1, auth2, async (c) => {
    const auth = c.get("auth");
    const secreto = generarSecretoTotp();
    const cifrado = keyring.cifrar(secreto);
    await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      // Se guarda ya cifrado pero SIN habilitar todavía — solo se activa
      // en /mfa/confirmar tras verificar un código real (evita que un
      // "iniciar" a medias deje mfa_totp_habilitado en un estado
      // inconsistente si el usuario nunca confirma).
      await cliente.query("SELECT autenticar_actualizar_mfa($1,$2,$3,$4,$5,$6,$7)", [
        auth.usuarioId,
        false,
        cifrado.cifrado,
        cifrado.iv,
        cifrado.tag,
        cifrado.claveVersion,
        JSON.stringify([]),
      ]);
    });
    return c.json({
      secretBase32: secreto,
      otpauthUrl: otpauthUrl({ secretBase32: secreto, cuenta: String(auth.usuarioId), emisor: "Atiende" }),
    });
  });

  app.post("/mfa/confirmar", auth1, auth2, async (c) => {
    const auth = c.get("auth");
    const cuerpo = CuerpoMfaConfirmar.parse(await c.req.json());
    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<FilaUsuarioAuth>("SELECT * FROM autenticar_buscar_usuario_por_id($1)", [auth.usuarioId]);
      const usuario = rows[0];
      const secreto = usuario ? descifrarSecretoMfa(keyring, usuario) : null;
      if (!usuario || !secreto || !verificarTotp(secreto, cuerpo.codigo)) {
        throw new ErrorDominio("mfa_invalido", "Código TOTP inválido");
      }
      const codigos = generarCodigosRecuperacion();
      const almacenados: CodigoRecuperacionAlmacenado[] = codigos.map((cod) => ({ hash: hashearCodigoRecuperacion(cod), usadoEn: null }));
      await cliente.query("SELECT autenticar_actualizar_mfa($1,$2,$3,$4,$5,$6,$7)", [
        auth.usuarioId,
        true,
        usuario.mfa_totp_secret_cifrado,
        usuario.mfa_totp_secret_iv,
        usuario.mfa_totp_secret_tag,
        usuario.mfa_totp_secret_clave_version,
        JSON.stringify(almacenados),
      ]);
      await registrarEventoAuth(cliente, { usuarioId: auth.usuarioId, tenantId: auth.tenantId, tipo: "mfa_habilitado" });
      return codigos;
    });
    return c.json({ habilitado: true, codigosRecuperacion: resultado });
  });

  app.post("/mfa/deshabilitar", auth1, auth2, async (c) => {
    const auth = c.get("auth");
    const cuerpo = CuerpoMfaDeshabilitar.parse(await c.req.json());
    const claveValida = await verificarContrasenaActual(auth.usuarioId, cuerpo.password);
    if (!claveValida) throw new ErrorDominio("credenciales_invalidas", "Contraseña incorrecta");
    await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      await cliente.query("SELECT autenticar_deshabilitar_mfa($1)", [auth.usuarioId]);
      await registrarEventoAuth(cliente, { usuarioId: auth.usuarioId, tenantId: auth.tenantId, tipo: "mfa_deshabilitado" });
    });
    return c.json({ deshabilitado: true });
  });

  app.get("/sesiones", auth1, auth2, async (c) => {
    const auth = c.get("auth");
    const refreshActual = obtenerCookieRefresh(c);
    const hashActual = refreshActual ? hashearRefreshToken(refreshActual) : null;
    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<{
        id: string;
        creado_en: string;
        expira_en: string;
        aud: string;
        dispositivo_etiqueta: string | null;
        token_hash: string;
      }>(
        "SELECT id, creado_en, expira_en, aud, dispositivo_etiqueta, token_hash FROM refresh_token WHERE usuario_id = $1 AND revocado_en IS NULL ORDER BY creado_en DESC",
        [auth.usuarioId],
      );
      return rows;
    });
    return c.json({
      sesiones: filas.map((f) => ({
        id: f.id,
        creadoEn: f.creado_en,
        expiraEn: f.expira_en,
        aud: f.aud,
        dispositivoEtiqueta: f.dispositivo_etiqueta,
        actual: hashActual !== null && f.token_hash === hashActual,
      })),
    });
  });

  app.delete("/sesiones/:id", auth1, auth2, async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const afectadas = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rowCount } = await cliente.query(
          "UPDATE refresh_token SET revocado_en = now(), revocado_motivo = 'revocada_por_usuario' WHERE id = $1 AND usuario_id = $2 AND revocado_en IS NULL",
          [id, auth.usuarioId],
        );
        return rowCount ?? 0;
      }),
    );
    if (afectadas === 0) throw new ErrorDominio("recurso_no_encontrado", "Sesión no encontrada");
    return c.json({ revocada: true });
  });

  app.post("/logout-global", auth1, auth2, async (c) => {
    const auth = c.get("auth");
    await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        await cliente.query(
          "UPDATE refresh_token SET revocado_en = now(), revocado_motivo = 'logout_global' WHERE usuario_id = $1 AND revocado_en IS NULL",
          [auth.usuarioId],
        );
      }),
    );
    limpiarCookieRefresh(c, { segura: cookieSegura });
    limpiarCookieCsrf(c, { segura: cookieSegura });
    return c.body(null, 204);
  });

  // ---------------------------------------------------------------------
  // Google Sign-In (OpenID Connect, Authorization Code + PKCE).
  // ---------------------------------------------------------------------
  app.get("/google/inicio", async (c) => {
    if (!googleHabilitado) {
      throw new ErrorDominio("google_deshabilitado", motivoGoogleDeshabilitado() ?? "Google Sign-In deshabilitado");
    }
    const invitacionToken = c.req.query("invitacionToken");
    const tenantId = c.req.query("tenantId");
    if (invitacionToken && tenantId) {
      throw new ErrorDominio("validacion", "invitacionToken y tenantId son mutuamente excluyentes");
    }

    const pkce = generarPkce();
    const state = generarValorAleatorio(24);
    const nonce = generarValorAleatorio(24);

    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      await cliente.query(
        `INSERT INTO oidc_flow (proveedor, state_hash, code_verifier, nonce, redirect_uri, cliente, invitacion_token_hash, tenant_id_registro, expira_en)
         VALUES ('google', $1, $2, $3, $4, 'web', $5, $6, now() + ($7 || ' milliseconds')::interval)`,
        [
          hashearValorOidc(state),
          pkce.verifier,
          nonce,
          google.redirectUri,
          invitacionToken ? hashearValorOidc(invitacionToken) : null,
          tenantId ?? null,
          TTL_OIDC_FLOW_MS,
        ],
      );
    });

    const url = construirUrlAutorizacion({
      authorizationEndpoint: AUTHORIZATION_ENDPOINT_GOOGLE,
      clientId: google.clientId!,
      redirectUri: google.redirectUri!,
      state,
      nonce,
      codeChallenge: pkce.challenge,
      scope: SCOPE_GOOGLE,
    });
    return c.redirect(url, 302);
  });

  app.get("/google/callback", async (c) => {
    if (!googleHabilitado) {
      throw new ErrorDominio("google_deshabilitado", motivoGoogleDeshabilitado() ?? "Google Sign-In deshabilitado");
    }
    await manejarCallbackOidc(c, {
      proveedor: "google",
      issuer: ISSUER_GOOGLE,
      jwksUri: JWKS_URI_GOOGLE,
      clientId: google.clientId!,
      clientSecret: google.clientSecret!,
      tokenEndpoint: TOKEN_ENDPOINT_GOOGLE,
    });
    return c.redirect(`${urlPublicaWeb}/auth/google/completado`, 302);
  });

  // ---------------------------------------------------------------------
  // Proveedor OIDC simulado (dev/pruebas/E2E) — fail-closed, nunca en
  // producción (D-019). Reusa exactamente el mismo callback de arriba,
  // apuntando al emisor simulado en vez de a Google.
  // ---------------------------------------------------------------------
  if (oidcSimuladoHabilitado) {
    const issuerSimulado = `${urlPublicaApi}/auth/oidc-simulado`;
    app.route("/oidc-simulado", crearOidcSimulado({ issuerBaseUrl: issuerSimulado }));

    app.get("/oidc-simulado-login/inicio", async (c) => {
      const invitacionToken = c.req.query("invitacionToken");
      const tenantId = c.req.query("tenantId");
      const pkce = generarPkce();
      const state = generarValorAleatorio(24);
      const nonce = generarValorAleatorio(24);
      const redirectUri = `${urlPublicaApi}/auth/oidc-simulado-login/callback`;

      await conConexion(pool, async (cliente) => {
        await limpiarSesion(cliente);
        await cliente.query(
          `INSERT INTO oidc_flow (proveedor, state_hash, code_verifier, nonce, redirect_uri, cliente, invitacion_token_hash, tenant_id_registro, expira_en)
           VALUES ('oidc_simulado', $1, $2, $3, $4, 'web', $5, $6, now() + ($7 || ' milliseconds')::interval)`,
          [
            hashearValorOidc(state),
            pkce.verifier,
            nonce,
            redirectUri,
            invitacionToken ? hashearValorOidc(invitacionToken) : null,
            tenantId ?? null,
            TTL_OIDC_FLOW_MS,
          ],
        );
      });

      const url = construirUrlAutorizacion({
        authorizationEndpoint: `${issuerSimulado}/authorize`,
        clientId: "atiende-web-simulado",
        redirectUri,
        state,
        nonce,
        codeChallenge: pkce.challenge,
      });
      return c.redirect(url, 302);
    });

    app.get("/oidc-simulado-login/callback", async (c) => {
      await manejarCallbackOidc(c, {
        proveedor: "oidc_simulado",
        issuer: issuerSimulado,
        jwksUri: `${issuerSimulado}/jwks.json`,
        clientId: "atiende-web-simulado",
        clientSecret: "no-aplica-oidc-simulado",
        tokenEndpoint: `${issuerSimulado}/token`,
      });
      return c.redirect(`${urlPublicaWeb}/auth/google/completado`, 302);
    });
  }

  return app;
}
