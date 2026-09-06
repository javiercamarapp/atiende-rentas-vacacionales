import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEntornoAdversarial, type EntornoAdversarial } from "../sync/entorno.js";
// Import relativo directo al worker real de Lote 10 (apps/api no publica
// este subpath en su "exports" de package.json — a propósito, ver
// apps/api/package.json — así que se importa por ruta de archivo, nunca
// por el specifier "@atiende-rv/api", que solo expone "." y "./contrato").
// Reutiliza la implementación real, no una reimplementación de prueba:
// el objetivo del caso 16 a nivel worker es demostrar que el MISMO código
// que corre en producción sobrevive un crash a mitad de lote.
import {
  procesarPendientesOutbox,
  contarPendientesOutbox,
  type EventoOutboxPendiente,
} from "../../../apps/api/src/workers/observabilidad/outboxWorker.js";

/**
 * Caso adversarial 16 — crash/replay a mitad de batch, a nivel del WORKER
 * de outbox real (Lote 10, H-035/H-036), contra `embedded-postgres` real
 * (D-009/D-022) — complementa (no duplica) el caso 16 de
 * `tests/adversarial/sync/casos.test.ts`, que verifica el mismo invariante
 * a nivel del MOTOR de sincronización (reintentar un ciclo de import
 * completo). Aquí el "crash" es literal: el proceso muere DESPUÉS de que
 * el evento K ya hizo COMMIT y ANTES de que el K+1 confirme — reanudar
 * debe procesar exactamente los eventos restantes, sin duplicar ni perder
 * ninguno.
 */

let entorno: EntornoAdversarial;

beforeAll(async () => {
  entorno = await crearEntornoAdversarial("atiende_rv_adversarial_outbox");
}, 120_000);

afterAll(async () => {
  await entorno.cerrar();
});

async function encolarEventosDePrueba(n: number, prefijo: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const resultado = await entorno.motor.ejecutor.query<{ id: string }>(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload, creado_en)
       VALUES (NULL, $1, $2, now() + ($3 || ' milliseconds')::interval) RETURNING id`,
      [`${prefijo}_${i}`, JSON.stringify({ i }), String(i)],
    );
    ids.push(resultado.rows[0]!.id);
  }
  return ids;
}

describe("caso 16 (worker) — crash/replay a mitad de lote contra embedded-postgres real", () => {
  it("matar el worker real tras confirmar K eventos y reanudar procesa EXACTAMENTE los restantes, sin duplicar", async () => {
    const ids = await encolarEventosDePrueba(6, "worker16");
    const invocaciones: string[] = [];
    const K = 3;

    let contador = 0;
    await expect(
      procesarPendientesOutbox({
        ejecutor: entorno.motor.ejecutor,
        aplicarEfecto: async (evento: EventoOutboxPendiente) => {
          contador++;
          if (contador === K + 1) {
            throw new Error("crash simulado del proceso worker a mitad de lote");
          }
          invocaciones.push(evento.id);
        },
      }),
    ).rejects.toThrow("crash simulado");

    expect(invocaciones).toHaveLength(K);
    expect(await contarPendientesOutbox(entorno.motor.ejecutor)).toBe(6 - K);

    // "Reanudar el worker": nueva invocación, sin memoria de proceso —
    // solo la tabla ledger `outbox_evento_consumido_observabilidad`
    // decide qué falta.
    const reanudado = await procesarPendientesOutbox({
      ejecutor: entorno.motor.ejecutor,
      aplicarEfecto: async (evento: EventoOutboxPendiente) => {
        invocaciones.push(evento.id);
      },
    });

    expect(reanudado.procesados).toHaveLength(6 - K);
    expect(invocaciones).toHaveLength(6);
    expect(new Set(invocaciones).size).toBe(6); // CERO duplicados
    expect(new Set(invocaciones)).toEqual(new Set(ids));
    expect(await contarPendientesOutbox(entorno.motor.ejecutor)).toBe(0);

    console.log(
      `[CASO 16-WORKER] eventos_totales=6 crash_tras=${K} reanudados=${reanudado.procesados.length} ` +
        `duplicados=${invocaciones.length - new Set(invocaciones).size}`,
    );
  });

  it("reanudar un lote ya completamente consumido no vuelve a invocar aplicarEfecto (idempotencia del worker)", async () => {
    await encolarEventosDePrueba(2, "worker16-idem");
    let invocaciones = 0;
    await procesarPendientesOutbox({ ejecutor: entorno.motor.ejecutor, aplicarEfecto: async () => { invocaciones++; } });
    const pendientesTrasPrimera = await contarPendientesOutbox(entorno.motor.ejecutor);

    const segunda = await procesarPendientesOutbox({
      ejecutor: entorno.motor.ejecutor,
      aplicarEfecto: async () => { invocaciones++; },
    });

    expect(segunda.procesados).toHaveLength(0);
    expect(await contarPendientesOutbox(entorno.motor.ejecutor)).toBe(pendientesTrasPrimera);
  });
});
