import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { hashContrasena } from "../../src/seguridad/contrasenas.js";

/**
 * Pruebas de integración de Lote 5 (E08, H-049 a H-055) contra
 * `embedded-postgres` real con el rol `app_rv` — mismo patrón que
 * `apps/api/test/integration/api.test.ts` (Lote 3), suite propia para no
 * tocar ese archivo (carpetas exclusivas, docs/fase2/LOTES.md).
 *
 * `npm run test:integration -- --filter=limpieza` (comando de prueba de
 * Lote 5 en docs/fase2/LOTES.md) ejecuta este archivo por nombre.
 */

process.env.JWT_SECRET = "prueba-jwt-secret-lote5-de-al-menos-32-caracteres-0987654321";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;

interface Fixture {
  tenantA: string;
  unidadA: string;
  ownerA: string;
  emailAdminA: string;
  passwordAdminA: string;
  emailLimpiezaAsignada: string;
  passwordLimpiezaAsignada: string;
  usuarioLimpiezaAsignadaId: string;
  emailLimpiezaOtra: string;
  passwordLimpiezaOtra: string;
  emailPropietarioA: string;
  passwordPropietarioA: string;
  emailOperadorSolo: string;
  passwordOperadorSolo: string;
}
let fx: Fixture;

function puertoAleatorio(): number {
  return 55000 + Math.floor(Math.random() * 9000);
}

async function login(email: string, password: string) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken: string };
  return { status: res.status, accessToken: body.accessToken };
}

function autenticado(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } };
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-limpieza-test-"));
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
  await servidor.createDatabase("atiende_rv_limpieza_test");

  superusuario = servidor.getPgClient("atiende_rv_limpieza_test");
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

  const tenantA = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-LIMPIEZA-A') RETURNING id");
  const egA = await superusuario.query<{ id: string }>(
    "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'EG Limpieza A') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const ownerA = await superusuario.query<{ id: string }>(
    "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner Limpieza A') RETURNING id",
    [egA.rows[0]!.id],
  );
  const propA = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop Limpieza A', 'America/Cancun') RETURNING id",
    [tenantA.rows[0]!.id],
  );
  const unidadA = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, owner_id, nombre, duracion_minima_noches) VALUES ($1, $2, 'U-Limpieza-A', 1) RETURNING id",
    [propA.rows[0]!.id, ownerA.rows[0]!.id],
  );

  const passwordAdminA = "clave-super-secreta-admin-l5";
  const passwordLimpiezaAsignada = "clave-limpieza-asignada-l5";
  const passwordLimpiezaOtra = "clave-limpieza-otra-l5";
  const passwordPropietarioA = "clave-propietario-a-l5";
  const passwordOperadorSolo = "clave-operador-solo-l5";

  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantA.rows[0]!.id, "admin.a@limpieza-test.local", await hashContrasena(passwordAdminA)],
  );
  const limpiezaAsignada = await superusuario.query<{ id: string }>(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'limpieza', $3) RETURNING id`,
    [tenantA.rows[0]!.id, "limpieza.asignada@limpieza-test.local", await hashContrasena(passwordLimpiezaAsignada)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'limpieza', $3)`,
    [tenantA.rows[0]!.id, "limpieza.otra@limpieza-test.local", await hashContrasena(passwordLimpiezaOtra)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, owner_id, password_hash) VALUES ($1, $2, 'propietario', $3, $4)`,
    [tenantA.rows[0]!.id, "propietario.a@limpieza-test.local", ownerA.rows[0]!.id, await hashContrasena(passwordPropietarioA)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, colaborador_nivel, password_hash) VALUES ($1, $2, 'operador', 'solo_calendario', $3)`,
    [tenantA.rows[0]!.id, "operador.solo@limpieza-test.local", await hashContrasena(passwordOperadorSolo)],
  );

  fx = {
    tenantA: tenantA.rows[0]!.id,
    unidadA: unidadA.rows[0]!.id,
    ownerA: ownerA.rows[0]!.id,
    emailAdminA: "admin.a@limpieza-test.local",
    passwordAdminA,
    emailLimpiezaAsignada: "limpieza.asignada@limpieza-test.local",
    passwordLimpiezaAsignada,
    usuarioLimpiezaAsignadaId: limpiezaAsignada.rows[0]!.id,
    emailLimpiezaOtra: "limpieza.otra@limpieza-test.local",
    passwordLimpiezaOtra,
    emailPropietarioA: "propietario.a@limpieza-test.local",
    passwordPropietarioA,
    emailOperadorSolo: "operador.solo@limpieza-test.local",
    passwordOperadorSolo,
  };

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_limpieza_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  app = crearApp({ pool });
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("§Limpieza-1: generación y reprogramación de tarea al checkout", () => {
  it("confirmar un checkout de prueba crea una tarea de limpieza vinculada; modificar la fecha la reprograma preservando el responsable", async () => {
    const { accessToken } = await login(fx.emailAdminA, fx.passwordAdminA);

    const reserva = await app.request(
      "/reservas",
      autenticado(accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-06-01", fin: "2026-06-05" } }),
      }),
    );
    expect(reserva.status).toBe(201);
    const reservaBody = (await reserva.json()) as { id: string };

    const procesado = await app.request("/operacion/tareas/procesar-eventos", autenticado(accessToken, { method: "POST" }));
    expect(procesado.status).toBe(200);
    const procesadoBody = (await procesado.json()) as { tareasCreadas: string[] };
    expect(procesadoBody.tareasCreadas).toHaveLength(1);
    const tareaId = procesadoBody.tareasCreadas[0]!;

    const asignar = await app.request(
      `/operacion/tareas/${tareaId}/asignar`,
      autenticado(accessToken, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asignadoA: fx.usuarioLimpiezaAsignadaId, esProveedorExterno: false }),
      }),
    );
    expect(asignar.status).toBe(200);

    const patch = await app.request(
      `/reservas/${reservaBody.id}`,
      autenticado(accessToken, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rango: { inicio: "2026-06-01", fin: "2026-06-07" } }),
      }),
    );
    expect(patch.status).toBe(200);

    const reprocesado = await app.request("/operacion/tareas/procesar-eventos", autenticado(accessToken, { method: "POST" }));
    const reprocesadoBody = (await reprocesado.json()) as { tareasReprogramadas: string[] };
    expect(reprocesadoBody.tareasReprogramadas).toEqual([tareaId]);

    const detalle = await app.request(`/operacion/tareas/${tareaId}`, autenticado(accessToken));
    const detalleBody = (await detalle.json()) as { programadaPara: string; asignadoA: string };
    expect(detalleBody.programadaPara).toBe("2026-06-07");
    expect(detalleBody.asignadoA).toBe(fx.usuarioLimpiezaAsignadaId);
  });
});

