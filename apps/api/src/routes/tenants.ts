import { Hono } from "hono";
import { z } from "zod";
import type pg from "pg";
import { ErrorDominio } from "../contrato/errores.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";

const CuerpoCrearTenant = z.object({
  nombre: z.string().min(1),
  razonSocial: z.string().min(1),
});

export function crearRutasTenants(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // POST /tenants — alta de un tenant nuevo (empresa gestora), exclusiva de
  // Superadmin Atiende (backoffice completo llega en Lote 8; aquí solo el
  // mínimo para poder bootstrapear un tenant de prueba/piloto).
  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin");
    const cuerpo = CuerpoCrearTenant.parse(await c.req.json());

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

    return c.json({ id: fila.id, nombre: cuerpo.nombre }, 201);
  });

  // GET /tenants/me
  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.tenantId) {
      throw new ErrorDominio("tenant_forbidden", "Superadmin no pertenece a ningún tenant");
    }
    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query("SELECT id, nombre, tipo FROM tenant WHERE id = $1", [auth.tenantId]);
      return rows[0] ?? null;
    });
    if (!fila) throw new ErrorDominio("recurso_no_encontrado", "Tenant no encontrado");
    return c.json({ id: fila.id, nombre: fila.nombre, tipo: fila.tipo });
  });

  return app;
}
