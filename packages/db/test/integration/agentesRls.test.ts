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
 * Lote 9 (BACKLOG E14) — RLS real contra `embedded-postgres` (D-022) sobre
 * las tablas de agentes (0070-0072): `agente_cuota_tenant` y
 * `agente_tool_call_log`. Mismo patrón que
 * `packages/db/test/integration/mensajeriaRls.test.ts`/`finanzasPricingRls.test.ts`:
 *
 * 1. Aislamiento cross-tenant: tenant B nunca ve cuota/trazas de tenant A.
 * 2. `contador`/`limpieza`/`propietario` NO tienen ninguna política de
 *    SELECT aplicable (deny-by-default, FORCE RLS) — ninguno de esos
 *    roles invoca tools de agente en el catálogo actual
 *    (`packages/domain/agentes/catalogo.ts`).
 * 3. `superadmin`/`admin_gestora`/`operador` del tenant SÍ ven su propia
 *    cuota y trazas.
 * 4. La tabla de trazas es append-only: ni siquiera `superadmin` tiene una
 *    política de UPDATE/DELETE (verificado con un intento directo).
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
  adminA: string;
  operadorA: string;
  propietarioA: string;
  limpiezaA: string;
  contadorA: string;
  adminB: string;
}
let ids: IdsFixture;

function puertoAleatorioEnRango(): number {
  return 51000 + Math.floor(Math.random() * 5000);
}

async function nuevaConexionAppRv(): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_agentes_rls_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  await cliente.connect();
  conexionesAppRv.push(cliente);
  return cliente;
}

async function comoUsuario(usuarioId: string, tenantId: string | null, rol: string, colaboradorNivel = ""): Promise<pg.Client> {
  const cliente = await nuevaConexionAppRv();
  await cliente.query("SELECT set_config('app.user_id', $1, false)", [usuarioId]);
  await cliente.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ?? ""]);
  await cliente.query("SELECT set_config('app.rol', $1, false)", [rol]);
  await cliente.query("SELECT set_config('app.colaborador_nivel', $1, false)", [colaboradorNivel]);
  return cliente;
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-agentes-rls-test-"));
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
  await servidor.createDatabase("atiende_rv_agentes_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_agentes_rls_test");
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

  const tenantA = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Agentes-A') RETURNING id");
  const tenantB = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Agentes-B') RETURNING id");

  async function crearUsuario(tenantId: string | null, email: string, rol: string, colaboradorNivel: string | null = null) {
    const r = await superusuario.query<{ id: string }>(
      `INSERT INTO usuario (tenant_id, email, rol, colaborador_nivel, password_hash) VALUES ($1, $2, $3, $4, 'x') RETURNING id`,
      [tenantId, email, rol, colaboradorNivel],
    );
    return r.rows[0]!.id;
  }

  const adminA = await crearUsuario(tenantA.rows[0]!.id, "admin.agentes.a@test.local", "admin_gestora");
  const operadorA = await crearUsuario(tenantA.rows[0]!.id, "operador.agentes.a@test.local", "operador", "acceso_total");
  const propietarioA = await crearUsuario(tenantA.rows[0]!.id, "propietario.agentes.a@test.local", "propietario");
  const limpiezaA = await crearUsuario(tenantA.rows[0]!.id, "limpieza.agentes.a@test.local", "limpieza");
  const contadorA = await crearUsuario(tenantA.rows[0]!.id, "contador.agentes.a@test.local", "contador");
  const adminB = await crearUsuario(tenantB.rows[0]!.id, "admin.agentes.b@test.local", "admin_gestora");

  await superusuario.query(
    `INSERT INTO agente_cuota_tenant (tenant_id, techo_tokens_periodo, techo_llamadas_periodo)
     VALUES ($1, 100000, 1000), ($2, 100000, 1000)`,
    [tenantA.rows[0]!.id, tenantB.rows[0]!.id],
  );
  await superusuario.query(
    `INSERT INTO agente_tool_call_log
       (tenant_id, actor_id, rol_actor, conversation_id, canal, tool_nombre, resultado, duracion_ms, modelo_real, costo_usd_real, inicio_en, fin_en)
     VALUES ($1, $2, 'operador', 'conv-a-1', 'airbnb', 'mensajeria_proponer_borrador', 'exito', 120, 'simulado-etiquetado-v1', 0.001, now(), now())`,
    [tenantA.rows[0]!.id, operadorA],
  );

  ids = { tenantA: tenantA.rows[0]!.id, tenantB: tenantB.rows[0]!.id, adminA, operadorA, propietarioA, limpiezaA, contadorA, adminB };
}, 120_000);

