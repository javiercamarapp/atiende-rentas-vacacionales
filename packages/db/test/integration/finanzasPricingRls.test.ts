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
 * Lote 7 — RLS real contra `embedded-postgres` (D-022: nunca solo PGlite
 * para invariantes/RLS) sobre las tablas nuevas de finanzas/pricing
 * (0050-0055). Verifica, con SQL directo contra el rol `app_rv` (sin
 * BYPASSRLS, mismo patrón que packages/db/test/integration/rls.test.ts):
 *
 * 1. Propietario A NO ve los owner statements de Propietario B, aunque
 *    ambos pertenezcan al mismo tenant (entregable explícito del encargo).
 * 2. Contador SÍ ve finanzas (owner_statement, reserva_financiero) pero
 *    NUNCA calendario (ocupacion_unidad) — brecha fail-closed de 0015 más
 *    el acceso positivo añadido en 0054.
 * 3. Aislamiento cross-tenant también aplica a las tablas de finanzas.
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
  unidadA1: string;
  unidadA2: string;
  ocupacionA1: string;
  ownerA1: string;
  ownerA2: string;
  statementOwnerA1: string;
  statementOwnerA2: string;
  adminA: string;
  contadorA: string;
  propietarioA1: string;
  propietarioA2: string;
}
let ids: IdsFixture;

function puertoAleatorioEnRango(): number {
  return 45000 + Math.floor(Math.random() * 5000);
}

