import { Hono } from "hono";
import type pg from "pg";
import {
  CuerpoActualizarUnidadBackoffice,
  CuerpoCrearUnidadBackoffice,
  ErrorDominio,
} from "../../contrato/tipos.js";
import { conSesion, enTransaccion } from "../../db/contexto.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirRol } from "../../middleware/roles.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { relanzarSiRlsRechazo } from "./comun.js";

interface FilaUnidad {
  id: string;
  propiedad_id: string;
  owner_id: string | null;
  nombre: string;
  duracion_minima_noches: number;
}

function serializar(f: FilaUnidad) {
  return {
    id: f.id,
    propiedadId: f.propiedad_id,
    ownerId: f.owner_id,
    nombre: f.nombre,
    duracionMinimaNoches: f.duracion_minima_noches,
  };
}

/**
 * CRUD de administración de unidades (H-012, multi-unidad con `cantidad`):
 * el alta acepta `cantidad` (1-50) para crear N unidades idénticas de una
 * sola llamada — cada `INSERT` es una fila independiente con su propio
 * invariante de exclusión (packages/db `ocupacion_unidad`, ninguna fila
 * compartida entre unidades, RV17 §14). Si `cantidad > 1` y no se
 * personaliza, el `nombre` se sufija "1".."N".
 */
export function crearRutasBackofficeUnidades(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const propiedadId = c.req.query("propiedadId");
    if (!propiedadId) throw new ErrorDominio("validacion", "propiedadId es requerido");

    const filas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) => {
        const { rows } = await cliente.query<FilaUnidad>(
          `SELECT id, propiedad_id, owner_id, nombre, duracion_minima_noches
           FROM unidad WHERE propiedad_id = $1 ORDER BY creado_en ASC`,
          [propiedadId],
        );
        return rows;
      }),
    );

    return c.json({ unidades: filas.map(serializar) });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const cuerpo = CuerpoCrearUnidadBackoffice.parse(await c.req.json());

    const filas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          const creadas: FilaUnidad[] = [];
          for (let i = 1; i <= cuerpo.cantidad; i++) {
            const nombre = cuerpo.cantidad > 1 ? `${cuerpo.nombre} ${i}` : cuerpo.nombre;
            const { rows } = await cliente.query<FilaUnidad>(
              `INSERT INTO unidad (propiedad_id, owner_id, nombre, duracion_minima_noches)
               VALUES ($1, $2, $3, COALESCE($4, 1))
               RETURNING id, propiedad_id, owner_id, nombre, duracion_minima_noches`,
              [cuerpo.propiedadId, cuerpo.ownerId ?? null, nombre, cuerpo.duracionMinimaNoches ?? null],
            );
            if (rows.length === 0) {
              throw new ErrorDominio("recurso_no_encontrado", "Propiedad no encontrada o sin permiso");
            }
            creadas.push(rows[0]!);
          }
          return creadas;
        }),
      ),
    );

    return c.json({ unidades: filas.map(serializar) }, 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const id = c.req.param("id");
    const cuerpo = CuerpoActualizarUnidadBackoffice.parse(await c.req.json());

    const fila = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          const { rows } = await cliente.query<FilaUnidad>(
            `UPDATE unidad SET
               nombre = COALESCE($2, nombre),
               owner_id = CASE WHEN $3::boolean THEN $4::uuid ELSE owner_id END,
               duracion_minima_noches = COALESCE($5, duracion_minima_noches)
             WHERE id = $1
             RETURNING id, propiedad_id, owner_id, nombre, duracion_minima_noches`,
            [
              id,
              cuerpo.nombre ?? null,
              cuerpo.ownerId !== undefined,
              cuerpo.ownerId ?? null,
              cuerpo.duracionMinimaNoches ?? null,
            ],
          );
          return rows[0] ?? null;
        }),
      ),
    );
    if (!fila) throw new ErrorDominio("recurso_no_encontrado", "Unidad no encontrada o sin permiso");

    return c.json(serializar(fila));
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, "superadmin", "admin_gestora");
    const id = c.req.param("id");

    const eliminadas = await relanzarSiRlsRechazo(() =>
      conSesion(pool, sesionDeAuth(auth), async (cliente) =>
        enTransaccion(cliente, async () => {
          const { rowCount } = await cliente.query("DELETE FROM unidad WHERE id = $1", [id]);
          return rowCount ?? 0;
        }),
      ),
    );
    if (eliminadas === 0) throw new ErrorDominio("recurso_no_encontrado", "Unidad no encontrada o sin permiso");

    return c.body(null, 204);
  });

  return app;
}
