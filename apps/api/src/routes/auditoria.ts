import { Hono } from "hono";
import type pg from "pg";
import { QueryPaginacion } from "../contrato/tipos.js";
import { conSesion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { ROLES_ADMIN } from "../rolesComunes.js";
import { sesionDeAuth } from "../middleware/tenant.js";

/** GET /auditoria — paginado, admin-only (§Auditoría-1). Doble candado:
 * `exigirRol` en la capa de servicio (H-044) y la política RLS
 * `auditoria_mutacion_select` (packages/db migración 0015), que además
 * respalda el aislamiento por tenant incluso si este chequeo se olvidara. */
export function crearRutasAuditoria(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const query = QueryPaginacion.parse({
      pagina: c.req.query("pagina"),
      tamano: c.req.query("tamano"),
    });
    const offset = (query.pagina - 1) * query.tamano;

    const { entradas, total } = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const [filas, conteo] = await Promise.all([
        cliente.query(
          `SELECT id, tabla, fila_id, operacion, actor_id, creado_en, valores_previos, valores_nuevos
           FROM auditoria_mutacion
           ORDER BY creado_en DESC
           LIMIT $1 OFFSET $2`,
          [query.tamano, offset],
        ),
        cliente.query<{ total: string }>("SELECT count(*)::text AS total FROM auditoria_mutacion"),
      ]);
      return { entradas: filas.rows, total: Number.parseInt(conteo.rows[0]?.total ?? "0", 10) };
    });

    return c.json({
      pagina: query.pagina,
      tamano: query.tamano,
      total,
      entradas: entradas.map((f) => ({
        id: f.id,
        tabla: f.tabla,
        filaId: f.fila_id,
        operacion: f.operacion,
        actorId: f.actor_id,
        creadoEn: f.creado_en,
        valoresPrevios: f.valores_previos,
        valoresNuevos: f.valores_nuevos,
      })),
    });
  });

  return app;
}
