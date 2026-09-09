// Auditoría-3 / A3-fact-02
//
// Hallazgo: `exigirLimitePlan()` (apps/api/src/routes/facturacionLimites.ts:26-73)
// implementa el límite de plan como un patrón "leer uso actual -> comparar
// contra el límite -> si permitido, dejar que la ruta haga el INSERT real"
// (comentario propio: "se llama explícitamente al inicio de cada ruta...
// ANTES del INSERT real"). La lectura de uso (`medicion_uso_actual`, un
// simple `count(*)` sobre `unidad`/`cuenta_canal`) y el INSERT posterior
// NO comparten ninguna transacción serializable ni lock (ni un advisory
// lock, ni `SELECT ... FOR UPDATE`, ni `SERIALIZABLE`) — es un clásico
// TOCTOU (time-of-check to time-of-use).
//
// Este test reproduce el escenario exacto pedido por la auditoría: dos
// peticiones CONCURRENTES para dar de alta una unidad cuando el plan solo
// permite 1 unidad activa y el tenant ya tiene 0. Ambas deberían ver
// "0 de 1" en el chequeo y ambas insertan — el tenant termina con 2
// unidades activas contra un límite de 1.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { exigirLimitePlan } from "../../../apps/api/src/routes/facturacionLimites.js";
import { conSesion } from "../../../apps/api/src/db/contexto.js";
import type { ContextoAuth } from "../../../apps/api/src/middleware/autenticacion.js";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let tenantId: string;
let propiedadId: string;
let usuarioId: string;

function puertoAleatorio(): number {
  return 55000 + Math.floor(Math.random() * 8000);
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-auditoria3-race-"));
  const puerto = puertoAleatorio();
  servidor = new EmbeddedPostgres({
    databaseDir,
    port: puerto,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("atiende_rv_auditoria3_race_test");

  superusuario = servidor.getPgClient("atiende_rv_auditoria3_race_test");
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

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_auditoria3_race_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
    max: 10,
  });

  const { rows: tenantRows } = await superusuario.query<{ id: string }>(
    `INSERT INTO tenant (nombre, tipo) VALUES ('Tenant auditoría race', 'empresa_gestora') RETURNING id`,
  );
  tenantId = tenantRows[0]!.id;

  await superusuario.query(
    `INSERT INTO suscripcion_tenant (tenant_id, plan_codigo, estado) VALUES ($1, 'esencial', 'activa')`,
    [tenantId],
  );
  // Límite de 1 unidad activa SOLO en esta base de prueba aislada.
  await superusuario.query("UPDATE plan_facturacion SET limite_unidades_activas = 1 WHERE codigo = 'esencial'");

  const { rows: propRows } = await superusuario.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Casa race', 'America/Cancun') RETURNING id`,
    [tenantId],
  );
  propiedadId = propRows[0]!.id;

  const { rows: userRows } = await superusuario.query<{ id: string }>(
    `INSERT INTO usuario (tenant_id, email, password_hash, rol, colaborador_nivel, activo, email_verificado_en)
     VALUES ($1, 'race@auditoria3.example', 'x', 'admin_gestora', NULL, true, now()) RETURNING id`,
    [tenantId],
  );
  usuarioId = userRows[0]!.id;
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario?.end().catch(() => undefined);
  await servidor?.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("A3-fact-02: exigirLimitePlan + INSERT unidad tiene una carrera TOCTOU", () => {
  it("2 altas de unidad CONCURRENTES contra un límite de 1 crean 2 unidades activas", async () => {
    const auth: ContextoAuth = { usuarioId, tenantId, rol: "admin_gestora", colaboradorNivel: null };

    async function intentarAltaUnidad(nombre: string): Promise<"creada" | "rechazada"> {
      await exigirLimitePlan(pool, auth, "unidades_activas"); // lanza ErrorDominio 402 si no hay cupo
      await conSesion(pool, { usuarioId, tenantId, rol: "admin_gestora", colaboradorNivel: null }, async (cliente) => {
        await cliente.query(
          `INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2)`,
          [propiedadId, nombre],
        );
      });
      return "creada";
    }

    const resultados = await Promise.allSettled([
      intentarAltaUnidad("Unidad race A"),
      intentarAltaUnidad("Unidad race B"),
    ]);

    const creadas = resultados.filter((r) => r.status === "fulfilled").length;

    const { rows } = await superusuario.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE p.tenant_id = $1",
      [tenantId],
    );
    const unidadesReales = Number(rows[0]!.n);

    // Si el límite se respetara de verdad, como mucho 1 de las 2 llamadas
    // concurrentes debería haber creado una unidad (o ninguna, si ambas
    // corrieran el chequeo tras la otra ya haber insertado). El bug real:
    // ambas ven "0 de 1" ANTES de que cualquiera inserte, así que las DOS
    // pasan el chequeo y las DOS insertan.
    expect(creadas).toBe(2);
    expect(unidadesReales).toBe(2); // > límite de 1 configurado arriba
  });
});
