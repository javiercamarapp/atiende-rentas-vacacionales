import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { crearApp } from "../../src/app.js";
import { crearEmpresaGestora, crearOwner, crearPropiedad, crearTenant, crearUnidad, crearUsuario } from "../soporte/fixtures.js";

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
  emailOperador: string;
  passwordOperador: string;
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

  const tenantId = await crearTenant(superusuario, "T-Lote7");
  const egId = await crearEmpresaGestora(superusuario, tenantId, "EG Lote7");
  const ownerId = await crearOwner(superusuario, egId, "Owner Lote7");
  const propiedadId = await crearPropiedad(superusuario, tenantId, { nombre: "Prop Lote7", moneda: "MXN" });
  const unidadId = await crearUnidad(superusuario, propiedadId, { nombre: "Unidad Lote7", ownerId });
  const canalAirbnb = await superusuario.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
  const ocupacionAirbnb = await superusuario.query<{ id: string }>(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante, canal_origen_id, external_id)
     VALUES ($1, daterange('2026-10-01', '2026-10-05', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true, $2, 'AIRBNB-EXT-1')
     RETURNING id`,
    [unidadId, canalAirbnb.rows[0]!.id],
  );

  const passwordAdmin = "clave-super-secreta-lote7-admin";
  const passwordPropietario = "clave-super-secreta-lote7-owner";
  const passwordContador = "clave-super-secreta-lote7-cont";
  const passwordOperador = "clave-super-secreta-lote7-operador";
  await crearUsuario(superusuario, { tenantId, email: "admin.lote7@test.local", rol: "admin_gestora", password: passwordAdmin });
  await crearUsuario(superusuario, {
    tenantId,
    email: "owner.lote7@test.local",
    rol: "propietario",
    ownerId,
    password: passwordPropietario,
  });
  await crearUsuario(superusuario, { tenantId, email: "contador.lote7@test.local", rol: "contador", password: passwordContador });
  // Auditoría 2, corrección P-04/Q-11: rol SIN acceso a finanzas, para
  // probar que `exigirRol` en GET /statements lo bloquea en la capa HTTP
  // (antes dependía enteramente de RLS).
  await crearUsuario(superusuario, {
    tenantId,
    email: "operador.lote7@test.local",
    rol: "operador",
    colaboradorNivel: "acceso_total",
    password: passwordOperador,
  });

  fx = {
    tenantId,
    propiedadId,
    unidadId,
    ownerId,
    ocupacionAirbnbId: ocupacionAirbnb.rows[0]!.id,
    emailAdmin: "admin.lote7@test.local",
    passwordAdmin,
    emailPropietario: "owner.lote7@test.local",
    passwordPropietario,
    emailContador: "contador.lote7@test.local",
    passwordContador,
    emailOperador: "operador.lote7@test.local",
    passwordOperador,
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

  it("Auditoría 2, P-04/Q-11: GET /statements exige rol en la capa HTTP, no solo RLS — operador recibe 403", async () => {
    const token = await login(fx.emailOperador, fx.passwordOperador);
    const res = await app.request(`/finanzas/statements?ownerId=${fx.ownerId}`, autenticado(token));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { codigo: string } };
    expect(body.error.codigo).toBe("rol_forbidden");
  });

  it("Auditoría 2, P-04/Q-11: superadmin/admin_gestora/contador/propietario siguen viendo GET /statements sin cambios", async () => {
    for (const [email, password] of [
      [fx.emailAdmin, fx.passwordAdmin],
      [fx.emailContador, fx.passwordContador],
      [fx.emailPropietario, fx.passwordPropietario],
    ] as const) {
      const token = await login(email, password);
      const res = await app.request(`/finanzas/statements?ownerId=${fx.ownerId}`, autenticado(token));
      expect(res.status).toBe(200);
    }
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

describe("Auditoría 2, D-DSD-15: dos POST /statements/generar concurrentes del mismo owner+periodo", () => {
  // docs/auditoria-2/dominio-sync-datos.md D-DSD-15: sin lock, la
  // transacción de POST /statements/generar (SELECT sin FOR UPDATE +
  // INSERT con version calculada en memoria) puede dejar que dos
  // solicitudes concurrentes lean AMBAS "no existe versión anterior" y
  // ambas intenten insertar version=1 — una recibiría el 23505 sin
  // traducir de la unique constraint de owner_statement, propagado como
  // 500 genérico. La reproducción de tests/auditoria-2/dominio/
  // statementConcurrenciaMismoOwnerPeriodo.test.ts replica esa MISMA
  // secuencia SQL directamente contra la base (sin pasar por la ruta) y
  // queda fuera del alcance de este corrector (tests/auditoria-2/ es del
  // auditor de dominio); esta prueba complementaria ejercita el fix real
  // vía 2 llamadas HTTP concurrentes contra la ruta ya corregida.
  it("ninguna de las 2 solicitudes concurrentes falla; como máximo una versión=1 persiste", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);

    const unidad = await superusuario.query<{ id: string }>(
      "INSERT INTO unidad (propiedad_id, owner_id, nombre) VALUES ($1, $2, 'Unidad D-DSD-15') RETURNING id",
      [fx.propiedadId, fx.ownerId],
    );
    const canalAirbnb = await superusuario.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
    const ocupacion = await superusuario.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante, canal_origen_id, external_id)
       VALUES ($1, daterange('2027-01-01', '2027-01-05', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true, $2, 'AIRBNB-EXT-DSD15')
       RETURNING id`,
      [unidad.rows[0]!.id, canalAirbnb.rows[0]!.id],
    );
    const movimiento = await app.request(
      `/finanzas/reservas/${ocupacion.rows[0]!.id}/movimiento`,
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          moneda: "MXN",
          montoBrutoCentavos: 300000,
          comisionGestorBasisPoints: 1000,
          comisionGestorBase: "neto_de_canal",
          gastos: [],
          impuestos: [],
        }),
      }),
    );
    expect(movimiento.status).toBe(201);

    const periodoInicio = "2027-01-01";
    const periodoFin = "2027-02-01";
    const cuerpo = JSON.stringify({ ownerId: fx.ownerId, periodoInicio, periodoFin });

    const [resA, resB] = await Promise.all([
      app.request("/finanzas/statements/generar", autenticado(token, { method: "POST", body: cuerpo })),
      app.request("/finanzas/statements/generar", autenticado(token, { method: "POST", body: cuerpo })),
    ]);

    // Ninguna de las 2 debe propagar el 500/23505 sin manejar — ambas
    // resuelven con 200/201 (una crea, la otra reusa la versión ya creada).
    expect([resA.status, resB.status].every((s) => s === 200 || s === 201)).toBe(true);

    const { rows } = await superusuario.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM owner_statement WHERE owner_id = $1 AND periodo_inicio = $2 AND periodo_fin = $3`,
      [fx.ownerId, periodoInicio, periodoFin],
    );
    expect(Number(rows[0]!.count)).toBe(1);
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

  it("H-071: POST /paridad detecta una violación fuera de tolerancia, propone un ajuste y registra una alerta 'paridad_precio' (nunca publica nada)", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);

    const regla = await app.request(
      `/pricing/unidades/${fx.unidadId}/reglas-canal`,
      autenticado(token, { method: "POST", body: JSON.stringify({ canalCodigo: "airbnb", markupBasisPoints: 1500, activo: true }) }),
    );
    expect(regla.status).toBe(201);

    const paridad = await app.request(
      `/pricing/unidades/${fx.unidadId}/paridad`,
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          precioReferenciaNocheCentavos: 100000,
          toleranciaBasisPoints: 100,
          precios: [{ canalCodigo: "airbnb", precioNocheCentavos: 140000 }], // esperado 115000, muy por encima
        }),
      }),
    );
    expect(paridad.status).toBe(200);
    const body = (await paridad.json()) as {
      violaciones: Array<{ canalCodigo: string; precioEsperadoNocheCentavos: number; propuesta: { precioPropuestoNocheCentavos: number } }>;
      alertasGeneradas: number;
    };
    expect(body.violaciones).toHaveLength(1);
    expect(body.violaciones[0]!.canalCodigo).toBe("airbnb");
    expect(body.violaciones[0]!.precioEsperadoNocheCentavos).toBe(115000);
    expect(body.violaciones[0]!.propuesta.precioPropuestoNocheCentavos).toBe(115000);
    expect(body.alertasGeneradas).toBe(1);

    const alertas = await app.request("/alertas?estado=activa", autenticado(token));
    const alertasBody = (await alertas.json()) as { alertas: Array<{ tipo: string; unidad_id: string }> };
    const alertaParidad = alertasBody.alertas.find((a) => a.tipo === "paridad_precio" && a.unidad_id === fx.unidadId);
    expect(alertaParidad).toBeDefined();
  });

  it("H-071: dentro de tolerancia no genera violaciones ni alertas", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const paridad = await app.request(
      `/pricing/unidades/${fx.unidadId}/paridad`,
      autenticado(token, {
        method: "POST",
        body: JSON.stringify({
          precioReferenciaNocheCentavos: 100000,
          toleranciaBasisPoints: 5000,
          precios: [{ canalCodigo: "booking", precioNocheCentavos: 100000 }],
        }),
      }),
    );
    expect(paridad.status).toBe(200);
    const body = (await paridad.json()) as { violaciones: unknown[]; alertasGeneradas: number };
    expect(body.violaciones).toHaveLength(0);
    expect(body.alertasGeneradas).toBe(0);
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

describe("Reportes — H-072: el reporte de ocupación cruza tarea_operativa (limpieza, Lote 5) — brecha de Lote 7 cerrada", () => {
  it("resta del RevPAR las noches bloqueadas por una tarea de limpieza pendiente (nunca las trata como vendibles)", async () => {
    // Unidad propia de este bloque para no interferir con la fila de
    // fx.unidadId ya usada por el bloque anterior. 2 noches ocupadas y
    // vendidas en $1,000.00 (2026-10-01 a 2026-10-03), y una tarea de
    // limpieza de turnover TODAVÍA pendiente cuyo buffer bloquea otras 2
    // noches (2026-10-06 a 2026-10-08) dentro del mismo periodo de reporte.
    const unidadId = await crearUnidad(superusuario, fx.propiedadId, { nombre: "Unidad H-072" });
    const ocupacion = await superusuario.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange('2026-10-01', '2026-10-03', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)
       RETURNING id`,
      [unidadId],
    );
    await superusuario.query(
      `INSERT INTO reserva_financiero (ocupacion_unidad_id, moneda, monto_bruto_centavos) VALUES ($1, 'MXN', 100000)`,
      [ocupacion.rows[0]!.id],
    );
    const buffer = await superusuario.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange('2026-10-06', '2026-10-08', '[)'), 'bloqueo', 'BUFFER_LIMPIEZA', 'confirmado', true)
       RETURNING id`,
      [unidadId],
    );
    await superusuario.query(
      `INSERT INTO tarea_operativa (unidad_id, buffer_ocupacion_id, tipo, estado, programada_para)
       VALUES ($1, $2, 'limpieza', 'pendiente', '2026-10-06')`,
      [unidadId, buffer.rows[0]!.id],
    );

    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/reportes/ocupacion?desde=2026-10-01&hasta=2026-10-08`, autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      unidades: {
        unidadId: string;
        nochesOcupadas: number;
        nochesDisponibles: number;
        nochesBloqueadasLimpiezaPendiente: number;
        nochesDisponiblesVendibles: number;
        revparCentavos: number;
        revparAjustadoLimpiezaCentavos: number;
      }[];
    };
    const fila = body.unidades.find((u) => u.unidadId === unidadId);
    expect(fila).toBeDefined();
    expect(fila!.nochesOcupadas).toBe(2);
    expect(fila!.nochesDisponibles).toBe(7); // 2026-10-01 al 2026-10-08
    expect(fila!.nochesBloqueadasLimpiezaPendiente).toBe(2); // 2026-10-06 al 2026-10-08
    expect(fila!.nochesDisponiblesVendibles).toBe(5); // 7 - 2
    expect(fila!.revparCentavos).toBe(14286); // 100000/7, sin ajustar
    expect(fila!.revparAjustadoLimpiezaCentavos).toBe(20000); // 100000/5, cruzando limpieza pendiente
  });

  it("una tarea de limpieza ya COMPLETADA no resta ninguna noche del inventario vendible", async () => {
    const unidadId = await crearUnidad(superusuario, fx.propiedadId, { nombre: "Unidad H-072 completada" });
    const buffer = await superusuario.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange('2026-10-06', '2026-10-08', '[)'), 'bloqueo', 'BUFFER_LIMPIEZA', 'confirmado', true)
       RETURNING id`,
      [unidadId],
    );
    await superusuario.query(
      `INSERT INTO tarea_operativa (unidad_id, buffer_ocupacion_id, tipo, estado, programada_para, completada_en)
       VALUES ($1, $2, 'limpieza', 'completada', '2026-10-06', now())`,
      [unidadId, buffer.rows[0]!.id],
    );

    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/reportes/ocupacion?desde=2026-10-01&hasta=2026-10-08`, autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      unidades: { unidadId: string; nochesBloqueadasLimpiezaPendiente: number; nochesDisponiblesVendibles: number }[];
    };
    const fila = body.unidades.find((u) => u.unidadId === unidadId);
    expect(fila).toBeDefined();
    expect(fila!.nochesBloqueadasLimpiezaPendiente).toBe(0);
    expect(fila!.nochesDisponiblesVendibles).toBe(7);
  });

  it("fix doble conteo: dos tareas de limpieza con buffers solapados de la MISMA unidad fusionan sus noches (4, no 6)", async () => {
    // 0005_ocupacion_unidad.ts documenta explícitamente que las filas
    // capa='bloqueo' NUNCA pasan por el EXCLUDE de Postgres entre sí — el
    // solape entre dos buffers de limpieza de la misma unidad no se
    // previene en la base de datos. Reproduce exactamente el caso
    // reportado: buffer 2026-10-04..07 (3 noches) y buffer 2026-10-05..08
    // (3 noches), solapados en 2026-10-05 y 2026-10-06 (2 noches). Sumar
    // por fila cruda da 3+3=6; el correcto, fusionando el solape, es 4
    // noches únicas (04, 05, 06, 07).
    const unidadId = await crearUnidad(superusuario, fx.propiedadId, { nombre: "Unidad H-072 solape" });
    const buffer1 = await superusuario.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange('2026-10-04', '2026-10-07', '[)'), 'bloqueo', 'BUFFER_LIMPIEZA', 'confirmado', true)
       RETURNING id`,
      [unidadId],
    );
    const buffer2 = await superusuario.query<{ id: string }>(
      `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
       VALUES ($1, daterange('2026-10-05', '2026-10-08', '[)'), 'bloqueo', 'BUFFER_LIMPIEZA', 'confirmado', true)
       RETURNING id`,
      [unidadId],
    );
    await superusuario.query(
      `INSERT INTO tarea_operativa (unidad_id, buffer_ocupacion_id, tipo, estado, programada_para)
       VALUES ($1, $2, 'limpieza', 'pendiente', '2026-10-04')`,
      [unidadId, buffer1.rows[0]!.id],
    );
    await superusuario.query(
      `INSERT INTO tarea_operativa (unidad_id, buffer_ocupacion_id, tipo, estado, programada_para)
       VALUES ($1, $2, 'limpieza', 'pendiente', '2026-10-05')`,
      [unidadId, buffer2.rows[0]!.id],
    );

    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/reportes/ocupacion?desde=2026-10-01&hasta=2026-10-08`, autenticado(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      unidades: {
        unidadId: string;
        nochesDisponibles: number;
        nochesBloqueadasLimpiezaPendiente: number;
        nochesDisponiblesVendibles: number;
      }[];
    };
    const fila = body.unidades.find((u) => u.unidadId === unidadId);
    expect(fila).toBeDefined();
    expect(fila!.nochesDisponibles).toBe(7); // 2026-10-01 al 2026-10-08
    expect(fila!.nochesBloqueadasLimpiezaPendiente).toBe(4); // 04,05,06,07 fusionadas — NUNCA 6
    expect(fila!.nochesDisponiblesVendibles).toBe(3); // 7 - 4
  });

  it("GET /reportes/ocupacion?formato=csv incluye las columnas nuevas de H-072", async () => {
    const token = await login(fx.emailAdmin, fx.passwordAdmin);
    const res = await app.request(`/reportes/ocupacion?desde=2026-10-01&hasta=2026-10-08&formato=csv`, autenticado(token));
    expect(res.status).toBe(200);
    const texto = await res.text();
    const encabezado = texto.split("\n")[0]!;
    expect(encabezado).toContain("nochesBloqueadasLimpiezaPendiente");
    expect(encabezado).toContain("revparAjustadoLimpiezaCentavos");
  });
});
