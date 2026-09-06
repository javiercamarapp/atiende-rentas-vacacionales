import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones } from "../../src/runner/migrar.js";
import { migraciones } from "../../src/migrations/index.js";
import type { EjecutorSql } from "../../src/runner/ejecutorSql.js";

/**
 * Regresión permanente S-05 (docs/auditoria-2/seguridad.md,
 * migración 0093_huesped_minimo_tenant_rls.ts): `huesped_minimo` (PII de
 * huésped) debe quedar dentro del mismo perímetro multitenant que el
 * resto de tablas de negocio (caso adversarial 18) — RLS `FORCE`ado, con
 * `tenant_id` NOT NULL, contra `embedded-postgres` real (D-022), no PGlite.
 */
const USUARIO_SUPERUSUARIO = "postgres";
const PASSWORD_SUPERUSUARIO = "postgres";
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let puerto: number;
let superusuario: pg.Client;
const conexionesAppRv: pg.Client[] = [];

interface IdsFixture {
  tenantA: string;
  tenantB: string;
  unidadA: string;
  adminA: string;
  huespedA: string;
  huespedB: string;
}
let ids: IdsFixture;

function puertoAleatorioEnRango(): number {
  return 47000 + Math.floor(Math.random() * 5000);
}

async function nuevaConexionAppRv(): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_huesped_minimo_rls_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  await cliente.connect();
  conexionesAppRv.push(cliente);
  return cliente;
}

async function comoUsuario(usuarioId: string, tenantId: string | null, rol: string): Promise<pg.Client> {
  const cliente = await nuevaConexionAppRv();
  await cliente.query("SELECT set_config('app.user_id', $1, false)", [usuarioId]);
  await cliente.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ?? ""]);
  await cliente.query("SELECT set_config('app.rol', $1, false)", [rol]);
  await cliente.query("SELECT set_config('app.colaborador_nivel', $1, false)", [""]);
  return cliente;
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-huesped-minimo-rls-test-"));
  puerto = puertoAleatorioEnRango();
  servidor = new EmbeddedPostgres({
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
  await servidor.createDatabase("atiende_rv_huesped_minimo_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_huesped_minimo_rls_test");
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

  const tenantA = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-HM-A') RETURNING id");
  const tenantB = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-HM-B') RETURNING id");
  const propiedadA = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop HM A', 'America/Cancun') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const unidadA = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad HM A') RETURNING id",
    [propiedadA.rows[0]!.id],
  );
  const adminA = await superusuario.query<{ id: string }>(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'admin.hm.a@test.local', 'admin_gestora', 'x') RETURNING id`,
    [tenantA.rows[0]!.id],
  );
  const huespedA = await superusuario.query<{ id: string }>(
    `INSERT INTO huesped_minimo (nombre, contacto, tenant_id) VALUES ('Huesped A', 'tel:A', $1) RETURNING id`,
    [tenantA.rows[0]!.id],
  );
  const huespedB = await superusuario.query<{ id: string }>(
    `INSERT INTO huesped_minimo (nombre, contacto, tenant_id) VALUES ('Huesped B Secreto', 'tel:B', $1) RETURNING id`,
    [tenantB.rows[0]!.id],
  );

  ids = {
    tenantA: tenantA.rows[0]!.id,
    tenantB: tenantB.rows[0]!.id,
    unidadA: unidadA.rows[0]!.id,
    adminA: adminA.rows[0]!.id,
    huespedA: huespedA.rows[0]!.id,
    huespedB: huespedB.rows[0]!.id,
  };
}, 120_000);

afterAll(async () => {
  await Promise.all(conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await superusuario?.end().catch(() => undefined);
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("huesped_minimo — ENABLE/FORCE ROW LEVEL SECURITY (S-05, caso adversarial 18)", () => {
  it("relrowsecurity y relforcerowsecurity están activos", async () => {
    const r = await superusuario.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'huesped_minimo'`,
    );
    expect(r.rows[0]!.relrowsecurity).toBe(true);
    expect(r.rows[0]!.relforcerowsecurity).toBe(true);
  });

  it("tenant_id es NOT NULL", async () => {
    const r = await superusuario.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'huesped_minimo' AND column_name = 'tenant_id'`,
    );
    expect(r.rows[0]!.is_nullable).toBe("NO");
  });

  it("admin del tenant A ve su propio huésped pero NUNCA el del tenant B (aislamiento cross-tenant, SQL directo bajo app_rv)", async () => {
    const clienteA = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const propio = await clienteA.query("SELECT id, nombre FROM huesped_minimo WHERE id = $1", [ids.huespedA]);
    expect(propio.rows).toHaveLength(1);

    const ajeno = await clienteA.query("SELECT id, nombre FROM huesped_minimo WHERE id = $1", [ids.huespedB]);
    expect(ajeno.rows).toHaveLength(0);

    const todos = await clienteA.query("SELECT id FROM huesped_minimo");
    expect(todos.rows.map((r: { id: string }) => r.id)).not.toContain(ids.huespedB);
  });

  it("INSERT directo sin RLS (app_rv, sesión sin tenant_id de sesión) es rechazado por WITH CHECK", async () => {
    const clienteSinSesion = await nuevaConexionAppRv();
    await expect(
      clienteSinSesion.query(
        `INSERT INTO huesped_minimo (nombre, contacto, tenant_id) VALUES ('Intruso', 'tel:X', $1)`,
        [ids.tenantA],
      ),
    ).rejects.toThrow();
  });
});
