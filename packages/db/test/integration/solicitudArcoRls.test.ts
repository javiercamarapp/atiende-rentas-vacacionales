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
 * REQ-151 (docs/REQUISITOS.md, migración 0133_solicitud_arco.ts):
 * (a) RLS aislada por tenant + rol (ROLES_ADMIN únicamente, mismo
 *     criterio que facturación/notificaciones);
 * (b) `plazo_limite` es GENERATED a partir de `fn_calcular_plazo_arco` —
 *     20 días hábiles (LFPDPPP) / 1 mes (RGPD) desde `recibida_en`, nunca
 *     editable directamente;
 * (c) un ticket nunca puede quedar 'resuelta'/'rechazada' sin
 *     `resolucion_notas` ni sin `resuelta_en` (CHECK de la tabla);
 * (d) ninguna política de DELETE existe — ni superadmin puede borrar un
 *     ticket ARCO.
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
}
let ids: IdsFixture;

function puertoAleatorioEnRango(): number {
  return 52000 + Math.floor(Math.random() * 5000);
}

async function nuevaConexionAppRv(): Promise<pg.Client> {
  const cliente = new pg.Client({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_solicitud_arco_rls_test",
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
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-solicitud-arco-rls-test-"));
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
  await servidor.createDatabase("atiende_rv_solicitud_arco_rls_test");

  superusuario = servidor.getPgClient("atiende_rv_solicitud_arco_rls_test");
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

  const tenantA = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-ARCO-A') RETURNING id");
  const tenantB = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-ARCO-B') RETURNING id");
  const adminA = await superusuario.query<{ id: string }>(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'admin.arco.a@test.local', 'admin_gestora', 'x') RETURNING id`,
    [tenantA.rows[0]!.id],
  );
  const operadorA = await superusuario.query<{ id: string }>(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, 'operador.arco.a@test.local', 'operador', 'x') RETURNING id`,
    [tenantA.rows[0]!.id],
  );

  ids = {
    tenantA: tenantA.rows[0]!.id,
    tenantB: tenantB.rows[0]!.id,
    adminA: adminA.rows[0]!.id,
    operadorA: operadorA.rows[0]!.id,
  };
}, 120_000);

