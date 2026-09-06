import type { EjecutorTransaccional } from "../../aplicacion/ejecutor.js";
import { bloquearUnidadEnTransaccion } from "../../aplicacion/ejecutor.js";
import { cancelarOcupacion, crearBloqueo } from "../../aplicacion/reservas.js";
import { calcularRangoBuffer } from "../buffer.js";
import { checklistCompleto, plantillaChecklistPorTipo } from "../checklist.js";
import { requiereConfirmacionHumanaParaBloqueo } from "../incidencias.js";
import { aplicarConsumo } from "../inventario.js";
import { calcularVencimientoSla } from "../sla.js";
import type {
  ConsumoInventario,
  PrioridadTareaOperativa,
  SeveridadIncidencia,
  TipoTareaOperativa,
} from "../tipos.js";
import { CONFIGURACION_OPERATIVA_DEFECTO } from "../tipos.js";

/**
 * Capa de aplicación transaccional de Lote 5 (H-049 a H-055), mismo patrón
 * que `packages/domain/src/aplicacion/reservas.ts`: cada función abre/cierra
 * su propia transacción sobre un `EjecutorTransaccional` ya conectado. Nunca
 * importa nada de `@atiende-rv/db` (structural typing, igual que Lote 1).
 */

async function obtenerConfiguracion(
  ejecutor: EjecutorTransaccional,
  unidadId: string,
): Promise<{ propiedadId: string; bufferLimpiezaNoches: number; slaLimpiezaHoras: number; slaMantenimientoHoras: number }> {
  const unidad = await ejecutor.query<{ propiedad_id: string }>(
    `SELECT propiedad_id FROM unidad WHERE id = $1`,
    [unidadId],
  );
  if (unidad.rows.length === 0) throw new Error(`unidad ${unidadId} no existe`);
  const propiedadId = unidad.rows[0]!.propiedad_id;

  const config = await ejecutor.query<{
    buffer_limpieza_noches: number;
    sla_limpieza_horas: number;
    sla_mantenimiento_horas: number;
  }>(
    `SELECT buffer_limpieza_noches, sla_limpieza_horas, sla_mantenimiento_horas
     FROM configuracion_operativa_propiedad WHERE propiedad_id = $1`,
    [propiedadId],
  );
  if (config.rows.length === 0) {
    return {
      propiedadId,
      bufferLimpiezaNoches: CONFIGURACION_OPERATIVA_DEFECTO.bufferLimpiezaNoches,
      slaLimpiezaHoras: CONFIGURACION_OPERATIVA_DEFECTO.slaLimpiezaHoras,
      slaMantenimientoHoras: CONFIGURACION_OPERATIVA_DEFECTO.slaMantenimientoHoras,
    };
  }
  const fila = config.rows[0]!;
  return {
    propiedadId,
    bufferLimpiezaNoches: fila.buffer_limpieza_noches,
    slaLimpiezaHoras: fila.sla_limpieza_horas,
    slaMantenimientoHoras: fila.sla_mantenimiento_horas,
  };
}

async function insertarChecklistPlantilla(
  ejecutor: EjecutorTransaccional,
  tareaId: string,
  tipo: TipoTareaOperativa,
): Promise<void> {
  const plantilla = plantillaChecklistPorTipo(tipo);
  for (let i = 0; i < plantilla.length; i += 1) {
    await ejecutor.query(
      `INSERT INTO checklist_item_tarea (tarea_id, descripcion, orden) VALUES ($1, $2, $3)`,
      [tareaId, plantilla[i], i],
    );
  }
}

// ---------------------------------------------------------------------------
// H-049/H-050: generación automática de tarea de limpieza + buffer al
// confirmarse el checkout (consumiendo outbox_evento de Lote 1)
// ---------------------------------------------------------------------------

export interface ResultadoCrearTareaCheckout {
  tareaId: string;
  bufferOcupacionId: string | null;
}

/** Crea la tarea de limpieza vinculada a una reserva recién confirmada
 * (H-049) y, si la propiedad tiene buffer configurado (>0 noches), el
 * bloqueo `BUFFER_LIMPIEZA` real de calendario (H-050) — vía `crearBloqueo`,
 * la MISMA función transaccional de Lote 1, nunca reimplementada aquí. */
