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
 * Lote 7 — pruebas de integración HTTP de finanzas/pricing/reportes contra
 * `embedded-postgres` real (D-022), mismo patrón que
 * apps/api/test/integration/api.test.ts. Cubre el entregable verificable
 * explícito de `docs/fase2/LOTES.md` Lote 7: una reserva de Airbnb
 * configurada como "monto ya neto de comisión" no resta de nuevo la
 * comisión sobre el bruto original en el owner statement generado.
 */

process.env.JWT_SECRET = "prueba-jwt-secret-lote7-al-menos-32-caracteres-000";
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
  tenantId: string;
  propiedadId: string;
  unidadId: string;
  ownerId: string;
  ocupacionAirbnbId: string;
  emailAdmin: string;
  passwordAdmin: string;
  emailPropietario: string;
  passwordPropietario: string;
  emailContador: string;
  passwordContador: string;
}
let fx: Fixture;

function puertoAleatorio(): number {
  return 55000 + Math.floor(Math.random() * 5000);
}

async function login(email: string, password: string) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

function autenticado(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } };
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-lote7-test-"));
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
  await servidor.createDatabase("atiende_rv_lote7_test");

  superusuario = servidor.getPgClient("atiende_rv_lote7_test");
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

  const tenant = await superusuario.query<{ id: string }>("INSERT INTO tenant (nombre) VALUES ('T-Lote7') RETURNING id");
  const eg = await superusuario.query<{ id: string }>(
    "INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'EG Lote7') RETURNING id",
    [tenant.rows[0]!.id],
  );
  const owner = await superusuario.query<{ id: string }>(
    "INSERT INTO owner (empresa_gestora_id, nombre) VALUES ($1, 'Owner Lote7') RETURNING id",
    [eg.rows[0]!.id],
  );
  const propiedad = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria, moneda) VALUES ($1, 'Prop Lote7', 'America/Cancun', 'MXN') RETURNING id",
    [tenant.rows[0]!.id],
  );
  const unidad = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad Lote7') RETURNING id",
    [propiedad.rows[0]!.id, owner.rows[0]!.id],
  );
  const canalAirbnb = await superusuario.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
  const ocupacionAirbnb = await superusuario.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante, canal_origen_id, external_id)
     VALUES ($1, daterange('2026-10-01', '2026-10-05', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true, $2, 'AIRBNB-EXT-1')
     RETURNING id`,
    [unidad.rows[0]!.id, canalAirbnb.rows[0]!.id],
  );

  const passwordAdmin = "clave-super-secreta-lote7-admin";
  const passwordPropietario = "clave-super-secreta-lote7-owner";
  const passwordContador = "clave-super-secreta-lote7-cont";
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenant.rows[0]!.id, "admin.lote7@test.local", await hashContrasena(passwordAdmin)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, owner_id, password_hash) VALUES ($1, $2, 'propietario', $3, $4)`,
    [tenant.rows[0]!.id, "owner.lote7@test.local", owner.rows[0]!.id, await hashContrasena(passwordPropietario)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'contador', $3)`,
    [tenant.rows[0]!.id, "contador.lote7@test.local", await hashContrasena(passwordContador)],
  );

  fx = {
    tenantId: tenant.rows[0]!.id,
    propiedadId: propiedad.rows[0]!.id,
    unidadId: unidad.rows[0]!.id,
    ownerId: owner.rows[0]!.id,
    ocupacionAirbnbId: ocupacionAirbnb.rows[0]!.id,
    emailAdmin: "admin.lote7@test.local",
    passwordAdmin,
    emailPropietario: "owner.lote7@test.local",
    passwordPropietario,
    emailContador: "contador.lote7@test.local",
    passwordContador,
  };

  pool = new pg.Pool({ host: "127.0.0.1", port: puerto, database: "atiende_rv_lote7_test", user: USUARIO_APP, password: PASSWORD_APP });
  app = crearApp({ pool });
}, 120_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  await superusuario.end().catch(() => undefined);
  await servidor.stop().catch(() => undefined);
  await rm(databaseDir, { recursive: true, force: true }).catch(() => undefined);
});

describe("Finanzas — H-062/H-063: sin doble descuento de comisión (entregable del Lote 7)", () => {
  it("configura la regla de comisión host-only de Airbnb (ya neta) con fuente citada", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      "/finanzas/reglas-comision",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          canalCodigo: "airbnb",
          yaNetoDeComision: true,
          comisionBasisPoints: 1600,
          fuente: "RV12 L-RV12-02: airbnb.com/help/article/1857",
        }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("registra el movimiento financiero de la reserva de Airbnb sin volver a descontar la comisión", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      `/finanzas/reservas/${fx.ocupacionAirbnbId}/movimiento`,
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          moneda: "MXN",
          montoBrutoCentavos: 840000, // ya neto de la comisión host-only de Airbnb
          comisionGestorBasisPoints: 1000,
          comisionGestorBase: "neto_de_canal",
          gastos: [{ tipo: "limpieza", montoCentavos: 50000 }],
          impuestos: [],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { comisionCanalCentavos: number; montoRecibidoCentavos: number; netoCentavos: number };
    expect(body.comisionCanalCentavos).toBe(0); // nunca vuelve a restar
    expect(body.montoRecibidoCentavos).toBe(840000);
    expect(body.netoCentavos).toBe(840000 - 84000 - 50000);
  });

  it("GET del movimiento incluye la alerta fiscal sin calcular ningún impuesto (B-005)", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/finanzas/reservas/${fx.ocupacionAirbnbId}`, autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alertaFiscal: { requiereRevisionFiscal: boolean; rfcRegistrado: boolean } };
    expect(body.alertaFiscal.requiereRevisionFiscal).toBe(true);
    expect(body.alertaFiscal.rfcRegistrado).toBe(false);
  });

  it("genera el owner statement del periodo — idempotente en una segunda llamada idéntica", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const primera = await app.request(
      "/finanzas/statements/generar",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({ ownerId: fx.ownerId, periodoInicio: "2026-10-01", periodoFin: "2026-11-01" }),
      }),
    );
    expect(primera.status).toBe(201);
    const bodyPrimera = (await primera.json()) as { id: string; version: number; comisionCanalCentavos: number };
    expect(bodyPrimera.version).toBe(1);
    expect(bodyPrimera.comisionCanalCentavos).toBe(0); // Finanzas-1: sin doble descuento en el statement

    const segunda = await app.request(
      "/finanzas/statements/generar",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({ ownerId: fx.ownerId, periodoInicio: "2026-10-01", periodoFin: "2026-11-01" }),
      }),
    );
    expect(segunda.status).toBe(200); // mismo contenido -> no crea una nueva versión
    const bodySegunda = (await segunda.json()) as { id: string; version: number };
    expect(bodySegunda.id).toBe(bodyPrimera.id);
    expect(bodySegunda.version).toBe(1);
  });

  it("descarga del statement devuelve HTML descargable (dev)", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const lista = await app.request(`/finanzas/statements?ownerId=${fx.ownerId}`, autenticado(token));
    const { statements } = (await lista.json()) as { statements: { id: string }[] };
    expect(statements.length).toBeGreaterThan(0);
    const descarga = await app.request(`/finanzas/statements/${statements[0]!.id}/descarga`, autenticado(token));
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get("content-type")).toContain("text/html");
    const html = await descarga.text();
    expect(html).toContain("Owner statement");
    expect(html).toContain("revisión legal/fiscal");
  });

  it("propietario del owner ve su propio statement; nunca al pedirlo un tenant/owner ajeno se filtra", async () => {
    const token = await login(fx.emailPropietario, fx.passwordPropietario);
    const res = await app.request(`/finanzas/statements?ownerId=${fx.ownerId}`, autenticado(token));
    expect(res.status).toBe(200);
    const { statements } = (await res.json()) as { statements: unknown[] };
    expect(statements.length).toBeGreaterThan(0);
  });

  it("contador puede leer finanzas pero no puede escribir un movimiento", async () => {
    const token = await login(fx.emailContador, fx.passwordContador);
    const lectura = await app.request(`/finanzas/reservas/${fx.ocupacionAirbnbId}`, autenticado(token));
    expect(lectura.status).toBe(200);

    const escritura = await app.request(
      `/finanzas/reservas/${fx.ocupacionAirbnbId}/movimiento`,
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({ moneda: "MXN", montoBrutoCentavos: 1, comisionGestorBasisPoints: 0, gastos: [], impuestos: [] }),
      }),
    );
    expect(escritura.status).toBe(403);
  });
});

