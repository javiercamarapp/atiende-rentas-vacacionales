import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { describe, expect, it } from "vitest";
import {
  aplicarMigraciones,
  crearMotorEmbeddedPostgres,
  migraciones,
  revertirUltima,
  type EjecutorSql,
  type MotorEmbeddedPostgres,
} from "@atiende-rv/db";
import pg from "pg";

/**
 * Auditoría adversarial independiente (fase 2) — SOLO migraciones, punto
 * 2b del encargo.
 *
 * `packages/db/test/migraciones.test.ts` ya prueba que `revertirUltima`
 * ejecuta el `down` real de la ÚLTIMA migración del catálogo COMPLETO, y
 * que `revertirTodas` termina sin ninguna tabla de dominio — pero esa
 * verificación final es solo "ninguna tabla queda" al FINAL de deshacer
 * TODO; no confirma, migración por migración representativa, que el
 * `down` produce el cambio de COMPORTAMIENTO esperado (no solo que la
 * tabla desaparezca) cuando se aplica de forma aislada sobre datos reales
 * ya insertados — p. ej. que RLS deja de filtrar de verdad (con un ROL
 * real, no superusuario) o que un trigger de auditoría deja de disparar.
 *
 * Esta suite toma tres migraciones representativas de distintos lotes,
 * cada una en su PROPIO cluster `embedded-postgres` aislado (para que
 * `revertirUltima` revierta EXACTAMENTE esa migración, sin tener que
 * deshacer antes N migraciones posteriores): EXCLUDE/gist (0005), triggers
 * de auditoría (0013) y políticas RLS (0015). Para cada una: up, inserta
 * datos de prueba, ejercita el comportamiento ANTES de revertir, corre
 * `down` vía `revertirUltima`, y confirma con SQL real contra
 * embedded-postgres que el comportamiento post-down cambió de verdad y
 * que no quedan objetos huérfanos (funciones/triggers/constraints/tablas).
 */

function catalogoHasta(id: string) {
  const idx = migraciones.findIndex((m) => m.id === id);
  if (idx === -1) throw new Error(`Migración "${id}" no encontrada en el catálogo`);
  return migraciones.slice(0, idx + 1);
}

