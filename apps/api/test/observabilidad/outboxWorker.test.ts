import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, crearMotorPglite, migraciones } from "@atiende-rv/db";
import {
  contarPendientesOutbox,
  edadPendienteMasViejoMs,
  procesarPendientesOutbox,
  type EventoOutboxPendiente,
} from "../../src/workers/observabilidad/outboxWorker.js";
import { RegistroMetricas } from "../../src/workers/observabilidad/metricas.js";

/**
 * Entregable verificable de Lote 10 (LOTES.md): "matar el worker a mitad
 * de lote y reanudar sin duplicar efectos". Se simula un crash lanzando
 * una excepción DESPUÉS de que el evento K ya hizo COMMIT — la
 * transacción del evento K+1 nunca llega a confirmarse, así que el
 * segundo `procesarPendientesOutbox` (equivalente a "reanudar el
 * worker") debe procesar EXACTAMENTE los eventos restantes, sin repetir
 * ninguno de los ya confirmados.
 */

let motor: Awaited<ReturnType<typeof crearMotorPglite>>;

async function encolarEventos(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    // `creado_en` explícito con offset creciente: la resolución del reloj
    // en corridas rápidas de PGlite no garantiza timestamps distintos
    // entre inserciones sucesivas en el mismo milisegundo — esto hace el
    // orden FIFO determinista y verificable sin depender de esa
    // resolución.
    const resultado = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload, creado_en)
       VALUES (NULL, $1, $2, now() + ($3 || ' milliseconds')::interval) RETURNING id`,
      [`evento_${i}`, JSON.stringify({ i }), String(i)],
    );
    ids.push(resultado.rows[0]!.id);
  }
  return ids;
}

beforeEach(async () => {
  motor = await crearMotorPglite();
  await aplicarMigraciones(motor.ejecutor, migraciones);
});

afterEach(async () => {
  await motor.cerrar();
});

describe("procesarPendientesOutbox — replay idempotente tras crash a mitad de lote", () => {
  it("procesa todos los eventos exactamente una vez en una corrida sin fallos", async () => {
    await encolarEventos(5);
    const invocaciones: string[] = [];
    const resultado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: async (evento) => {
        invocaciones.push(evento.id);
      },
    });
    expect(resultado.procesados).toHaveLength(5);
    expect(invocaciones).toHaveLength(5);
    expect(new Set(invocaciones).size).toBe(5); // sin duplicados.
    expect(await contarPendientesOutbox(motor.ejecutor)).toBe(0);
  });

  it("matar el worker a mitad de lote y reanudar NO duplica ni pierde efectos", async () => {
    const ids = await encolarEventos(6);
    const invocaciones: string[] = [];
    const K = 3; // el worker "muere" justo después de confirmar el evento K-ésimo.

    const aplicarEfectoConCrashSimulado = async (evento: EventoOutboxPendiente) => {
      invocaciones.push(evento.id);
    };

    // Primera corrida: dejamos que procese K eventos y forzamos un error
    // ANTES de que el K+1 haga COMMIT (simula el proceso muriendo a mitad
    // de la transacción del evento K+1 — esa transacción hace ROLLBACK).
    let contador = 0;
    try {
      await procesarPendientesOutbox({
        ejecutor: motor.ejecutor,
        aplicarEfecto: async (evento, tx) => {
          contador++;
          if (contador === K + 1) {
            throw new Error("crash simulado del proceso a mitad de lote");
          }
          await aplicarEfectoConCrashSimulado(evento);
          void tx;
        },
      });
      throw new Error("se esperaba que procesarPendientesOutbox lanzara por el crash simulado");
    } catch (error) {
      expect((error as Error).message).toContain("crash simulado");
    }

    // Tras el "crash": exactamente K eventos quedaron confirmados
    // (procesado + ledger), el resto sigue pendiente.
    expect(invocaciones).toHaveLength(K);
    expect(await contarPendientesOutbox(motor.ejecutor)).toBe(6 - K);

    // "Reanudar el worker": nueva llamada, sin memoria de la anterior más
    // que el estado en BD (misma conexión aquí, pero el algoritmo no
    // depende de estado en memoria del proceso — solo de la tabla ledger).
    const resultadoReanudado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: aplicarEfectoConCrashSimulado,
    });

    expect(resultadoReanudado.procesados).toHaveLength(6 - K);
    expect(invocaciones).toHaveLength(6); // K de la primera corrida + (6-K) de la segunda.
    expect(new Set(invocaciones).size).toBe(6); // CERO duplicados de principio a fin.
    expect(new Set(invocaciones)).toEqual(new Set(ids));
    expect(await contarPendientesOutbox(motor.ejecutor)).toBe(0);
  });

  it("una segunda llamada sobre un lote ya completamente procesado no vuelve a invocar aplicarEfecto", async () => {
    await encolarEventos(3);
    let invocaciones = 0;
    await procesarPendientesOutbox({ ejecutor: motor.ejecutor, aplicarEfecto: async () => { invocaciones++; } });
    expect(invocaciones).toBe(3);

    const segunda = await procesarPendientesOutbox({ ejecutor: motor.ejecutor, aplicarEfecto: async () => { invocaciones++; } });
    expect(segunda.procesados).toHaveLength(0);
    expect(invocaciones).toBe(3); // sin cambios — nada quedó pendiente.
  });

  it("respeta el orden FIFO por creado_en y el límite del lote", async () => {
    const ids = await encolarEventos(10);
    const invocaciones: string[] = [];
    const resultado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: async (evento) => {
        invocaciones.push(evento.id);
      },
      limite: 4,
    });
    expect(resultado.procesados).toHaveLength(4);
    expect(invocaciones).toEqual(ids.slice(0, 4));
    expect(await contarPendientesOutbox(motor.ejecutor)).toBe(6);
  });

  it("registra la latencia interna (evento→efecto aplicado) en el histograma de métricas", async () => {
    await encolarEventos(1);
    const metricas = new RegistroMetricas();
    await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: async () => undefined,
      metricas,
      ahoraMs: () => Date.now() + 5000, // fuerza una latencia medible y determinista.
    });
    const [resumen] = metricas.latenciaInternaMs.snapshot();
    expect(resumen!.cuenta).toBe(1);
    expect(resumen!.min).toBeGreaterThanOrEqual(4000);
  });

  it("H-073: cuando el evento SÍ tiene ocupacion_unidad_id resoluble, la latencia interna queda etiquetada con canal y cuenta_canal_id (no solo tipo_evento)", async () => {
    const tenant = await motor.ejecutor.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T') RETURNING id");
    const propiedad = await motor.ejecutor.query<{ id: string }>(
      "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'P', 'America/Cancun') RETURNING id",
      [tenant.rows[0]!.id],
    );
    const unidad = await motor.ejecutor.query<{ id: string }>(
      "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'U1') RETURNING id",
      [propiedad.rows[0]!.id],
    );
    const canal = await motor.ejecutor.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
    const canalId = canal.rows[0]!.id;
    const cuenta = await motor.ejecutor.query<{ id: string }>(
      "INSERT INTO cuenta_canal (tenant_id, canal_id, nombre) VALUES ($1, $2, 'Cuenta 1') RETURNING id",
      [tenant.rows[0]!.id, canalId],
    );
    await motor.ejecutor.query("INSERT INTO unidad_canal_feed (unidad_id, canal_id, cuenta_canal_id) VALUES ($1, $2, $3)", [
      unidad.rows[0]!.id,
      canalId,
      cuenta.rows[0]!.id,
    ]);
    const ocupacion = await motor.ejecutor.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, canal_origen_id)
       VALUES ($1, daterange('2026-02-01', '2026-02-05', '[)'), 'reserva', 'RESERVA_CANAL', $2) RETURNING id`,
      [unidad.rows[0]!.id, canalId],
    );
    await motor.ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload, creado_en) VALUES ($1, 'cerrar_disponibilidad', '{}', now())`,
      [ocupacion.rows[0]!.id],
    );

    const metricas = new RegistroMetricas();
    await procesarPendientesOutbox({ ejecutor: motor.ejecutor, aplicarEfecto: async () => undefined, metricas });

    const [resumen] = metricas.latenciaInternaMs.snapshot();
    expect(resumen!.labels).toMatchObject({ tipo_evento: "cerrar_disponibilidad", canal: "airbnb", cuenta_canal_id: cuenta.rows[0]!.id });
  });

  it("actualiza el gauge de tamaño de cola a partir de un COUNT(*) real, no de un contador acumulado", async () => {
    await encolarEventos(4);
    const metricas = new RegistroMetricas();
    await procesarPendientesOutbox({ ejecutor: motor.ejecutor, aplicarEfecto: async () => undefined, limite: 2, metricas });
    expect(metricas.colaOutbox.obtener()).toBe(2);
  });

  it("edadPendienteMasViejoMs devuelve null sin pendientes y la antigüedad correcta con pendientes", async () => {
    expect(await edadPendienteMasViejoMs(motor.ejecutor)).toBeNull();
    await encolarEventos(1);
    const edad = await edadPendienteMasViejoMs(motor.ejecutor, Date.now() + 10_000);
    expect(edad).toBeGreaterThanOrEqual(9000);
  });

  it("si aplicarEfecto lanza, el evento NO queda marcado como consumido (vuelve a intentarse después)", async () => {
    await encolarEventos(1);
    let intentos = 0;
    await expect(
      procesarPendientesOutbox({
        ejecutor: motor.ejecutor,
        aplicarEfecto: async () => {
          intentos++;
          throw new Error("efecto falló");
        },
      }),
    ).rejects.toThrow("efecto falló");
    expect(await contarPendientesOutbox(motor.ejecutor)).toBe(1);

    // Reintento posterior sí lo procesa.
    const resultado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: async () => {
        intentos++;
      },
    });
    expect(resultado.procesados).toHaveLength(1);
    expect(intentos).toBe(2);
  });
});

describe("procesarPendientesOutbox — pausadoPorModoDegradado (H-091/REQ-166, §Operación-3)", () => {
  it("con pushAutomaticoHabilitado=false NO procesa ningún evento pendiente, aunque haya pendientes reales en la tabla", async () => {
    await encolarEventos(3);
    let invocaciones = 0;

    const resultado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: async () => {
        invocaciones++;
      },
      pushAutomaticoHabilitado: false,
    });

    expect(resultado).toEqual({ procesados: [], omitidosYaConsumidos: 0, pausadoPorModoDegradado: true });
    expect(invocaciones).toBe(0);
    // Los 3 eventos siguen pendientes de verdad — la pausa nunca los
    // marca como consumidos ni los descarta, solo difiere su procesamiento.
    expect(await contarPendientesOutbox(motor.ejecutor)).toBe(3);
  });

  it("sin pushAutomaticoHabilitado (u omitido/true) procesa normalmente — comportamiento IDÉNTICO al de antes de H-091", async () => {
    await encolarEventos(2);
    const invocados: string[] = [];

    const resultado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: async (evento) => {
        invocados.push(evento.id);
      },
      pushAutomaticoHabilitado: true,
    });

    expect(resultado.procesados).toHaveLength(2);
    expect(resultado.pausadoPorModoDegradado).toBeUndefined();
    expect(invocados).toHaveLength(2);
    expect(await contarPendientesOutbox(motor.ejecutor)).toBe(0);
  });
});