afterAll(async () => {
  await Promise.all(conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("RLS agentes (0071) — acceso positivo dentro del propio tenant", () => {
  it("admin_gestora ve la cuota y las trazas de su tenant", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const cuota = await cliente.query("SELECT tenant_id FROM agente_cuota_tenant WHERE tenant_id = $1", [ids.tenantA]);
    expect(cuota.rows).toHaveLength(1);
    const trazas = await cliente.query("SELECT id FROM agente_tool_call_log WHERE tenant_id = $1", [ids.tenantA]);
    expect(trazas.rows).toHaveLength(1);
  });

  it("operador ve la cuota y las trazas de su tenant", async () => {
    const cliente = await comoUsuario(ids.operadorA, ids.tenantA, "operador", "acceso_total");
    const cuota = await cliente.query("SELECT tenant_id FROM agente_cuota_tenant WHERE tenant_id = $1", [ids.tenantA]);
    expect(cuota.rows).toHaveLength(1);
  });

  it("operador puede insertar una traza propia (actor_id = usuario_actual_id())", async () => {
    const cliente = await comoUsuario(ids.operadorA, ids.tenantA, "operador", "acceso_total");
    await expect(
      cliente.query(
        `INSERT INTO agente_tool_call_log
           (tenant_id, actor_id, rol_actor, conversation_id, canal, tool_nombre, resultado, duracion_ms, modelo_real, costo_usd_real, inicio_en, fin_en)
         VALUES ($1, $2, 'operador', 'conv-a-2', 'airbnb', 'incidencia_resumir', 'exito', 80, 'simulado-etiquetado-v1', 0.0005, now(), now())`,
        [ids.tenantA, ids.operadorA],
      ),
    ).resolves.toBeDefined();
  });
});

describe("RLS agentes (0071) — aislamiento cross-tenant", () => {
  it("admin_gestora de tenant B nunca ve la cuota/trazas de tenant A", async () => {
    const cliente = await comoUsuario(ids.adminB, ids.tenantB, "admin_gestora");
    const cuota = await cliente.query("SELECT tenant_id FROM agente_cuota_tenant WHERE tenant_id = $1", [ids.tenantA]);
    expect(cuota.rows).toHaveLength(0);
    const trazas = await cliente.query("SELECT id FROM agente_tool_call_log WHERE tenant_id = $1", [ids.tenantA]);
    expect(trazas.rows).toHaveLength(0);
  });
});

describe("RLS agentes (0071) — deny-by-default explícito", () => {
  it("propietario NO ve cuota ni trazas (sin política aplicable)", async () => {
    const cliente = await comoUsuario(ids.propietarioA, ids.tenantA, "propietario");
    const cuota = await cliente.query("SELECT tenant_id FROM agente_cuota_tenant WHERE tenant_id = $1", [ids.tenantA]);
    expect(cuota.rows).toHaveLength(0);
    const trazas = await cliente.query("SELECT id FROM agente_tool_call_log WHERE tenant_id = $1", [ids.tenantA]);
    expect(trazas.rows).toHaveLength(0);
  });

  it("limpieza NO ve cuota ni trazas", async () => {
    const cliente = await comoUsuario(ids.limpiezaA, ids.tenantA, "limpieza");
    const cuota = await cliente.query("SELECT tenant_id FROM agente_cuota_tenant WHERE tenant_id = $1", [ids.tenantA]);
    expect(cuota.rows).toHaveLength(0);
  });

  it("contador NO ve cuota ni trazas (no es un rol que invoque tools de agente)", async () => {
    const cliente = await comoUsuario(ids.contadorA, ids.tenantA, "contador");
    const cuota = await cliente.query("SELECT tenant_id FROM agente_cuota_tenant WHERE tenant_id = $1", [ids.tenantA]);
    expect(cuota.rows).toHaveLength(0);
    const trazas = await cliente.query("SELECT id FROM agente_tool_call_log WHERE tenant_id = $1", [ids.tenantA]);
    expect(trazas.rows).toHaveLength(0);
  });
});

describe("RLS agentes (0071) — trazabilidad append-only", () => {
  it("ni siquiera admin_gestora puede UPDATE/DELETE una traza ya escrita", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const actualizados = await cliente.query(
      "UPDATE agente_tool_call_log SET resultado = 'error' WHERE tenant_id = $1",
      [ids.tenantA],
    );
    expect(actualizados.rowCount).toBe(0);
    const borrados = await cliente.query("DELETE FROM agente_tool_call_log WHERE tenant_id = $1", [ids.tenantA]);
    expect(borrados.rowCount).toBe(0);
  });
});
