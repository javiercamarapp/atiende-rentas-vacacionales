// Script de captura de evidencia real para las correcciones P-01/P-02 de
// Auditoría 2 (docs/auditoria-2/producto-ux-operacion.md) — mismo patrón
// que apps/web/e2e/lote8-captura.ts: NO forma parte de `npm run test:e2e`,
// arranca su PROPIA API real (embedded-postgres + migraciones + fixture) y
// su propio servidor Vite en puertos dedicados. Produce:
//   docs/capturas/auditoria2-alertas.png  (corrección P-02)
//   docs/capturas/auditoria2-agentes.png  (corrección P-01)
// Uso: `npx tsx apps/web/e2e/auditoria2-correcciones-captura.ts` desde la
// raíz del repo.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { serve } from "@hono/node-server";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { chromium } from "playwright";
import { aplicarMigraciones, migraciones } from "@atiende-rv/db";
import { crearApp } from "../../api/src/app.js";
import { hashContrasena } from "../../api/src/seguridad/contrasenas.js";
import { registroFlagsAgentesInstancia } from "../../api/src/agentes/servicio.js";
import { FLAG_AGENTES_HABILITADO } from "@atiende-rv/domain/agentes";

const PUERTO_PG = 55598;
const PUERTO_API = 8811;
const PUERTO_WEB = 5192;
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

process.env.JWT_SECRET = "auditoria2-captura-jwt-secret-de-al-menos-32-caracteres";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.WEB_ORIGIN = "*";

async function esperar(url: string, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // aún no está listo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout esperando ${url}`);
}

async function main() {
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-auditoria2-captura-"));
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
  await servidor.createDatabase("atiende_rv_auditoria2_captura");

  const superusuario = servidor.getPgClient("atiende_rv_auditoria2_captura");
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
  await superusuario.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${USUARIO_APP}`);
  await superusuario.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${USUARIO_APP}`);

  const PASSWORD_ADMIN = "clave-captura-auditoria2-admin-1234";
  const EMAIL_ADMIN = "admin@auditoria2-captura.local";

  const tenant = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('Auditoría 2 — Correcciones') RETURNING id",
  );
  const tenantId = tenant.rows[0]!.id;
  await superusuario.query("INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'Correcciones SA de CV')", [
    tenantId,
  ]);
  const propiedad = await superusuario.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria, moneda, direccion_linea1, direccion_ciudad, direccion_pais)
     VALUES ($1, 'Villa Correcciones', 'America/Cancun', 'MXN', 'Av. Coba 123', 'Tulum', 'MX') RETURNING id`,
    [tenantId],
  );
  const unidad = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Suite Correcciones') RETURNING id",
    [propiedad.rows[0]!.id],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantId, EMAIL_ADMIN, await hashContrasena(PASSWORD_ADMIN)],
  );

  // --- Fixture para P-02: 3 alertas reales insertadas por el propio motor
  // de reglas (evaluarAlertas/dispararAlertas), nunca por INSERT a mano
  // del texto que se ve en pantalla, salvo por la fila en sí (igual
  // patrón que usa la suite de integración de alertas.test.ts).
  await superusuario.query(
    `INSERT INTO alerta (tipo, severidad, canal_id, unidad_id, mensaje, metadata, accion_reversible, estado)
     VALUES
       ('sync_sin_exito', 'alta', NULL, $1, 'Sin sincronización exitosa en Airbnb hace 25200s (umbral 21600s)', '{}'::jsonb, NULL, 'activa'),
       ('conflicto_pendiente', 'media', NULL, $1, 'Conflicto de calendario pendiente de revisión humana (capa_cruzada)', '{}'::jsonb, NULL, 'activa'),
       ('token_canal_revocado', 'alta', NULL, $1, 'Token de Booking.com revocado/expirado tras 3 intentos — push pausado (reversible)', '{}'::jsonb, 'sync.canal_pausado_por_alerta=true', 'activa')`,
    [unidad.rows[0]!.id],
  );

  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: PUERTO_PG,
    database: "atiende_rv_auditoria2_captura",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  const app = crearApp({ pool });

  // --- Fixture para P-01: activa agentes.habilitado para este tenant, con
  // una entrada de auditoría real (mismo RegistroFlags que consume la ruta
  // GET /agentes/flags/:id/auditoria).
  registroFlagsAgentesInstancia().establecer({
    flagId: FLAG_AGENTES_HABILITADO,
    valor: true,
    tenantId,
    actor: "captura-auditoria2",
    motivo: "Captura de evidencia P-01 — piloto habilitado para este tenant",
  });

  const httpServer = serve({ fetch: app.fetch, port: PUERTO_API }, (info) => {
    console.log(`[auditoria2-captura] API en http://localhost:${info.port}`);
  });

  let vite: ChildProcess | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await esperar(`http://localhost:${PUERTO_API}/health`);

    vite = spawn("npx", ["vite", "--port", String(PUERTO_WEB), "--strictPort"], {
      cwd: join(import.meta.dirname, ".."),
      env: { ...process.env, VITE_API_URL: `http://localhost:${PUERTO_API}` },
      stdio: "pipe",
    });
    await esperar(`http://localhost:${PUERTO_WEB}`);

    browser = await chromium.launch({ channel: "chrome" });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", (err) => console.log("[browser-error]", err.message));

    await page.goto(`http://localhost:${PUERTO_WEB}/login`);
    await page.getByLabel(/correo|email/i).fill(EMAIL_ADMIN);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD_ADMIN);
    await page.getByRole("button", { name: /iniciar sesión|entrar|login/i }).click();
    await page.waitForURL(/\/(calendario)?$/, { timeout: 15_000 }).catch(() => undefined);

    // --- Captura 1 (P-02): página de Alertas con las 3 alertas reales ---
    await page.goto(`http://localhost:${PUERTO_WEB}/monitor-sync/alertas`);
    await page.getByRole("heading", { name: "Alertas" }).waitFor({ timeout: 15_000 });
    await page.getByText(/Sin sincronización exitosa en Airbnb/i).waitFor({ timeout: 15_000 });
    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/auditoria2-alertas.png"), fullPage: true });
    console.log("[auditoria2-captura] guardada docs/capturas/auditoria2-alertas.png");

    // --- Captura 2 (P-01): página de Automatización agéntica ---
    await page.goto(`http://localhost:${PUERTO_WEB}/agentes`);
    await page.getByRole("heading", { name: "Automatización agéntica" }).waitFor({ timeout: 15_000 });
    await page.getByText(/requiere aprobación humana explícita/i).waitFor({ timeout: 15_000 });
    await page.getByText("Activo").waitFor({ timeout: 15_000 });
    await page.getByText("mensajeria_proponer_borrador").waitFor({ timeout: 15_000 });
    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/auditoria2-agentes.png"), fullPage: true });
    console.log("[auditoria2-captura] guardada docs/capturas/auditoria2-agentes.png");
  } finally {
    await browser?.close().catch(() => undefined);
    vite?.kill();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await pool.end().catch(() => undefined);
    await superusuario.end().catch(() => undefined);
    await servidor.stop().catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[auditoria2-captura] fallo:", err);
    process.exit(1);
  });
