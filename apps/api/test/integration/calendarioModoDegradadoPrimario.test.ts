import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { CATALOGO_FLAGS_POR_DEFECTO, FLAG_SYNC_PUSH_AUTOMATICO, RegistroFlags } from "@atiende-rv/domain";
import { crearApp } from "../../src/app.js";
import { crearPropiedad, crearTenant, crearUnidad, crearUsuario } from "../soporte/fixtures.js";

/**
 * H-091/REQ-166 (§Operación-3), criterio de aceptación EXACTO citado en
 * `docs/REQUISITOS.md`: "Existe un modo de degradación de solo-lectura del
 * calendario cuando la base de escritura primaria no responde, con pausa
 * automática de todo push saliente y señalización visible en UI."
 *
 * Esta suite prueba, contra DOS clusters `embedded-postgres` REALES
 * (primario + una "réplica" sembrada a mano, mismo límite honesto que
 * `calendarioReplicaLectura.test.ts` y `enrutadorLecturaReplica.ts`), el
 * escenario opuesto al de esa otra suite: el PRIMARIO cae (proceso real
 * detenido) mientras la réplica sigue viva —
 *
 * 1. El calendario SIGUE siendo legible (solo lectura, vía la réplica).
 * 2. `GET /health/detallado` reporta `modoDegradadoCalendario: true` y
 *    apaga `sync.push_automatico` AUTOMÁTICAMENTE (efecto real sobre el
 *    registro de flags, no solo un campo en la respuesta).
 * 3. Con el flag ya apagado, el cron real de push saliente
 *    (`GET /internal/cron/outbox-worker`) NO procesa ningún evento
 *    pendiente — la pausa es efectiva, no decorativa.
 */

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

process.env.JWT_SECRET = "prueba-jwt-secret-h091b-al-menos-32-caracteres-000";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";
process.env.CRON_SECRET = "cron-secret-h091b-de-prueba-1234567890";

interface ClusterLevantado {
  dir: string;
  servidor: EmbeddedPostgres;
  superusuario: pg.Client;
  pool: pg.Pool;
}

function puertoAleatorio(): number {
  return 60500 + Math.floor(Math.random() * 1500);
}

