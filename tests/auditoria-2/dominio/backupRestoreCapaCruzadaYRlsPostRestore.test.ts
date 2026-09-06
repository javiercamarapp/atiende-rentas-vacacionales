import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { exportarBackupLogico, restaurarBackupLogico, verificarIntegridad } from "@atiende-rv/db/backup/index.js";

/**
 * Auditoría adversarial independiente (fase 2) — SOLO migraciones/backup,
 * punto 2c del encargo.
 *
 * `packages/db/test/integration/backup.test.ts` YA verifica, con
 * embedded-postgres real, que el EXCLUDE sigue rechazando un segundo
 * SOLAPE DENTRO DE LA MISMA CAPA (`capa='reserva'` dos veces) tras un
 * restore. `packages/db/test/backup/exportarRestaurar.test.ts` verifica
 * `verificarIntegridad` sobre el EXCLUDE pero no ejercita RLS post-restore
 * con un rol real.
 *
 * Lo que NINGUNA suite existente cubre (confirmado leyendo ambos archivos
 * completos):
 *  1. La combinación de capas cruzadas SOLAPADAS en el propio backup — una
 *     reserva confirmada + un bloqueo de mantenimiento que se solapan en
 *     fechas sobre la MISMA unidad (válido por diseño: el EXCLUDE de 0005
 *     solo corre sobre `capa='reserva'`, nunca sobre `capa='bloqueo'`) —
 *     debe exportarse y restaurarse SIN que el restore falle (la carga
 *     masiva con `session_replication_role=replica` no reintroduce el
 *     problema de orden de inserción, y el EXCLUDE no debe disparar contra
 *     una fila `capa='bloqueo'`).
 *  2. Verificación EXPLÍCITA de que las políticas RLS (0015/0092) siguen
 *     activas tras el restore, con un ROL REAL sin BYPASSRLS (`app_rv`,
 *     mismo patrón que `packages/db/test/integration/rls.test.ts`) — no
 *     solo con la conexión superusuario que hace el propio restore (que
 *     SIEMPRE ignora RLS, dando un falso verde si se probara así).
 *
 * Nota sobre `session_replication_role = replica` (usado por
 * `restaurarBackupLogico` durante la carga masiva): desactiva triggers de
 * usuario y comprobaciones de FK, pero NO es lo mismo que RLS — RLS se
 * evalúa por ROL de conexión, no por `session_replication_role`. Esta
 * suite lo confirma empíricamente en vez de asumirlo.
 */

const USUARIO_SUPERUSUARIO = "postgres";
const PASSWORD_SUPERUSUARIO = "postgres";
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

interface ClusterPrueba {
  databaseDir: string;
  servidor: EmbeddedPostgres;
  puerto: number;
  superusuario: pg.Client;
  ejecutor: EjecutorSql;
  conexionesAppRv: pg.Client[];
}

function puertoAleatorioEnRango(base: number): number {
  return base + Math.floor(Math.random() * 4000);
}

async function levantarCluster(nombreBd: string, puertoBase: number): Promise<ClusterPrueba> {
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-backup-capa-cruzada-rls-"));
  const puerto = puertoAleatorioEnRango(puertoBase);
  const servidor = new EmbeddedPostgres({
    databaseDir,
    port: puerto,
    user: USUARIO_SUPERUSUARIO,
    password: PASSWORD_SUPERUSUARIO,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase(nombreBd);

  const superusuario = servidor.getPgClient(nombreBd);
  await superusuario.connect();
  await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

  const ejecutor: EjecutorSql = {
    async query(sql, params) {
      const r = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql) {
      await superusuario.query(sql);
    },
  };
  await aplicarMigraciones(ejecutor, migraciones);

  return { databaseDir, servidor, puerto, superusuario, ejecutor, conexionesAppRv: [] };
}

async function comoAppRv(
  cluster: ClusterPrueba,
  nombreBd: string,
  usuarioId: string,
  tenantId: string | null,
  rol: string,
): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: cluster.puerto,
    database: nombreBd,
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  await cliente.connect();
  cluster.conexionesAppRv.push(cliente);
  await cliente.query("SELECT set_config('app.user_id', $1, false)", [usuarioId]);
  await cliente.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ?? ""]);
  await cliente.query("SELECT set_config('app.rol', $1, false)", [rol]);
  await cliente.query("SELECT set_config('app.colaborador_nivel', $1, false)", [""]);
  return cliente;
}

