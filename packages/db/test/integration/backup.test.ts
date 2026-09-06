import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOGO_FLAGS_POR_DEFECTO, FLAG_SYNC_PUSH_AUTOMATICO, RegistroFlags } from "@atiende-rv/domain";
import { crearMotorEmbeddedPostgres, type MotorEmbeddedPostgres } from "../../src/runner/motorEmbeddedPostgres.js";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";
import { exportarBackupLogico } from "../../backup/exportar.js";
import { verificarIntegridad } from "../../backup/integridad.js";
import { confirmarReconciliacionYReactivarPush, recuperarDesdeBackup } from "../../backup/recuperacion.js";

/**
 * Backup/restauración contra DOS clusters `embedded-postgres` REALES y
 * aislados (§Operación-3, entregable verificable de Lote 10 en
 * LOTES.md: "una restauración de backup en un entorno aislado pasa las
 * verificaciones mínimas de integridad y dispara automáticamente la
 * reconciliación de drift antes de permitir push automático"). El origen
 * simula el primario de producción; el destino es la instancia aislada
 * donde se practica la restauración — nunca se restaura sobre el primario.
 */

let origen: MotorEmbeddedPostgres;
let destino: MotorEmbeddedPostgres;
let tenantId: string;
let ocupacionId: string;

beforeAll(async () => {
  origen = await crearMotorEmbeddedPostgres("atiende_rv_backup_origen");
  destino = await crearMotorEmbeddedPostgres("atiende_rv_backup_destino");
  await aplicarMigraciones(origen.ejecutor, migraciones);
  await aplicarMigraciones(destino.ejecutor, migraciones);

  const tenant = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant backup real') RETURNING id`,
  );
  tenantId = tenant.rows[0]!.id;
  const propiedad = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop backup', 'America/Mexico_City') RETURNING id`,
    [tenantId],
  );
  const unidad = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad backup') RETURNING id`,
    [propiedad.rows[0]!.id],
  );
  const ocupacion = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2026-11-01','2026-11-06','[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
     RETURNING id`,
    [unidad.rows[0]!.id],
  );
  ocupacionId = ocupacion.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await origen.cerrar();
  await destino.cerrar();
});

describe("Backup lógico + restauración en instancia aislada (H-086/H-087, §Operación-3)", () => {
  it("restaura en un cluster embedded-postgres AISLADO distinto del origen y pasa integridad (conteos, EXCLUDE, reserva recuperable)", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor);
    expect(backup.tablas.length).toBeGreaterThan(10);

    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const reporte = await recuperarDesdeBackup(destino.ejecutor, backup, {
      registroFlags,
      actor: "sistema-restore",
      idsOcupacionAVerificar: [ocupacionId],
    });

    expect(reporte.integridad.conteosOk).toBe(true);
    expect(reporte.integridad.excludePresente).toBe(true);
    expect(reporte.integridad.idsRecuperablesVerificados).toEqual([ocupacionId]);
    expect(reporte.integridad.ok).toBe(true);

    // El EXCLUDE restaurado sigue siendo una restricción REAL contra
    // embedded-postgres: un segundo rango solapado sobre la misma unidad
    // en el destino restaurado debe seguir siendo rechazado con 23P01.
    const unidadRestaurada = await destino.ejecutor.query<{ unidad_id: string }>(
      `SELECT unidad_id FROM ocupacion_unidad WHERE id = $1`,
      [ocupacionId],
    );
    await expect(
      destino.ejecutor.query(
        `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
         VALUES ($1, daterange('2026-11-03','2026-11-04','[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
        [unidadRestaurada.rows[0]!.unidad_id],
      ),
    ).rejects.toMatchObject({ code: "23P01" });

    // §Operación-3: push automático queda bloqueado hasta reconciliar.
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);
  }, 120_000);

  it("la reconciliación de drift se dispara antes de permitir push automático, y el flag solo se reactiva tras confirmarla sin drift", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor);
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const llamadasReconciliacion: string[] = [];

    const reporte = await recuperarDesdeBackup(destino.ejecutor, backup, {
      registroFlags,
      actor: "sistema-restore",
      idsOcupacionAVerificar: [ocupacionId],
      feeds: [{ canalId: "canal-airbnb-demo", unidadId: "unidad-demo" }],
      reconciliarFeed: async (feed) => {
        llamadasReconciliacion.push(`${feed.canalId}/${feed.unidadId}`);
        return { ...feed, sinDrift: true };
      },
    });

    expect(llamadasReconciliacion).toEqual(["canal-airbnb-demo/unidad-demo"]);
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);

    confirmarReconciliacionYReactivarPush(registroFlags, reporte, "operador-oncall");
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);

    const auditoria = registroFlags.auditoria(FLAG_SYNC_PUSH_AUTOMATICO);
    expect(auditoria.map((a) => a.motivo).some((m) => m.includes("restauracion_backup"))).toBe(true);
    expect(auditoria.map((a) => a.motivo).some((m) => m.includes("reconciliacion_confirmada"))).toBe(true);
  }, 120_000);

  it("verificarIntegridad falla explícitamente si el destino no corrió las migraciones (esquema ausente)", async () => {
    const motorSinMigrar = await crearMotorEmbeddedPostgres("atiende_rv_backup_sin_migrar");
    try {
      const backup = await exportarBackupLogico(origen.ejecutor, { tablas: ["tenant"] });
      await expect(verificarIntegridad(motorSinMigrar.ejecutor, backup)).rejects.toThrow();
    } finally {
      await motorSinMigrar.cerrar();
    }
  }, 120_000);
});