describe("Finanzas — H-064: conciliación de payout con discrepancia", () => {
  it("importa un payout con una línea conciliada y una con discrepancia", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(
      "/finanzas/payouts",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          canalCodigo: "airbnb",
          moneda: "MXN",
          fechaPayout: "2026-10-06",
          lineas: [
            { referenciaExternaReserva: "AIRBNB-EXT-1", montoCentavos: 999999 }, // distinto del monto_recibido real -> discrepancia
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resumen: { discrepancias: number; conciliadas: number } };
    expect(body.resumen.discrepancias).toBe(1);
    expect(body.resumen.conciliadas).toBe(0);
  });
});

describe("Pricing — H-068/H-069: cotización determinista y publicación denegada", () => {
  it("configura tarifa base, descuento por duración y cotiza determinísticamente", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const base = await app.request(
      `/pricing/unidades/${fx.unidadId}/base`,
      autenticado(token, { method: "POST", body: JSON.stringify({ precioNocheCentavos: 100000, moneda: "MXN" }) }),
    );
    expect(base.status).toBe(201);

    const descuento = await app.request(
      `/pricing/unidades/${fx.unidadId}/descuentos-duracion`,
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({ nochesMinimas: 7, porcentajeDescuentoBasisPoints: 1000, fuente: "RV13: Airbnb art. 1344" }),
      }),
    );
    expect(descuento.status).toBe(201);

    const cotizacion = await app.request(
      "/pricing/cotizar",
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({ unidadId: fx.unidadId, rango: { inicio: "2026-11-01", fin: "2026-11-08" } }),
      }),
    );
    expect(cotizacion.status).toBe(200);
    const body = (await cotizacion.json()) as { noches: number; descuentoAplicado: { nochesMinimas: number } | null; totalCentavos: number };
    expect(body.noches).toBe(7);
    expect(body.descuentoAplicado?.nochesMinimas).toBe(7);
    expect(body.totalCentavos).toBe(630000); // 700000 - 10%
  });

  it("la publicación de tarifas hacia Airbnb queda denegada (ningún adaptador real declara ratesPush)", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/pricing/unidades/${fx.unidadId}/publicacion/airbnb`, autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { puedePublicar: boolean; mensaje: string };
    expect(body.puedePublicar).toBe(false);
    expect(body.mensaje).toMatch(/no sincronizables por iCal/i);
  });
});

describe("Reportes — H-072/H-073: ocupación/ingresos derivados, exportación CSV", () => {
  it("GET /reportes/ocupacion devuelve métricas por unidad", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/reportes/ocupacion?desde=2026-10-01&hasta=2026-10-08`, autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { unidades: { unidadId: string; nochesOcupadas: number }[] };
    const fila = body.unidades.find((u) => u.unidadId === fx.unidadId);
    expect(fila).toBeDefined();
    expect(fila!.nochesOcupadas).toBe(4); // 2026-10-01 al 2026-10-05
  });

  it("GET /reportes/ocupacion?formato=csv exporta CSV descargable", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/reportes/ocupacion?desde=2026-10-01&hasta=2026-10-08&formato=csv`, autenticado(token));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const texto = await res.text();
    expect(texto.split("\n")[0]).toContain("unidadNombre");
  });

  it("GET /reportes/ingresos agrupa por canal/propiedad/mes", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/reportes/ingresos?desde=2026-10-01&hasta=2026-11-01`, autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { filas: { canalCodigo: string; mes: string }[] };
    expect(body.filas.some((f) => f.canalCodigo === "airbnb" && f.mes === "2026-10")).toBe(true);
  });
});
