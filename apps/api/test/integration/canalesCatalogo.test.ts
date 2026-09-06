import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { crearTenant, crearUsuario } from "../soporte/fixtures.js";

/**
 * Lote 3.4 (RV22, Fase 3): `GET /canales-mexico/catalogo` +
 * `GET /canales-mexico/:canalCodigo/asistente` — catálogo declarativo
 * (migración 0110) + asistente de conexión, siempre de solo lectura
 * (RV22-R-06). Contra `embedded-postgres` real con el rol `app_rv`, mismo
 * patrón que `exportIcal.test.ts` — archivo/fixture propio para no tocar
 * los compartidos (B-007).
 */

process.env.JWT_SECRET = "prueba-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;
let accessToken: string;

function puertoAleatorio(): number {
  return 53000 + Math.floor(Math.random() * 9000);
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-canales-catalogo-test-"));
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
  await servidor.createDatabase("atiende_rv_canales_catalogo_test");

  superusuario = servidor.getPgClient("atiende_rv_canales_catalogo_test");
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

  const tenantId = await crearTenant(superusuario, "T-CANALES-CATALOGO");
  const passwordAdmin = "clave-super-secreta-admin-canales-mx";
  await crearUsuario(superusuario, { tenantId, email: "admin.canalesmx@api-test.local", rol: "admin_gestora", password: passwordAdmin });

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_canales_catalogo_test",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  app = crearApp({ pool });

  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin.canalesmx@api-test.local", password: passwordAdmin }),
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

interface ViaCatalogo {
  viaTecnica: string;
  nivel: "A" | "B" | "C";
  estadoHonesto: string;
  motivo: string | null;
  fuente: string;
}

interface CanalCatalogo {
  canalCodigo: string;
  nombre: string;
  vias: ViaCatalogo[];
}

describe("GET /canales-mexico/catalogo", () => {
  it("sin autenticación es rechazado", async () => {
    const res = await app.request("/canales-mexico/catalogo");
    expect(res.status).toBe(401);
  });

  it("devuelve los 3 niveles A/B/C, Airbnb y Vrbo con dos vías cada uno, y Best Day nunca 'ical'/'sandbox'/'producción'", async () => {
    const res = await app.request("/canales-mexico/catalogo", autenticado());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { canales: CanalCatalogo[] };

    const niveles = new Set(body.canales.flatMap((c) => c.vias.map((v) => v.nivel)));
    expect(niveles).toEqual(new Set(["A", "B", "C"]));

    const airbnb = body.canales.find((c) => c.canalCodigo === "airbnb")!;
    expect(airbnb.vias.map((v) => v.viaTecnica).sort()).toEqual(["api_partner", "ical_import_export"]);

    const bestday = body.canales.find((c) => c.canalCodigo === "bestday")!;
    expect(bestday.vias).toHaveLength(1);
    expect(["ical", "sandbox", "produccion"]).not.toContain(bestday.vias[0]!.estadoHonesto);
    expect(bestday.vias[0]!.motivo).toBeTruthy();

    // RV22-R-06/R-09: todo estado partner_pendiente/no_aplica trae motivo.
    for (const canal of body.canales) {
      for (const via of canal.vias) {
        if (via.estadoHonesto === "partner_pendiente" || via.estadoHonesto === "no_aplica") {
          expect(via.motivo, `${canal.canalCodigo}/${via.viaTecnica} sin motivo`).toBeTruthy();
        }
        expect(via.fuente).toBeTruthy();
      }
    }
  });
});

describe("GET /canales-mexico/:canalCodigo/asistente", () => {
  it("canal desconocido devuelve 404 recurso_no_encontrado", async () => {
    const res = await app.request("/canales-mexico/canal-inventado/asistente", autenticado());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("recurso_no_encontrado");
  });

  it("Booking.com: incluye el motivo de la pausa y nunca promete autoconexión", async () => {
    const res = await app.request("/canales-mexico/booking/asistente", autenticado());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { motivo: string; pasos: string[]; avisoNoAutoconexion: string; estadoHonesto: string };
    expect(body.estadoHonesto).toBe("partner_pendiente");
    expect(body.motivo).toMatch(/pausa/i);
    expect(body.avisoNoAutoconexion).toBeTruthy();
    expect(body.pasos.length).toBeGreaterThan(0);
  });

  it("Airbnb: ?via=ical y ?via=api_partner devuelven asistentes distintos", async () => {
    const ical = await app.request("/canales-mexico/airbnb/asistente?via=ical_import_export", autenticado());
    const api = await app.request("/canales-mexico/airbnb/asistente?via=api_partner", autenticado());
    expect(ical.status).toBe(200);
    expect(api.status).toBe(200);
    const icalBody = (await ical.json()) as { estadoHonesto: string };
    const apiBody = (await api.json()) as { estadoHonesto: string };
    expect(icalBody.estadoHonesto).toBe("ical");
    expect(apiBody.estadoHonesto).toBe("partner_pendiente");
  });
});
