import { Hono } from "hono";
import type pg from "pg";
import {
  asignarTarea,
  completarChecklistItem,
  completarTarea,
  procesarEventosCheckoutPendientes,
} from "@atiende-rv/domain";
import {
  CuerpoAsignarTarea,
  CuerpoCompletarChecklistItem,
  CuerpoCompletarTarea,
  CuerpoCrearTareaOperativa,
  ErrorDominio,
  QueryCalendarioTareas,
} from "../../contrato/tipos.js";
import { conSesion } from "../../db/contexto.js";
import { comoEjecutor } from "../../db/ejecutorPg.js";
import { requiereAutenticacion } from "../../middleware/autenticacion.js";
import { sesionDeAuth } from "../../middleware/tenant.js";
import { exigirPuedeGestionarOperacion, exigirPuedeOperarTarea } from "./permisos.js";
import {
  mapearChecklistItem,
  mapearTarea,
  TAREA_SELECT,
  TAREA_SELECT_CON_UNIDAD,
  type FilaChecklistItem,
  type FilaTareaOperativa,
} from "./mapeo.js";

function traducirErrorOperacion(error: unknown): ErrorDominio {
  if (error instanceof ErrorDominio) return error;
  const mensaje = error instanceof Error ? error.message : "Error de operación";
  if (/no existe/.test(mensaje)) return new ErrorDominio("recurso_no_encontrado", mensaje);
  if (/checklist_incompleto/.test(mensaje)) {
    return new ErrorDominio("conflicto_pendiente", "El checklist tiene ítems pendientes: no se puede completar la tarea");
  }
  return new ErrorDominio("error_interno", "No se pudo completar la operación");
}