export async function crearTareaLimpiezaPorCheckout(
  ejecutor: EjecutorTransaccional,
  entrada: { unidadId: string; ocupacionUnidadId: string; fechaCheckout: string },
): Promise<ResultadoCrearTareaCheckout> {
  const config = await obtenerConfiguracion(ejecutor, entrada.unidadId);

  await ejecutor.exec("BEGIN");
  try {
    await bloquearUnidadEnTransaccion(ejecutor, entrada.unidadId);

    const prioridad: PrioridadTareaOperativa = "media";
    const creadaEn = new Date().toISOString();
    const slaVenceEn = calcularVencimientoSla(creadaEn, "limpieza", prioridad, config);

    const insertado = await ejecutor.query<{ id: string }>(
      `INSERT INTO tarea_operativa
         (unidad_id, ocupacion_unidad_id, tipo, estado, prioridad, programada_para, sla_vence_en)
       VALUES ($1, $2, 'limpieza', 'pendiente', $3, $4, $5)
       RETURNING id`,
      [entrada.unidadId, entrada.ocupacionUnidadId, prioridad, entrada.fechaCheckout, slaVenceEn],
    );
    const tareaId = insertado.rows[0]!.id;
    await insertarChecklistPlantilla(ejecutor, tareaId, "limpieza");

    const rangoBuffer = calcularRangoBuffer(entrada.fechaCheckout, config.bufferLimpiezaNoches);
    let bufferOcupacionId: string | null = null;

    await ejecutor.exec("COMMIT");

    if (rangoBuffer) {
      // crearBloqueo gestiona su PROPIA transacción (BEGIN/COMMIT interno,
      // Lote 1) — se invoca DESPUÉS del COMMIT de arriba, nunca anidada
      // dentro de la transacción de la tarea, porque `EjecutorTransaccional`
      // no soporta transacciones anidadas reales (solo el `SAVEPOINT`
      // explícito que usa `aplicacion/reservas.ts` internamente).
      const bufferResultado = await crearBloqueo(ejecutor, {
        unidadId: entrada.unidadId,
        rango: rangoBuffer,
        razon: "BUFFER_LIMPIEZA",
      });
      bufferOcupacionId = bufferResultado.ocupacionId;
      await ejecutor.query(`UPDATE tarea_operativa SET buffer_ocupacion_id = $1 WHERE id = $2`, [
        bufferOcupacionId,
        tareaId,
      ]);
    }

    return { tareaId, bufferOcupacionId };
  } catch (error) {
    await ejecutor.exec("ROLLBACK");
    throw error;
  }
}

/** H-049: reprograma la tarea vinculada cuando la reserva de origen cambia
 * de fecha — preserva SIEMPRE `asignado_a` (nunca se toca esa columna). Si
 * había un buffer, se cancela el bloqueo anterior y se crea uno nuevo en la
 * nueva fecha (mismo criterio: nunca reescribe el rango de un bloqueo ya
 * insertado, siempre cancela + crea, igual que el resto del calendario). */
export async function reprogramarTareaPorCambioReserva(
  ejecutor: EjecutorTransaccional,
  entrada: { ocupacionUnidadId: string; nuevaFechaCheckout: string },
): Promise<{ tareaId: string } | null> {
  const tarea = await ejecutor.query<{ id: string; unidad_id: string; buffer_ocupacion_id: string | null; estado: string }>(
    `SELECT id, unidad_id, buffer_ocupacion_id, estado FROM tarea_operativa
     WHERE ocupacion_unidad_id = $1 AND estado NOT IN ('completada', 'cancelada')
     ORDER BY creado_en DESC LIMIT 1`,
    [entrada.ocupacionUnidadId],
  );
  if (tarea.rows.length === 0) return null;
  const fila = tarea.rows[0]!;

  await ejecutor.query(`UPDATE tarea_operativa SET programada_para = $1, actualizado_en = now() WHERE id = $2`, [
    entrada.nuevaFechaCheckout,
    fila.id,
  ]);

  if (fila.buffer_ocupacion_id) {
    await cancelarOcupacion(ejecutor, fila.buffer_ocupacion_id);
    const config = await obtenerConfiguracion(ejecutor, fila.unidad_id);
    const rangoBuffer = calcularRangoBuffer(entrada.nuevaFechaCheckout, config.bufferLimpiezaNoches);
    if (rangoBuffer) {
      const bufferResultado = await crearBloqueo(ejecutor, {
        unidadId: fila.unidad_id,
        rango: rangoBuffer,
        razon: "BUFFER_LIMPIEZA",
      });
      await ejecutor.query(`UPDATE tarea_operativa SET buffer_ocupacion_id = $1 WHERE id = $2`, [
        bufferResultado.ocupacionId,
        fila.id,
      ]);
    } else {
      await ejecutor.query(`UPDATE tarea_operativa SET buffer_ocupacion_id = NULL WHERE id = $1`, [fila.id]);
    }
  }

  return { tareaId: fila.id };
}