afterAll(async () => {
  await Promise.all(conexionesAppRv.map((c) => c.end().catch(() => undefined)));
  await superusuario?.end().catch(() => undefined);
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("solicitud_arco — ENABLE/FORCE ROW LEVEL SECURITY (REQ-151)", () => {
  it("relrowsecurity y relforcerowsecurity están activos", async () => {
    const r = await superusuario.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'solicitud_arco'`,
    );
    expect(r.rows[0]!.relrowsecurity).toBe(true);
    expect(r.rows[0]!.relforcerowsecurity).toBe(true);
  });

  it("admin del tenant A ve su propio ticket pero nunca uno del tenant B (aislamiento cross-tenant)", async () => {
    const ticketA = await superusuario.query<{ id: string }>(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email)
       VALUES ($1, 'acceso', 'mx_lfpdppp', 'Persona A', 'persona-a@example.com') RETURNING id`,
      [ids.tenantA],
    );
    const ticketB = await superusuario.query<{ id: string }>(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email)
       VALUES ($1, 'acceso', 'ue_rgpd', 'Persona B secreta', 'persona-b@example.com') RETURNING id`,
      [ids.tenantB],
    );

    const clienteA = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const propio = await clienteA.query("SELECT id FROM solicitud_arco WHERE id = $1", [ticketA.rows[0]!.id]);
    expect(propio.rows).toHaveLength(1);

    const ajeno = await clienteA.query("SELECT id FROM solicitud_arco WHERE id = $1", [ticketB.rows[0]!.id]);
    expect(ajeno.rows).toHaveLength(0);
  });

  it("un operador (no ROLES_ADMIN) no ve ningún ticket ARCO de su propio tenant", async () => {
    const t = await superusuario.query<{ id: string }>(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email)
       VALUES ($1, 'rectificacion', 'mx_lfpdppp', 'Persona Op', 'persona-op@example.com') RETURNING id`,
      [ids.tenantA],
    );
    const clienteOperador = await comoUsuario(ids.operadorA, ids.tenantA, "operador");
    const vista = await clienteOperador.query("SELECT id FROM solicitud_arco WHERE id = $1", [t.rows[0]!.id]);
    expect(vista.rows).toHaveLength(0);
  });

  it("INSERT directo sin sesión (app_rv sin tenant_id de sesión) es rechazado por WITH CHECK", async () => {
    const clienteSinSesion = await nuevaConexionAppRv();
    await expect(
      clienteSinSesion.query(
        `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email)
         VALUES ($1, 'acceso', 'mx_lfpdppp', 'Intruso', 'intruso@example.com')`,
        [ids.tenantA],
      ),
    ).rejects.toThrow();
  });

  it("ninguna política de DELETE existe: ni siquiera superadmin/postgres puede borrar un ticket vía app_rv", async () => {
    const t = await superusuario.query<{ id: string }>(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email)
       VALUES ($1, 'cancelacion', 'ue_rgpd', 'Persona Del', 'persona-del@example.com') RETURNING id`,
      [ids.tenantA],
    );
    const clienteA = await comoUsuario(ids.adminA, ids.tenantA, "admin_gestora");
    const borrado = await clienteA.query("DELETE FROM solicitud_arco WHERE id = $1", [t.rows[0]!.id]);
    expect(borrado.rowCount).toBe(0);
    const sigueAhi = await superusuario.query("SELECT id FROM solicitud_arco WHERE id = $1", [t.rows[0]!.id]);
    expect(sigueAhi.rows).toHaveLength(1);
  });
});

describe("fn_calcular_plazo_arco — plazo por jurisdicción (REQ-151)", () => {
  it("RGPD (UE): plazo_limite = recibida_en + 1 mes exacto", async () => {
    const r = await superusuario.query<{ recibida_en: string; plazo_limite: string }>(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, recibida_en)
       VALUES ($1, 'oposicion', 'ue_rgpd', 'RGPD Uno', 'rgpd1@example.com', '2026-01-15T10:00:00Z')
       RETURNING recibida_en, plazo_limite`,
      [ids.tenantA],
    );
    expect(new Date(r.rows[0]!.plazo_limite).toISOString()).toBe(new Date("2026-02-15T10:00:00Z").toISOString());
  });

  it("LFPDPPP (MX): 20 días hábiles desde un lunes caen 4 semanas después (excluye 4 fines de semana)", async () => {
    // 2026-01-05 es lunes. 20 días hábiles después, contando solo
    // lunes-viernes: lunes 05-ene es el día 0 (recepción); el día hábil
    // número 20 cae el 2026-02-02 (lunes), tras saltar 4 fines de semana
    // completos (8 días de calendario no hábiles).
    const r = await superusuario.query<{ plazo_limite: string }>(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, recibida_en)
       VALUES ($1, 'acceso', 'mx_lfpdppp', 'LFPDPPP Uno', 'lfpdppp1@example.com', '2026-01-05T09:00:00-06:00')
       RETURNING plazo_limite`,
      [ids.tenantA],
    );
    const plazo = new Date(r.rows[0]!.plazo_limite);
    // 05-ene (lun, día 0) + 20 días hábiles = 02-feb-2026 (lunes).
    expect(plazo.toISOString().slice(0, 10)).toBe("2026-02-02");
  });

  it("plazo_limite no es editable: un UPDATE que intenta fijarlo directamente falla", async () => {
    const t = await superusuario.query<{ id: string }>(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email)
       VALUES ($1, 'acceso', 'mx_lfpdppp', 'No Editable', 'no-editable@example.com') RETURNING id`,
      [ids.tenantA],
    );
    await expect(
      superusuario.query("UPDATE solicitud_arco SET plazo_limite = now() WHERE id = $1", [t.rows[0]!.id]),
    ).rejects.toThrow();
  });

  it("jurisdicción desconocida es rechazada por el CHECK de la columna antes de llegar a la función", async () => {
    await expect(
      superusuario.query(
        `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email)
         VALUES ($1, 'acceso', 'es_invalida', 'Nadie', 'nadie@example.com')`,
        [ids.tenantA],
      ),
    ).rejects.toThrow();
  });
});

describe("solicitud_arco — invariantes de resolución (CHECK de tabla, REQ-151)", () => {
  it("no se puede insertar un ticket 'resuelta' sin resolucion_notas", async () => {
    await expect(
      superusuario.query(
        `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, estado, resuelta_en)
         VALUES ($1, 'acceso', 'mx_lfpdppp', 'Sin Notas', 'sin-notas@example.com', 'resuelta', now())`,
        [ids.tenantA],
      ),
    ).rejects.toThrow();
  });

  it("no se puede insertar un ticket 'resuelta' sin resuelta_en, aunque tenga notas", async () => {
    await expect(
      superusuario.query(
        `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, estado, resolucion_notas)
         VALUES ($1, 'acceso', 'mx_lfpdppp', 'Sin Fecha', 'sin-fecha@example.com', 'resuelta', 'se le dio acceso a sus datos')`,
        [ids.tenantA],
      ),
    ).rejects.toThrow();
  });

  it("un ticket 'recibida' con resuelta_en ya fijado también es rechazado (CHECK simétrico)", async () => {
    await expect(
      superusuario.query(
        `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, estado, resuelta_en)
         VALUES ($1, 'acceso', 'mx_lfpdppp', 'Fecha De Mas', 'fecha-de-mas@example.com', 'recibida', now())`,
        [ids.tenantA],
      ),
    ).rejects.toThrow();
  });

  it("un ticket 'resuelta' con notas y fecha sí se inserta", async () => {
    const r = await superusuario.query(
      `INSERT INTO solicitud_arco (tenant_id, tipo_derecho, jurisdiccion, solicitante_nombre, solicitante_email, estado, resolucion_notas, resuelta_en)
       VALUES ($1, 'acceso', 'mx_lfpdppp', 'Caso Completo', 'caso-completo@example.com', 'resuelta', 'se le dio acceso a sus datos', now())
       RETURNING id`,
      [ids.tenantA],
    );
    expect(r.rows).toHaveLength(1);
  });
});
