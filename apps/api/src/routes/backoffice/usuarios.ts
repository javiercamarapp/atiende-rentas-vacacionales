import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import type pg from "pg";
import { CuerpoCrearInvitacion, ErrorDominio } from "../../contrato/tipos.js";
import { conSesion, enTransaccion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { relanzarSiRlsRechazo, resolverTenantId } from "./comun.js";

interface FilaInvitacion {
  id: string;
  email: string;
  rol: string;
  colaborador_nivel: string | null;
  creado_en: string;
  expira_en: string;
  aceptada_en: string | null;
  revocada_en: string | null;
}

function serializarInvitacion(f: FilaInvitacion) {
  return {
    id: f.id,
    email: f.email,
    rol: f.rol,
    colaboradorNivel: f.colaborador_nivel,
    creadoEn: f.creado_en,
    expiraEn: f.expira_en,
    aceptadaEn: f.aceptada_en,
    revocadaEn: f.revocada_en,
  };
}

function generarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

/**
 * Usuarios/roles del tenant + invitaciones (RV12 §1, 3 niveles de
 * colaborador ya definidos en Lote 3: `acceso_total`/`calendario_mensajeria`/
 * `solo_calendario`). El token de invitación NUNCA se persiste en claro
 * (`invitacion_usuario.token_hash`, packages/db migración 0062) — solo se
 * devuelve UNA VEZ en la respuesta de `POST /invitaciones` (mismo patrón
 * que un refresh token). El flujo de aceptación (fijar contraseña con ese
 * token) queda documentado como pendiente de un canal de entrega de email
 * real — fuera del alcance mínimo de este lote (sin servicio de correo en
 * Fase 2); el token generado aquí es válido para integrarlo cuando ese
 * canal exista.
 */
export function crearRutasBackofficeUsuarios(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const tenantId = resolverTenantId(auth, c.req.query("tenantId"));

    const filas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) => {
        const { rows } = await cliente.query(
          "SELECT id, email, rol, colaborador_nivel, activo FROM usuario WHERE tenant_id = $1 ORDER BY creado_en DESC",
          [tenantId],
        );
        return rows;
      }),
    );

    return c.json({
      usuarios: filas.map((f) => ({
        id: f.id,
        email: f.email,
        rol: f.rol,
        colaboradorNivel: f.colaborador_nivel,
        activo: f.activo,
      })),
    });
  });

  app.get("/invitaciones", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const tenantId = resolverTenantId(auth, c.req.query("tenantId"));

    const filas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) => {
        const { rows } = await cliente.query<FilaInvitacion>(
          `SELECT id, email, rol, colaborador_nivel, creado_en, expira_en, aceptada_en, revocada_en
           FROM invitacion_usuario WHERE tenant_id = $1 ORDER BY creado_en DESC`,
          [tenantId],
        );
        return rows;
      }),
    );

    return c.json({ invitaciones: filas.map(serializarInvitacion) });
  });

  app.post("/invitaciones", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoCrearInvitacion.parse(await c.req.json());
    const tenantId = resolverTenantId(auth, c.req.query("tenantId") ?? undefined);
    const { token, hash } = generarToken();

    const fila = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          const { rows } = await cliente.query<FilaInvitacion>(
            `INSERT INTO invitacion_usuario (tenant_id, email, rol, colaborador_nivel, owner_id, token_hash, creado_por, expira_en)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' hours')::interval)
             RETURNING id, email, rol, colaborador_nivel, creado_en, expira_en, aceptada_en, revocada_en`,
            [
              tenantId,
              cuerpo.email,
              cuerpo.rol,
              cuerpo.colaboradorNivel ?? null,
              cuerpo.ownerId ?? null,
              hash,
              auth.usuarioId,
              cuerpo.ttlHoras,
            ],
          );
          return rows[0]!;
        }),
      ),
    );

    // El token en claro se devuelve UNA sola vez — nunca queda persistido
    // ni se puede recuperar después de esta respuesta.
    return c.json({ ...serializarInvitacion(fila), token }, 201);
  });

  app.post("/invitaciones/:id/revocar", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const id = c.req.param("id");

    const afectadas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          const { rowCount } = await cliente.query(
            "UPDATE invitacion_usuario SET revocada_en = now() WHERE id = $1 AND aceptada_en IS NULL AND revocada_en IS NULL",
            [id],
          );
          return rowCount ?? 0;
        }),
      ),
    );
    if (afectadas === 0) throw new ErrorDominio("recurso_no_encontrado", "Invitación no encontrada o ya resuelta");

    return c.json({ id, revocada: true });
  });

  return app;
}
