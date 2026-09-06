import { calcularNoches, esRangoValido } from "../fechas.js";
import { puedeTransicionar } from "../estados.js";
import type { EstadoOcupacion, RangoFechas, Razon, TipoConflicto } from "../tipos.js";
import { bloquearUnidadEnTransaccion, esViolacionExclusion, type EjecutorTransaccional } from "./ejecutor.js";

/**
 * Capa de aplicación transaccional mínima sobre `ocupacion_unidad`
 * (H-017 a H-022, LOTES.md Lote 1: "sin HTTP todavía"). Cada función
 * gestiona su propia transacción de principio a fin: recibe un
 * `EjecutorTransaccional` ya conectado (una conexión SQL abierta, no un
 * pool) y deja la conexión en estado `IDLE` (fuera de transacción) al
 * terminar, tanto en éxito como en error.
 *
 * Mecanismo de conflicto (D-002/BLUEPRINT §3.2, corrección BC1): el
 * `INSERT`/`UPDATE` que sí participa del EXCLUDE (capa='reserva',
 * bloqueante=true, estado<>'cancelado') se intenta dentro de un
 * `SAVEPOINT`; si Postgres lo rechaza con `23P01`
 * (`exclusion_violation`), se hace `ROLLBACK TO SAVEPOINT` (recupera la
 * transacción, que de otro modo quedaría abortada) y se registra el
 * conflicto de forma explícita — nunca se cancela ninguna reserva
 * automáticamente (REQ-000).
 */

function requireRangoValido(rango: RangoFechas): void {
  if (!esRangoValido(rango)) {
    throw new Error(`Rango inválido (debe cumplir inicio < fin): [${rango.inicio}, ${rango.fin})`);
  }
}

export interface InfoConflicto {
  tipo: TipoConflicto;
  conflictoId: string;
  ocupacionExistenteId: string;
}

/**
 * D-DSD-02: verificación de solapamiento contra capas NO bloqueantes a
 * nivel de EXCLUDE (`capa='bloqueo'`: BLOQUEO_PROPIETARIO, MANTENIMIENTO,
 * BUFFER_LIMPIEZA) que `crearReservaConfirmada`/`modificarFechasReserva`
 * necesitan replicar del mismo patrón que ya usa `crearBloqueo` (líneas
 * más abajo): el `EXCLUDE` de base de datos SOLO protege
 * `capa='reserva' AND bloqueante=true`, así que una reserva de canal que
 * aterriza sobre un bloqueo ya existente nunca dispara `23P01` y, sin esta
 * verificación explícita, se insertaría sin ninguna fila en
 * `conflicto_calendario` ni alerta (D-002).
 *
 * Decisión de producto (documentada aquí, ver también
 * docs/auditoria-2/correcciones-dominio.md): la reserva de canal SIEMPRE
 * se acepta —el canal externo ya la confirmó frente al huésped, cancelarla
 * unilateralmente violaría REQ-000— y el conflicto se registra para
 * revisión humana como `capa_cruzada`, nunca como motivo de rechazo. La UI
 * debe mostrar esta reserva como "conflicto pendiente" (mismo tratamiento
 * visual que `overbooking_confirmado`) aunque a nivel de `estado` de BD
 * siga siendo `confirmado`/`provisional` normal.
 */