describe("§Limpieza-2: RLS de limpieza — solo ve/opera su propia tarea asignada", () => {
  it("una tarea recién creada no es visible para limpieza hasta que se le asigna; otro usuario de limpieza nunca la ve", async () => {
    const { accessToken: tokenAdmin } = await login(fx.emailAdminA, fx.passwordAdminA);
    const reserva = await app.request(
      "/reservas",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-07-01", fin: "2026-07-03" } }),
      }),
    );
    expect(reserva.status).toBe(201);
    const procesado = await app.request("/operacion/tareas/procesar-eventos", autenticado(tokenAdmin, { method: "POST" }));
    const { tareasCreadas } = (await procesado.json()) as { tareasCreadas: string[] };
    const tareaId = tareasCreadas[0]!;

    const { accessToken: tokenLimpiezaAsignada } = await login(fx.emailLimpiezaAsignada, fx.passwordLimpiezaAsignada);
    const { accessToken: tokenLimpiezaOtra } = await login(fx.emailLimpiezaOtra, fx.passwordLimpiezaOtra);

    // Antes de asignar: ningún usuario de limpieza la ve.
    const listaAntes = await app.request("/operacion/tareas", autenticado(tokenLimpiezaAsignada));
    const listaAntesBody = (await listaAntes.json()) as { tareas: { id: string }[] };
    expect(listaAntesBody.tareas.find((t) => t.id === tareaId)).toBeUndefined();

    await app.request(
      `/operacion/tareas/${tareaId}/asignar`,
      autenticado(tokenAdmin, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asignadoA: fx.usuarioLimpiezaAsignadaId, esProveedorExterno: false }),
      }),
    );

    const listaDespues = await app.request("/operacion/tareas", autenticado(tokenLimpiezaAsignada));
    const listaDespuesBody = (await listaDespues.json()) as { tareas: { id: string }[] };
    expect(listaDespuesBody.tareas.map((t) => t.id)).toContain(tareaId);

    // El OTRO usuario de limpieza (no asignado) nunca ve esta tarea, ni por
    // listado ni por acceso directo (RLS + chequeo de aplicación).
    const listaOtra = await app.request("/operacion/tareas", autenticado(tokenLimpiezaOtra));
    const listaOtraBody = (await listaOtra.json()) as { tareas: { id: string }[] };
    expect(listaOtraBody.tareas.find((t) => t.id === tareaId)).toBeUndefined();

    const detalleOtra = await app.request(`/operacion/tareas/${tareaId}`, autenticado(tokenLimpiezaOtra));
    expect(detalleOtra.status).toBe(404);
  });
});