describe("2b: down reversible con comportamiento verificado (no solo lectura del SQL)", () => {
  it("0005_ocupacion_unidad: down elimina limpiamente EXCLUDE/tabla/índices, sin objetos huérfanos", async () => {
    let motor: MotorEmbeddedPostgres | undefined;
    try {
      motor = await crearMotorEmbeddedPostgres("atiende_rv_down_0005_test");
      await aplicarMigraciones(motor.ejecutor, catalogoHasta("0005_ocupacion_unidad"));

      const tenant = await motor.ejecutor.query<{ id: string }>(
        "INSERT INTO tenant (nombre) VALUES ('T-Down0005') RETURNING id",
      );
      const propiedad = await motor.ejecutor.query<{ id: string }>(
        "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop down 0005', 'America/Cancun') RETURNING id",
        [tenant.rows[0]!.id],
      );
      const unidad = await motor.ejecutor.query<{ id: string }>(
        "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad down 0005') RETURNING id",
        [propiedad.rows[0]!.id],
      );

      // Comportamiento PRE-down: EXCLUDE activo (sanity check mínimo).
      await motor.ejecutor.query(
        `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
         VALUES ($1, daterange('2026-06-01','2026-06-05','[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
        [unidad.rows[0]!.id],
      );
      await expect(
        motor.ejecutor.query(
          `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
           VALUES ($1, daterange('2026-06-02','2026-06-03','[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
          [unidad.rows[0]!.id],
        ),
      ).rejects.toMatchObject({ code: "23P01" });

      const revertida = await revertirUltima(motor.ejecutor, migraciones);
      expect(revertida).toBe("0005_ocupacion_unidad");

      const tablaOcupacion = await motor.ejecutor.query<{ v: string | null }>(
        "SELECT to_regclass('ocupacion_unidad')::text AS v",
      );
      const tablaHuesped = await motor.ejecutor.query<{ v: string | null }>(
        "SELECT to_regclass('huesped_minimo')::text AS v",
      );
      expect(tablaOcupacion.rows[0]!.v).toBeNull();
      expect(tablaHuesped.rows[0]!.v).toBeNull();

      // Sin objetos huérfanos: ni la restricción EXCLUDE ni sus índices de
      // apoyo deben sobrevivir a la tabla que los contenía.
      const constraintHuerfano = await motor.ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pg_constraint WHERE conname = 'ocupacion_unidad_sin_solape'",
      );
      expect(Number(constraintHuerfano.rows[0]!.n)).toBe(0);
    } finally {
      await motor?.cerrar();
    }
  }, 120_000);

  it("0013_auditoria_triggers: down detiene realmente la captura de auditoría (comportamental, no solo DROP TRIGGER)", async () => {
    let motor: MotorEmbeddedPostgres | undefined;
    try {
      motor = await crearMotorEmbeddedPostgres("atiende_rv_down_0013_test");
      await aplicarMigraciones(motor.ejecutor, catalogoHasta("0013_auditoria_triggers"));

      const antes = await motor.ejecutor.query<{ n: string }>("SELECT count(*)::text AS n FROM auditoria_mutacion");
      const conteoAntes = Number(antes.rows[0]!.n);

      await motor.ejecutor.query(
        "INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES (NULL, 'pre-down@test.local', 'superadmin', 'x')",
      );
      const trasInsertPreDown = await motor.ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM auditoria_mutacion WHERE tabla = 'usuario'",
      );
      // Comportamiento PRE-down: el trigger de auditoría SÍ captura el INSERT.
      expect(Number(trasInsertPreDown.rows[0]!.n)).toBeGreaterThan(0);

      const revertida = await revertirUltima(motor.ejecutor, migraciones);
      expect(revertida).toBe("0013_auditoria_triggers");

      const triggerHuerfano = await motor.ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pg_trigger WHERE tgname IN ('auditoria_usuario', 'auditoria_ocupacion_unidad')",
      );
      expect(Number(triggerHuerfano.rows[0]!.n)).toBe(0);
      const funcionHuerfana = await motor.ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pg_proc WHERE proname IN ('fn_auditoria_directa', 'fn_auditoria_ocupacion_unidad')",
      );
      expect(Number(funcionHuerfana.rows[0]!.n)).toBe(0);

      const conteoPreDownTotal = await motor.ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM auditoria_mutacion WHERE tabla = 'usuario'",
      );
      const conteoAntesDeSegundoInsert = Number(conteoPreDownTotal.rows[0]!.n);

      // Comportamiento POST-down: un INSERT nuevo en `usuario` YA NO debe
      // generar ninguna fila nueva de auditoría — prueba conductual real
      // de que el trigger dejó de estar activo, no solo que el catálogo ya
      // no lo lista.
      await motor.ejecutor.query(
        "INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES (NULL, 'post-down@test.local', 'superadmin', 'x')",
      );
      const trasInsertPostDown = await motor.ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM auditoria_mutacion WHERE tabla = 'usuario'",
      );
      expect(Number(trasInsertPostDown.rows[0]!.n)).toBe(conteoAntesDeSegundoInsert);
    } finally {
      await motor?.cerrar();
    }
  }, 120_000);

  it("0015_rls_politicas: down desactiva RLS de verdad para un ROL real sin BYPASSRLS (no solo borra las políticas del catálogo)", async () => {
    // `crearMotorEmbeddedPostgres` no expone host/puerto (solo una conexión
    // de superusuario), y aquí necesitamos una SEGUNDA conexión autenticada
    // como `app_rv` (sin BYPASSRLS) — mismo patrón manual que
    // packages/db/test/integration/rls.test.ts.
    const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-down-0015-test-"));
    const puerto = 48000 + Math.floor(Math.random() * 4000);
    const nombreBd = "atiende_rv_down_0015_manual_test";
    const servidor = new EmbeddedPostgres({
      databaseDir,
      port: puerto,
      user: "postgres",
      password: "postgres",
      persistent: false,
      onLog: () => undefined,
      onError: () => undefined,
    });
    let superusuario: pg.Client | undefined;
    let conexionAppRv: pg.Client | undefined;
    try {
      await servidor.initialise();
      await servidor.start();
      await servidor.createDatabase(nombreBd);
      superusuario = servidor.getPgClient(nombreBd);
      await superusuario.connect();
      await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");

      const ejecutor: EjecutorSql = {
        async query(sql, params) {
          const r = await superusuario!.query(sql, params as unknown[] | undefined);
          return { rows: r.rows, rowCount: r.rowCount };
        },
        async exec(sql) {
          await superusuario!.query(sql);
        },
      };
      await aplicarMigraciones(ejecutor, catalogoHasta("0015_rls_politicas"));

      const tenantA = await ejecutor.query<{ id: string }>(
        "INSERT INTO tenant (nombre) VALUES ('T-Down0015-A') RETURNING id",
      );
      const tenantB = await ejecutor.query<{ id: string }>(
        "INSERT INTO tenant (nombre) VALUES ('T-Down0015-B') RETURNING id",
      );
      const adminA = await ejecutor.query<{ id: string }>(
        "INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'admin.down0015.a@test.local', 'admin_gestora', 'x') RETURNING id",
        [tenantA.rows[0]!.id],
      );

      conexionAppRv = new pg.Client({
        host: "127.0.0.1",
        port: puerto,
        database: nombreBd,
        user: "app_rv",
        password: "app_rv_dev_change_in_prod",
      });
      await conexionAppRv.connect();
      await conexionAppRv.query("SELECT set_config('app.user_id', $1, false)", [adminA.rows[0]!.id]);
      await conexionAppRv.query("SELECT set_config('app.tenant_id', $1, false)", [tenantA.rows[0]!.id]);
      await conexionAppRv.query("SELECT set_config('app.rol', 'admin_gestora', false)");
      await conexionAppRv.query("SELECT set_config('app.colaborador_nivel', '', false)");

      // Comportamiento PRE-down: RLS activo — adminA de tenantA NUNCA ve
      // la fila `tenant` de tenantB.
      const preDown = await conexionAppRv.query<{ id: string }>("SELECT id FROM tenant ORDER BY id");
      expect(preDown.rows.map((r) => r.id)).not.toContain(tenantB.rows[0]!.id);

      const revertida = await revertirUltima(ejecutor, migraciones);
      expect(revertida).toBe("0015_rls_politicas");

      const politicasHuerfanas = await ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pg_policies WHERE tablename IN ('tenant', 'usuario', 'ocupacion_unidad')",
      );
      expect(Number(politicasHuerfanas.rows[0]!.n)).toBe(0);

      const rlsHabilitado = await ejecutor.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pg_class WHERE relname = 'tenant' AND relrowsecurity = true",
      );
      expect(Number(rlsHabilitado.rows[0]!.n)).toBe(0);

      // Comportamiento POST-down conductual: la MISMA conexión/rol/sesión
      // de adminA ahora SÍ ve la fila de tenantB — prueba real de que RLS
      // se desactivó (no un superusuario ignorando RLS: `app_rv` nunca
      // tuvo BYPASSRLS).
      const postDown = await conexionAppRv.query<{ id: string }>("SELECT id FROM tenant ORDER BY id");
      expect(postDown.rows.map((r) => r.id)).toContain(tenantB.rows[0]!.id);
      expect(postDown.rows.length).toBeGreaterThanOrEqual(2);
    } finally {
      await conexionAppRv?.end().catch(() => undefined);
      await superusuario?.end().catch(() => undefined);
      await servidor.stop().catch(() => undefined);
      await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }, 120_000);
});