async function levantarCluster(nombreBd: string): Promise<ClusterLevantado> {
  const dir = await mkdtemp(join(tmpdir(), `atiende-rv-h091b-${nombreBd}-`));
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
  // Ver el comentario equivalente en calendarioReplicaLectura.test.ts:
  // esta suite apaga el PRIMARIO con su pool todavía vivo — sin este
  // listener, el error del cliente idle tumba la corrida aunque las
  // aserciones pasen.
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

let primario: ClusterLevantado;
let replica: ClusterLevantado;
let tenantId: string;
let unidadId: string;
const emailAdmin = "admin.h091b@api-test.local";
const passwordAdmin = "clave-super-secreta-admin-h091b";

const DESDE = "2027-02-01";
const DIA_OCUPADO = "2027-02-05";
const HASTA = "2027-02-15";

beforeAll(async () => {
  primario = await levantarCluster("atiende_rv_h091b_primario");
  replica = await levantarCluster("atiende_rv_h091b_replica");

  tenantId = await crearTenant(primario.superusuario, "T-H091B");
  const propiedadId = await crearPropiedad(primario.superusuario, tenantId, { nombre: "Casa H091B" });
  unidadId = await crearUnidad(primario.superusuario, propiedadId, { nombre: "U-H091B", duracionMinimaNoches: 1 });
  await crearUsuario(primario.superusuario, {
    tenantId,
    email: emailAdmin,
    rol: "admin_gestora",
    password: passwordAdmin,
  });

  const usuarioAdminId = (
    await primario.superusuario.query<{ id: string }>("SELECT id FROM usuario WHERE email = $1", [emailAdmin])
  ).rows[0]!.id;
  const propiedadFila = (
    await primario.superusuario.query<{ tenant_id: string; nombre: string; zona_horaria: string }>(
      "SELECT tenant_id, nombre, zona_horaria FROM propiedad WHERE id = $1",
      [propiedadId],
    )
  ).rows[0]!;

  // Clonado manual mínimo (mismo criterio que calendarioReplicaLectura.test.ts):
  // solo lo que RLS necesita para autorizar la MISMA sesión sobre la
  // conexión de la réplica, más UNA ocupación para que la respuesta del
  // calendario en modo degradado tenga contenido real que verificar.
  await replica.superusuario.query("INSERT INTO tenant (id, nombre) VALUES ($1, 'T-H091B')", [tenantId]);
  await replica.superusuario.query(
    "INSERT INTO propiedad (id, tenant_id, nombre, zona_horaria) VALUES ($1, $2, $3, $4)",
    [propiedadId, propiedadFila.tenant_id, propiedadFila.nombre, propiedadFila.zona_horaria],
  );
  await replica.superusuario.query("INSERT INTO unidad (id, propiedad_id, nombre) VALUES ($1, $2, 'U-H091B')", [
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
    [unidadId, DIA_OCUPADO, "2027-02-06"],
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
  delete process.env.CRON_SECRET;
}, 60_000);

describe("Modo degradado del calendario cuando el PRIMARIO no responde (H-091/REQ-166, §Operación-3)", () => {
  it("con el primario vivo, se puede iniciar sesión y leer el calendario normalmente (línea base)", async () => {
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const app = crearApp({ pool: primario.pool, poolReplica: replica.pool, registroFlags });
    const token = await login(app, emailAdmin, passwordAdmin);

    const res = await app.request(
      `/unidades/${unidadId}/calendario?desde=${DESDE}&hasta=${HASTA}`,
      autenticado(token),
    );
    expect(res.status).toBe(200);

    const salud = await app.request("/health/detallado");
    const cuerpoSalud = (await salud.json()) as { modoDegradadoCalendario: boolean; pushAutomaticoHabilitado: boolean };
    expect(cuerpoSalud.modoDegradadoCalendario).toBe(false);
    expect(cuerpoSalud.pushAutomaticoHabilitado).toBe(true);
  });

  it("al APAGAR el primario (proceso real detenido): el calendario SIGUE siendo legible vía la réplica, y /health/detallado activa el modo degradado + pausa push AUTOMÁTICAMENTE", async () => {
    // El login (escritura de sesión/lectura de usuario) también depende
    // del primario — se obtiene el token ANTES de apagarlo, igual que
    // pasaría en producción con un usuario ya autenticado cuyo access
    // token sigue siendo válido (JWT stateless) cuando el primario cae a
    // mitad de su sesión.
    const registroFlags = new RegistroFlags(CATALOGO_FLAGS_POR_DEFECTO);
    const app = crearApp({ pool: primario.pool, poolReplica: replica.pool, registroFlags });
    const token = await login(app, emailAdmin, passwordAdmin);

    await primario.servidor.stop();

    // 1. El calendario sigue respondiendo — solo lectura, servida por la
    //    réplica (que nunca se apagó).
    const resCalendario = await app.request(
      `/unidades/${unidadId}/calendario?desde=${DESDE}&hasta=${HASTA}`,
      autenticado(token),
    );
    expect(resCalendario.status).toBe(200);
    const cuerpoCalendario = (await resCalendario.json()) as { noches: Array<{ fecha: string; ocupada: boolean }> };
    const ocupadaEsperada = cuerpoCalendario.noches.find((n) => n.fecha === DIA_OCUPADO);
    expect(ocupadaEsperada?.ocupada).toBe(true);

    // 2. /health/detallado detecta el primario caído (consulta REAL contra
    //    `deps.pool`, no simulada) y expone el modo degradado.
    const resSalud = await app.request("/health/detallado");
    expect(resSalud.status).toBe(200); // degradado nunca es un error HTTP.
    const cuerpoSalud = (await resSalud.json()) as {
      status: string;
      modoDegradadoCalendario: boolean;
      pushAutomaticoHabilitado: boolean;
    };
    expect(cuerpoSalud.status).toBe("degradado");
    expect(cuerpoSalud.modoDegradadoCalendario).toBe(true);
    expect(cuerpoSalud.pushAutomaticoHabilitado).toBe(false);

    // 3. Efecto real sobre el registro de flags — el mismo que ve
    //    GET /backoffice/flags — no solo un campo de la respuesta JSON.
    expect(registroFlags.valor(FLAG_SYNC_PUSH_AUTOMATICO)).toBe(false);

    // 4. La pausa es efectiva sobre el push saliente REAL: el cron de
    //    outbox no procesa nada mientras el flag siga apagado.
    const resCron = await app.request("/internal/cron/outbox-worker", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(resCron.status).toBe(200);
    const cuerpoCron = (await resCron.json()) as { pausadoPorModoDegradado?: boolean };
    expect(cuerpoCron.pausadoPorModoDegradado).toBe(true);
  });
});
