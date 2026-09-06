import { Hono } from "hono";
import type pg from "pg";
import { CuerpoLogin, CuerpoRefresh } from "../contrato/tipos.js";
import { ErrorDominio } from "../contrato/errores.js";
import { conConexion, enTransaccion, fijarSesion, limpiarSesion } from "../db/contexto.js";
import { verificarContrasena } from "../seguridad/contrasenas.js";
import {
  DURACION_REFRESH_TOKEN_MS,
  emitirAccessToken,
  generarRefreshToken,
  hashearRefreshToken,
} from "../seguridad/jwt.js";
import { LimitadorVentana, type OpcionesRateLimit } from "../seguridad/rateLimit.js";
import type { ColaboradorNivel, RolUsuario } from "../contrato/tipos.js";

interface FilaUsuarioAuth {
  id: string;
  tenant_id: string | null;
  rol: RolUsuario;
  colaborador_nivel: ColaboradorNivel | null;
  owner_id: string | null;
  password_hash?: string;
  activo: boolean;
}

async function emitirParDeTokens(
  cliente: pg.PoolClient,
  usuario: FilaUsuarioAuth,
  jwtSecret: string,
): Promise<{ accessToken: string; refreshToken: string; expiraEn: number }> {
  await fijarSesion(cliente, {
    usuarioId: usuario.id,
    tenantId: usuario.tenant_id,
    rol: usuario.rol,
    colaboradorNivel: usuario.colaborador_nivel,
  });

  const { token: accessToken, expiraEn } = await emitirAccessToken(
    {
      sub: usuario.id,
      tenant_id: usuario.tenant_id,
      rol: usuario.rol,
      colaborador_nivel: usuario.colaborador_nivel,
    },
    jwtSecret,
  );

  const { token: refreshToken, hash } = generarRefreshToken();
  await enTransaccion(cliente, async () => {
    await cliente.query(
      `INSERT INTO refresh_token (usuario_id, token_hash, expira_en)
       VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
      [usuario.id, hash, DURACION_REFRESH_TOKEN_MS],
    );
  });

  return { accessToken, refreshToken, expiraEn };
}

export function crearRutasAuth(
  pool: pg.Pool,
  jwtSecret: string,
  rateLimitLoginPorEmail: OpcionesRateLimit,
): Hono {
  const app = new Hono();

  // S-06: límite adicional por email/usuario, independiente del rate
  // limit genérico por IP (apps/api/src/seguridad/rateLimit.ts) — evita
  // fuerza bruta contra una sola cuenta desde muchas IPs/proxies
  // distintos, un vector que el límite por IP nunca puede cerrar por sí
  // solo. Normalizado (lowercase/trim) para que variantes de
  // mayúsculas/espacios del mismo email compartan el mismo contador.
  const limitadorPorEmail = new LimitadorVentana(rateLimitLoginPorEmail);

  // POST /auth/login
  app.post("/login", async (c) => {
    const cuerpo = CuerpoLogin.parse(await c.req.json());
    limitadorPorEmail.registrarIntento(`login:${cuerpo.email.trim().toLowerCase()}`);

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<FilaUsuarioAuth>(
        "SELECT * FROM autenticar_buscar_usuario($1)",
        [cuerpo.email],
      );
      const usuario = rows[0];
      // Mensaje idéntico exista o no el email (nunca revelar cuál de los
      // dos falló — enumeración de usuarios, ASVS 2.1.11/§RV19/21-7).
      if (!usuario || !usuario.activo || !usuario.password_hash) {
        throw new ErrorDominio("credenciales_invalidas", "Email o contraseña incorrectos");
      }
      const claveValida = await verificarContrasena(cuerpo.password, usuario.password_hash);
      if (!claveValida) {
        throw new ErrorDominio("credenciales_invalidas", "Email o contraseña incorrectos");
      }

      const tokens = await emitirParDeTokens(cliente, usuario, jwtSecret);
      return {
        ...tokens,
        usuario: {
          id: usuario.id,
          tenantId: usuario.tenant_id,
          rol: usuario.rol,
          colaboradorNivel: usuario.colaborador_nivel,
        },
      };
    });

    return c.json(resultado, 200);
  });

  // POST /auth/refresh — rotación: el refresh token usado se revoca y se
  // emite uno nuevo (H-040). Reusar un refresh token ya revocado es
  // rechazado explícitamente (posible señal de robo de token).
  app.post("/refresh", async (c) => {
    const cuerpo = CuerpoRefresh.parse(await c.req.json());
    const hash = hashearRefreshToken(cuerpo.refreshToken);

    const resultado = await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<{
        id: string;
        usuario_id: string;
        expira_en: string;
        revocado_en: string | null;
      }>("SELECT * FROM autenticar_buscar_refresh_token($1)", [hash]);
      const fila = rows[0];
      if (!fila || fila.revocado_en !== null || new Date(fila.expira_en).getTime() < Date.now()) {
        throw new ErrorDominio("token_invalido", "Refresh token inválido o expirado");
      }

      const usuarios = await cliente.query<FilaUsuarioAuth>(
        "SELECT * FROM autenticar_buscar_usuario_por_id($1)",
        [fila.usuario_id],
      );
      const usuario = usuarios.rows[0];
      if (!usuario || !usuario.activo) {
        throw new ErrorDominio("token_invalido", "Usuario inactivo");
      }

      // Fija la sesión con el usuario dueño del token para poder revocarlo
      // (política refresh_token_propio exige usuario_id = usuario_actual_id()).
      await fijarSesion(cliente, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        rol: usuario.rol,
        colaboradorNivel: usuario.colaborador_nivel,
      });
      await enTransaccion(cliente, async () => {
        await cliente.query("UPDATE refresh_token SET revocado_en = now() WHERE id = $1", [fila.id]);
      });

      const tokens = await emitirParDeTokens(cliente, usuario, jwtSecret);
      return {
        ...tokens,
        usuario: {
          id: usuario.id,
          tenantId: usuario.tenant_id,
          rol: usuario.rol,
          colaboradorNivel: usuario.colaborador_nivel,
        },
      };
    });

    return c.json(resultado, 200);
  });

  // POST /auth/logout — revoca el refresh token (no invalida access tokens
  // ya emitidos, que expiran solos a los 15 minutos; documentado).
  app.post("/logout", async (c) => {
    const cuerpo = CuerpoRefresh.parse(await c.req.json());
    const hash = hashearRefreshToken(cuerpo.refreshToken);

    await conConexion(pool, async (cliente) => {
      await limpiarSesion(cliente);
      const { rows } = await cliente.query<{ id: string; usuario_id: string }>(
        "SELECT id, usuario_id FROM autenticar_buscar_refresh_token($1)",
        [hash],
      );
      const fila = rows[0];
      if (!fila) return; // logout de un token ya inválido: no-op silencioso.

      const usuarios = await cliente.query<FilaUsuarioAuth>(
        "SELECT * FROM autenticar_buscar_usuario_por_id($1)",
        [fila.usuario_id],
      );
      const usuario = usuarios.rows[0];
      if (!usuario) return;

      await fijarSesion(cliente, {
        usuarioId: usuario.id,
        tenantId: usuario.tenant_id,
        rol: usuario.rol,
        colaboradorNivel: usuario.colaborador_nivel,
      });
      await enTransaccion(cliente, async () => {
        await cliente.query("UPDATE refresh_token SET revocado_en = now() WHERE id = $1", [fila.id]);
      });
    });

    return c.body(null, 204);
  });

  return app;
}
