import { Hono } from "hono";
import type pg from "pg";
import { crearRutasBorradores } from "./borradores.js";
import { crearRutasConversaciones } from "./conversaciones.js";
import { crearRutasPlantillas } from "./plantillas.js";
import { crearRutasPoliticas } from "./politicas.js";

/**
 * Lote 6 (BACKLOG E09, H-056 a H-061): agrupa las rutas de mensajería con
 * aprobación humana bajo un único combinador, montado en
 * `apps/api/src/routes/index.ts` (punto de fusión compartido, una sola
 * línea añadida — docs/fase2/LOTES.md, nota de cabecera) como
 * `/mensajeria/conversaciones`, `/mensajeria/borradores`,
 * `/mensajeria/plantillas`, `/mensajeria/politicas`.
 *
 * Nota deliberada: NO existe `/mensajeria/enviar` ni ninguna ruta que
 * inserte un mensaje saliente sin pasar por
 * `POST /mensajeria/borradores/:id/aprobar` (D-006, RV18-R-03) — buscar un
 * endpoint de envío directo en este árbol de rutas debe fallar por diseño.
 */
export function crearRutasMensajeria(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.route("/conversaciones", crearRutasConversaciones(pool, jwtSecret));
  // `crearRutasBorradores` declara sus propias rutas completas
  // (`/conversaciones/:id/borradores`, `/borradores/:id/aprobar`, etc.) —
  // se monta en la raíz (no bajo "/borradores") para no duplicar el
  // prefijo "/conversaciones".
  app.route("/", crearRutasBorradores(pool, jwtSecret));
  app.route("/plantillas", crearRutasPlantillas(pool, jwtSecret));
  app.route("/politicas", crearRutasPoliticas(pool, jwtSecret));
  return app;
}
