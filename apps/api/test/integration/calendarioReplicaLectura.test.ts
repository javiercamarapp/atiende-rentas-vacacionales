import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { crearPropiedad, crearTenant, crearUnidad, crearUsuario } from "../soporte/fixtures.js";

/**
 * H-091/REQ-166 (§Operación-3) — wiring REAL de `EnrutadorLecturaReplica`
 * (`packages/db/src/runner/enrutadorLecturaReplica.ts`) al endpoint HTTP
 * `GET /unidades/:id/calendario`, contra DOS clusters `embedded-postgres`
 * reales e independientes (primario + una "réplica" sembrada a mano —
 * mismo límite honesto documentado en `enrutadorLecturaReplica.ts` y en
 * `packages/db/test/integration/enrutadorLecturaReplica.test.ts`: nunca
 * streaming replication real, imposible de levantar aquí).
 *
 * Lo que prueba, contra procesos Postgres reales (no mocks):
 * 1. Con la réplica sana, la lectura del calendario viene de VERDAD de
 *    ella (dato presente SOLO en la réplica, ausente del primario).
 * 2. Al APAGAR el proceso de la réplica (`servidorReplica.stop()`, un
 *    cluster completo, no una función que lanza), la MISMA ruta HTTP cae
 *    automáticamente al primario ante un error REAL de conexión — sin que
 *    el cliente reciba nunca un error 5xx por esto.
 * 3. Sin `poolReplica` (comportamiento por defecto sin `DATABASE_URL_REPLICA`),
 *    la ruta funciona exactamente igual que antes de H-091 — regresión.
 */

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

process.env.JWT_SECRET = "prueba-jwt-secret-h091-al-menos-32-caracteres-0000";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

interface ClusterLevantado {
  dir: string;
  servidor: EmbeddedPostgres;
  superusuario: pg.Client;
  pool: pg.Pool;
}

function puertoAleatorio(): number {
  return 58000 + Math.floor(Math.random() * 2000);
}

async function levantarCluster(nombreBd: string): Promise<ClusterLevantado> {
  const dir = await mkdtemp(join(tmpdir(), `atiende-rv-h091-${nombreBd}-`));
  const puerto = puertoAleatorio();
  const servidor = new EmbeddedPostgres({
    databaseDir: dir,
    port: puerto,
    user: "postgres",
    password: "postgres",
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

  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: nombreBd,
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  // Esta prueba APAGA el cluster de la réplica a mitad de suite
  // (`servidor.stop()`) con el `pool` todavía vivo (a propósito: es
  // exactamente lo que fuerza el fallback real) — el cliente idle del
  // pool recibe entonces "terminating connection due to administrator
  // command" de Postgres. `pg.Pool` reemite ese error de un cliente idle
  // como evento `error` del propio pool; sin un listener, Node lo trata
  // como una excepción no capturada y tumba la corrida de vitest aunque
  // todas las aserciones hayan pasado. Un listener no-op es el manejo
  // correcto aquí (no un `try/catch`: no hay ninguna promesa que atrapar,
  // es un evento asíncrono del socket) — el propio fallback YA se prueba
  // por su efecto real (`onFallback` + los datos devueltos), este
  // listener no oculta ningún fallo de la prueba.
  pool.on("error", () => undefined);

  return { dir, servidor, superusuario, pool };
}

async function login(app: ReturnType<typeof crearApp>, email: string, password: string): Promise<string> {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken: string };
  if (res.status !== 200 || !body.accessToken) {
    throw new Error(`login falló en la prueba: status=${res.status} body=${JSON.stringify(body)}`);
  }
  return body.accessToken;
}

function autenticado(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } };
}

interface NocheCalendario {
  fecha: string;
  ocupada: boolean;
}

let primario: ClusterLevantado;
let replica: ClusterLevantado;
let tenantId: string;
let unidadId: string;
const emailAdmin = "admin.h091@api-test.local";
const passwordAdmin = "clave-super-secreta-admin-h091";

// Ventana de fechas de la prueba: DIA_PRIMARIO solo tiene ocupación en el
// cluster PRIMARIO; DIA_REPLICA solo la tiene en la "réplica" — así el
// origen real de cada lectura queda inequívoco por el propio contenido de
// la respuesta, sin instrumentar la app para "hacer trampa".
const DESDE = "2027-01-01";
const DIA_PRIMARIO = "2027-01-05";
const DIA_REPLICA = "2027-01-10";
const HASTA = "2027-01-15";

