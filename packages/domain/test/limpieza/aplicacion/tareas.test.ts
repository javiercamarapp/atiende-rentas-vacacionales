import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearFixtureEsquema } from "../../soporte/fixtureEsquema.js";
import { crearReservaConfirmada, modificarFechasReserva, cancelarOcupacion } from "../../../src/aplicacion/reservas.js";
import type { EjecutorTransaccional } from "../../../src/aplicacion/ejecutor.js";
import {
  asignarTarea,
  cancelarTareaPorCancelacionReserva,
  completarChecklistItem,
  completarTarea,
  confirmarBloqueoMantenimiento,
  crearTareaLimpiezaPorCheckout,
  procesarEventosCheckoutPendientes,
  registrarIncidencia,
  reprogramarTareaPorCambioReserva,
} from "../../../src/limpieza/aplicacion/tareas.js";

let fixture: Awaited<ReturnType<typeof crearFixtureEsquema>>;
let tenantId: string;
let usuarioLimpiezaId: string;

beforeEach(async () => {
  fixture = await crearFixtureEsquema();
  const propiedad = await fixture.ejecutor.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM propiedad WHERE id = $1`,
    [fixture.propiedadId],
  );
  tenantId = propiedad.rows[0]!.tenant_id;
  const usuario = await fixture.ejecutor.query<{ id: string }>(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'limpieza@test.local', 'limpieza', 'x') RETURNING id`,
    [tenantId],
  );
  usuarioLimpiezaId = usuario.rows[0]!.id;
});

afterEach(async () => {
  await fixture.cerrar();
});

async function tareaDe(ejecutor: EjecutorTransaccional, ocupacionUnidadId: string) {
  const r = await ejecutor.query<{
    id: string;
    estado: string;
    programada_para: string;
    buffer_ocupacion_id: string | null;
    asignado_a: string | null;
  }>(
    `SELECT id, estado, programada_para::text AS programada_para, buffer_ocupacion_id, asignado_a
     FROM tarea_operativa WHERE ocupacion_unidad_id = $1 ORDER BY creado_en DESC LIMIT 1`,
    [ocupacionUnidadId],
  );
  return r.rows[0]!;
}

