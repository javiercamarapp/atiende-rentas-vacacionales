import type { EjecutorSql, FilaSql } from "@atiende-rv/db";
import type { RegistroMetricas } from "./metricas.js";
import type { Trazador } from "./otel.js";
import { resolverEtiquetasCanalCuentaPorOcupacion, type EtiquetasCanalCuenta } from "./latenciaCanalCuenta.js";

/**
 * Worker de replay idempotente del outbox (Lote 10, H-035/H-036). Lee
 * `outbox_evento` y aplica un efecto exactamente una vez por evento,
 * incluso si el proceso muere a mitad de un lote — ver
 * `test/observabilidad/outboxWorker.test.ts` (mata el worker entre el
 * evento K y K+1 de un lote de N, y confirma que reanudar procesa
 * exactamente los N-K restantes, sin repetir ninguno de los K ya hechos).
 *
 * Estrategia (documentada porque NO es "SELECT...FOR UPDATE SKIP LOCKED"
 * clásico): cada evento se procesa en su PROPIA transacción — se abre,
 * se invoca `aplicarEfecto` (que debe escribir SOLO a través del `tx`
 * recibido, o ser idempotente por sí mismo si toca algo externo), se deja
 * constancia en `outbox_evento_consumido_observabilidad` (PK =
 * outbox_evento_id, migración 0080) y se hace COMMIT — todo o nada. Un
 * crash entre el COMMIT del evento K y el inicio del K+1 no pierde ni
 * duplica nada: los eventos ya confirmados tienen su fila en el ledger
 * (se excluyen del siguiente `SELECT` de pendientes vía LEFT JOIN) y el
 * evento en vuelo en el momento del crash nunca llegó a hacer COMMIT, así
 * que reaparece como pendiente igual que si nunca se hubiera tocado.
 *
 * Límite conocido, documentado a propósito: esto asume UN solo worker
 * activo a la vez (sin `SKIP LOCKED` no hay protección contra dos workers
 * concurrentes tomando el mismo evento) — escalar horizontalmente
 * requeriría añadir eso, fuera del alcance mínimo de H-035/H-036.
 */

interface FilaOutboxPendiente extends FilaSql {
  id: string;
  ocupacion_unidad_id: string | null;
  tipo_evento: string;
  payload: unknown;
  creado_en: string;
}

export interface EventoOutboxPendiente {
  id: string;
  ocupacionUnidadId: string | null;
  tipoEvento: string;
  payload: unknown;
  creadoEn: string;
}

export type AplicarEfectoOutbox = (evento: EventoOutboxPendiente, tx: EjecutorSql) => Promise<void>;

export interface OpcionesProcesarPendientesOutbox {
  ejecutor: EjecutorSql;
  aplicarEfecto: AplicarEfectoOutbox;
  limite?: number;
  trazador?: Trazador;
  metricas?: RegistroMetricas;
  ahoraMs?: () => number;
}

export interface ResultadoProcesarLote {
  procesados: string[];
  omitidosYaConsumidos: number;
}

async function listarPendientes(ejecutor: EjecutorSql, limite: number): Promise<FilaOutboxPendiente[]> {
  const resultado = await ejecutor.query<FilaOutboxPendiente>(
    `SELECT oe.id, oe.ocupacion_unidad_id, oe.tipo_evento, oe.payload, oe.creado_en::text AS creado_en
     FROM outbox_evento oe
     LEFT JOIN outbox_evento_consumido_observabilidad c ON c.outbox_evento_id = oe.id
     WHERE c.outbox_evento_id IS NULL
     ORDER BY oe.creado_en, oe.id
     LIMIT $1`,
    [limite],
  );
  return resultado.rows;
}

/**
 * Procesa hasta `limite` eventos pendientes, uno por transacción. Segura
 * de llamar repetidamente (idempotente) — cada llamada solo ve lo que
 * sigue pendiente en ese momento.
 */
