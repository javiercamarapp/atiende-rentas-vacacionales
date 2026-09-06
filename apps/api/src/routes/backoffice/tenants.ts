import { Hono } from "hono";
import type pg from "pg";
import { CuerpoCrearTenantBackoffice, CuerpoSuspenderTenant, ErrorDominio } from "../../contrato/tipos.js";
import { conSesion, enTransaccion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { ROLES_SUPERADMIN } from "../../rolesComunes.js";
import { sesionDeAuth } from "../../middleware/tenant.js";

interface FilaMetricas {
  tenant_id: string;
  unidades_total: string;
  cuentas_canal_total: string;
  cuentas_canal_configuradas: string;
  cuentas_canal_simulador: string;
  alertas_abiertas: string;
  outbox_pendiente: string;
}

/**
 * H-074: panel multi-tenant de superadmin — listado/alta/baja/suspensión
 * de tenants + métricas agregadas por tenant. El directorio (`GET /`) es
 * visible SIN concesión "romper cristal" (política
 * `tenant_select_superadmin_directorio`, packages/db migración 0061):
 * nombre/tipo/estado + conteos agregados de `backoffice_metricas_tenants`
 * (packages/db migración 0063) — nunca contenido de negocio.
 */
export function crearRutasBackofficeTenants(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);

    const { tenants, metricas } = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const [t, m] = await Promise.all([
        cliente.query(
          "SELECT id, nombre, tipo, estado, suspendido_motivo, creado_en FROM tenant ORDER BY creado_en DESC",
        ),
        cliente.query<FilaMetricas>("SELECT * FROM backoffice_metricas_tenants(NULL)"),
      ]);
      return { tenants: t.rows, metricas: m.rows };
    });

    const metricasPorTenant = new Map(metricas.map((m) => [m.tenant_id, m]));

    return c.json({
      tenants: tenants.map((t) => {
        const m = metricasPorTenant.get(t.id);
        return {
          id: t.id,
          nombre: t.nombre,
          tipo: t.tipo,
          estado: t.estado,
          suspendidoMotivo: t.suspendido_motivo,
          creadoEn: t.creado_en,
          metricas: {
            unidadesTotal: Number.parseInt(m?.unidades_total ?? "0", 10),
            cuentasCanalTotal: Number.parseInt(m?.cuentas_canal_total ?? "0", 10),
            cuentasCanalConfiguradas: Number.parseInt(m?.cuentas_canal_configuradas ?? "0", 10),
            cuentasCanalSimulador: Number.parseInt(m?.cuentas_canal_simulador ?? "0", 10),
            alertasAbiertas: Number.parseInt(m?.alertas_abiertas ?? "0", 10),
            outboxPendiente: Number.parseInt(m?.outbox_pendiente ?? "0", 10),
          },
        };
      }),
    });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);
    const cuerpo = CuerpoCrearTenantBackoffice.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const tenant = await cliente.query<{ id: string }>(
          "INSERT INTO tenant (nombre, tipo) VALUES ($1, 'empresa_gestora') RETURNING id",
          [cuerpo.nombre],
        );
        await cliente.query("INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, $2)", [
          tenant.rows[0]!.id,
          cuerpo.razonSocial,
        ]);
        return tenant.rows[0]!;
      }),
    );

    return c.json({ id: fila.id, nombre: cuerpo.nombre, estado: "activo" }, 201);
  });

  app.post("/:id/suspender", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);
    const tenantId = c.req.param("id");
    const cuerpo = CuerpoSuspenderTenant.parse(await c.req.json());

    const actualizado = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rowCount } = await cliente.query(
          `UPDATE tenant SET estado = 'suspendido', suspendido_motivo = $2, suspendido_en = now(), suspendido_por = $3
           WHERE id = $1`,
          [tenantId, cuerpo.motivo, auth.usuarioId],
        );
        return rowCount ?? 0;
      }),
    );
    if (actualizado === 0) throw new ErrorDominio("recurso_no_encontrado", "Tenant no encontrado");

    return c.json({ id: tenantId, estado: "suspendido" });
  });

  app.post("/:id/activar", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_SUPERADMIN);
    const tenantId = c.req.param("id");

    const actualizado = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rowCount } = await cliente.query(
          `UPDATE tenant SET estado = 'activo', suspendido_motivo = NULL, suspendido_en = NULL, suspendido_por = NULL
           WHERE id = $1`,
          [tenantId],
        );
        return rowCount ?? 0;
      }),
    );
    if (actualizado === 0) throw new ErrorDominio("recurso_no_encontrado", "Tenant no encontrado");

    return c.json({ id: tenantId, estado: "activo" });
  });

  return app;
}