describe("§Limpieza-2: checklist con fotos/timestamps + bloqueo de completar (REQ-113)", () => {
  it("no se puede completar la tarea con checklist pendiente (409); al completar todo, sí se puede", async () => {
    const { accessToken: tokenAdmin } = await login(fx.emailAdminA, fx.passwordAdminA);
    const reserva = await app.request(
      "/reservas",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-08-01", fin: "2026-08-03" } }),
      }),
    );
    expect(reserva.status).toBe(201);
    const procesado = await app.request("/operacion/tareas/procesar-eventos", autenticado(tokenAdmin, { method: "POST" }));
    const { tareasCreadas } = (await procesado.json()) as { tareasCreadas: string[] };
    const tareaId = tareasCreadas[0]!;
    await app.request(
      `/operacion/tareas/${tareaId}/asignar`,
      autenticado(tokenAdmin, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asignadoA: fx.usuarioLimpiezaAsignadaId, esProveedorExterno: true }),
      }),
    );

    const { accessToken: tokenLimpieza } = await login(fx.emailLimpiezaAsignada, fx.passwordLimpiezaAsignada);

    const detalle = await app.request(`/operacion/tareas/${tareaId}`, autenticado(tokenLimpieza));
    const detalleBody = (await detalle.json()) as { checklist: { id: string }[] };
    expect(detalleBody.checklist.length).toBeGreaterThan(0);

    const primerCompletar = await app.request(
      `/operacion/tareas/${tareaId}/completar`,
      autenticado(tokenLimpieza, { method: "POST" }),
    );
    expect(primerCompletar.status).toBe(409);
    const primerCompletarBody = (await primerCompletar.json()) as { error: { codigo: string } };
    expect(primerCompletarBody.error.codigo).toBe("conflicto_pendiente");

    for (const item of detalleBody.checklist) {
      const res = await app.request(
        `/operacion/tareas/${tareaId}/checklist/${item.id}/completar`,
        autenticado(tokenLimpieza, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fotos: [{ rutaAlmacenamiento: `dev-local/${item.id}.jpg` }] }),
        }),
      );
      expect(res.status).toBe(204);
    }

    const segundoCompletar = await app.request(
      `/operacion/tareas/${tareaId}/completar`,
      autenticado(tokenLimpieza, { method: "POST" }),
    );
    expect(segundoCompletar.status).toBe(200);
  });
});