beforeAll(async () => {
  primario = await levantarCluster("atiende_rv_h091_primario");
  replica = await levantarCluster("atiende_rv_h091_replica");

  tenantId = await crearTenant(primario.superusuario, "T-H091");
  const propiedadId = await crearPropiedad(primario.superusuario, tenantId, { nombre: "Casa H091" });
  unidadId = await crearUnidad(primario.superusuario, propiedadId, { nombre: "U-H091", duracionMinimaNoches: 1 });
  await crearUsuario(primario.superusuario, {
    tenantId,
    email: emailAdmin,
    rol: "admin_gestora",
    password: passwordAdmin,
  });
  await primario.superusuario.query(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon)
     VALUES ($1, daterange($2, $3, '[)'), 'bloqueo', 'BLOQUEO_PROPIETARIO')`,
    [unidadId, DIA_PRIMARIO, "2027-01-06"],
  );

  // Clonado MANUAL (no streaming replication, ver cabecera) de las filas
  // que RLS necesita para autorizar la MISMA sesión (mismo tenantId/
  // unidadId/usuarioId del JWT emitido por el login contra el PRIMARIO)
  // sobre la conexión de la réplica — con un dato de ocupación DISTINTO
  // para poder distinguir, leyendo la respuesta HTTP, cuál cluster
  // respondió de verdad.
  const usuarioAdminId = (
    await primario.superusuario.query<{ id: string }>("SELECT id FROM usuario WHERE email = $1", [emailAdmin])
  ).rows[0]!.id;
  const propiedadFila = (
    await primario.superusuario.query<{ tenant_id: string; nombre: string; zona_horaria: string }>(
      "SELECT tenant_id, nombre, zona_horaria FROM propiedad WHERE id = $1",
      [propiedadId],
    )
  ).rows[0]!;

  await replica.superusuario.query("INSERT INTO tenant (id, nombre) VALUES ($1, 'T-H091')", [tenantId]);
  await replica.superusuario.query(
    "INSERT INTO propiedad (id, tenant_id, nombre, zona_horaria) VALUES ($1, $2, $3, $4)",
    [propiedadId, propiedadFila.tenant_id, propiedadFila.nombre, propiedadFila.zona_horaria],
  );
  await replica.superusuario.query("INSERT INTO unidad (id, propiedad_id, nombre) VALUES ($1, $2, 'U-H091')", [
    unidadId,
    propiedadId,
  ]);
  await replica.superusuario.query(
    "INSERT INTO usuario (id, tenant_id, email, rol, password_hash) VALUES ($1, $2, $3, 'admin_gestora', 'no-se-usa-nunca-para-login')",
    [usuarioAdminId, tenantId, emailAdmin],
  );
  await replica.superusuario.query(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon)
     VALUES ($1, daterange($2, $3, '[)'), 'bloqueo', 'BLOQUEO_PROPIETARIO')`,
    [unidadId, DIA_REPLICA, "2027-01-11"],
  );
}, 180_000);

afterAll(async () => {
  await primario.pool?.end().catch(() => undefined);
  await replica.pool?.end().catch(() => undefined);
  await primario.superusuario.end().catch(() => undefined);
  await replica.superusuario.end().catch(() => undefined);
  await primario.servidor.stop().catch(() => undefined);
  await replica.servidor.stop().catch(() => undefined);
  await rm(primario.dir, { recursive: true, force: true }).catch(() => undefined);
  await rm(replica.dir, { recursive: true, force: true }).catch(() => undefined);
});

describe("GET /unidades/:id/calendario — EnrutadorLecturaReplica conectado al endpoint real (H-091/REQ-166)", () => {
  it("con DATABASE_URL_REPLICA configurada (poolReplica sano), la lectura viene de la RÉPLICA — nunca del primario", async () => {
    const app = crearApp({ pool: primario.pool, poolReplica: replica.pool });
    const token = await login(app, emailAdmin, passwordAdmin);

    const res = await app.request(
      `/unidades/${unidadId}/calendario?desde=${DESDE}&hasta=${HASTA}`,
      autenticado(token),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { noches: NocheCalendario[] };
    const porFecha = new Map(body.noches.map((n) => [n.fecha, n.ocupada]));

    // El dato que SOLO existe en la réplica está ocupado; el que SOLO
    // existe en el primario NO aparece — prueba, por contenido real, que
    // esta lectura vino de la réplica.
    expect(porFecha.get(DIA_REPLICA)).toBe(true);
    expect(porFecha.get(DIA_PRIMARIO)).toBe(false);
  });

  it("al APAGAR el cluster de la réplica (proceso real detenido), la MISMA ruta cae automáticamente al primario — 200, nunca un error", async () => {
    await replica.servidor.stop();

    const app = crearApp({ pool: primario.pool, poolReplica: replica.pool });
    const token = await login(app, emailAdmin, passwordAdmin);

    const res = await app.request(
      `/unidades/${unidadId}/calendario?desde=${DESDE}&hasta=${HASTA}`,
      autenticado(token),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { noches: NocheCalendario[] };
    const porFecha = new Map(body.noches.map((n) => [n.fecha, n.ocupada]));

    // Ahora el dato visible es el del PRIMARIO — la réplica está apagada
    // de verdad (proceso Postgres detenido, no un mock que lanza).
    expect(porFecha.get(DIA_PRIMARIO)).toBe(true);
    expect(porFecha.get(DIA_REPLICA)).toBe(false);
  });

  it("sin poolReplica (comportamiento por defecto sin DATABASE_URL_REPLICA), la ruta funciona exactamente igual que antes de H-091", async () => {
    const app = crearApp({ pool: primario.pool, poolReplica: null });
    const token = await login(app, emailAdmin, passwordAdmin);

    const res = await app.request(
      `/unidades/${unidadId}/calendario?desde=${DESDE}&hasta=${HASTA}`,
      autenticado(token),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { noches: NocheCalendario[] };
    const porFecha = new Map(body.noches.map((n) => [n.fecha, n.ocupada]));
    expect(porFecha.get(DIA_PRIMARIO)).toBe(true);
  });
});
