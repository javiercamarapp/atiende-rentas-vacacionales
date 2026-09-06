import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { parsearIcs } from "@atiende-rv/adapters";
import { crearApp } from "../../src/app.js";
import { hashContrasena } from "../../src/seguridad/contrasenas.js";

/**
 * Lote 11B, corrección cruzada #3: "URL de exportación iCal propia" —
 * `GET/POST /export-ical/:unidadId/:canalId` (autenticado) entregan la URL
 * del feed público `GET /feed/ical/:token` (sin autenticación, el token es
 * la credencial). Contra `embedded-postgres` real con el rol `app_rv`,
 * mismo patrón que `api.test.ts`, en su propio archivo/fixture para no
 * tocar ese archivo compartido (B-007: constructores concurrentes sobre el
 * mismo índice de git).
 */

process.env.JWT_SECRET = "prueba-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";
process.env.API_PUBLIC_URL = "http://localhost:8787";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;

let tenantId: string;
let unidadId: string;
let canalAirbnbId: string;
let accessToken: string;

function puertoAleatorio(): number {
  return 51000 + Math.floor(Math.random() * 9000);
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-export-ical-test-"));
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
  await servidor.createDatabase("atiende_rv_export_ical_test");

  superusuario = servidor.getPgClient("atiende_rv_export_ical_test");
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

  const tenant = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('T-EXPORT-ICAL') RETURNING id",
  );
  tenantId = tenant.rows[0]!.id;
  const propiedad = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop Export', 'America/Cancun') RETURNING id",
    [tenantId],
  );
  const unidad = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Depto Export') RETURNING id",
    [propiedad.rows[0]!.id],
  );
  unidadId = unidad.rows[0]!.id;
  const canal = await superusuario.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
  canalAirbnbId = canal.rows[0]!.id;

  // Una reserva confirmada (RESERVA_CANAL) para que el feed exportado
  // tenga al menos un VEVENT real que el parser propio pueda validar.
  await superusuario.query(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2026-12-01', '2026-12-05', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
    [unidadId],
  );

  const passwordAdmin = "clave-super-secreta-admin-export";
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantId, "admin.export@api-test.local", await hashContrasena(passwordAdmin)],
  );

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_export_ical_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  app = crearApp({ pool });

  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin.export@api-test.local", password: passwordAdmin }),
  });
  const loginBody = (await loginRes.json()) as { accessToken: string };
  accessToken = loginBody.accessToken;
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

function autenticado(init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${accessToken}` } };
}

describe("GET /feed/ical/:token — feed público de exportación", () => {
  it("token inválido/inexistente devuelve 404", async () => {
    const res = await app.request("/feed/ical/token-que-nunca-se-emitio.ics");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("recurso_no_encontrado");
  });

  it("token válido devuelve un feed .ics que el parser propio parsea correctamente, sin PII", async () => {
    const emision = await app.request(
      `/export-ical/${unidadId}/${canalAirbnbId}`,
      autenticado({ method: "GET" }),
    );
    expect(emision.status).toBe(200);
    const { url, token } = (await emision.json()) as { url: string; token: string };
    expect(url).toContain(`/feed/ical/${token}.ics`);

    const feedRes = await app.request(`/feed/ical/${token}.ics`);
    expect(feedRes.status).toBe(200);
    expect(feedRes.headers.get("content-type")).toContain("text/calendar");
    const texto = await feedRes.text();

    const normalizado = parsearIcs(texto);
    expect(normalizado.eventos).toHaveLength(1);
    expect(normalizado.eventos[0]!.summary).toBe("Reservado");
    // D-021: nunca datos de huésped/tarifa en el feed exportado.
    expect(texto).not.toMatch(/huesped|email|tarifa|precio/i);
  });

  it("rotar el token invalida el anterior de inmediato y el nuevo funciona", async () => {
    const emision = await app.request(
      `/export-ical/${unidadId}/${canalAirbnbId}`,
      autenticado({ method: "GET" }),
    );
    const { token: tokenViejo } = (await emision.json()) as { token: string };

    const rotacion = await app.request(
      `/export-ical/${unidadId}/${canalAirbnbId}/rotar`,
      autenticado({ method: "POST" }),
    );
    expect(rotacion.status).toBe(200);
    const { token: tokenNuevo } = (await rotacion.json()) as { token: string };
    expect(tokenNuevo).not.toBe(tokenViejo);

    const feedViejo = await app.request(`/feed/ical/${tokenViejo}.ics`);
    expect(feedViejo.status).toBe(404);

    const feedNuevo = await app.request(`/feed/ical/${tokenNuevo}.ics`);
    expect(feedNuevo.status).toBe(200);
  });

  it("GET /export-ical sin autenticación es rechazado", async () => {
    const res = await app.request(`/export-ical/${unidadId}/${canalAirbnbId}`);
    expect(res.status).toBe(401);
  });
});
