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
 * Lote 6 (BACKLOG E09) — RLS real contra `embedded-postgres` (D-022) sobre
 * las tablas de mensajería (0040-0044). Verifica, con SQL directo contra
 * el rol `app_rv` (sin BYPASSRLS, mismo patrón que
 * packages/db/test/integration/rls.test.ts /
 * packages/db/test/integration/finanzasPricingRls.test.ts):
 *
 * 1. Aislamiento cross-tenant: tenant B nunca ve conversaciones de tenant A.
 * 2. Propietario y limpieza NO tienen ninguna política aplicable sobre
 *    mensajería (deny-by-default, FORCE RLS) — el entregable explícito del
 *    encargo ("operador/admin del tenant; propietario y limpieza sin
 *    acceso").
 * 3. Operador con `colaborador_nivel = 'solo_calendario'` tampoco ve
 *    mensajería (mismo criterio que Lote 5).
 * 4. `contador` (rol financiero) tampoco tiene acceso — mensajería nunca
 *    se declaró para ese rol.
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
  unidadB: string;
  conversacionA: string;
  conversacionB: string;
  adminA: string;
  operadorSoloA: string;
  operadorMensajeriaA: string;
  propietarioA: string;
  limpiezaA: string;
  contadorA: string;
  adminB: string;
}
let ids: IdsFixture;

function puertoAleatorioEnRango(): number {
  return 46000 + Math.floor(Math.random() * 5000);
}

async function nuevaConexionAppRv(): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_mensajeria_rls_test",
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
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-mensajeria-rls-test-"));
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
  await servidor.createDatabase("atiende_rv_mensajeria_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_mensajeria_rls_test");
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

  const tenantA = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Msg-A') RETURNING id");
  const tenantB = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Msg-B') RETURNING id");
  const propiedadA = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop Msg A', 'America/Cancun') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const propiedadB = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop Msg B', 'America/Cancun') RETURNING id",
    [tenantB.rows[0]!.id],
  );
  const unidadA = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad Msg A') RETURNING id",
    [propiedadA.rows[0]!.id],
  );
  const unidadB = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad Msg B') RETURNING id",
    [propiedadB.rows[0]!.id],
  );
  const canalAirbnb = await superusuario.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");

  const conversacionA = await superusuario.query<{ id: string }>(
    "INSERT INTO conversacion (unidad_id, canal_id) VALUES ($1, $2) RETURNING id",
    [unidadA.rows[0]!.id, canalAirbnb.rows[0]!.id],
  );
  const conversacionB = await superusuario.query<{ id: string }>(
    "INSERT INTO conversacion (unidad_id, canal_id) VALUES ($1, $2) RETURNING id",
    [unidadB.rows[0]!.id, canalAirbnb.rows[0]!.id],
  );

  async function crearUsuario(tenantId: string | null, email: string, rol: string, colaboradorNivel: string | null = null) {
    const r = await superusuario.query<{ id: string }>(
      `INSERT INTO usuario (tenant_id, email, rol, colaborador_nivel, password_hash) VALUES ($1, $2, $3, $4, 'x') RETURNING id`,
      [tenantId, email, rol, colaboradorNivel],
    );
    return r.rows[0]!.id;
  }

  const adminA = await crearUsuario(tenantA.rows[0]!.id, "admin.msg.a@test.local", "admin_gestora");
  const operadorSoloA = await crearUsuario(tenantA.rows[0]!.id, "operador.solo.msg.a@test.local", "operador", "solo_calendario");
  const operadorMensajeriaA = await crearUsuario(
    tenantA.rows[0]!.id,
    "operador.mensajeria.msg.a@test.local",
    "operador",
    "calendario_mensajeria",
  );
  const propietarioA = await crearUsuario(tenantA.rows[0]!.id, "propietario.msg.a@test.local", "propietario");
  const limpiezaA = await crearUsuario(tenantA.rows[0]!.id, "limpieza.msg.a@test.local", "limpieza");
  const contadorA = await crearUsuario(tenantA.rows[0]!.id, "contador.msg.a@test.local", "contador");
  const adminB = await crearUsuario(tenantB.rows[0]!.id, "admin.msg.b@test.local", "admin_gestora");

  ids = {
    tenantA: tenantA.rows[0]!.id,
    tenantB: tenantB.rows[0]!.id,
    unidadA: unidadA.rows[0]!.id,
    unidadB: unidadB.rows[0]!.id,
    conversacionA: conversacionA.rows[0]!.id,
    conversacionB: conversacionB.rows[0]!.id,
    adminA,
    operadorSoloA,
    operadorMensajeriaA,
    propietarioA,
    limpiezaA,
    contadorA,
    adminB,
  };
}, 120_000);

