import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigraciones, migraciones, type EjecutorSql } from "@atiende-rv/db";
import { fechaLocalDesdeInstante } from "@atiende-rv/domain";
// Import directo por ruta relativa: `@atiende-rv/api` solo expone
// `./src/index.ts` (arranca un server como efecto lateral) y
// `./contrato` en su `package.json` — no reexporta `crearApp`. Igual que
// hace `apps/api/test/integration/backoffice.test.ts` con
// `../../src/app.js`, resuelto aquí en relativo desde
// `tests/auditoria-2/dominio/`.
import { crearApp } from "../../../apps/api/src/app.js";
import { hashContrasena } from "../../../apps/api/src/seguridad/contrasenas.js";

/**
 * Auditoría adversarial independiente — dominio/sync/datos (fase 2).
 *
 * Hipótesis: `apps/api/src/routes/backoffice/propiedades.ts`, endpoint
 * `PATCH /backoffice/propiedades/:id` (líneas 110-150), permite cambiar
 * `propiedad.zona_horaria` en cualquier momento, sin verificar si esa
 * propiedad tiene `ocupacion_unidad` activas (reservas confirmadas o
 * provisionales) en ninguna de sus unidades, sin recalcular nada, y sin
 * devolver ninguna advertencia. El `UPDATE ... zona_horaria =
 * COALESCE($3, zona_horaria) ... WHERE id = $1` (línea 126) es
 * incondicional.
 *
 * Impacto de negocio: `ocupacion_unidad.rango` guarda fechas de
 * calendario puras (sin zona horaria adjunta, packages/domain/src/fechas.ts).
 * Un timestamp entrante de un canal (`DATE-TIME-UTC`/`DATE-TIME-TZID`) se
 * resuelve a fecha de calendario vía `resolverFechaLocal` usando la zona
 * ACTUAL de la propiedad en el momento del ciclo de import
 * (`ctx.zonaHorariaPropiedad`, motor.ts). Si un operador cambia
 * `zona_horaria` de la propiedad después de que ya existen reservas
 * activas, el MISMO instante UTC de un evento de canal se traduciría a
 * una fecha de calendario distinta antes/después del cambio — un
 * check-in/check-out puede desplazarse un día completo de forma silenciosa
 * para sincronizaciones futuras, mientras las filas ya persistidas quedan
 * congeladas en la interpretación de la zona anterior. Ningún flujo
 * recalcula ni marca esas filas como "fecha calculada bajo una zona ya
 * obsoleta".
 *
 * Comportamiento correcto esperado: el endpoint debería rechazar (409/400)
 * o exigir una confirmación explícita para cambiar `zona_horaria` de una
 * propiedad que ya tiene `ocupacion_unidad` activas, dado que esas fechas
 * de calendario ya persistidas dejan de tener una interpretación horaria
 * consistente con los eventos de canal que lleguen después del cambio.
 */

process.env.JWT_SECRET = "auditoria2-jwt-secret-de-al-menos-32-caracteres-0000000000";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "http://localhost:5173";

const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

function puertoAleatorio(): number {
  return 53000 + Math.floor(Math.random() * 8000);
}

let databaseDir: string;
let servidor: EmbeddedPostgres;
let superusuario: pg.Client;
let pool: pg.Pool;
let app: ReturnType<typeof crearApp>;

interface Fixture {
  propiedadId: string;
  unidadId: string;
  emailAdmin: string;
  passwordAdmin: string;
}
let fx: Fixture;

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
  databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-auditoria2-zona-"));
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
  await servidor.createDatabase("atiende_rv_auditoria2_zona");

  superusuario = servidor.getPgClient("atiende_rv_auditoria2_zona");
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
    "INSERT INTO tenant (nombre) VALUES ('Tenant auditoria-2 zona horaria') RETURNING id",
  );
  const propiedad = await superusuario.query<{ id: string }>(
    "INSERT INTO propiedad (tenant_id, nombre, zona_horaria) VALUES ($1, 'Prop zona horaria', 'America/New_York') RETURNING id",
    [tenant.rows[0]!.id],
  );
  const unidad = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Unidad zona horaria') RETURNING id",
    [propiedad.rows[0]!.id],
  );

  // Reserva CONFIRMADA activa y futura, ya persistida bajo la zona
  // original de la propiedad (America/New_York).
  await superusuario.query(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante)
     VALUES ($1, daterange('2027-03-10','2027-03-15','[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true)`,
    [unidad.rows[0]!.id],
  );

  const passwordAdmin = "clave-super-secreta-admin-zona";
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenant.rows[0]!.id, "admin.zona@auditoria2-test.local", await hashContrasena(passwordAdmin)],
  );

  fx = {
    propiedadId: propiedad.rows[0]!.id,
    unidadId: unidad.rows[0]!.id,
    emailAdmin: "admin.zona@auditoria2-test.local",
    passwordAdmin,
  };

  pool = new pg.Pool({
    host: "127.0.0.1",
    port: puerto,
    database: "atiende_rv_auditoria2_zona",
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

describe("PATCH /backoffice/propiedades/:id — cambio de zona_horaria con reservas activas existentes", () => {
  it("debería rechazar (o advertir) el cambio de zona horaria cuando ya hay ocupacion_unidad activas; en la práctica lo acepta en silencio", async () => {
    const { accessToken } = await login(fx.emailAdmin, fx.passwordAdmin);

    // Confirma que la reserva activa efectivamente existe antes del cambio.
    const activasAntes = await superusuario.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ocupacion_unidad WHERE unidad_id = $1 AND estado <> 'cancelado'`,
      [fx.unidadId],
    );
    expect(Number(activasAntes.rows[0]!.n)).toBe(1);

    // Cambio de zona horaria drástico (America/New_York -> Pacific/Auckland,
    // ~17/18h de diferencia según DST): cualquier evento de canal futuro
    // con un timestamp UTC cercano a medianoche cambiará de fecha de
    // calendario.
    const res = await app.request(
      `/backoffice/propiedades/${fx.propiedadId}`,
      autenticado(accessToken, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zonaHoraria: "Pacific/Auckland" }),
      }),
    );
    const body = (await res.json().catch(() => ({}))) as { zonaHoraria?: string; error?: unknown };

    // Comportamiento correcto esperado: rechazo explícito (409/400) al
    // existir reservas activas sin recalcular/confirmar, NUNCA un 200
    // silencioso.
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Evidencia adicional del impacto real si el cambio se acepta: el
    // mismo instante UTC exacto (un check-in a las 04:30 UTC) se traduce a
    // una fecha de calendario distinta bajo cada zona — un desplazamiento
    // de noche completo para eventos de canal futuros, sin que la fila ya
    // persistida (2027-03-10..2027-03-15, calculada bajo America/New_York)
    // quede marcada de ninguna forma como potencialmente inconsistente.
    const instanteDeReferencia = "2027-03-12T04:30:00Z";
    const fechaBajoZonaOriginal = fechaLocalDesdeInstante(instanteDeReferencia, "America/New_York");
    const fechaBajoZonaNueva = fechaLocalDesdeInstante(instanteDeReferencia, "Pacific/Auckland");
    expect(fechaBajoZonaOriginal).toBe("2027-03-11");
    expect(fechaBajoZonaNueva).toBe("2027-03-12");
    console.log(
      `[auditoria-2] mismo instante UTC ${instanteDeReferencia}: zona original=America/New_York -> ${fechaBajoZonaOriginal}; ` +
        `zona nueva=Pacific/Auckland -> ${fechaBajoZonaNueva}; PATCH respondió status=${res.status} body=${JSON.stringify(body)}`,
    );
  });
});
