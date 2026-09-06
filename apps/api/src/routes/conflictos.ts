import { Hono } from "hono";
import type pg from "pg";
import { conSesion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { sesionDeAuth } from "../middleware/tenant.js";

export function crearRutasConflictos(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // GET /conflictos?resuelto=false — RLS (packages/db migración 0015) ya
  // restringe esto a superadmin/admin_gestora/operador de ese tenant.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const mostrarTodos = c.req.query("resuelto") === "true";

    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT id, unidad_id, tipo, detectado_en, resuelto_en
         FROM conflicto_calendario
         WHERE $1::boolean OR resuelto_en IS NULL
         ORDER BY detectado_en DESC`,
        [mostrarTodos],
      );
      return rows;
    });

    return c.json({
      conflictos: filas.map((f) => ({
        id: f.id,
        unidadId: f.unidad_id,
        tipo: f.tipo,
        detectadoEn: f.detectado_en,
        resueltoEn: f.resuelto_en,
      })),
    });
  });

  return app;
}