async function cerrarCluster(cluster: ClusterPrueba): Promise<void> {
  await Promise.all(cluster.conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await cluster.superusuario.end().catch(() => undefined);
  await cluster.servidor.stop().catch(() => undefined);
  await rm(cluster.databaseDir, { recursive: true, force: true }).catch(() => undefined);
}

const NOMBRE_BD_ORIGEN = "atiende_rv_backup_capa_cruzada_origen";
const NOMBRE_BD_DESTINO = "atiende_rv_backup_capa_cruzada_destino";

let origen: ClusterPrueba;
let destino: ClusterPrueba;
let unidadIdOrigen: string;
let ocupacionReservaId: string;
let tenantAId: string;
let tenantBId: string;
let adminBId: string;

beforeAll(async () => {
  [origen, destino] = await Promise.all([
    levantarCluster(NOMBRE_BD_ORIGEN, 46000),
    levantarCluster(NOMBRE_BD_DESTINO, 47000),
  ]);

  const tenantA = await origen.ejecutor.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('T-Backup-CapaCruzada-A') RETURNING id",
  );
  tenantAId = tenantA.rows[0]!.id;
  const tenantB = await origen.ejecutor.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('T-Backup-CapaCruzada-B') RETURNING id",
  );
  tenantBId = tenantB.rows[0]!.id;

  const propiedad = await origen.ejecutor.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop capa cruzada', 'America/Cancun') RETURNING id",
    [tenantAId],
  );
  const unidad = await origen.ejecutor.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad capa cruzada') RETURNING id",
    [propiedad.rows[0]!.id],
  );
  unidadIdOrigen = unidad.rows[0]!.id;

  // Reserva confirmada + bloqueo de mantenimiento SOLAPADOS a propósito
  // sobre la misma unidad (válido por diseño: capa='bloqueo' nunca
  // participa del EXCLUDE de 0005, sin importar el solape).
  const reserva = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2026-12-10', '2026-12-15', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
     RETURNING id`,
    [unidadIdOrigen],
  );
  ocupacionReservaId = reserva.rows[0]!.id;
  await origen.ejecutor.query(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2026-12-12', '2026-12-13', '[)'), 'bloqueo', 'MANTENIMIENTO', 'confirmado', true)`,
    [unidadIdOrigen],
  );

  const admin = await origen.ejecutor.query<{ id: string }>(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'admin.b.capacruzada@test.local', 'admin_gestora', 'x') RETURNING id`,
    [tenantBId],
  );
  adminBId = admin.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await Promise.all([cerrarCluster(origen), cerrarCluster(destino)]);
});

describe("2c: backup/restore de capas cruzadas solapadas + verificación honesta de EXCLUDE y RLS post-restore", () => {
  it("(i) el restore de un backup con reserva+bloqueo de mantenimiento solapados en la misma unidad tiene éxito", async () => {
    const backup = await exportarBackupLogico(origen.ejecutor);
    const reporte = await restaurarBackupLogico(destino.ejecutor, backup);
    expect(reporte.tablasRestauradas.length).toBeGreaterThan(0);

    const integridad = await verificarIntegridad(destino.ejecutor, backup, {
      idsOcupacionAVerificar: [ocupacionReservaId],
    });
    expect(integridad.conteosOk).toBe(true);
    expect(integridad.excludePresente).toBe(true);
    expect(integridad.idsRecuperablesVerificados).toEqual([ocupacionReservaId]);
    expect(integridad.ok).toBe(true);

    const filas = await destino.ejecutor.query<{ capa: string }>(
      "SELECT capa FROM ocupacion_unidad WHERE unidad_id = $1 ORDER BY capa",
      [unidadIdOrigen],
    );
    expect(filas.rows.map((f) => f.capa)).toEqual(["bloqueo", "reserva"]);
  }, 120_000);

  it("(ii) el EXCLUDE sigue activo tras el restore: una reserva solapada sobre la misma unidad se rechaza con 23P01", async () => {
    await expect(
      destino.ejecutor.query(
        `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
         VALUES ($1, daterange('2026-12-11', '2026-12-12', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
        [unidadIdOrigen],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  }, 30_000);

  it("(iii) las políticas RLS siguen activas tras el restore: admin de otro tenant, con rol app_rv real (sin BYPASSRLS), no ve la unidad/ocupación restaurada", async () => {
    const clienteAppRv = await comoAppRv(destino, NOMBRE_BD_DESTINO, adminBId, tenantBId, "admin_gestora");

    const unidadesVisibles = await clienteAppRv.query("SELECT id FROM unidad WHERE id = $1", [unidadIdOrigen]);
    expect(unidadesVisibles.rows).toHaveLength(0);

    const ocupacionesVisibles = await clienteAppRv.query("SELECT id FROM ocupacion_unidad WHERE unidad_id = $1", [
      unidadIdOrigen,
    ]);
    expect(ocupacionesVisibles.rows).toHaveLength(0);
  }, 30_000);
});