async function detectarYRegistrarConflictosCapaCruzada(
  ejecutor: EjecutorTransaccional,
  unidadId: string,
  ocupacionId: string,
  rango: RangoFechas,
): Promise<InfoConflicto[]> {
  const solapadas = await ejecutor.query<{ id: string }>(
    `SELECT id FROM ocupacion_unidad
     WHERE unidad_id = $1 AND id <> $2 AND estado <> 'cancelado' AND capa = 'bloqueo'
       AND rango && daterange($3, $4, '[)')`,
    [unidadId, ocupacionId, rango.inicio, rango.fin],
  );

  const conflictos: InfoConflicto[] = [];
  for (const fila of solapadas.rows) {
    const conflictoInsertado = await ejecutor.query<{ id: string }>(
      `INSERT INTO conflicto_calendario (unidad_id, ocupacion_a_id, ocupacion_b_id, tipo)
       VALUES ($1, $2, $3, 'capa_cruzada')
       RETURNING id`,
      [unidadId, fila.id, ocupacionId],
    );
    const info: InfoConflicto = {
      tipo: "capa_cruzada",
      conflictoId: conflictoInsertado.rows[0]!.id,
      ocupacionExistenteId: fila.id,
    };
    conflictos.push(info);
    await ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'alerta_capa_cruzada', $2::jsonb)`,
      [ocupacionId, JSON.stringify({ conflicto: info })],
    );
  }
  return conflictos;
}

// ---------------------------------------------------------------------------
// Crear reserva confirmada / provisional (H-017, H-021)
// ---------------------------------------------------------------------------

export interface EntradaCrearReserva {
  unidadId: string;
  rango: RangoFechas;
  /** `provisional` cubre tanto Airbnb (bloqueante=true, REQ-048) como
   * Booking `INQUIRY` (bloqueante=false, REQ-068). */
  estado: Extract<EstadoOcupacion, "confirmado" | "provisional">;
  /** Una reserva `confirmado` siempre es bloqueante (regla de negocio,
   * verificada abajo); una `provisional` puede o no serlo según si el
   * canal de origen la bloquea (REQ-048 vs REQ-068). */
  bloqueante: boolean;
  canalOrigenId?: string | null;
  externalId?: string | null;
}

export interface ResultadoCrearReserva {
  ocupacionId: string;
  conflicto: InfoConflicto | null;
  /** D-DSD-02: conflictos `capa_cruzada` contra bloqueos (propietario,
   * mantenimiento, buffer) ya existentes sobre el mismo rango. Nunca
   * bloquea la inserción de la reserva de canal — solo la reporta. */
  conflictosCapaCruzada: InfoConflicto[];
}

export async function crearReservaConfirmada(
  ejecutor: EjecutorTransaccional,
  entrada: EntradaCrearReserva,
): Promise<ResultadoCrearReserva> {
  requireRangoValido(entrada.rango);
  if (entrada.estado === "confirmado" && !entrada.bloqueante) {
    throw new Error(
      "una reserva 'confirmado' siempre debe ser bloqueante=true; " +
        "bloqueante=false solo es válido para 'provisional' (REQ-068)",
    );
  }

  await ejecutor.exec("BEGIN");
  try {
    await bloquearUnidadEnTransaccion(ejecutor, entrada.unidadId);

    // H-009: la duración mínima de estancia es una regla de la fuente de
    // verdad interna, no una validación que un canal pueda saltarse. Se
    // aplica siempre, incluso a reservas 'provisional' (para no encolar de
    // entrada una solicitud que nunca podría confirmarse tal cual).
    const unidad = await ejecutor.query<{ duracion_minima_noches: number }>(
      `SELECT duracion_minima_noches FROM unidad WHERE id = $1`,
      [entrada.unidadId],
    );
    if (unidad.rows.length === 0) {
      throw new Error(`unidad ${entrada.unidadId} no existe`);
    }
    const noches = calcularNoches(entrada.rango);
    const minimo = unidad.rows[0]!.duracion_minima_noches;
    if (noches < minimo) {
      throw new Error(
        `estancia de ${noches} noche(s) por debajo de la duración mínima configurada (${minimo}) para esta unidad`,
      );
    }

    await ejecutor.exec("SAVEPOINT intento_insercion");

    let ocupacionId: string;
    let conflicto: InfoConflicto | null = null;

    try {
      const insertado = await ejecutor.query<{ id: string }>(
        `INSERT INTO ocupacion_unidad
           (unidad_id, rango, capa, razon, estado, bloqueante, canal_origen_id, external_id)
         VALUES
           ($1, daterange($2, $3, '[)'), 'reserva', 'RESERVA_CANAL', $4, $5, $6, $7)
         RETURNING id`,
        [
          entrada.unidadId,
          entrada.rango.inicio,
          entrada.rango.fin,
          entrada.estado,
          entrada.bloqueante,
          entrada.canalOrigenId ?? null,
          entrada.externalId ?? null,
        ],
      );
      ocupacionId = insertado.rows[0]!.id;
    } catch (error) {
      if (!esViolacionExclusion(error)) throw error;

      await ejecutor.exec("ROLLBACK TO SAVEPOINT intento_insercion");

      const existente = await ejecutor.query<{ id: string }>(
        `SELECT id FROM ocupacion_unidad
         WHERE unidad_id = $1 AND capa = 'reserva' AND estado <> 'cancelado' AND bloqueante
           AND rango && daterange($2, $3, '[)')
         LIMIT 1`,
        [entrada.unidadId, entrada.rango.inicio, entrada.rango.fin],
      );
      const ocupacionExistenteId = existente.rows[0]?.id ?? null;

      // Se inserta igualmente, pero como 'conflicto_pendiente' y
      // bloqueante=false — así este segundo INSERT queda excluido del
      // EXCLUDE (BLUEPRINT §3.2) y sí se acepta.
      const insertadoComoConflicto = await ejecutor.query<{ id: string }>(
        `INSERT INTO ocupacion_unidad
           (unidad_id, rango, capa, razon, estado, bloqueante, canal_origen_id, external_id)
         VALUES
           ($1, daterange($2, $3, '[)'), 'reserva', 'RESERVA_CANAL', 'conflicto_pendiente', false, $4, $5)
         RETURNING id`,
        [
          entrada.unidadId,
          entrada.rango.inicio,
          entrada.rango.fin,
          entrada.canalOrigenId ?? null,
          entrada.externalId ?? null,
        ],
      );
      ocupacionId = insertadoComoConflicto.rows[0]!.id;

      if (ocupacionExistenteId) {
        const conflictoInsertado = await ejecutor.query<{ id: string }>(
          `INSERT INTO conflicto_calendario (unidad_id, ocupacion_a_id, ocupacion_b_id, tipo)
           VALUES ($1, $2, $3, 'overbooking_confirmado')
           RETURNING id`,
          [entrada.unidadId, ocupacionExistenteId, ocupacionId],
        );
        conflicto = {
          tipo: "overbooking_confirmado",
          conflictoId: conflictoInsertado.rows[0]!.id,
          ocupacionExistenteId,
        };
        await ejecutor.query(
          `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
           VALUES ($1, 'alerta_overbooking', $2::jsonb)`,
          [ocupacionId, JSON.stringify({ conflicto })],
        );
      }

      // D-DSD-02: el conflicto reserva-vs-reserva (overbooking) no excluye
      // que ADEMÁS haya un solapamiento contra un bloqueo de menor
      // precedencia (capa cruzada) — se verifica siempre, no solo en la
      // rama de éxito.
      const conflictosCapaCruzada = await detectarYRegistrarConflictosCapaCruzada(
        ejecutor,
        entrada.unidadId,
        ocupacionId,
        entrada.rango,
      );

      await ejecutor.exec("COMMIT");
      return { ocupacionId, conflicto, conflictosCapaCruzada };
    }

    await ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'cerrar_disponibilidad', '{}'::jsonb)`,
      [ocupacionId],
    );

    // D-DSD-02: la reserva de canal se acepta SIEMPRE (el canal externo ya
    // la confirmó frente al huésped) incluso cuando solapa con un bloqueo
    // de propietario/mantenimiento/buffer ya existente; el solapamiento se
    // registra como conflicto de capa cruzada para revisión humana, nunca
    // como motivo de rechazo.
    const conflictosCapaCruzada = await detectarYRegistrarConflictosCapaCruzada(
      ejecutor,
      entrada.unidadId,
      ocupacionId,
      entrada.rango,
    );

    await ejecutor.exec("COMMIT");
    return { ocupacionId, conflicto: null, conflictosCapaCruzada };
  } catch (error) {
    await ejecutor.exec("ROLLBACK");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Crear bloqueo de propietario/mantenimiento/buffer (H-022, H-008)
// ---------------------------------------------------------------------------

export interface EntradaCrearBloqueo {
  unidadId: string;
  rango: RangoFechas;
  razon: Extract<Razon, "BLOQUEO_PROPIETARIO" | "MANTENIMIENTO" | "BUFFER_LIMPIEZA">;
}

export interface ResultadoCrearBloqueo {
  ocupacionId: string;
  /** Conflictos de capa cruzada detectados contra CUALQUIER otra fila
   * activa solapada (reserva u otro bloqueo) — el INSERT nunca es
   * rechazado por la base de datos (capa='bloqueo' no participa del
   * EXCLUDE), pero cada solape se registra explícitamente (D-002). */
  conflictosCapaCruzada: InfoConflicto[];
}

export async function crearBloqueo(
  ejecutor: EjecutorTransaccional,
  entrada: EntradaCrearBloqueo,
): Promise<ResultadoCrearBloqueo> {
  requireRangoValido(entrada.rango);

  await ejecutor.exec("BEGIN");
  try {
    await bloquearUnidadEnTransaccion(ejecutor, entrada.unidadId);
    const insertado = await ejecutor.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange($2, $3, '[)'), 'bloqueo', $4, 'confirmado', true)
       RETURNING id`,
      [entrada.unidadId, entrada.rango.inicio, entrada.rango.fin, entrada.razon],
    );
    const ocupacionId = insertado.rows[0]!.id;

    const solapadas = await ejecutor.query<{ id: string }>(
      `SELECT id FROM ocupacion_unidad
       WHERE unidad_id = $1 AND id <> $2 AND estado <> 'cancelado'
         AND rango && daterange($3, $4, '[)')`,
      [entrada.unidadId, ocupacionId, entrada.rango.inicio, entrada.rango.fin],
    );

    const conflictosCapaCruzada: InfoConflicto[] = [];
    for (const fila of solapadas.rows) {
      const conflictoInsertado = await ejecutor.query<{ id: string }>(
        `INSERT INTO conflicto_calendario (unidad_id, ocupacion_a_id, ocupacion_b_id, tipo)
         VALUES ($1, $2, $3, 'capa_cruzada')
         RETURNING id`,
        [entrada.unidadId, fila.id, ocupacionId],
      );
      const info: InfoConflicto = {
        tipo: "capa_cruzada",
        conflictoId: conflictoInsertado.rows[0]!.id,
        ocupacionExistenteId: fila.id,
      };
      conflictosCapaCruzada.push(info);
      await ejecutor.query(
        `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
         VALUES ($1, 'alerta_capa_cruzada', $2::jsonb)`,
        [ocupacionId, JSON.stringify({ conflicto: info })],
      );
    }

    await ejecutor.exec("COMMIT");
    return { ocupacionId, conflictosCapaCruzada };
  } catch (error) {
    await ejecutor.exec("ROLLBACK");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Cancelar (H-018): nunca reabre noches ocupadas por otra causa
// ---------------------------------------------------------------------------

export interface ResultadoCancelarOcupacion {
  estadoAnterior: EstadoOcupacion;
}

export async function cancelarOcupacion(
  ejecutor: EjecutorTransaccional,
  ocupacionId: string,
): Promise<ResultadoCancelarOcupacion> {
  await ejecutor.exec("BEGIN");
  try {
    const actual = await ejecutor.query<{ estado: EstadoOcupacion }>(
      `SELECT estado FROM ocupacion_unidad WHERE id = $1 FOR UPDATE`,
      [ocupacionId],
    );
    if (actual.rows.length === 0) {
      throw new Error(`ocupacion_unidad ${ocupacionId} no existe`);
    }
    const estadoAnterior = actual.rows[0]!.estado;
    if (!puedeTransicionar(estadoAnterior, "cancelado")) {
      throw new Error(
        `no se puede cancelar una ocupación en estado "${estadoAnterior}"`,
      );
    }

    await ejecutor.query(
      `UPDATE ocupacion_unidad SET estado = 'cancelado', actualizado_en = now() WHERE id = $1`,
      [ocupacionId],
    );
    // No hace falta "liberar" noches explícitamente: la disponibilidad se
    // deriva siempre por OR sobre filas activas (packages/domain/capas.ts,
    // estaOcupada). Si otra fila con estado<>'cancelado' cubre la misma
    // noche, seguirá contando como ocupada sin ningún cambio adicional
    // aquí — así se garantiza H-018 por construcción, no por un chequeo
    // ad-hoc que se pueda olvidar en un flujo futuro.
    await ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'liberar_disponibilidad', '{}'::jsonb)`,
      [ocupacionId],
    );

    await ejecutor.exec("COMMIT");
    return { estadoAnterior };
  } catch (error) {
    await ejecutor.exec("ROLLBACK");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Modificar fechas (H-019, H-020): ampliar/reducir/mover, atómico
// ---------------------------------------------------------------------------

export interface ResultadoModificarFechas {
  ocupacionId: string;
  rangoAnterior: RangoFechas;
  /** Rango efectivo tras la operación: igual a `rangoAnterior` si hubo
   * conflicto (la modificación se rechazó sin tocar la reserva). */
  rangoEfectivo: RangoFechas;
  conflicto: InfoConflicto | null;
  /** D-DSD-02: conflictos `capa_cruzada` contra bloqueos ya existentes
   * sobre el rango efectivo tras la operación. */
  conflictosCapaCruzada: InfoConflicto[];
}

export async function modificarFechasReserva(
  ejecutor: EjecutorTransaccional,
  ocupacionId: string,
  nuevoRango: RangoFechas,
): Promise<ResultadoModificarFechas> {
  requireRangoValido(nuevoRango);

  await ejecutor.exec("BEGIN");
  try {
    const unidadDeLaFila = await ejecutor.query<{ unidad_id: string }>(
      `SELECT unidad_id FROM ocupacion_unidad WHERE id = $1`,
      [ocupacionId],
    );
    if (unidadDeLaFila.rows.length === 0) {
      throw new Error(`ocupacion_unidad ${ocupacionId} no existe`);
    }
    // Mismo advisory lock que crearReservaConfirmada/crearBloqueo (D-012,
    // RV17 §7.4): evita que una modificación y una inserción concurrentes
    // sobre la misma unidad terminen en deadlock (40P01) en vez de un
    // exclusion_violation limpio (23P01).
    await bloquearUnidadEnTransaccion(ejecutor, unidadDeLaFila.rows[0]!.unidad_id);

    const actual = await ejecutor.query<{
      unidad_id: string;
      inicio: string;
      fin: string;
      capa: string;
    }>(
      `SELECT unidad_id, lower(rango)::text AS inicio, upper(rango)::text AS fin, capa
       FROM ocupacion_unidad WHERE id = $1 FOR UPDATE`,
      [ocupacionId],
    );
    if (actual.rows.length === 0) {
      throw new Error(`ocupacion_unidad ${ocupacionId} no existe`);
    }
    const fila = actual.rows[0]!;
    if (fila.capa !== "reserva") {
      throw new Error("modificarFechasReserva solo aplica a filas capa='reserva'");
    }
    const rangoAnterior: RangoFechas = { inicio: fila.inicio, fin: fila.fin };

    await ejecutor.exec("SAVEPOINT intento_actualizacion");
    try {
      await ejecutor.query(
        `UPDATE ocupacion_unidad
         SET rango = daterange($2, $3, '[)'), version = version + 1, actualizado_en = now()
         WHERE id = $1`,
        [ocupacionId, nuevoRango.inicio, nuevoRango.fin],
      );
    } catch (error) {
      if (!esViolacionExclusion(error)) throw error;

      // La reserva ajena que causa el conflicto NUNCA se cancela ni se
      // toca; tampoco se degrada la reserva que intentó moverse — se deja
      // exactamente en su rango/estado anterior (rollback del intento) y
      // solo se registra el conflicto para revisión humana (BLUEPRINT §4.4,
      // REQ-006).
      await ejecutor.exec("ROLLBACK TO SAVEPOINT intento_actualizacion");

      const existente = await ejecutor.query<{ id: string }>(
        `SELECT id FROM ocupacion_unidad
         WHERE unidad_id = $1 AND id <> $2 AND capa = 'reserva' AND estado <> 'cancelado' AND bloqueante
           AND rango && daterange($3, $4, '[)')
         LIMIT 1`,
        [fila.unidad_id, ocupacionId, nuevoRango.inicio, nuevoRango.fin],
      );
      const ocupacionExistenteId = existente.rows[0]?.id ?? null;

      let conflicto: InfoConflicto | null = null;
      if (ocupacionExistenteId) {
        const conflictoInsertado = await ejecutor.query<{ id: string }>(
          `INSERT INTO conflicto_calendario (unidad_id, ocupacion_a_id, ocupacion_b_id, tipo)
           VALUES ($1, $2, $3, 'overbooking_confirmado')
           RETURNING id`,
          [fila.unidad_id, ocupacionExistenteId, ocupacionId],
        );
        conflicto = {
          tipo: "overbooking_confirmado",
          conflictoId: conflictoInsertado.rows[0]!.id,
          ocupacionExistenteId,
        };
        await ejecutor.query(
          `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
           VALUES ($1, 'alerta_overbooking', $2::jsonb)`,
          [ocupacionId, JSON.stringify({ conflicto, intentoDeRango: nuevoRango })],
        );
      }

      // D-DSD-02: el rango efectivo, tras rechazar el intento de
      // modificación, sigue siendo `rangoAnterior` — se verifica capa
      // cruzada contra ESE rango (el que realmente sigue vigente), no
      // contra el rango rechazado.
      const conflictosCapaCruzada = await detectarYRegistrarConflictosCapaCruzada(
        ejecutor,
        fila.unidad_id,
        ocupacionId,
        rangoAnterior,
      );

      await ejecutor.exec("COMMIT");
      return { ocupacionId, rangoAnterior, rangoEfectivo: rangoAnterior, conflicto, conflictosCapaCruzada };
    }

    await ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'modificar_disponibilidad', $2::jsonb)`,
      [ocupacionId, JSON.stringify({ rangoAnterior, rangoNuevo: nuevoRango })],
    );

    // D-DSD-02: una ampliación/movimiento de fechas (BLUEPRINT §4.4) que
    // aterriza sobre un bloqueo de propietario/mantenimiento/buffer se
    // acepta igual (mismo criterio que crearReservaConfirmada) y se
    // registra como conflicto de capa cruzada.
    const conflictosCapaCruzada = await detectarYRegistrarConflictosCapaCruzada(
      ejecutor,
      fila.unidad_id,
      ocupacionId,
      nuevoRango,
    );

    await ejecutor.exec("COMMIT");
    return { ocupacionId, rangoAnterior, rangoEfectivo: nuevoRango, conflicto: null, conflictosCapaCruzada };
  } catch (error) {
    await ejecutor.exec("ROLLBACK");
    throw error;
  }
}
