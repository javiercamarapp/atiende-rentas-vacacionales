import { Hono } from "hono";
import type pg from "pg";
import { validarZonaHorariaIana } from "@atiende-rv/domain";
import { CuerpoCrearPropiedad, ErrorDominio } from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { sesionDeAuth } from "../middleware/tenant.js";

export function crearRutasPropiedades(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        "SELECT id, nombre, zona_horaria, tenant_id, creado_en FROM propiedad ORDER BY creado_en DESC",
      );
      return rows;
    });
    return c.json({
      propiedades: filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        zonaHoraria: f.zona_horaria,
        tenantId: f.tenant_id,
      })),
    });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        "SELECT id, nombre, zona_horaria, tenant_id FROM propiedad WHERE id = $1",
        [id],
      );
      return rows[0] ?? null;
    });
    if (!fila) throw new ErrorDominio("recurso_no_encontrado", "Propiedad no encontrada");
    return c.json({ id: fila.id, nombre: fila.nombre, zonaHoraria: fila.zona_horaria, tenantId: fila.tenant_id });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoCrearPropiedad.parse(await c.req.json());
    if (!validarZonaHorariaIana(cuerpo.zonaHoraria)) {
      throw new ErrorDominio("validacion", `Zona horaria IANA inválida: "${cuerpo.zonaHoraria}"`);
    }
    if (!auth.tenantId) {
      throw new ErrorDominio("tenant_forbidden", "Superadmin debe operar con un tenant explícito (fuera de alcance de este lote)");
    }

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rows } = await cliente.query(
          `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, $2, $3)
           RETURNING id, nombre, zona_horaria, tenant_id`,
          [auth.tenantId, cuerpo.nombre, cuerpo.zonaHoraria],
        );
        return rows[0];
      }),
    );

    return c.json({ id: fila.id, nombre: fila.nombre, zonaHoraria: fila.zona_horaria, tenantId: fila.tenant_id }, 201);
  });

  return app;
}