afterAll(async () => {
  await Promise.all(conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("RLS mensajería (0043) — acceso positivo", () => {
  it("admin_gestora del tenant ve su conversación", async () => {
    const cliente = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const res = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionA]);
    expect(res.rows).toHaveLength(1);
  });

  it("operador con nivel 'calendario_mensajeria' ve mensajería", async () => {
    const cliente = await comoUsuario(ids.operadorMensajeriaA, ids.tenantA, "operador", "calendario_mensajeria");
    const res = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionA]);
    expect(res.rows).toHaveLength(1);
  });
});

describe("RLS mensajería (0043) — deny-by-default explícito del encargo", () => {
  it("propietario NO ve ninguna conversación (sin política aplicable)", async () => {
    const cliente = await comoUsuario(ids.propietarioA, ids.tenantA, "propietario");
    const res = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionA]);
    expect(res.rows).toHaveLength(0);
  });

  it("limpieza NO ve ninguna conversación (sin política aplicable)", async () => {
    const cliente = await comoUsuario(ids.limpiezaA, ids.tenantA, "limpieza");
    const res = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionA]);
    expect(res.rows).toHaveLength(0);
  });

  it("contador NO ve ninguna conversación (mensajería no es un rol financiero)", async () => {
    const cliente = await comoUsuario(ids.contadorA, ids.tenantA, "contador");
    const res = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionA]);
    expect(res.rows).toHaveLength(0);
  });

  it("operador 'solo_calendario' NO ve mensajería (mismo criterio que Lote 5)", async () => {
    const cliente = await comoUsuario(ids.operadorSoloA, ids.tenantA, "operador", "solo_calendario");
    const res = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionA]);
    expect(res.rows).toHaveLength(0);
  });

  it("propietario/limpieza tampoco pueden insertar un mensaje (WITH CHECK)", async () => {
    const propietario = await comoUsuario(ids.propietarioA, ids.tenantA, "propietario");
    await expect(
      propietario.query(`INSERT INTO mensaje (conversacion_id, direccion, origen, texto) VALUES ($1, 'entrante', 'manual', 'hola')`, [
        ids.conversacionA,
      ]),
    ).rejects.toThrow();

    const limpieza = await comoUsuario(ids.limpiezaA, ids.tenantA, "limpieza");
    await expect(
      limpieza.query(`INSERT INTO mensaje (conversacion_id, direccion, origen, texto) VALUES ($1, 'entrante', 'manual', 'hola')`, [
        ids.conversacionA,
      ]),
    ).rejects.toThrow();
  });
});

describe("RLS mensajería (0043) — aislamiento cross-tenant", () => {
  it("admin_gestora del tenant B nunca ve la conversación del tenant A", async () => {
    const cliente = await comoUsuario(ids.adminB, ids.tenantB, "admin_gestora");
    const res = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionA]);
    expect(res.rows).toHaveLength(0);
    // Pero sí ve la suya propia.
    const propia = await cliente.query("SELECT id FROM conversacion WHERE id = $1", [ids.conversacionB]);
    expect(propia.rows).toHaveLength(1);
  });
});
