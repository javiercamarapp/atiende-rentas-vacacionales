import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearFixtureEsquema } from "../soporte/fixtureEsquema.js";
import {
  cancelarOcupacion,
  crearBloqueo,
  crearReservaConfirmada,
  modificarFechasReserva,
} from "../../src/aplicacion/reservas.js";
import type { EjecutorTransaccional } from "../../src/aplicacion/ejecutor.js";

let fixture: Awaited<ReturnType<typeof crearFixtureEsquema>>;

beforeEach(async () => {
  fixture = await crearFixtureEsquema();
});

afterEach(async () => {
  await fixture.cerrar();
});

async function contarOcupaciones(ejecutor: EjecutorTransaccional, unidadId: string): Promise<number> {
  const r = await ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1`,
    [unidadId],
  );
  return Number(r.rows[0]!.n);
}

async function estadoDe(ejecutor: EjecutorTransaccional, id: string) {
  const r = await ejecutor.query<{ estado: string; bloqueante: boolean }>(
    `SELECT estado, bloqueante FROM ocupacion_unidad WHERE id = $1`,
    [id],
  );
  return r.rows[0]!;
}

describe("crearReservaConfirmada (H-017)", () => {
  it("inserta una reserva confirmada y encola outbox de cierre de disponibilidad", async () => {
    const resultado = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    expect(resultado.conflicto).toBeNull();

    const outbox = await fixture.ejecutor.query<{ tipo_evento: string }>(
      `SELECT tipo_evento FROM outbox_evento WHERE ocupacion_unidad_id = $1`,
      [resultado.ocupacionId],
    );
    expect(outbox.rows.map((r) => r.tipo_evento)).toEqual(["cerrar_disponibilidad"]);
  });

  it("dos rangos adyacentes (checkout=check-in) se insertan ambos sin error (caso adversarial 15)", async () => {
    const a = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const b = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-05", fin: "2026-06-08" },
      estado: "confirmado",
      bloqueante: true,
    });
    expect(a.conflicto).toBeNull();
    expect(b.conflicto).toBeNull();
    expect(await contarOcupaciones(fixture.ejecutor, fixture.unidadId)).toBe(2);
  });

  it("caso adversarial 2 / overbooking: dos reservas confirmadas solapadas → 23P01 capturado, conflicto registrado, ninguna se cancela", async () => {
    const primera = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-07-01", fin: "2026-07-05" },
      estado: "confirmado",
      bloqueante: true,
      canalOrigenId: null,
      externalId: "airbnb-abc",
    });
    expect(primera.conflicto).toBeNull();

    const segunda = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-07-03", fin: "2026-07-07" },
      estado: "confirmado",
      bloqueante: true,
      canalOrigenId: null,
      externalId: "booking-xyz",
    });

    expect(segunda.conflicto).not.toBeNull();
    expect(segunda.conflicto!.tipo).toBe("overbooking_confirmado");
    expect(segunda.conflicto!.ocupacionExistenteId).toBe(primera.ocupacionId);

    // Ambas filas siguen existiendo — ninguna reserva se cancela automáticamente.
    expect(await contarOcupaciones(fixture.ejecutor, fixture.unidadId)).toBe(2);
    const estadoPrimera = await estadoDe(fixture.ejecutor, primera.ocupacionId);
    expect(estadoPrimera.estado).toBe("confirmado");
    const estadoSegunda = await estadoDe(fixture.ejecutor, segunda.ocupacionId);
    expect(estadoSegunda.estado).toBe("conflicto_pendiente");
    expect(estadoSegunda.bloqueante).toBe(false);

    const conflictos = await fixture.ejecutor.query<{ tipo: string }>(
      `SELECT tipo FROM conflicto_calendario WHERE unidad_id = $1`,
      [fixture.unidadId],
    );
    expect(conflictos.rows).toEqual([{ tipo: "overbooking_confirmado" }]);

    const outboxAlerta = await fixture.ejecutor.query<{ tipo_evento: string }>(
      `SELECT tipo_evento FROM outbox_evento WHERE ocupacion_unidad_id = $1`,
      [segunda.ocupacionId],
    );
    expect(outboxAlerta.rows.map((r) => r.tipo_evento)).toEqual(["alerta_overbooking"]);
  });

  it("REQ-068: una solicitud pendiente no bloqueante (Booking INQUIRY) puede coexistir con la reserva real sin rechazo de BD", async () => {
    const confirmada = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-08-01", fin: "2026-08-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const inquiry = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-08-02", fin: "2026-08-04" },
      estado: "provisional",
      bloqueante: false,
    });
    expect(confirmada.conflicto).toBeNull();
    expect(inquiry.conflicto).toBeNull();
    expect(await contarOcupaciones(fixture.ejecutor, fixture.unidadId)).toBe(2);
  });

  it("rechaza estado='confirmado' con bloqueante=false (regla de negocio)", async () => {
    await expect(
      crearReservaConfirmada(fixture.ejecutor, {
        unidadId: fixture.unidadId,
        rango: { inicio: "2026-06-01", fin: "2026-06-02" },
        estado: "confirmado",
        bloqueante: false,
      }),
    ).rejects.toThrow();
  });

  it("H-009: rechaza una estancia por debajo de la duración mínima configurada en la unidad", async () => {
    await fixture.ejecutor.query(`UPDATE unidad SET duracion_minima_noches = 3 WHERE id = $1`, [
      fixture.unidadId,
    ]);
    await expect(
      crearReservaConfirmada(fixture.ejecutor, {
        unidadId: fixture.unidadId,
        rango: { inicio: "2026-06-01", fin: "2026-06-02" }, // 1 noche < mínimo 3
        estado: "confirmado",
        bloqueante: true,
      }),
    ).rejects.toThrow(/duración mínima/);
  });

  it("multi-unidad: misma fecha, dos unidades distintas, sin conflicto", async () => {
    const otraUnidadId = await fixture.crearUnidad("Unidad 2");
    const rango = { inicio: "2026-09-01", fin: "2026-09-05" };
    const a = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango,
      estado: "confirmado",
      bloqueante: true,
    });
    const b = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: otraUnidadId,
      rango,
      estado: "confirmado",
      bloqueante: true,
    });
    expect(a.conflicto).toBeNull();
    expect(b.conflicto).toBeNull();
  });

  it("D-DSD-02 (regresión): un bloqueo de mantenimiento ya existente + reserva de canal que lo solapa después SÍ genera conflicto capa_cruzada, y la reserva se acepta igual", async () => {
    await crearBloqueo(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-09-01", fin: "2026-09-10" },
      razon: "MANTENIMIENTO",
    });

    const resultado = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-09-03", fin: "2026-09-06" },
      estado: "confirmado",
      bloqueante: true,
      externalId: "reserva-solapa-mantenimiento@canal-externo.com",
    });

    // La reserva de canal se acepta SIEMPRE (REQ-000: nunca se cancela
    // unilateralmente una reserva ya confirmada por el canal externo) — el
    // EXCLUDE de BD ni siquiera dispara (capa='bloqueo' nunca participa),
    // así que `conflicto` (overbooking reserva-vs-reserva) sigue null.
    expect(resultado.conflicto).toBeNull();
    expect(resultado.conflictosCapaCruzada).toHaveLength(1);
    expect(resultado.conflictosCapaCruzada[0]!.tipo).toBe("capa_cruzada");

    const estado = await estadoDe(fixture.ejecutor, resultado.ocupacionId);
    expect(estado.estado).toBe("confirmado");

    const conflictos = await fixture.ejecutor.query<{ tipo: string }>(
      `SELECT tipo FROM conflicto_calendario WHERE unidad_id = $1`,
      [fixture.unidadId],
    );
    expect(conflictos.rows).toEqual([{ tipo: "capa_cruzada" }]);

    const outbox = await fixture.ejecutor.query<{ tipo_evento: string }>(
      `SELECT tipo_evento FROM outbox_evento WHERE ocupacion_unidad_id = $1 ORDER BY tipo_evento`,
      [resultado.ocupacionId],
    );
    expect(outbox.rows.map((r) => r.tipo_evento)).toEqual(["alerta_capa_cruzada", "cerrar_disponibilidad"]);
  });
});

describe("cancelarOcupacion (H-018)", () => {
  it("cancela una reserva y no toca otras filas", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const resultado = await cancelarOcupacion(fixture.ejecutor, reserva.ocupacionId);
    expect(resultado.estadoAnterior).toBe("confirmado");
    const estado = await estadoDe(fixture.ejecutor, reserva.ocupacionId);
    expect(estado.estado).toBe("cancelado");
  });

  it("caso adversarial 5: cancelar la reserva con un bloqueo de propietario solapado deja la noche ocupada por el bloqueo", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const bloqueo = await crearBloqueo(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      razon: "BLOQUEO_PROPIETARIO",
    });
    // El bloqueo se insertó sin ser rechazado por el EXCLUDE (capa='bloqueo'
    // nunca participa) y generó un conflicto de capa cruzada.
    expect(bloqueo.conflictosCapaCruzada).toHaveLength(1);
    expect(bloqueo.conflictosCapaCruzada[0]!.tipo).toBe("capa_cruzada");

    await cancelarOcupacion(fixture.ejecutor, reserva.ocupacionId);

    // Tras cancelar la reserva, el bloqueo de propietario sigue activo y
    // sigue existiendo — nunca se elimina ni se altera por la cancelación.
    const filas = await fixture.ejecutor.query<{ id: string; estado: string; capa: string }>(
      `SELECT id, estado, capa FROM ocupacion_unidad WHERE unidad_id = $1 ORDER BY capa`,
      [fixture.unidadId],
    );
    expect(filas.rows).toHaveLength(2);
    const filaBloqueo = filas.rows.find((f) => f.capa === "bloqueo")!;
    expect(filaBloqueo.estado).toBe("confirmado");
    const filaReserva = filas.rows.find((f) => f.capa === "reserva")!;
    expect(filaReserva.estado).toBe("cancelado");
  });

  it("no permite cancelar una ocupación ya cancelada", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    await cancelarOcupacion(fixture.ejecutor, reserva.ocupacionId);
    await expect(cancelarOcupacion(fixture.ejecutor, reserva.ocupacionId)).rejects.toThrow();
  });
});

describe("crearBloqueo (H-022, H-008)", () => {
  it("un bloqueo de mantenimiento superpuesto a una reserva se inserta y genera alerta capa_cruzada, sin tocar la reserva", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-10" },
      estado: "confirmado",
      bloqueante: true,
    });
    const mantenimiento = await crearBloqueo(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-03", fin: "2026-06-04" },
      razon: "MANTENIMIENTO",
    });
    expect(mantenimiento.conflictosCapaCruzada).toHaveLength(1);
    expect(mantenimiento.conflictosCapaCruzada[0]!.ocupacionExistenteId).toBe(reserva.ocupacionId);

    const estadoReserva = await estadoDe(fixture.ejecutor, reserva.ocupacionId);
    expect(estadoReserva.estado).toBe("confirmado");

    const outbox = await fixture.ejecutor.query<{ tipo_evento: string }>(
      `SELECT tipo_evento FROM outbox_evento WHERE ocupacion_unidad_id = $1`,
      [mantenimiento.ocupacionId],
    );
    expect(outbox.rows.map((r) => r.tipo_evento)).toEqual(["alerta_capa_cruzada"]);
  });

  it("un buffer de limpieza sin solapamiento no genera conflictos", async () => {
    const buffer = await crearBloqueo(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-05", fin: "2026-06-06" },
      razon: "BUFFER_LIMPIEZA",
    });
    expect(buffer.conflictosCapaCruzada).toHaveLength(0);
  });
});

describe("modificarFechasReserva (H-019, H-020)", () => {
  it("amplía una reserva sin conflicto", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-10", fin: "2026-06-15" },
      estado: "confirmado",
      bloqueante: true,
    });
    const resultado = await modificarFechasReserva(fixture.ejecutor, reserva.ocupacionId, {
      inicio: "2026-06-08",
      fin: "2026-06-17",
    });
    expect(resultado.conflicto).toBeNull();
    expect(resultado.rangoEfectivo).toEqual({ inicio: "2026-06-08", fin: "2026-06-17" });
  });

  it("D-DSD-02 (regresión): ampliar una reserva hacia un bloqueo de propietario ya existente SÍ genera conflicto capa_cruzada, y la ampliación se acepta igual", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-10", fin: "2026-06-15" },
      estado: "confirmado",
      bloqueante: true,
    });
    await crearBloqueo(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-15", fin: "2026-06-20" },
      razon: "BLOQUEO_PROPIETARIO",
    });

    const resultado = await modificarFechasReserva(fixture.ejecutor, reserva.ocupacionId, {
      inicio: "2026-06-10",
      fin: "2026-06-18",
    });

    expect(resultado.conflicto).toBeNull();
    expect(resultado.rangoEfectivo).toEqual({ inicio: "2026-06-10", fin: "2026-06-18" });
    expect(resultado.conflictosCapaCruzada).toHaveLength(1);
    expect(resultado.conflictosCapaCruzada[0]!.tipo).toBe("capa_cruzada");
  });

  it("reduce una reserva sin conflicto", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-10", fin: "2026-06-15" },
      estado: "confirmado",
      bloqueante: true,
    });
    const resultado = await modificarFechasReserva(fixture.ejecutor, reserva.ocupacionId, {
      inicio: "2026-06-11",
      fin: "2026-06-13",
    });
    expect(resultado.conflicto).toBeNull();
    expect(resultado.rangoEfectivo).toEqual({ inicio: "2026-06-11", fin: "2026-06-13" });
  });

  it("mueve una reserva a fechas totalmente distintas sin conflicto", async () => {
    const reserva = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-10", fin: "2026-06-15" },
      estado: "confirmado",
      bloqueante: true,
    });
    const resultado = await modificarFechasReserva(fixture.ejecutor, reserva.ocupacionId, {
      inicio: "2026-07-01",
      fin: "2026-07-06",
    });
    expect(resultado.conflicto).toBeNull();
    expect(resultado.rangoEfectivo).toEqual({ inicio: "2026-07-01", fin: "2026-07-06" });
  });

  it("caso adversarial 4: ampliar hacia noches ya ocupadas por otra reserva produce conflicto y NO mueve ninguna reserva", async () => {
    const reservaA = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const reservaB = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-10", fin: "2026-06-15" },
      estado: "confirmado",
      bloqueante: true,
    });

    const resultado = await modificarFechasReserva(fixture.ejecutor, reservaB.ocupacionId, {
      inicio: "2026-06-04",
      fin: "2026-06-20",
    });

    expect(resultado.conflicto).not.toBeNull();
    expect(resultado.conflicto!.ocupacionExistenteId).toBe(reservaA.ocupacionId);
    // La reserva B queda exactamente en su rango original — la modificación
    // se rechazó sin tocarla ni tocar la reserva A.
    expect(resultado.rangoEfectivo).toEqual({ inicio: "2026-06-10", fin: "2026-06-15" });

    const filaA = await estadoDe(fixture.ejecutor, reservaA.ocupacionId);
    expect(filaA.estado).toBe("confirmado");
    const filaB = await estadoDe(fixture.ejecutor, reservaB.ocupacionId);
    expect(filaB.estado).toBe("confirmado");

    const rangoBReal = await fixture.ejecutor.query<{ inicio: string; fin: string }>(
      `SELECT lower(rango)::text AS inicio, upper(rango)::text AS fin FROM ocupacion_unidad WHERE id = $1`,
      [reservaB.ocupacionId],
    );
    expect(rangoBReal.rows[0]).toEqual({ inicio: "2026-06-10", fin: "2026-06-15" });
  });

  it("desplazar una reserva a noches contiguas de otra (checkout=check-in) es válido, no un conflicto", async () => {
    const reservaA = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-01", fin: "2026-06-05" },
      estado: "confirmado",
      bloqueante: true,
    });
    const reservaB = await crearReservaConfirmada(fixture.ejecutor, {
      unidadId: fixture.unidadId,
      rango: { inicio: "2026-06-10", fin: "2026-06-12" },
      estado: "confirmado",
      bloqueante: true,
    });

    const resultado = await modificarFechasReserva(fixture.ejecutor, reservaB.ocupacionId, {
      inicio: "2026-06-05",
      fin: "2026-06-07",
    });
    expect(resultado.conflicto).toBeNull();
    void reservaA;
  });
});