export async function procesarPendientesOutbox(
  opciones: OpcionesProcesarPendientesOutbox,
): Promise<ResultadoProcesarLote> {
  const { ejecutor, aplicarEfecto, trazador, metricas } = opciones;
  const limite = opciones.limite ?? 50;
  const ahoraMs = opciones.ahoraMs ?? (() => Date.now());

  const pendientes = await listarPendientes(ejecutor, limite);
  const procesados: string[] = [];
  let omitidosYaConsumidos = 0;

  for (const fila of pendientes) {
    const evento: EventoOutboxPendiente = {
      id: fila.id,
      ocupacionUnidadId: fila.ocupacion_unidad_id,
      tipoEvento: fila.tipo_evento,
      payload: fila.payload,
      creadoEn: fila.creado_en,
    };

    const span = trazador?.iniciarSpan("outbox.evento.aplicar", {
      kind: "CONSUMER",
      atributos: { outbox_evento_id: evento.id, tipo_evento: evento.tipoEvento },
    });

    await ejecutor.exec("BEGIN");
    try {
      // Re-chequeo DENTRO de la transacción: si otra llamada ya lo marcó
      // consumido entre el SELECT de arriba y este punto, se omite sin
      // aplicar el efecto una segunda vez.
      const yaConsumido = await ejecutor.query<{ outbox_evento_id: string }>(
        `SELECT outbox_evento_id FROM outbox_evento_consumido_observabilidad WHERE outbox_evento_id = $1`,
        [evento.id],
      );
      if (yaConsumido.rows.length > 0) {
        await ejecutor.exec("COMMIT");
        omitidosYaConsumidos++;
        span?.terminar();
        continue;
      }

      await aplicarEfecto(evento, ejecutor);

      const creadoEnMs = new Date(evento.creadoEn).getTime();
      const latenciaInternaMs = Math.max(0, ahoraMs() - creadoEnMs);

      await ejecutor.query(
        `INSERT INTO outbox_evento_consumido_observabilidad (outbox_evento_id, latencia_interna_ms)
         VALUES ($1, $2)
         ON CONFLICT (outbox_evento_id) DO NOTHING`,
        [evento.id, Math.round(latenciaInternaMs)],
      );

      await ejecutor.exec("COMMIT");

      if (metricas) {
        // H-073: además de `tipo_evento`, se intenta etiquetar por canal/
        // cuenta de canal (fuera de la transacción ya confirmada — un
        // fallo aquí nunca debe deshacer el efecto ya aplicado, así que
        // se degrada a "sin etiqueta extra" en vez de propagar el error).
        let etiquetasCanalCuenta: EtiquetasCanalCuenta = {};
        if (evento.ocupacionUnidadId) {
          try {
            etiquetasCanalCuenta = await resolverEtiquetasCanalCuentaPorOcupacion(ejecutor, evento.ocupacionUnidadId);
          } catch {
            etiquetasCanalCuenta = {};
          }
        }
        metricas.latenciaInternaMs.observar(latenciaInternaMs, {
          tipo_evento: evento.tipoEvento,
          ...etiquetasCanalCuenta,
        });
      }
      procesados.push(evento.id);
      span?.terminar();
    } catch (error) {
      await ejecutor.exec("ROLLBACK");
      span?.terminar({ error });
      throw error;
    }
  }

  if (metricas) {
    metricas.colaOutbox.set(await contarPendientesOutbox(ejecutor));
  }

  return { procesados, omitidosYaConsumidos };
}

/** Tamaño actual de la cola pendiente (para `/health/detallado` y para el
 * gauge de alertas `outbox_atascada`) — cuenta exacta, no aproximada. */
export async function contarPendientesOutbox(ejecutor: EjecutorSql): Promise<number> {
  const resultado = await ejecutor.query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM outbox_evento oe
     LEFT JOIN outbox_evento_consumido_observabilidad c ON c.outbox_evento_id = oe.id
     WHERE c.outbox_evento_id IS NULL`,
  );
  return Number(resultado.rows[0]?.n ?? "0");
}

/** Antigüedad (ms) del evento pendiente más viejo — insumo directo de la
 * alerta `outbox_atascada` (H-037). `null` si no hay pendientes. */
export async function edadPendienteMasViejoMs(ejecutor: EjecutorSql, ahoraMs = Date.now()): Promise<number | null> {
  const resultado = await ejecutor.query<{ creado_en: string }>(
    `SELECT oe.creado_en::text AS creado_en
     FROM outbox_evento oe
     LEFT JOIN outbox_evento_consumido_observabilidad c ON c.outbox_evento_id = oe.id
     WHERE c.outbox_evento_id IS NULL
     ORDER BY oe.creado_en
     LIMIT 1`,
  );
  const fila = resultado.rows[0];
  if (!fila) return null;
  return Math.max(0, ahoraMs - new Date(fila.creado_en).getTime());
}
