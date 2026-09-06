import { Hono } from "hono";
import type pg from "pg";
import { nochesDelRango, ocupacionesActivasEnNoche, razonDominante } from "@atiende-rv/domain";
import type { Ocupacion } from "@atiende-rv/domain";
import { CuerpoCrearUnidad, ErrorDominio, QueryRangoCalendario } from "../contrato/tipos.js";
import { conSesion, enTransaccion } from "../db/contexto.js";
import { requiereAutenticacion } from "../middleware/autenticacion.js";
import { exigirRol } from "../middleware/roles.js";
import { ROLES_ADMIN } from "../rolesComunes.js";
import { sesionDeAuth } from "../middleware/tenant.js";

interface FilaOcupacion {
  id: string;
  unidad_id: string;
  inicio: string;
  fin: string;
  capa: Ocupacion["capa"];
  razon: Ocupacion["razon"];
  estado: Ocupacion["estado"];
  bloqueante: boolean;
  canal_origen_id: string | null;
  canal_codigo: string | null;
}

export function crearRutasUnidades(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query(
        "SELECT id, propiedad_id, owner_id, nombre, duracion_minima_noches FROM unidad ORDER BY creado_en DESC",
      );
      return rows;
    });
    return c.json({
      unidades: filas.map((f) => ({
        id: f.id,
        propiedadId: f.propiedad_id,
        ownerId: f.owner_id,
        nombre: f.nombre,
        duracionMinimaNoches: f.duracion_minima_noches,
      })),
    });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirRol(auth, ...ROLES_ADMIN);
    const cuerpo = CuerpoCrearUnidad.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) =>
      enTransaccion(cliente, async () => {
        const { rows } = await cliente.query(
          `INSERT INTO unidad (propiedad_id, owner_id, nombre, duracion_minima_noches)
           VALUES ($1, $2, $3, COALESCE($4, 1))
           RETURNING id, propiedad_id, owner_id, nombre, duracion_minima_noches`,
          [cuerpo.propiedadId, cuerpo.ownerId ?? null, cuerpo.nombre, cuerpo.duracionMinimaNoches ?? null],
        );
        if (rows.length === 0) {
          throw new ErrorDominio("recurso_no_encontrado", "Propiedad no encontrada o sin permiso");
        }
        return rows[0];
      }),
    );

    return c.json(
      {
        id: fila.id,
        propiedadId: fila.propiedad_id,
        ownerId: fila.owner_id,
        nombre: fila.nombre,
        duracionMinimaNoches: fila.duracion_minima_noches,
      },
      201,
    );
  });

  // GET /unidades/:id/calendario?desde&hasta — rango de fechas → noches
  // con capa/estado/origen resueltos (RV09-R-01, §UX-1). Usa la misma
  // lógica de precedencia que packages/domain/src/capas.ts, nunca una
  // reimplementación paralela en SQL.
  app.get("/:id/calendario", async (c) => {
    const auth = c.get("auth");
    const unidadId = c.req.param("id");
    const query = QueryRangoCalendario.parse({
      desde: c.req.query("desde"),
      hasta: c.req.query("hasta"),
    });
    if (query.desde >= query.hasta) {
      throw new ErrorDominio("rango_invalido", "El parámetro 'desde' debe ser anterior a 'hasta'");
    }

    const filas = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const { rows } = await cliente.query<FilaOcupacion>(
        `SELECT o.id, o.unidad_id, lower(o.rango)::text AS inicio, upper(o.rango)::text AS fin,
                o.capa, o.razon, o.estado, o.bloqueante, o.canal_origen_id, c.codigo AS canal_codigo
         FROM ocupacion_unidad o
         LEFT JOIN canal c ON c.id = o.canal_origen_id
         WHERE o.unidad_id = $1 AND o.rango && daterange($2, $3, '[)')`,
        [unidadId, query.desde, query.hasta],
      );
      return rows;
    });

    const ocupaciones: Ocupacion[] = filas.map((f) => ({
      id: f.id,
      unidadId: f.unidad_id,
      rango: { inicio: f.inicio, fin: f.fin },
      capa: f.capa,
      razon: f.razon,
      estado: f.estado,
      bloqueante: f.bloqueante,
      canalOrigenId: f.canal_origen_id,
    }));
    const codigoPorOcupacionId = new Map(filas.map((f) => [f.id, f.canal_codigo]));

    const noches = nochesDelRango({ inicio: query.desde, fin: query.hasta }).map((fecha) => {
      const dominante = razonDominante(ocupaciones, fecha);
      const activas = ocupacionesActivasEnNoche(ocupaciones, fecha);
      const esDirecta = activas.length > 0 && activas.every((o) => !o.canalOrigenId || codigoPorOcupacionId.get(o.id) === "manual");
      return {
        fecha,
        ocupada: dominante !== null,
        ocupacionId: dominante?.id ?? null,
        ocupacionInicio: dominante?.rango.inicio ?? null,
        ocupacionFin: dominante?.rango.fin ?? null,
        capa: dominante?.capa ?? null,
        razon: dominante?.razon ?? null,
        estado: dominante?.estado ?? null,
        origenCanal: dominante ? (codigoPorOcupacionId.get(dominante.id) ?? null) : null,
        esDirecta: dominante ? esDirecta : false,
      };
    });

    return c.json({ unidadId, desde: query.desde, hasta: query.hasta, noches });
  });

  return app;
}