describe("§RV19/21-6: incidencia grave → bloqueo de mantenimiento SOLO con confirmación humana", () => {
  it("una incidencia leve no puede confirmar bloqueo (422); una grave sí, y el bloqueo NUNCA cancela reservas activas", async () => {
    const { accessToken: tokenAdmin } = await login(fx.emailAdminA, fx.passwordAdminA);

    const reserva = await app.request(
      "/reservas",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, rango: { inicio: "2026-09-01", fin: "2026-09-10" } }),
      }),
    );
    expect(reserva.status).toBe(201);
    const reservaBody = (await reserva.json()) as { id: string };

    const incidenciaLeve = await app.request(
      "/operacion/incidencias",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, severidad: "leve", titulo: "Foco fundido" }),
      }),
    );
    expect(incidenciaLeve.status).toBe(201);
    const incidenciaLeveBody = (await incidenciaLeve.json()) as { id: string; requiereConfirmacionHumana: boolean };
    expect(incidenciaLeveBody.requiereConfirmacionHumana).toBe(false);

    const intentoConfirmarLeve = await app.request(
      `/operacion/incidencias/${incidenciaLeveBody.id}/confirmar-bloqueo`,
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rango: { inicio: "2026-09-03", fin: "2026-09-04" } }),
      }),
    );
    expect(intentoConfirmarLeve.status).toBe(422);

    const incidenciaGrave = await app.request(
      "/operacion/incidencias",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unidadId: fx.unidadA,
          severidad: "grave",
          titulo: "Fuga de gas",
          propuestaBloqueoRango: { inicio: "2026-09-04", fin: "2026-09-05" },
        }),
      }),
    );
    expect(incidenciaGrave.status).toBe(201);
    const incidenciaGraveBody = (await incidenciaGrave.json()) as { id: string; requiereConfirmacionHumana: boolean };
    expect(incidenciaGraveBody.requiereConfirmacionHumana).toBe(true);

    const confirmar = await app.request(
      `/operacion/incidencias/${incidenciaGraveBody.id}/confirmar-bloqueo`,
      autenticado(tokenAdmin, { method: "POST" }),
    );
    expect(confirmar.status).toBe(200);
    const confirmarBody = (await confirmar.json()) as { conflictosCapaCruzada: number };
    expect(confirmarBody.conflictosCapaCruzada).toBe(1); // solapa con la reserva 2026-09-01..10

    // La reserva original sigue confirmada — nunca se cancela.
    const calendario = await app.request(
      `/unidades/${fx.unidadA}/calendario?desde=2026-09-01&hasta=2026-09-10`,
      autenticado(tokenAdmin),
    );
    const calendarioBody = (await calendario.json()) as {
      noches: { fecha: string; razon: string | null }[];
    };
    // RESERVA_CANAL tiene mayor precedencia que MANTENIMIENTO (D-002): la
    // noche 2026-09-04 sigue mostrando la reserva como razón dominante.
    const noche = calendarioBody.noches.find((n) => n.fecha === "2026-09-04");
    expect(noche?.razon).toBe("RESERVA_CANAL");
    void reservaBody;
  });

  it("un operador 'solo_calendario' no puede confirmar un bloqueo de mantenimiento (403)", async () => {
    const { accessToken: tokenAdmin } = await login(fx.emailAdminA, fx.passwordAdminA);
    const incidencia = await app.request(
      "/operacion/incidencias",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unidadId: fx.unidadA,
          severidad: "grave",
          titulo: "Corto circuito",
          propuestaBloqueoRango: { inicio: "2026-10-01", fin: "2026-10-02" },
        }),
      }),
    );
    const incidenciaBody = (await incidencia.json()) as { id: string };

    const { accessToken: tokenOperadorSolo } = await login(fx.emailOperadorSolo, fx.passwordOperadorSolo);
    const intento = await app.request(
      `/operacion/incidencias/${incidenciaBody.id}/confirmar-bloqueo`,
      autenticado(tokenOperadorSolo, { method: "POST" }),
    );
    expect(intento.status).toBe(403);
  });
});

describe("§Roles-4: propietario tiene solo lectura de la operación de sus propiedades", () => {
  it("propietarioA puede LEER tareas de su unidad pero no puede crear una tarea manual (403)", async () => {
    const { accessToken: tokenAdmin } = await login(fx.emailAdminA, fx.passwordAdminA);
    const tareaManual = await app.request(
      "/operacion/tareas",
      autenticado(tokenAdmin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, tipo: "mantenimiento", programadaPara: "2026-11-01" }),
      }),
    );
    expect(tareaManual.status).toBe(201);
    const tareaManualBody = (await tareaManual.json()) as { id: string };

    const { accessToken: tokenPropietario } = await login(fx.emailPropietarioA, fx.passwordPropietarioA);
    const lectura = await app.request("/operacion/tareas", autenticado(tokenPropietario));
    expect(lectura.status).toBe(200);
    const lecturaBody = (await lectura.json()) as { tareas: { id: string }[] };
    expect(lecturaBody.tareas.map((t) => t.id)).toContain(tareaManualBody.id);

    const intentoCrear = await app.request(
      "/operacion/tareas",
      autenticado(tokenPropietario, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unidadId: fx.unidadA, tipo: "inspeccion", programadaPara: "2026-11-05" }),
      }),
    );
    expect(intentoCrear.status).toBe(403);
  });
});
