import { Hono } from "hono";
import type pg from "pg";
import { crearRutasIncidencias } from "./incidencias.js";
import { crearRutasInventario } from "./inventario.js";
import { crearRutasTareasOperativas } from "./tareas.js";

/**
 * Lote 5 (BACKLOG E08, H-049 a H-055): agrupa las rutas de operación de
 * limpieza/mantenimiento bajo un único combinador, montado en
 * `apps/api/src/routes/index.ts` (punto de fusión compartido, una sola
 * línea añadida — docs/fase2/LOTES.md, nota de cabecera) como
 * `/operacion/tareas`, `/operacion/incidencias`, `/operacion/inventario`.
 */
export function crearRutasLimpieza(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.route("/tareas", crearRutasTareasOperativas(pool, jwtSecret));
  app.route("/incidencias", crearRutasIncidencias(pool, jwtSecret));
  app.route("/inventario", crearRutasInventario(pool, jwtSecret));
  return app;
}