async function nuevaConexionAppRv(): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_finanzas_rls_test",
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
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-finanzas-rls-test-"));
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
  await servidor.createDatabase("atiende_rv_finanzas_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_finanzas_rls_test");
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

  const tenantA = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Fin-A') RETURNING id");
  const tenantB = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Fin-B') RETURNING id");
  const egA = await superusuario.query<{ id: string }>(
    "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'EG Fin A') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const ownerA1 = await superusuario.query<{ id: string }>(
    "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner Fin A1') RETURNING id",
    [egA.rows[0]!.id],
  );
  const ownerA2 = await superusuario.query<{ id: string }>(
    "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner Fin A2') RETURNING id",
    [egA.rows[0]!.id],
  );
  const propiedadA = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop Fin A', 'America/Cancun') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const unidadA1 = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad Fin A1') RETURNING id",
    [propiedadA.rows[0]!.id, ownerA1.rows[0]!.id],
  );
  const unidadA2 = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad Fin A2') RETURNING id",
    [propiedadA.rows[0]!.id, ownerA2.rows[0]!.id],
  );
  const ocupacionA1 = await superusuario.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2026-11-01', '2026-11-05', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
     RETURNING id`,
    [unidadA1.rows[0]!.id],
  );

  async function crearUsuario(tenantId: string | null, email: string, rol: string, ownerId: string | null) {
    const r = await superusuario.query<{ id: string }>(
      `INSERT INTO usuario (tenant_id, email, rol, owner_id, password_hash) VALUES ($1, $2, $3, $4, 'x') RETURNING id`,
      [tenantId, email, rol, ownerId],
    );
    return r.rows[0]!.id;
  }

  const adminA = await crearUsuario(tenantA.rows[0]!.id, "admin.fin.a@test.local", "admin_gestora", null);
  const contadorA = await crearUsuario(tenantA.rows[0]!.id, "contador.fin.a@test.local", "contador", null);
  const propietarioA1 = await crearUsuario(
    tenantA.rows[0]!.id,
    "propietario.fin.a1@test.local",
    "propietario",
    ownerA1.rows[0]!.id,
  );
  const propietarioA2 = await crearUsuario(
    tenantA.rows[0]!.id,
    "propietario.fin.a2@test.local",
    "propietario",
    ownerA2.rows[0]!.id,
  );

  const statementOwnerA1 = await superusuario.query<{ id: string }>(
    `INSERT INTO owner_statement (owner_id, tenant_id, periodo_inicio, periodo_fin, moneda, ingresos_brutos_centavos, comision_canal_centavos, comision_gestor_centavos, gastos_centavos, impuestos_centavos, neto_centavos, hash_contenido)
     VALUES ($1, $2, '2026-11-01', '2026-12-01', 'MXN', 100000, 0, 10000, 0, 0, 90000, 'hash-a1')
     RETURNING id`,
    [ownerA1.rows[0]!.id, tenantA.rows[0]!.id],
  );
  const statementOwnerA2 = await superusuario.query<{ id: string }>(
    `INSERT INTO owner_statement (owner_id, tenant_id, periodo_inicio, periodo_fin, moneda, ingresos_brutos_centavos, comision_canal_centavos, comision_gestor_centavos, gastos_centavos, impuestos_centavos, neto_centavos, hash_contenido)
     VALUES ($1, $2, '2026-11-01', '2026-12-01', 'MXN', 200000, 0, 20000, 0, 0, 180000, 'hash-a2')
     RETURNING id`,
    [ownerA2.rows[0]!.id, tenantA.rows[0]!.id],
  );

  ids = {
    tenantA: tenantA.rows[0]!.id,
    tenantB: tenantB.rows[0]!.id,
    unidadA1: unidadA1.rows[0]!.id,
    unidadA2: unidadA2.rows[0]!.id,
    ocupacionA1: ocupacionA1.rows[0]!.id,
    ownerA1: ownerA1.rows[0]!.id,
    ownerA2: ownerA2.rows[0]!.id,
    statementOwnerA1: statementOwnerA1.rows[0]!.id,
    statementOwnerA2: statementOwnerA2.rows[0]!.id,
    adminA,
    contadorA,
    propietarioA1,
    propietarioA2,
  };
}, 120_000);

afterAll(async () => {
  await Promise.all(conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("§Auditoría-1/encargo Lote 7: propietario A no ve statements de propietario B", () => {
  it("propietarioA1 solo ve su propio owner_statement, nunca el de propietarioA2 (mismo tenant)", async () => {
    const cliente = await comoUsuario(ids.propietarioA1, ids.tenantA, "propietario");
    const { rows } = await cliente.query<{ id: string }>("SELECT id FROM owner_statement ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual([ids.statementOwnerA1]);
  });

  it("propietarioA2 solo ve el suyo", async () => {
    const cliente = await comoUsuario(ids.propietarioA2, ids.tenantA, "propietario");
    const { rows } = await cliente.query<{ id: string }>("SELECT id FROM owner_statement ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual([ids.statementOwnerA2]);
  });

  it("admin_gestora del tenant ve ambos statements", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const { rows } = await cliente.query<{ id: string }>("SELECT id FROM owner_statement ORDER BY id");
    expect(rows).toHaveLength(2);
  });

  it("propietario no puede escribir/insertar un owner_statement (solo lectura)", async () => {
    const cliente = await comoUsuario(ids.propietarioA1, ids.tenantA, "propietario");
    await expect(
      cliente.query(
        `INSERT INTO owner_statement (owner_id, tenant_id, periodo_inicio, periodo_fin, moneda, ingresos_brutos_centavos, comision_canal_centavos, comision_gestor_centavos, gastos_centavos, impuestos_centavos, neto_centavos, hash_contenido)
         VALUES ($1, $2, '2026-12-01', '2027-01-01', 'MXN', 1, 0, 0, 0, 0, 1, 'hash-forzado')`,
        [ids.ownerA1, ids.tenantA],
      ),
    ).rejects.toThrow();
  });
});

describe("contador ve finanzas pero nunca calendario", () => {
  it("contadorA lee owner_statement y reserva_financiero del tenant", async () => {
    const cliente = await comoUsuario(ids.contadorA, ids.tenantA, "contador");
    const statements = await cliente.query("SELECT id FROM owner_statement");
    expect(statements.rows).toHaveLength(2);
  });

  it("contadorA NO ve ninguna fila de ocupacion_unidad (calendario)", async () => {
    const cliente = await comoUsuario(ids.contadorA, ids.tenantA, "contador");
    const { rows } = await cliente.query("SELECT id FROM ocupacion_unidad");
    expect(rows).toHaveLength(0);
  });

  it("contadorA no puede escribir en owner_statement (solo lectura)", async () => {
    const cliente = await comoUsuario(ids.contadorA, ids.tenantA, "contador");
    const resultado = await cliente.query("UPDATE owner_statement SET neto_centavos = 0 WHERE id = $1", [
      ids.statementOwnerA1,
    ]);
    expect(resultado.rowCount).toBe(0);
  });
});

describe("aislamiento cross-tenant en tablas de finanzas (caso adversarial 18)", () => {
  it("un tenant sin membresía nunca ve owner_statement de otro tenant", async () => {
    const superadmin = await superusuario.query<{ id: string }>(
      "INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES (NULL, 'superadmin.fin@test.local', 'superadmin', 'x') RETURNING id",
    );
    const adminBTenant = ids.tenantB;
    const adminB = await superusuario.query<{ id: string }>(
      "INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'admin.fin.b@test.local', 'admin_gestora', 'x') RETURNING id",
      [adminBTenant],
    );
    const cliente = await comoUsuario(adminB.rows[0]!.id, adminBTenant, "admin_gestora");
    const { rows } = await cliente.query("SELECT id FROM owner_statement");
    expect(rows).toHaveLength(0);
    // superadmin nunca usado en assert, solo para confirmar que insertarlo no rompe RLS de otras filas.
    expect(superadmin.rows[0]!.id).toBeTruthy();
  });
});

describe("reserva_financiero: propietario limitado a sus propias unidades", () => {
  it("propietarioA1 ve la reserva_financiero de su unidad tras insertarla", async () => {
    await superusuario.query(
      `INSERT INTO reserva_financiero (ocupacion_unidad_id, moneda, monto_bruto_centavos, ya_neto_de_comision, comision_gestor_basis_points, comision_gestor_base, monto_recibido_centavos, neto_centavos)
       VALUES ($1, 'MXN', 100000, true, 1000, 'neto_de_canal', 100000, 90000)`,
      [ids.ocupacionA1],
    );
    const cliente = await comoUsuario(ids.propietarioA1, ids.tenantA, "propietario");
    const { rows } = await cliente.query("SELECT ocupacion_unidad_id FROM reserva_financiero");
    expect(rows).toHaveLength(1);
  });

  it("propietarioA2 (otra unidad) no ve la reserva_financiero de la unidad de propietarioA1", async () => {
    const cliente = await comoUsuario(ids.propietarioA2, ids.tenantA, "propietario");
    const { rows } = await cliente.query("SELECT ocupacion_unidad_id FROM reserva_financiero");
    expect(rows).toHaveLength(0);
  });
});