export function crearRutasTareasOperativas(pool: pg.Pool, jwtSecret: string): Hono {
  const app = new Hono();
  app.use("*", requiereAutenticacion(jwtSecret));

  // GET /operacion/tareas — lista filtrable por unidad/estado/fecha. RLS
  // (packages/db migración 0036) ya restringe qué filas puede ver cada rol
  // (limpieza SOLO sus tareas asignadas, propietario solo lectura de sus
  // unidades) — este endpoint no reimplementa ese filtro, solo pagina.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const unidadId = c.req.query("unidadId");
    const estado = c.req.query("estado");
    const programadaPara = c.req.query("programadaPara");

    const condiciones: string[] = [];
    const params: unknown[] = [];
    if (unidadId) {
      params.push(unidadId);
      condiciones.push(`unidad_id = $${params.length}`);
    }
    if (estado) {
      params.push(estado);
      condiciones.push(`estado = $${params.length}`);
    }
    if (programadaPara) {
      params.push(programadaPara);
      condiciones.push(`programada_para = $${params.length}`);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

    const filas = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaTareaOperativa>(
        `SELECT ${TAREA_SELECT_CON_UNIDAD} FROM tarea_operativa ${where} ORDER BY programada_para, creado_en`,
        params,
      ),
    );
    return c.json({ tareas: filas.rows.map(mapearTarea) });
  });

  // GET /operacion/tareas/calendario — turnos por día (H-049/entregable de
  // Lote 5: "calendario de turnos por día").
  app.get("/calendario", async (c) => {
    const auth = c.get("auth");
    const query = QueryCalendarioTareas.parse({
      desde: c.req.query("desde"),
      hasta: c.req.query("hasta"),
      unidadId: c.req.query("unidadId"),
    });

    const params: unknown[] = [query.desde, query.hasta];
    let filtroUnidad = "";
    if (query.unidadId) {
      params.push(query.unidadId);
      filtroUnidad = `AND unidad_id = $${params.length}`;
    }

    const filas = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      cliente.query<FilaTareaOperativa>(
        `SELECT ${TAREA_SELECT_CON_UNIDAD} FROM tarea_operativa
         WHERE programada_para >= $1 AND programada_para <= $2 ${filtroUnidad}
         ORDER BY programada_para, creado_en`,
        params,
      ),
    );

    const porDia = new Map<string, FilaTareaOperativa[]>();
    for (const fila of filas.rows) {
      const lista = porDia.get(fila.programada_para) ?? [];
      lista.push(fila);
      porDia.set(fila.programada_para, lista);
    }
    const turnos = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, tareas]) => ({ fecha, tareas: tareas.map(mapearTarea) }));

    return c.json({ turnos });
  });

  // POST /operacion/tareas — creación MANUAL (mantenimiento/inspección);
  // 'limpieza' siempre se genera automáticamente al checkout (H-049) y
  // nunca a mano vía este endpoint.
  app.post("/", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarOperacion(auth);
    const cuerpo = CuerpoCrearTareaOperativa.parse(await c.req.json());

    const fila = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const insertado = await cliente.query<FilaTareaOperativa>(
        `INSERT INTO tarea_operativa (unidad_id, tipo, prioridad, programada_para, notas)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${TAREA_SELECT}`,
        [cuerpo.unidadId, cuerpo.tipo, cuerpo.prioridad ?? "media", cuerpo.programadaPara, cuerpo.notas ?? null],
      );
      // RETURNING solo puede referenciar columnas de la propia tabla
      // insertada — una segunda lectura con la función definer resuelve
      // `unidadNombre` para la respuesta (mismo criterio de acceso que
      // cualquier otro GET de esta ruta).
      const conNombre = await cliente.query<FilaTareaOperativa>(
        `SELECT ${TAREA_SELECT_CON_UNIDAD} FROM tarea_operativa WHERE id = $1`,
        [insertado.rows[0]!.id],
      );
      return conNombre.rows[0]!;
    });
    return c.json(mapearTarea(fila), 201);
  });

  // GET /operacion/tareas/:id — detalle con checklist.
  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const tarea = await cliente.query<FilaTareaOperativa>(
        `SELECT ${TAREA_SELECT_CON_UNIDAD} FROM tarea_operativa WHERE id = $1`,
        [id],
      );
      if (tarea.rows.length === 0) return null;
      const checklist = await cliente.query<FilaChecklistItem>(
        `SELECT id, tarea_id, descripcion, orden, completado, completado_en, completado_por
         FROM checklist_item_tarea WHERE tarea_id = $1 ORDER BY orden`,
        [id],
      );
      return { tarea: tarea.rows[0]!, checklist: checklist.rows };
    });
    if (!resultado) throw new ErrorDominio("recurso_no_encontrado", "Tarea operativa no encontrada");

    return c.json({
      ...mapearTarea(resultado.tarea),
      checklist: resultado.checklist.map(mapearChecklistItem),
    });
  });

  // PATCH /operacion/tareas/:id/asignar — H-053 (interno o proveedor externo).
  app.patch("/:id/asignar", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarOperacion(auth);
    const id = c.req.param("id");
    const cuerpo = CuerpoAsignarTarea.parse(await c.req.json());

    await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      try {
        await asignarTarea(comoEjecutor(cliente), {
          tareaId: id,
          asignadoA: cuerpo.asignadoA,
          esProveedorExterno: cuerpo.esProveedorExterno,
        });
      } catch (error) {
        throw traducirErrorOperacion(error);
      }
    });
    return c.json({ id, asignadoA: cuerpo.asignadoA, esProveedorExterno: cuerpo.esProveedorExterno });
  });

  // POST /operacion/tareas/:id/checklist/:itemId/completar — H-051: ítem
  // con timestamp (siempre `now()` en BD) + fotos (metadatos, dev-local).
  app.post("/:id/checklist/:itemId/completar", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const itemId = c.req.param("itemId");
    const cuerpo = CuerpoCompletarChecklistItem.parse(await c.req.json().catch(() => ({})));

    await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const tarea = await cliente.query<{ asignado_a: string | null }>(
        `SELECT asignado_a FROM tarea_operativa WHERE id = $1`,
        [id],
      );
      if (tarea.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Tarea operativa no encontrada");
      exigirPuedeOperarTarea(auth, tarea.rows[0]!.asignado_a);

      try {
        await completarChecklistItem(comoEjecutor(cliente), {
          checklistItemId: itemId,
          completadoPor: auth.usuarioId,
          fotos: (cuerpo.fotos ?? []).map((f) => ({ rutaAlmacenamiento: f.rutaAlmacenamiento, subidaPor: auth.usuarioId })),
        });
      } catch (error) {
        throw traducirErrorOperacion(error);
      }
    });
    return c.body(null, 204);
  });

  // POST /operacion/tareas/:id/completar — H-051/H-052: exige checklist
  // completo (si no, 409 `conflicto_pendiente` y la tarea queda 'bloqueada')
  // y descuenta el inventario configurado.
  app.post("/:id/completar", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const cuerpo = CuerpoCompletarTarea.parse(await c.req.json().catch(() => ({})));

    const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
      const tarea = await cliente.query<{ asignado_a: string | null }>(
        `SELECT asignado_a FROM tarea_operativa WHERE id = $1`,
        [id],
      );
      if (tarea.rows.length === 0) throw new ErrorDominio("recurso_no_encontrado", "Tarea operativa no encontrada");
      exigirPuedeOperarTarea(auth, tarea.rows[0]!.asignado_a);

      try {
        return await completarTarea(comoEjecutor(cliente), { tareaId: id, consumos: cuerpo.consumos });
      } catch (error) {
        throw traducirErrorOperacion(error);
      }
    });
    return c.json({ id, estado: "completada", alertasStockBajo: resultado.alertasStockBajo });
  });

  // POST /operacion/tareas/procesar-eventos — dispara manualmente el
  // consumidor de outbox_evento (H-049), mismo patrón que
  // "POST /canales/:id/sync" de Lote 3 (dispara reconciliación manual).
  app.post("/procesar-eventos", async (c) => {
    const auth = c.get("auth");
    exigirPuedeGestionarOperacion(auth);

    const resultado = await conSesion(pool, sesionDeAuth(auth), (cliente) =>
      procesarEventosCheckoutPendientes(comoEjecutor(cliente)),
    );
    return c.json(resultado);
  });

  return app;
}
