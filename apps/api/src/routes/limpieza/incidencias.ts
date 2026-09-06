import { Hono } from "hono";
import type pg from "pg";
import { confirmarBloqueoMantenimiento, registrarIncidencia } from "@atiende-rv/domain";
import { CuerpoConfirmarBloqueoMantenimiento, CuerpoCrearIncidencia, ErrorDominio } from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { comoEjecutor } from "../../db/ejecutorPg.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { exigirEscrituraCalendario } from "../../middleware/roles.js";
import { sesionDeAuth } from "../../middleware/tenant.js";

interface FilaIncidencia {
  id: string;
  unidad_id: string;
  severidad: "leve" | "moderada" | "grave";
  titulo: string;
  descripcion: string | null;
  estado: string;
}

function mapearIncidencia(fila: FilaIncidencia, requiereConfirmacionHumana: boolean) {
  return {
    id: fila.id,
    unidadId: fila.unidad_id,
    severidad: fila.severidad,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    estado: fila.estado,
    requiereConfirmacionHumana,
  };
}

function traducirErrorIncidencia(error: unknown): ErrorDominio {
  if (error instanceof ErrorDominio) return error;
  const mensaje = error instanceof Error ? error.message : "Error de incidencia";
  if (/no existe/.test(mensaje)) return new ErrorDominio("recurso_no_encontrado", mensaje);
  if (/severidad 'grave'|ya tiene un bloqueo|rango de bloqueo/.test(mensaje)) {
    return new ErrorDominio("validacion", mensaje);
  }
  return new ErrorDominio("error_interno", "No se pudo completar la operación");
}

/**
 * H-055 (REQ-118): cualquier rol operativo puede REPORTAR una incidencia
 * (RLS ya restringe a `limpieza` a solo sus propias incidencias, packages/db
 * migración 0036). Confirmar el bloqueo de mantenimiento propuesto por una
 * incidencia grave exige el mismo permiso que crear cualquier otro bloqueo
 * de calendario (`exigirEscrituraCalendario`, igual que
 * `apps/api/src/routes/bloqueos.ts` de Lote 3) — decisión de producto
 * explícita, nunca automática (RV11 §e, D-011): `crearBloqueo` (Lote 1)
 * jamás cancela ninguna reserva.
 */
export function crearRutasIncidencias(pool: pg.Pool, jwtSecret: string): Hono {
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
      cliente.query<FilaIncidencia>(
        `SELECT id, unidad_id, severidad, titulo, descripcion, estado
         FROM incidencia_mantenimiento ${where} ORDER BY creado_en DESC`,
        params,
      ),
    );
    return c.json({
      incidencias: filas.rows.map((f) => mapearIncidencia(f, f.severidad === "grave")),
    });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    const cuerpo = CuerpoCrearIncidencia.parse(await c.req.json());

    const resultado = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      registrarIncidencia(comoEjecutor(cliente), {
        unidadId: cuerpo.unidadId,
        tareaOrigenId: cuerpo.tareaOrigenId,
        severidad: cuerpo.severidad,
        titulo: cuerpo.titulo,
        descripcion: cuerpo.descripcion,
        reportadoPor: auth.usuarioId,
        propuestaBloqueoRango: cuerpo.propuestaBloqueoRango ?? null,
      }),
    );

    return c.json(
      {
        id: resultado.incidenciaId,
        unidadId: cuerpo.unidadId,
        severidad: cuerpo.severidad,
        titulo: cuerpo.titulo,
        descripcion: cuerpo.descripcion ?? null,
        requiereConfirmacionHumana: resultado.requiereConfirmacionHumana,
      },
      201,
    );
  });

  // POST /operacion/incidencias/:id/confirmar-bloqueo — H-055: confirmación
  // humana explícita, nunca disparada por ningún trigger/webhook.
  app.post("/:id/confirmar-bloqueo", async (c) => {
    const auth = c.get("auth");
    exigirEscrituraCalendario(auth);
    const id = c.req.param("id");
    const cuerpo = CuerpoConfirmarBloqueoMantenimiento.parse(await c.req.json().catch(() => ({})));

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      try {
        return await confirmarBloqueoMantenimiento(comoEjecutor(cliente), {
          incidenciaId: id,
          confirmadoPor: auth.usuarioId,
          rango: cuerpo.rango,
        });
      } catch (error) {
        throw traducirErrorIncidencia(error);
      }
    });

    return c.json({
      id,
      estado: "bloqueo_confirmado",
      bloqueoOcupacionId: resultado.ocupacionId,
      conflictosCapaCruzada: resultado.conflictosCapaCruzada,
    });
  });

  return app;
}
