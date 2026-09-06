import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CATALOGO_FLAGS_POR_DEFECTO, FLAG_SYNC_PUSH_AUTOMATICO, RegistroFlags } from "@atiende-rv/domain";
import { crearMotorPglite } from "../../src/runner/motorPglite.js";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";
import { exportarBackupLogico, ordenTopologicoTablas } from "../../backup/exportar.js";
import { restaurarBackupLogico } from "../../backup/restaurar.js";
import { verificarIntegridad } from "../../backup/integridad.js";
import { confirmarReconciliacionYReactivarPush, recuperarDesdeBackup } from "../../backup/recuperacion.js";

/**
 * Backup/restore usando PGlite (unitario, D-022: sin necesidad de
 * concurrencia real de embedded-postgres para probar la lógica de
 * export/import/integridad/flags). El caso con `embedded-postgres` real
 * (dos clusters aislados, EXCLUDE verificado literalmente vía
 * `pg_constraint`) vive en `test/integration/backup.test.ts`.
 */

let origen: Awaited<ReturnType<typeof crearMotorPglite>>;
let destino: Awaited<ReturnType<typeof crearMotorPglite>>;
let tenantId: string;
let ocupacionId: string;

beforeEach(async () => {
  origen = await crearMotorPglite();
  destino = await crearMotorPglite();
  await aplicarMigraciones(origen.ejecutor, migraciones);
  await aplicarMigraciones(destino.ejecutor, migraciones);

  const tenant = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO tenant (nombre) VALUES ('Tenant backup') RETURNING id`,
  );
  tenantId = tenant.rows[0]!.id;
  const propiedad = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop 1', 'America/Mexico_City') RETURNING id`,
    [tenantId],
  );
  const unidad = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad 1') RETURNING id`,
    [propiedad.rows[0]!.id],
  );
  const ocupacion = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2026-10-01','2026-10-05','[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
     RETURNING id`,
    [unidad.rows[0]!.id],
  );
  ocupacionId = ocupacion.rows[0]!.id;
});

afterEach(async () => {
  await origen.cerrar();
  await destino.cerrar();
});

describe("ordenTopologicoTablas", () => {
  it("ordena tablas dependientes después de sus padres", () => {
    const orden = ordenTopologicoTablas(
      ["unidad", "propiedad", "tenant"],
      [
        ["unidad", "propiedad"],
        ["propiedad", "tenant"],
      ],
    );
    expect(orden.indexOf("tenant")).toBeLessThan(orden.indexOf("propiedad"));
    expect(orden.indexOf("propiedad")).toBeLessThan(orden.indexOf("unidad"));
  });
});

describe("exportarBackupLogico / restaurarBackupLogico (H-086)", () => {
  it("exporta el esquema real y el destino termina con los mismos conteos por tabla", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor);
    expect(backup.tablas.length).toBeGreaterThan(0);

    const tablaOcupacion = backup.tablas.find((t) => t.nombre === "ocupacion_unidad");
    expect(tablaOcupacion?.filas).toHaveLength(1);

    await restaurarBackupLogico(destino.ejecutor, backup);

    for (const tabla of backup.tablas) {
      const resultado = await destino.ejecutor.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${tabla.nombre}"`);
      expect(Number(resultado.rows[0]!.n)).toBe(tabla.filas.length);
    }
  });

  it("preserva el rango daterange y los booleans exactamente (round-trip de tipos)", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor);
    await restaurarBackupLogico(destino.ejecutor, backup);

    const fila = await destino.ejecutor.query<{ rango: string; bloqueante: boolean }>(
      `SELECT rango::text, bloqueante FROM ocupacion_unidad WHERE id = $1`,
      [ocupacionId],
    );
    expect(fila.rows[0]!.bloqueante).toBe(true);
    expect(fila.rows[0]!.rango).toContain("2026-10-01");
  });

  it("verificarIntegridad detecta el EXCLUDE de ocupacion_unidad tras restaurar", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor);
    await restaurarBackupLogico(destino.ejecutor, backup);
    const reporte = await verificarIntegridad(destino.ejecutor, backup, { idsOcupacionAVerificar: [ocupacionId] });
    expect(reporte.excludePresente).toBe(true);
    expect(reporte.idsRecuperablesVerificados).toEqual([ocupacionId]);
    expect(reporte.idsFaltantes).toEqual([]);
    expect(reporte.ok).toBe(true);
  });

  it("verificarIntegridad marca discrepancia si el destino no coincide en conteo", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor);
    // Restauración deliberadamente incompleta: solo insertamos una parte.
    await destino.ejecutor.exec(
      `INSERT INTO tenant (id, nombre) VALUES (gen_random_uuid(), 'Otro tenant no relacionado')`,
    );
    const reporte = await verificarIntegridad(destino.ejecutor, backup);
    expect(reporte.conteosOk).toBe(false);
    expect(reporte.ok).toBe(false);
  });

  it("una tabla vacía se exporta y se restaura sin error", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor, { tablas: ["huesped_minimo"] });
    expect(backup.tablas[0]!.filas).toEqual([]);
    const reporte = await restaurarBackupLogico(destino.ejecutor, backup);
    expect(reporte.filasInsertadasPorTabla.huesped_minimo).toBe(0);
  });
});

