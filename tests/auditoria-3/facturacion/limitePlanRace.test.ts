// Auditoría-3 / A3-FACT-02 — CORREGIDO
//
// Hallazgo original: `exigirLimitePlan()` (apps/api/src/routes/
// facturacionLimites.ts) implementaba el límite de plan como un patrón
// "leer uso actual -> comparar contra el límite -> si permitido, dejar
// que la ruta haga el INSERT real", abriendo su PROPIA transacción
// separada de la transacción que hacía el INSERT — un clásico TOCTOU
// (time-of-check to time-of-use). Dos peticiones concurrentes podían
// leer AMBAS "0 de 1" antes de que cualquiera insertara, pasar el
// chequeo las DOS, e insertar las DOS, excediendo el límite del plan.
//
// Corrección verificada aquí: `exigirLimitePlanEnTransaccion()` recibe
// el `PoolClient` de la transacción activa (la MISMA que hace el
// INSERT) y toma, como primera operación, un advisory lock
// TRANSACCIONAL (`pg_advisory_xact_lock`) namespaced por tenant — eso
// serializa, por tenant, el chequeo + INSERT completo: la segunda
// petición concurrente espera a que la PRIMERA transacción entera
// termine (COMMIT o ROLLBACK) antes de leer `medicion_uso_actual`, así
// que ve el uso YA incrementado por la primera y es rechazada con 402
// (`plan_limite_alcanzado`) en vez de insertar.
//
// Este archivo reproduce el escenario exacto pedido por la auditoría —
// dos peticiones CONCURRENTES para dar de alta una unidad cuando el
// plan solo permite 1 unidad activa y el tenant ya tiene 0 — y además
// una variante de mayor concurrencia (5 peticiones a la vez) para
// verificar que la corrección no depende de que solo haya 2
// contendientes.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { exigirLimitePlanEnTransaccion } from "../../../apps/api/src/routes/facturacionLimites.js";
import { conSesion, enTransaccion } from "../../../apps/api/src/db/contexto.js";
import { ErrorDominio } from "../../../apps/api/src/contrato/errores.js";

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

/** Simula exactamente lo que hace `POST /unidades` tras la corrección:
 * el chequeo de límite y el INSERT en la MISMA transacción, sobre el
 * mismo `PoolClient`, con la sesión RLS del tenant fijada. */
async function intentarAltaUnidad(nombre: string): Promise<"creada" | "rechazada"> {
  try {
    await conSesion(pool, { usuarioId, tenantId, rol: "admin_gestora", colaboradorNivel: null }, (cliente) =>
      enTransaccion(cliente, async () => {
        await exigirLimitePlanEnTransaccion(cliente, tenantId, "unidades_activas");
        await cliente.query(`INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, $2)`, [propiedadId, nombre]);
      }),
    );
    return "creada";
  } catch (error) {
    if (error instanceof ErrorDominio && error.codigo === "plan_limite_alcanzado") return "rechazada";
    throw error;
  }
}

async function contarUnidadesReales(): Promise<number> {
  const { rows } = await superusuario.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE p.tenant_id = $1",
    [tenantId],
  );
  return Number(rows[0]!.n);
}

describe("A3-FACT-02 (corregido): exigirLimitePlanEnTransaccion + INSERT unidad es atómico bajo concurrencia real", () => {
  it("2 altas de unidad CONCURRENTES contra un límite de 1: exactamente 1 se crea, la otra se rechaza con 402", async () => {
    const resultados = await Promise.allSettled([
      intentarAltaUnidad("Unidad race A"),
      intentarAltaUnidad("Unidad race B"),
    ]);

    // Ninguna promesa debe rechazar con un error inesperado — solo el
    // valor de retorno "rechazada" (ErrorDominio 402 ya capturado arriba)
    // o "creada".
    for (const r of resultados) {
      if (r.status === "rejected") throw r.reason;
    }
    const valores = resultados.map((r) => (r as PromiseFulfilledResult<"creada" | "rechazada">).value);

    const creadas = valores.filter((v) => v === "creada").length;
    const rechazadas = valores.filter((v) => v === "rechazada").length;
    const unidadesReales = await contarUnidadesReales();

    // Antes de la corrección: ambas veían "0 de 1" ANTES de que
    // cualquiera insertara, así que las DOS pasaban el chequeo y las DOS
    // insertaban (creadas=2, unidadesReales=2 > límite de 1). El
    // advisory lock transaccional por tenant serializa las dos
    // transacciones completas: la segunda solo lee `medicion_uso_actual`
    // después de que la primera hizo COMMIT (o ROLLBACK), así que ve el
    // uso real y es rechazada.
    expect(creadas).toBe(1);
    expect(rechazadas).toBe(1);
    expect(unidadesReales).toBe(1); // nunca excede el límite de 1 configurado arriba
  });

  it("5 altas de unidad CONCURRENTES contra el mismo límite de 1: exactamente 1 se crea (no depende de que solo haya 2 contendientes)", async () => {
    // Punto de partida: 1 unidad ya activa (creada por el test anterior)
    // contra el mismo límite de 1 — así que NINGUNA de estas 5 debería
    // poder crear una unidad nueva.
    const antes = await contarUnidadesReales();
    expect(antes).toBe(1);

    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => intentarAltaUnidad(`Unidad race stress ${i}`)),
    );
    for (const r of resultados) {
      if (r.status === "rejected") throw r.reason;
    }
    const valores = resultados.map((r) => (r as PromiseFulfilledResult<"creada" | "rechazada">).value);

    expect(valores.filter((v) => v === "creada").length).toBe(0);
    expect(valores.filter((v) => v === "rechazada").length).toBe(5);
    expect(await contarUnidadesReales()).toBe(1); // sin cambios: el límite se sostiene
  });
});
