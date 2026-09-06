import { Hono } from "hono";
import type pg from "pg";
import { CuerpoCrearAccesoRomperCristal, ErrorDominio } from "../../contrato/tipos.js";
import { conSesion, enTransaccion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { ROLES_SUPERADMIN } from "../../rolesComunes.js";
import { registrarAccesoRomperCristal, sesionDeAuth } from "../../middleware/tenant.js";

/**
 * H-075/H-076: acceso "romper cristal" — motivo obligatorio, ventana
 * temporal acotada (`minutos`, máx. 24h), auditado. `POST /` crea la
 * concesión (packages/db tabla `acceso_romper_cristal`, migración 0061)
 * Y, en la misma transacción, deja la entrada histórica en
 * `auditoria_mutacion` reutilizando `registrarAccesoRomperCristal`
 * (ya existente desde Lote 3, `apps/api/src/middleware/tenant.ts`) — la
 * concesión es el "permiso vigente" que consulta `is_tenant_member`; la
 * entrada de auditoría es el registro inmutable de que se usó, con quién,
 * cuándo, sobre qué tenant y por qué (§Auditoría-1).
 *
 * Sin esta concesión, `is_tenant_member` deniega a CUALQUIER superadmin el
 * acceso a filas de negocio de un tenant (propiedad/unidad/usuario/owner/
 * cuenta_canal/...) — 0 filas en SELECT, `42501` en INSERT/UPDATE. El
 * banner persistente de la UI (`apps/web/src/pages/backoffice/`) se arma
 * con `GET /` mientras haya una concesión propia vigente.
 */
export function crearRutasBackofficeRomperCristal(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // GET / — concesiones propias vigentes (para el banner persistente).
  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);

    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT id, tenant_id, motivo, alcance, creado_en, expira_en, revocado_en
         FROM acceso_romper_cristal
         WHERE superadmin_id = $1 AND revocado_en IS NULL AND expira_en > now()
         ORDER BY creado_en DESC`,
        [auth.usuarioId],
      );
      return rows;
    });

    return c.json({
      accesos: filas.map((f) => ({
        id: f.id,
        tenantId: f.tenant_id,
        motivo: f.motivo,
        alcance: f.alcance,
        creadoEn: f.creado_en,
        expiraEn: f.expira_en,
        revocadoEn: f.revocado_en,
      })),
    });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);
    const cuerpo = CuerpoCrearAccesoRomperCristal.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rows } = await cliente.query<{ id: string; expira_en: string }>(
          `INSERT INTO acceso_romper_cristal (superadmin_id, tenant_id, motivo, alcance, expira_en)
           VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)
           RETURNING id, expira_en`,
          [auth.usuarioId, cuerpo.tenantId, cuerpo.motivo, cuerpo.alcance, cuerpo.minutos],
        );
        // Entrada histórica en auditoria_mutacion (§Auditoría-1): quién,
        // cuándo, sobre qué tenant, con qué motivo/alcance.
        await registrarAccesoRomperCristal(cliente, {
          actorId: auth.usuarioId,
          tenantId: cuerpo.tenantId,
          motivo: cuerpo.motivo,
          recurso: cuerpo.alcance,
        });
        return rows[0]!;
      }),
    );

    return c.json(
      { id: fila.id, tenantId: cuerpo.tenantId, motivo: cuerpo.motivo, expiraEn: fila.expira_en },
      201,
    );
  });

  app.post("/:id/revocar", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);
    const id = c.req.param("id");

    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rowCount } = await cliente.query(
          "UPDATE acceso_romper_cristal SET revocado_en = now() WHERE id = $1 AND superadmin_id = $2 AND revocado_en IS NULL",
          [id, auth.usuarioId],
        );
        return rowCount ?? 0;
      }),
    );
    if (filas === 0) throw new ErrorDominio("recurso_no_encontrado", "Concesión no encontrada o ya revocada");

    return c.json({ id, revocado: true });
  });

  return app;
}