describe("recuperarDesdeBackup / confirmarReconciliacionYReactivarPush (H-087, flag sync.push_automatico)", () => {
  it("tras un restore exitoso, push_automatico queda desactivado hasta reconciliar", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);

    const backup = await exportarBackupLogico(origen.ejecutor);
    const reporte = await recuperarDesdeBackup(destino.ejecutor, backup, {
      registroFlags,
      actor: "sistema-restore",
      idsOcupacionAVerificar: [ocupacionId],
    });

    expect(reporte.integridad.ok).toBe(true);
    expect(reporte.pushAutomaticoDesactivado).toBe(true);
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);
    expect(reporte.pushAutomaticoReactivado).toBe(false);
  });

  it("no reactiva el flag si no se pasó ningún feed a reconciliar", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const backup = await exportarBackupLogico(origen.ejecutor);
    const reporte = await recuperarDesdeBackup(destino.ejecutor, backup, { registroFlags, actor: "sistema" });

    expect(() => confirmarReconciliacionYReactivarPush(registroFlags, reporte, "operador")).toThrow(
      /No se puede reactivar/,
    );
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);
  });

  it("no reactiva el flag si algún feed reconciliado reporta drift", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const backup = await exportarBackupLogico(origen.ejecutor);
    const reporte = await recuperarDesdeBackup(destino.ejecutor, backup, {
      registroFlags,
      actor: "sistema",
      feeds: [{ canalId: "c1", unidadId: "u1" }],
      reconciliarFeed: async (feed) => ({ ...feed, sinDrift: false, detalle: "drift detectado" }),
    });

    expect(() => confirmarReconciliacionYReactivarPush(registroFlags, reporte, "operador")).toThrow(
      /No se puede reactivar/,
    );
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);
  });

  it("reactiva el flag SOLO cuando todos los feeds reconciliados están sin drift", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const backup = await exportarBackupLogico(origen.ejecutor);
    const reporte = await recuperarDesdeBackup(destino.ejecutor, backup, {
      registroFlags,
      actor: "sistema",
      feeds: [
        { canalId: "c1", unidadId: "u1" },
        { canalId: "c2", unidadId: "u1" },
      ],
      reconciliarFeed: async (feed) => ({ ...feed, sinDrift: true }),
    });

    confirmarReconciliacionYReactivarPush(registroFlags, reporte, "operador");

    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);
    expect(reporte.pushAutomaticoReactivado).toBe(true);
    const auditoria = registroFlags.auditoria(FLAG_SYNC_PUSH_AUTOMATICO);
    expect(auditoria).toHaveLength(2); // desactivación por restore + reactivación confirmada
  });

  it("NO toca el flag si la integridad falla (reserva de prueba esperada no aparece tras el restore)", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);

    const backup = await exportarBackupLogico(origen.ejecutor);
    const idInexistente = "00000000-0000-0000-0000-000000000000";
    const reporte = await recuperarDesdeBackup(destino.ejecutor, backup, {
      registroFlags,
      actor: "sistema",
      idsOcupacionAVerificar: [idInexistente],
    });

    expect(reporte.integridad.ok).toBe(false);
    expect(reporte.integridad.idsFaltantes).toEqual([idInexistente]);
    expect(reporte.pushAutomaticoDesactivado).toBe(false);
    // El flag conserva su valor previo (true) — la restauración fallida no
    // se disfraza de éxito ni deja el sistema en un estado ambiguo.
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(true);
    expect(registroFlags.auditoria(FLAG_SYNC_PUSH_AUTOMATICO)).toEqual([]);
  });
});
