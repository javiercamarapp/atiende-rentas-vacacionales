import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aplicarMigraciones, crearMotorPglite, migraciones } from "@atiende-rv/db";
import { procesarPendientesOutbox } from "../../src/workers/observabilidad/outboxWorker.js";
import { aplicarEfectoOutboxProduccion } from "../../src/workers/observabilidad/efectosOutbox.js";

/**
 * `aplicarEfectoOutboxProduccion` (el `aplicarEfecto` REAL que
 * `GET /internal/cron/outbox-worker` conecta al motor idempotente de
 * `outboxWorker.ts`, huérfano hasta ahora): materializa
 * `alerta_capa_cruzada`/`alerta_overbooking` en una fila real de
 * `alerta` (tipo `conflicto_pendiente`) y trata cualquier otro
 * `tipo_evento` como no-op (esos ya tienen su propio consumidor
 * dedicado — ver la cabecera de `efectosOutbox.ts`).
 *
 * Corre contra PGlite con el esquema real (mismo criterio que
 * `outboxWorker.test.ts`) — sin RLS/roles (PGlite no simula `app_rv`), lo
 * cual es correcto aquí: esta suite prueba el EFECTO en sí, no la sesión
 * RLS que lo protege en producción (esa se prueba contra Postgres real
 * en `test/integration/cronLimpiezaCheckoutRls.test.ts`, mismo patrón que
 * ya usa `cronSyncRls.test.ts` para `cronSync.ts`).
 */

let motor: Awaited<ReturnType<typeof crearMotorPglite>>;
let tenantId: string;
let propiedadId: string;
let unidadId: string;

beforeEach(async () => {
  motor = await crearMotorPglite();
  await aplicarMigraciones(motor.ejecutor, migraciones);

  const tenant = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant efectosOutbox') RETURNING id`,
  );
  tenantId = tenant.rows[0]!.id;
  const propiedad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Propiedad', 'America/Mexico_City') RETURNING id`,
    [tenantId],
  );
  propiedadId = propiedad.rows[0]!.id;
  const unidad = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad 1') RETURNING id`,
    [propiedadId],
  );
  unidadId = unidad.rows[0]!.id;
});

afterEach(async () => {
  await motor.cerrar();
});

async function crearOcupacion(inicio: string, fin: string): Promise<string> {
  const resultado = await motor.ejecutor.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon)
     VALUES ($1, daterange($2::date, $3::date, '[)'), 'reserva', 'RESERVA_CANAL')
     RETURNING id`,
    [unidadId, inicio, fin],
  );
  return resultado.rows[0]!.id;
}

interface FilaAlerta {
  tipo: string;
  severidad: string;
  unidad_id: string | null;
  mensaje: string;
  metadata: unknown;
}

describe("aplicarEfectoOutboxProduccion — materializa alertas de conflicto huérfanas", () => {
  it("convierte un evento alerta_capa_cruzada en una fila de alerta tipo conflicto_pendiente", async () => {
    const ocupacionId = await crearOcupacion("2026-01-01", "2026-01-05");
    await motor.ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'alerta_capa_cruzada', $2::jsonb)`,
      [ocupacionId, JSON.stringify({ conflicto: { tipo: "capa_cruzada", conflictoId: "c1" } })],
    );

    const resultado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: aplicarEfectoOutboxProduccion,
    });
    expect(resultado.procesados).toHaveLength(1);

    const alertas = await motor.ejecutor.query<FilaAlerta>(`SELECT tipo, severidad, unidad_id, mensaje, metadata FROM alerta`);
    expect(alertas.rows).toHaveLength(1);
    expect(alertas.rows[0]!.tipo).toBe("conflicto_pendiente");
    expect(alertas.rows[0]!.severidad).toBe("media");
    expect(alertas.rows[0]!.unidad_id).toBe(unidadId);
    const metadata = alertas.rows[0]!.metadata as { tipoEventoOrigen: string };
    expect(metadata.tipoEventoOrigen).toBe("alerta_capa_cruzada");
  });

  it("convierte un evento alerta_overbooking en una alerta de severidad alta", async () => {
    const ocupacionId = await crearOcupacion("2026-02-01", "2026-02-05");
    await motor.ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'alerta_overbooking', '{}'::jsonb)`,
      [ocupacionId],
    );

    await procesarPendientesOutbox({ ejecutor: motor.ejecutor, aplicarEfecto: aplicarEfectoOutboxProduccion });

    const alertas = await motor.ejecutor.query<FilaAlerta>(`SELECT tipo, severidad FROM alerta`);
    expect(alertas.rows).toHaveLength(1);
    expect(alertas.rows[0]!.tipo).toBe("conflicto_pendiente");
    expect(alertas.rows[0]!.severidad).toBe("alta");
  });

  it("NO genera ninguna alerta para tipos de evento con su propio consumidor dedicado (checkout)", async () => {
    const ocupacionId = await crearOcupacion("2026-03-01", "2026-03-05");
    for (const tipoEvento of ["cerrar_disponibilidad", "modificar_disponibilidad", "liberar_disponibilidad"]) {
      await motor.ejecutor.query(
        `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload) VALUES ($1, $2, '{}'::jsonb)`,
        [ocupacionId, tipoEvento],
      );
    }
    await motor.ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload) VALUES (NULL, 'sync_manual_solicitado', '{}'::jsonb)`,
    );

    const resultado = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: aplicarEfectoOutboxProduccion,
    });
    // Los 4 eventos se marcan consumidos (ledger propio de este worker),
    // aunque ninguno produjo una fila de alerta.
    expect(resultado.procesados).toHaveLength(4);

    const alertas = await motor.ejecutor.query(`SELECT 1 FROM alerta`);
    expect(alertas.rows).toHaveLength(0);
  });

  it("es idempotente: una segunda corrida no duplica la alerta ya materializada", async () => {
    const ocupacionId = await crearOcupacion("2026-04-01", "2026-04-05");
    await motor.ejecutor.query(
      `INSERT INTO outbox_evento (ocupacion_unidad_id, tipo_evento, payload)
       VALUES ($1, 'alerta_capa_cruzada', '{}'::jsonb)`,
      [ocupacionId],
    );

    await procesarPendientesOutbox({ ejecutor: motor.ejecutor, aplicarEfecto: aplicarEfectoOutboxProduccion });
    const segunda = await procesarPendientesOutbox({
      ejecutor: motor.ejecutor,
      aplicarEfecto: aplicarEfectoOutboxProduccion,
    });
    expect(segunda.procesados).toHaveLength(0);

    const alertas = await motor.ejecutor.query(`SELECT 1 FROM alerta`);
    expect(alertas.rows).toHaveLength(1);
  });
});
