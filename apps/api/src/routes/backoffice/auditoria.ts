import { Hono } from "hono";
import type pg from "pg";
import { QueryAuditoriaBackoffice } from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { sesionDeAuth } from "../../middleware/tenant.js";

/**
 * Auditoría consultable con filtros (§Auditoría-1) — extiende
 * `GET /auditoria` (Lote 3, apps/api/src/routes/auditoria.ts, sin
 * modificarla) con filtros por tabla/operación/actor/rango de fecha,
 * necesarios para que el back office pueda buscar, por ejemplo, todas las
 * entradas `ACCESO_ROMPER_CRISTAL` de un superadmin en un periodo. La
 * política RLS `auditoria_mutacion_select` (packages/db migración 0015)
 * sigue siendo el respaldo de aislamiento: un `admin_gestora` solo ve las
 * filas de su propio tenant aunque intente filtrar por otro.
 */
export function crearRutasBackofficeAuditoria(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const query = QueryAuditoriaBackoffice.parse({
      pagina: c.req.query("pagina"),
      tamano: c.req.query("tamano"),
      tabla: c.req.query("tabla"),
      operacion: c.req.query("operacion"),
      actorId: c.req.query("actorId"),
      desde: c.req.query("desde"),
      hasta: c.req.query("hasta"),
    });
    const offset = (query.pagina - 1) * query.tamano;

    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    function agregar(sql: string, valor: unknown) {
      parametros.push(valor);
      condiciones.push(sql.replace("?", `$${parametros.length}`));
    }
    if (query.tabla) agregar("tabla = ?", query.tabla);
    if (query.operacion) agregar("operacion = ?", query.operacion);
    if (query.actorId) agregar("actor_id = ?", query.actorId);
    if (query.desde) agregar("creado_en >= ?", query.desde);
    if (query.hasta) agregar("creado_en <= ?", query.hasta);
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

    const { entradas, total } = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const [filas, conteo] = await Promise.all([
        cliente.query(
          `SELECT id, tabla, fila_id, operacion, actor_id, creado_en, valores_previos, valores_nuevos
           FROM auditoria_mutacion
           ${where}
           ORDER BY creado_en DESC
           LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
          [...parametros, query.tamano, offset],
        ),
        cliente.query<{ total: string }>(
          `SELECT count(*)::text AS total FROM auditoria_mutacion ${where}`,
          parametros,
        ),
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