describe("crearTareaLimpiezaPorCheckout (H-049, H-050)", () => {
  it("crea la tarea vinculada a la reserva con checklist y buffer por defecto (1 noche)", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });

    const resultado = await crearTareaLimpiezaPorCheckout(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      ocupacionUnidadId: reserva.ocupacionId,
      fechaCheckout: "2026-06-05",
    });

    expect(resultado.bufferOcupacionId).not.toBeNull();

    const tarea = await fixture.ejecutor.query<{ tipo: string; programada_para: string; estado: string }>(
      `SELECT tipo, programada_para::text AS programada_para, estado FROM tarea_operativa WHERE id = $1`,
      [resultado.tareaId],
    );
    expect(tarea.rows[0]).toEqual({ tipo: "limpieza", programada_para: "2026-06-05", estado: "pendiente" });

    const items = await fixture.ejecutor.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM checklist_item_tarea WHERE tarea_id = $1`,
      [resultado.tareaId],
    );
    expect(Number(items.rows[0]!.n)).toBeGreaterThan(0);

    const buffer = await fixture.ejecutor.query<{ inicio: string; fin: string; razon: string }>(
      `SELECT lower(rango)::text AS inicio, upper(rango)::text AS fin, razon FROM ocupacion_unidad WHERE id = $1`,
      [resultado.bufferOcupacionId],
    );
    expect(buffer.rows[0]).toEqual({ inicio: "2026-06-05", fin: "2026-06-06", razon: "BUFFER_LIMPIEZA" });
  });

  it("respeta el buffer configurado por propiedad (0 = sin bloqueo)", async () => {
    await fixture.ejecutor.query(
      `INSERT INTO configuracion_operativa_propiedad (propiedad_id, buffer_limpieza_noches) VALUES ($1, 0)`,
      [fixture.propiedadId],
    );
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-07-01", fin: "2026-07-03" },
      estado: "confirmado",
      bloqueante: true,
    });
    const resultado = await crearTareaLimpiezaPorCheckout(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      ocupacionUnidadId: reserva.ocupacionId,
      fechaCheckout: "2026-07-03",
    });
    expect(resultado.bufferOcupacionId).toBeNull();
  });
});

describe("procesarEventosCheckoutPendientes (H-049): consume outbox_evento de Lote 1", () => {
  it("confirmar un checkout de prueba crea una tarea de limpieza vinculada (entregable verificable de Lote 5)", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-08-01", fin: "2026-08-04" },
      estado: "confirmado",
      bloqueante: true,
    });

    const resultado = await procesarEventosCheckoutPendientes(fixture.ejecutor);
    expect(resultado.tareasCreadas).toHaveLength(1);

    const tarea = await tareaDe(fixture.ejecutor, reserva.ocupacionId);
    expect(tarea.programada_para).toBe("2026-08-04");
    expect(tarea.estado).toBe("pendiente");

    // Idempotente: reprocesar no crea una segunda tarea para la misma reserva.
    const segundaPasada = await procesarEventosCheckoutPendientes(fixture.ejecutor);
    expect(segundaPasada.procesados).toBe(0);
  });

  it("modificar la fecha de la reserva reprograma la tarea preservando el responsable asignado (§Limpieza-1)", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-09-01", fin: "2026-09-04" },
      estado: "confirmado",
      bloqueante: true,
    });
    await procesarEventosCheckoutPendientes(fixture.ejecutor);
    const tareaOriginal = await tareaDe(fixture.ejecutor, reserva.ocupacionId);
    await asignarTarea(fixture.ejecutor, {
      tareaId: tareaOriginal.id,
      asignadoA: usuarioLimpiezaId,
      esProveedorExterno: false,
    });

    await modificarFechasReserva(fixture.ejecutor, reserva.ocupacionId, {
      inicio: "2026-09-01",
      fin: "2026-09-06",
    });
    const reprogramacion = await procesarEventosCheckoutPendientes(fixture.ejecutor);
    expect(reprogramacion.tareasReprogramadas).toEqual([tareaOriginal.id]);

    const tareaReprogramada = await tareaDe(fixture.ejecutor, reserva.ocupacionId);
    expect(tareaReprogramada.id).toBe(tareaOriginal.id);
    expect(tareaReprogramada.programada_para).toBe("2026-09-06");
    // El responsable asignado se preserva tras la reprogramación.
    expect(tareaReprogramada.asignado_a).toBe(usuarioLimpiezaId);

    // El buffer también se movió a la nueva fecha de checkout.
    const buffer = await fixture.ejecutor.query<{ inicio: string; fin: string }>(
      `SELECT lower(rango)::text AS inicio, upper(rango)::text AS fin FROM ocupacion_unidad WHERE id = $1`,
      [tareaReprogramada.buffer_ocupacion_id],
    );
    expect(buffer.rows[0]).toEqual({ inicio: "2026-09-06", fin: "2026-09-07" });
  });

  it("cancelar la reserva de origen cancela la tarea y libera el buffer", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-10-01", fin: "2026-10-03" },
      estado: "confirmado",
      bloqueante: true,
    });
    await procesarEventosCheckoutPendientes(fixture.ejecutor);
    const tarea = await tareaDe(fixture.ejecutor, reserva.ocupacionId);

    await cancelarOcupacion(fixture.ejecutor, reserva.ocupacionId);
    const resultado = await procesarEventosCheckoutPendientes(fixture.ejecutor);
    expect(resultado.tareasCanceladas).toEqual([tarea.id]);

    const tareaCancelada = await fixture.ejecutor.query<{ estado: string }>(
      `SELECT estado FROM tarea_operativa WHERE id = $1`,
      [tarea.id],
    );
    expect(tareaCancelada.rows[0]!.estado).toBe("cancelada");

    const bufferCancelado = await fixture.ejecutor.query<{ estado: string }>(
      `SELECT estado FROM ocupacion_unidad WHERE id = $1`,
      [tarea.buffer_ocupacion_id],
    );
    expect(bufferCancelado.rows[0]!.estado).toBe("cancelado");
  });
});

describe("checklist + inventario (H-051, H-052)", () => {
  async function crearTareaDePrueba() {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-11-01", fin: "2026-11-03" },
      estado: "confirmado",
      bloqueante: true,
    });
    const { tareaId } = await crearTareaLimpiezaPorCheckout(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      ocupacionUnidadId: reserva.ocupacionId,
      fechaCheckout: "2026-11-03",
    });
    return tareaId;
  }

  it("completar la tarea con checklist incompleto lanza error y bloquea la tarea (REQ-113)", async () => {
    const tareaId = await crearTareaDePrueba();
    await expect(completarTarea(fixture.ejecutor, { tareaId })).rejects.toThrow(/checklist_incompleto/);

    const tarea = await fixture.ejecutor.query<{ estado: string }>(`SELECT estado FROM tarea_operativa WHERE id = $1`, [
      tareaId,
    ]);
    expect(tarea.rows[0]!.estado).toBe("bloqueada");
  });

  it("completar cada ítem con foto/timestamp y luego la tarea descuenta inventario configurado", async () => {
    const tareaId = await crearTareaDePrueba();
    const items = await fixture.ejecutor.query<{ id: string }>(
      `SELECT id FROM checklist_item_tarea WHERE tarea_id = $1`,
      [tareaId],
    );
    for (const item of items.rows) {
      await completarChecklistItem(fixture.ejecutor, {
        checklistItemId: item.id,
        completadoPor: usuarioLimpiezaId,
        fotos: [{ rutaAlmacenamiento: `dev-local/${item.id}.jpg`, subidaPor: usuarioLimpiezaId }],
      });
    }
    const fotos = await fixture.ejecutor.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM foto_checklist_item fci
       JOIN checklist_item_tarea cit ON cit.id = fci.checklist_item_id
       WHERE cit.tarea_id = $1`,
      [tareaId],
    );
    expect(Number(fotos.rows[0]!.n)).toBe(items.rows.length);

    const item = await fixture.ejecutor.query<{ id: string }>(
      `INSERT INTO item_inventario (unidad_id, nombre, categoria, cantidad_actual, umbral_minimo)
       VALUES ($1, 'Toallas', 'ropa_blanca', 5, 4) RETURNING id`,
      [fixture.unidadId],
    );
    const itemInventarioId = item.rows[0]!.id;

    const resultado = await completarTarea(fixture.ejecutor, {
      tareaId,
      consumos: [{ itemInventarioId, cantidad: 2 }],
    });
    expect(resultado.alertasStockBajo).toEqual([itemInventarioId]);

    const nivel = await fixture.ejecutor.query<{ cantidad_actual: string }>(
      `SELECT cantidad_actual FROM item_inventario WHERE id = $1`,
      [itemInventarioId],
    );
    expect(Number(nivel.rows[0]!.cantidad_actual)).toBe(3);

    const tarea = await fixture.ejecutor.query<{ estado: string; completada_en: string | null }>(
      `SELECT estado, completada_en FROM tarea_operativa WHERE id = $1`,
      [tareaId],
    );
    expect(tarea.rows[0]!.estado).toBe("completada");
    expect(tarea.rows[0]!.completada_en).not.toBeNull();
  });
});

