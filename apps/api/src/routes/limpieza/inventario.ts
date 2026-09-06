import { Hono } from "hono";
import type pg from "pg";
import { CuerpoCrearItemInventario } from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { exigirPuedeGestionarOperacion } from "./permisos.js";
import { mapearItemInventario, type FilaItemInventario } from "./mapeo.js";

/** H-052 (REQ-115): inventario mínimo de ropa blanca/consumibles por
 * unidad. RLS (packages/db migración 0036) ya limita a `limpieza` a las
 * unidades donde tiene una tarea activa asignada. */
export function crearRutasInventario(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const unidadId = c.req.query("unidadId");
    const params: unknown[] = [];
    let where = "";
    if (unidadId) {
      params.push(unidadId);
      where = "WHERE unidad_id = $1";
    }
    const filas = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaItemInventario>(
        `SELECT id, unidad_id, nombre, categoria, cantidad_actual, umbral_minimo, unidad_medida
         FROM item_inventario ${where} ORDER BY nombre`,
        params,
      ),
    );
    return c.json({ items: filas.rows.map(mapearItemInventario) });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarOperacion(auth);
    const cuerpo = CuerpoCrearItemInventario.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaItemInventario>(
        `INSERT INTO item_inventario (unidad_id, nombre, categoria, cantidad_actual, umbral_minimo, unidad_medida)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, unidad_id, nombre, categoria, cantidad_actual, umbral_minimo, unidad_medida`,
        [cuerpo.unidadId, cuerpo.nombre, cuerpo.categoria, cuerpo.cantidadActual, cuerpo.umbralMinimo, cuerpo.unidadMedida],
      ),
    );
    return c.json(mapearItemInventario(fila.rows[0]!), 201);
  });

  return app;
}
