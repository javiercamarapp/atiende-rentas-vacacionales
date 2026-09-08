// Bootstrap de la API real para E2E (LOTES.md Lote 4 punto 6: "E2E mínimo
// con Playwright + Chrome del sistema contra api con simuladores"). Mismo
// patrón que `apps/api/test/integration/api.test.ts` (embedded-postgres +
// `aplicarMigraciones` + rol `app_rv`), pero como proceso de larga
// duración que Playwright arranca/mata vía `webServer` en
// `playwright.config.ts`, no como un test de Vitest.
//
// `crearApp`/`hashContrasena` no están en el `exports` público de
// `@atiende-rv/api` (solo "." → `src/index.ts`, que arranca el server
// standalone, y "./contrato") — se importan por ruta relativa dentro del
// mismo monorepo (misma técnica que usa el propio test de integración de
// Lote 3 desde `apps/api/test/`), sin modificar ningún archivo de
// `apps/api` (fuera del alcance de este lote).
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { aplicarMigraciones, migraciones } from "@atiende-rv/db";
import { crearApp } from "../../api/src/app.js";
import { hashContrasena } from "../../api/src/seguridad/contrasenas.js";
import {
  BASE_URL_API_E2E,
  BASE_URL_WEB_E2E,
  EMAIL_E2E,
  fechaOffsetIso,
  PASSWORD_E2E,
  PROPIEDAD_ID_E2E,
  PUERTO_API_E2E,
  TENANT_ID_E2E,
  UNIDAD_4_RAZONES_ID_E2E,
  UNIDAD_LIBRE_ID_E2E,
} from "./constantes.js";

const PUERTO_PG = 55488;
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

process.env.JWT_SECRET = "e2e-jwt-secret-de-al-menos-32-caracteres-1234567890";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = BASE_URL_WEB_E2E;
// Lote 3.2 (H-096+): el proveedor OIDC simulado se auto-referencia con
// `API_PUBLIC_URL` (issuer/jwks_uri/token_endpoint) — sin esto apuntaría
// al puerto por defecto (8787), no al puerto real de este servidor E2E.
process.env.API_PUBLIC_URL = BASE_URL_API_E2E;