/** Cancela la tarea (y su buffer, si tenía) cuando la reserva de origen se
 * cancela — nunca al revés: cancelar una tarea NUNCA cancela la reserva. */
export async function cancelarTareaPorCancelacionReserva(
  ejecutor: EjecutorTransaccional,
  ocupacionUnidadId: string,
): Promise<{ tareaId: string } | null> {
  const tarea = await ejecutor.query<{ id: string; buffer_ocupacion_id: string | null }>(
    `SELECT id, buffer_ocupacion_id FROM tarea_operativa
     WHERE ocupacion_unidad_id = $1 AND estado NOT IN ('completada', 'cancelada')
     ORDER BY creado_en DESC LIMIT 1`,
    [ocupacionUnidadId],
  );
  if (tarea.rows.length === 0) return null;
  const fila = tarea.rows[0]!;

  await ejecutor.query(`UPDATE tarea_operativa SET estado = 'cancelada', actualizado_en = now() WHERE id = $1`, [
    fila.id,
  ]);
  if (fila.buffer_ocupacion_id) {
    await cancelarOcupacion(ejecutor, fila.buffer_ocupacion_id);
  }
  return { tareaId: fila.id };
}

// ---------------------------------------------------------------------------
// Consumidor de outbox_evento (H-049): rango 0035, tabla de seguimiento
// propia — ver comentario de cabecera de esa migración.
// ---------------------------------------------------------------------------

interface FilaOutboxCheckout {
  [columna: string]: unknown;
  id: string;
  ocupacion_unidad_id: string;
  tipo_evento: string;
  payload: unknown;
}

export interface ResultadoProcesarEventos {
  procesados: number;
  tareasCreadas: string[];
  tareasReprogramadas: string[];
  tareasCanceladas: string[];
}

/** Procesa hasta `limite` eventos de outbox pendientes (no consumidos aún
 * por ESTE consumidor) relacionados con reservas (capa='reserva'). Se
 * invoca de forma manual/explícita (mismo patrón que "POST /canales/:id/sync
 * dispara reconciliación manual" de Lote 3) — un disparo automático por
 * temporizador es responsabilidad de un worker de infraestructura (Lote 10),
 * fuera del alcance de este paquete de dominio puro + capa de aplicación. */