describe("incidencias de mantenimiento (H-055, REQ-118)", () => {
  it("una incidencia grave con propuesta de bloqueo requiere confirmación humana explícita antes de crear el bloqueo", async () => {
    const incidencia = await registrarIncidencia(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      severidad: "grave",
      titulo: "Fuga de agua en baño principal",
      reportadoPor: usuarioLimpiezaId,
      propuestaBloqueoRango: { inicio: "2026-12-01", fin: "2026-12-03" },
    });
    expect(incidencia.requiereConfirmacionHumana).toBe(true);

    const estadoAntes = await fixture.ejecutor.query<{ estado: string }>(
      `SELECT estado FROM incidencia_mantenimiento WHERE id = $1`,
      [incidencia.incidenciaId],
    );
    expect(estadoAntes.rows[0]!.estado).toBe("bloqueo_propuesto");

    // Sin confirmación humana, NO existe ningún bloqueo de mantenimiento en el calendario todavía.
    const bloqueosAntes = await fixture.ejecutor.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND razon = 'MANTENIMIENTO'`,
      [fixture.unidadId],
    );
    expect(Number(bloqueosAntes.rows[0]!.n)).toBe(0);

    const confirmacion = await confirmarBloqueoMantenimiento(fixture.ejecutor, {
      incidenciaId: incidencia.incidenciaId,
      confirmadoPor: usuarioLimpiezaId,
    });
    expect(confirmacion.conflictosCapaCruzada).toBe(0);

    const estadoDespues = await fixture.ejecutor.query<{
      estado: string;
      confirmado_por: string;
      confirmado_en: string | null;
    }>(`SELECT estado, confirmado_por, confirmado_en FROM incidencia_mantenimiento WHERE id = $1`, [
      incidencia.incidenciaId,
    ]);
    expect(estadoDespues.rows[0]!.estado).toBe("bloqueo_confirmado");
    expect(estadoDespues.rows[0]!.confirmado_por).toBe(usuarioLimpiezaId);
    expect(estadoDespues.rows[0]!.confirmado_en).not.toBeNull();

    const bloqueo = await fixture.ejecutor.query<{ razon: string }>(
      `SELECT razon FROM ocupacion_unidad WHERE id = $1`,
      [confirmacion.ocupacionId],
    );
    expect(bloqueo.rows[0]!.razon).toBe("MANTENIMIENTO");
  });

  it("confirmar el bloqueo sobre una reserva activa genera alerta capa_cruzada y NUNCA cancela la reserva (REQ-118, D-011)", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2027-01-01", fin: "2027-01-10" },
      estado: "confirmado",
      bloqueante: true,
    });
    const incidencia = await registrarIncidencia(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      severidad: "grave",
      titulo: "Aire acondicionado descompuesto",
      reportadoPor: usuarioLimpiezaId,
      propuestaBloqueoRango: { inicio: "2027-01-03", fin: "2027-01-04" },
    });

    const confirmacion = await confirmarBloqueoMantenimiento(fixture.ejecutor, {
      incidenciaId: incidencia.incidenciaId,
      confirmadoPor: usuarioLimpiezaId,
    });
    expect(confirmacion.conflictosCapaCruzada).toBe(1);

    const conflicto = await fixture.ejecutor.query<{ tipo: string }>(
      `SELECT tipo FROM conflicto_calendario WHERE unidad_id = $1`,
      [fixture.unidadId],
    );
    expect(conflicto.rows.map((r) => r.tipo)).toContain("capa_cruzada");

    // La reserva original sigue intacta — nunca se cancela ni se toca.
    const estadoReserva = await fixture.ejecutor.query<{ estado: string }>(
      `SELECT estado FROM ocupacion_unidad WHERE id = $1`,
      [reserva.ocupacionId],
    );
    expect(estadoReserva.rows[0]!.estado).toBe("confirmado");
  });

  it("una incidencia leve/moderada no permite confirmar bloqueo (nunca automático)", async () => {
    const incidencia = await registrarIncidencia(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      severidad: "leve",
      titulo: "Foco fundido",
      reportadoPor: usuarioLimpiezaId,
    });
    expect(incidencia.requiereConfirmacionHumana).toBe(false);
    await expect(
      confirmarBloqueoMantenimiento(fixture.ejecutor, {
        incidenciaId: incidencia.incidenciaId,
        confirmadoPor: usuarioLimpiezaId,
        rango: { inicio: "2027-02-01", fin: "2027-02-02" },
      }),
    ).rejects.toThrow(/severidad 'grave'/);
  });
});