async function main() {
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-e2e-"));
  const servidor = new EmbeddedPostgres({
    databaseDir,
    port: PUERTO_PG,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("atiende_rv_e2e");

  const superusuario = servidor.getPgClient("atiende_rv_e2e");
  await superusuario.connect();
  await superusuario.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
  await superusuario.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${USUARIO_APP}') THEN
        CREATE ROLE ${USUARIO_APP} LOGIN PASSWORD '${PASSWORD_APP}';
      END IF;
    END $$;
  `);

  const ejecutor = {
    async query(sql: string, params?: unknown[]) {
      const r = await superusuario.query(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql: string) {
      await superusuario.query(sql);
    },
  };
  await aplicarMigraciones(ejecutor, migraciones);

  // El rol de escritura del backend necesita permisos reales sobre el
  // esquema recién migrado (mismo patrón que packages/db/test/integration
  // y apps/api/test/integration — el superusuario de migraciones nunca es
  // el rol con el que corre la API).
  await superusuario.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${USUARIO_APP}`);
  await superusuario.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${USUARIO_APP}`);

  // Fixture: mismo escenario que tests/fixtures/schema/seed-demo.sql (4
  // razones de bloqueo distintas en una unidad, ACEPTACION §UX-1) más una
  // segunda unidad libre, un usuario admin_gestora con contraseña conocida,
  // y dos cuentas de canal para ejercitar la matriz de conectividad:
  // Airbnb como SIMULADOR con sync reciente, Booking.com como
  // `partner_pendiente` (credenciales presentes, partner no aprobado).
  await superusuario.query(
    `INSERT INTO tenant (id, nombre) VALUES ($1, 'Tenant E2E Lote 4')`,
    [TENANT_ID_E2E],
  );
  await superusuario.query(
    `INSERT INTO propiedad (id, tenant_id, nombre, zona_horaria) VALUES ($1, $2, 'Edificio E2E', 'America/Cancun')`,
    [PROPIEDAD_ID_E2E, TENANT_ID_E2E],
  );
  await superusuario.query(
    `INSERT INTO unidad (id, propiedad_id, nombre) VALUES ($1, $2, 'Depto E2E 101'), ($3, $2, 'Depto E2E 102')`,
    [UNIDAD_4_RAZONES_ID_E2E, PROPIEDAD_ID_E2E, UNIDAD_LIBRE_ID_E2E],
  );
  // Fechas relativas a "hoy" (nunca fijas): el timeline por defecto solo
  // muestra 21 noches desde hoy (apps/web/src/pages/calendario/
  // CalendarioMaestroPage.tsx, NOCHES_VISIBLES_TIMELINE) — fechas fijas se
  // saldrían de esa ventana en cuanto pasara suficiente tiempo desde que
  // se escribió este fixture. `fechaOffsetIso` usa la misma hora local que
  // el navegador de Playwright (misma máquina), así que ambos coinciden.
  await superusuario.query(
    `INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante, canal_origen_id) VALUES
       ($1, daterange($2::date, $3::date, '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true,
         (SELECT id FROM canal WHERE codigo = 'airbnb')),
       ($1, daterange($4::date, $5::date, '[)'), 'bloqueo', 'BLOQUEO_PROPIETARIO', 'confirmado', true, NULL),
       ($1, daterange($6::date, $7::date, '[)'), 'bloqueo', 'MANTENIMIENTO', 'confirmado', true, NULL),
       ($1, daterange($8::date, $9::date, '[)'), 'bloqueo', 'BUFFER_LIMPIEZA', 'confirmado', true, NULL)`,
    [
      UNIDAD_4_RAZONES_ID_E2E,
      fechaOffsetIso(1),
      fechaOffsetIso(4),
      fechaOffsetIso(8),
      fechaOffsetIso(10),
      fechaOffsetIso(13),
      fechaOffsetIso(14),
      fechaOffsetIso(4),
      fechaOffsetIso(5),
    ],
  );

  const passwordHash = await hashContrasena(PASSWORD_E2E);
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [TENANT_ID_E2E, EMAIL_E2E, passwordHash],
  );

  await superusuario.query(
    `INSERT INTO cuenta_canal (tenant_id, canal_id, nombre, es_simulador, ultima_sincronizacion_exitosa_en,
                                credenciales_cifradas, credenciales_iv, credenciales_tag, credenciales_clave_version)
     VALUES ($1, (SELECT id FROM canal WHERE codigo = 'airbnb'), 'Airbnb — simulador E2E', true, now(),
             '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, 'v1')`,
    [TENANT_ID_E2E],
  );
  await superusuario.query(
    `INSERT INTO cuenta_canal (tenant_id, canal_id, nombre, es_simulador, partner_aprobado,
                                credenciales_cifradas, credenciales_iv, credenciales_tag, credenciales_clave_version)
     VALUES ($1, (SELECT id FROM canal WHERE codigo = 'booking'), 'Booking.com — extranet manual', false, false,
             '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, 'v1')`,
    [TENANT_ID_E2E],
  );

  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: PUERTO_PG,
    database: "atiende_rv_e2e",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  const app = crearApp({ pool });

  serve({ fetch: app.fetch, port: PUERTO_API_E2E }, (info) => {
    console.log(`[e2e-api] escuchando en http://localhost:${info.port}`);
  });

  const cerrar = async () => {
    await pool.end().catch(() => undefined);
    await superusuario.end().catch(() => undefined);
    await servidor.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", cerrar);
  process.on("SIGINT", cerrar);
}

main().catch((err) => {
  console.error("[e2e-api] fallo al arrancar:", err);
  process.exit(1);
});