export async function procesarEventosCheckoutPendientes(
  ejecutor: EjecutorTransaccional,
  limite = 50,
): Promise<ResultadoProcesarEventos> {
  const pendientes = await ejecutor.query<FilaOutboxCheckout>(
    `SELECT oe.id, oe.ocupacion_unidad_id, oe.tipo_evento, oe.payload
     FROM outbox_evento oe
     JOIN ocupacion_unidad ou ON ou.id = oe.ocupacion_unidad_id
     WHERE ou.capa = 'reserva'
       AND oe.tipo_evento IN ('cerrar_disponibilidad', 'modificar_disponibilidad', 'liberar_disponibilidad')
       AND NOT EXISTS (
         SELECT 1 FROM outbox_evento_consumido_limpieza c WHERE c.outbox_evento_id = oe.id
       )
     ORDER BY oe.creado_en
     LIMIT $1`,
    [limite],
  );

  const resultado: ResultadoProcesarEventos = {
    procesados: 0,
    tareasCreadas: [],
    tareasReprogramadas: [],
    tareasCanceladas: [],
  };

  for (const fila of pendientes.rows) {
    if (fila.tipo_evento === "cerrar_disponibilidad") {
      const ocupacion = await ejecutor.query<{ unidad_id: string; fin: string }>(
        `SELECT unidad_id, upper(rango)::text AS fin FROM ocupacion_unidad WHERE id = $1`,
        [fila.ocupacion_unidad_id],
      );
      if (ocupacion.rows.length > 0) {
        const { unidad_id: unidadId, fin } = ocupacion.rows[0]!;
        const creada = await crearTareaLimpiezaPorCheckout(ejecutor, {
          unidadId,
          ocupacionUnidadId: fila.ocupacion_unidad_id,
          fechaCheckout: fin,
        });
        resultado.tareasCreadas.push(creada.tareaId);
      }
    } else if (fila.tipo_evento === "modificar_disponibilidad") {
      const payload = fila.payload as { rangoNuevo?: { fin?: string } } | null;
      const nuevaFecha = payload?.rangoNuevo?.fin;
      if (nuevaFecha) {
        const reprogramada = await reprogramarTareaPorCambioReserva(ejecutor, {
          ocupacionUnidadId: fila.ocupacion_unidad_id,
          nuevaFechaCheckout: nuevaFecha,
        });
        if (reprogramada) resultado.tareasReprogramadas.push(reprogramada.tareaId);
      }
    } else if (fila.tipo_evento === "liberar_disponibilidad") {
      const cancelada = await cancelarTareaPorCancelacionReserva(ejecutor, fila.ocupacion_unidad_id);
      if (cancelada) resultado.tareasCanceladas.push(cancelada.tareaId);
    }

    await ejecutor.query(
      `INSERT INTO outbox_evento_consumido_limpieza (outbox_evento_id) VALUES ($1)
       ON CONFLICT (outbox_evento_id) DO NOTHING`,
      [fila.id],
    );
    resultado.procesados += 1;
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// H-053: asignación (personal interno o proveedor externo)
// ---------------------------------------------------------------------------

export async function asignarTarea(
  ejecutor: EjecutorTransaccional,
  entrada: { tareaId: string; asignadoA: string; esProveedorExterno: boolean },
): Promise<void> {
  const actualizado = await ejecutor.query<{ id: string }>(
    `UPDATE tarea_operativa
     SET asignado_a = $2, es_proveedor_externo = $3,
         estado = CASE WHEN estado = 'pendiente' THEN 'asignada' ELSE estado END,
         actualizado_en = now()
     WHERE id = $1
     RETURNING id`,
    [entrada.tareaId, entrada.asignadoA, entrada.esProveedorExterno],
  );
  if (actualizado.rows.length === 0) throw new Error(`tarea_operativa ${entrada.tareaId} no existe`);

  await ejecutor.query(
    `INSERT INTO notificacion_tarea (tarea_id, evento, canales)
     SELECT $1, 'asignada', COALESCE(cop.notificaciones_canales, '{}'::text[])
     FROM tarea_operativa t
     LEFT JOIN unidad u ON u.id = t.unidad_id
     LEFT JOIN configuracion_operativa_propiedad cop ON cop.propiedad_id = u.propiedad_id
     WHERE t.id = $1`,
    [entrada.tareaId],
  );
}

// ---------------------------------------------------------------------------
// H-051/H-052: checklist con fotos/timestamp + completar tarea (bloquea si
// el checklist está incompleto; descuenta inventario configurado)
// ---------------------------------------------------------------------------

export async function completarChecklistItem(
  ejecutor: EjecutorTransaccional,
  entrada: {
    checklistItemId: string;
    completadoPor: string;
    fotos?: { rutaAlmacenamiento: string; subidaPor: string }[];
  },
): Promise<void> {
  const actualizado = await ejecutor.query<{ id: string }>(
    `UPDATE checklist_item_tarea
     SET completado = true, completado_en = now(), completado_por = $2
     WHERE id = $1
     RETURNING id`,
    [entrada.checklistItemId, entrada.completadoPor],
  );
  if (actualizado.rows.length === 0) {
    throw new Error(`checklist_item_tarea ${entrada.checklistItemId} no existe`);
  }
  for (const foto of entrada.fotos ?? []) {
    await ejecutor.query(
      `INSERT INTO foto_checklist_item (checklist_item_id, ruta_almacenamiento, subida_por)
       VALUES ($1, $2, $3)`,
      [entrada.checklistItemId, foto.rutaAlmacenamiento, foto.subidaPor],
    );
  }
}

/** H-051 (REQ-113): completar la tarea EXIGE checklist completo — si algún
 * ítem sigue pendiente, la tarea pasa a `bloqueada` (nunca a `completada`,
 * nunca reabre disponibilidad) y la función lanza un error explícito para
 * que la capa HTTP lo traduzca a 409. H-052: al completar, se descuenta el
 * inventario configurado y se detecta stock bajo. */
export async function completarTarea(
  ejecutor: EjecutorTransaccional,
  entrada: { tareaId: string; consumos?: ConsumoInventario[] },
): Promise<{ alertasStockBajo: string[] }> {
  const items = await ejecutor.query<{ completado: boolean }>(
    `SELECT completado FROM checklist_item_tarea WHERE tarea_id = $1`,
    [entrada.tareaId],
  );
  const completo = checklistCompleto(
    items.rows.map((r) => ({
      id: "",
      tareaId: entrada.tareaId,
      descripcion: "",
      orden: 0,
      completado: r.completado,
      completadoEn: null,
      completadoPor: null,
    })),
  );

  if (!completo) {
    await ejecutor.query(`UPDATE tarea_operativa SET estado = 'bloqueada', actualizado_en = now() WHERE id = $1`, [
      entrada.tareaId,
    ]);
    throw new Error("checklist_incompleto: no se puede completar la tarea con ítems pendientes");
  }

  const alertasStockBajo: string[] = [];
  for (const consumo of entrada.consumos ?? []) {
    const item = await ejecutor.query<{
      id: string;
      unidad_id: string;
      nombre: string;
      categoria: "ropa_blanca" | "consumible" | "otro";
      cantidad_actual: string;
      umbral_minimo: string;
      unidad_medida: string;
    }>(`SELECT * FROM item_inventario WHERE id = $1 FOR UPDATE`, [consumo.itemInventarioId]);
    if (item.rows.length === 0) continue;
    const fila = item.rows[0]!;
    const resultado = aplicarConsumo(
      {
        id: fila.id,
        unidadId: fila.unidad_id,
        nombre: fila.nombre,
        categoria: fila.categoria,
        cantidadActual: Number(fila.cantidad_actual),
        umbralMinimo: Number(fila.umbral_minimo),
        unidadMedida: fila.unidad_medida,
      },
      consumo.cantidad,
    );
    await ejecutor.query(`UPDATE item_inventario SET cantidad_actual = $1 WHERE id = $2`, [
      resultado.cantidadNueva,
      fila.id,
    ]);
    await ejecutor.query(
      `INSERT INTO movimiento_inventario (item_inventario_id, tarea_id, cantidad, motivo)
       VALUES ($1, $2, $3, 'consumo_checklist')`,
      [fila.id, entrada.tareaId, -consumo.cantidad],
    );
    if (resultado.cruzaUmbralMinimo) alertasStockBajo.push(fila.id);
  }

  await ejecutor.query(
    `UPDATE tarea_operativa SET estado = 'completada', completada_en = now(), actualizado_en = now() WHERE id = $1`,
    [entrada.tareaId],
  );
  await ejecutor.query(
    `INSERT INTO notificacion_tarea (tarea_id, evento, canales)
     SELECT $1, 'completada', COALESCE(cop.notificaciones_canales, '{}'::text[])
     FROM tarea_operativa t
     LEFT JOIN unidad u ON u.id = t.unidad_id
     LEFT JOIN configuracion_operativa_propiedad cop ON cop.propiedad_id = u.propiedad_id
     WHERE t.id = $1`,
    [entrada.tareaId],
  );

  return { alertasStockBajo };
}

// ---------------------------------------------------------------------------
// H-055: incidencias de mantenimiento + confirmación humana de bloqueo
// ---------------------------------------------------------------------------

export async function registrarIncidencia(
  ejecutor: EjecutorTransaccional,
  entrada: {
    unidadId: string;
    tareaOrigenId?: string | null;
    severidad: SeveridadIncidencia;
    titulo: string;
    descripcion?: string | null;
    reportadoPor: string;
    propuestaBloqueoRango?: { inicio: string; fin: string } | null;
  },
): Promise<{ incidenciaId: string; requiereConfirmacionHumana: boolean }> {
  const requiereConfirmacion = requiereConfirmacionHumanaParaBloqueo(entrada.severidad);
  const estadoInicial = requiereConfirmacion && entrada.propuestaBloqueoRango ? "bloqueo_propuesto" : "abierta";

  const insertado = await ejecutor.query<{ id: string }>(
    `INSERT INTO incidencia_mantenimiento
       (unidad_id, tarea_origen_id, severidad, titulo, descripcion, reportado_por, estado, propuesta_bloqueo_rango)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       CASE WHEN $8::date IS NOT NULL THEN daterange($8::date, $9::date, '[)') ELSE NULL END)
     RETURNING id`,
    [
      entrada.unidadId,
      entrada.tareaOrigenId ?? null,
      entrada.severidad,
      entrada.titulo,
      entrada.descripcion ?? null,
      entrada.reportadoPor,
      estadoInicial,
      entrada.propuestaBloqueoRango?.inicio ?? null,
      entrada.propuestaBloqueoRango?.fin ?? null,
    ],
  );

  return { incidenciaId: insertado.rows[0]!.id, requiereConfirmacionHumana: requiereConfirmacion };
}

export interface ResultadoConfirmarBloqueoMantenimiento {
  ocupacionId: string;
  conflictosCapaCruzada: number;
}

/** H-055 (REQ-118): confirma el bloqueo de mantenimiento propuesto por una
 * incidencia GRAVE — exige un `confirmadoPor` humano explícito (nunca se
 * invoca desde ningún trigger/webhook automático) y delega en `crearBloqueo`
 * de Lote 1, que NUNCA cancela ni toca reservas existentes (D-011): un
 * solape con una reserva confirmada se registra como conflicto
 * `capa_cruzada`, nunca rechaza la operación ni cancela nada. */
export async function confirmarBloqueoMantenimiento(
  ejecutor: EjecutorTransaccional,
  entrada: { incidenciaId: string; confirmadoPor: string; rango?: { inicio: string; fin: string } },
): Promise<ResultadoConfirmarBloqueoMantenimiento> {
  const incidencia = await ejecutor.query<{
    id: string;
    unidad_id: string;
    severidad: SeveridadIncidencia;
    estado: string;
    inicio: string | null;
    fin: string | null;
  }>(
    `SELECT id, unidad_id, severidad, estado,
            lower(propuesta_bloqueo_rango)::text AS inicio, upper(propuesta_bloqueo_rango)::text AS fin
     FROM incidencia_mantenimiento WHERE id = $1`,
    [entrada.incidenciaId],
  );
  if (incidencia.rows.length === 0) throw new Error(`incidencia_mantenimiento ${entrada.incidenciaId} no existe`);
  const fila = incidencia.rows[0]!;

  if (!requiereConfirmacionHumanaParaBloqueo(fila.severidad)) {
    throw new Error("solo una incidencia de severidad 'grave' admite propuesta de bloqueo de mantenimiento");
  }
  if (fila.estado === "bloqueo_confirmado") {
    throw new Error("esta incidencia ya tiene un bloqueo de mantenimiento confirmado");
  }

  const rango = entrada.rango ?? (fila.inicio && fila.fin ? { inicio: fila.inicio, fin: fila.fin } : null);
  if (!rango) {
    throw new Error("no hay un rango de bloqueo propuesto ni provisto explícitamente para confirmar");
  }

  const bloqueo = await crearBloqueo(ejecutor, { unidadId: fila.unidad_id, rango, razon: "MANTENIMIENTO" });

  await ejecutor.query(
    `UPDATE incidencia_mantenimiento
     SET estado = 'bloqueo_confirmado', bloqueo_ocupacion_id = $2, confirmado_por = $3, confirmado_en = now(),
         actualizado_en = now(), propuesta_bloqueo_rango = daterange($4::date, $5::date, '[)')
     WHERE id = $1`,
    [entrada.incidenciaId, bloqueo.ocupacionId, entrada.confirmadoPor, rango.inicio, rango.fin],
  );

  return { ocupacionId: bloqueo.ocupacionId, conflictosCapaCruzada: bloqueo.conflictosCapaCruzada.length };
}
