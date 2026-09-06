// Script de captura de evidencia real para Lote 8 (back office/
// superadmin) — NO forma parte de la suite `npm run test:e2e` (no está
// registrado en `playwright.config.ts`, archivo compartido de Lote 4 que
// este lote no toca): arranca su PROPIA API real (embedded-postgres +
// migraciones + fixture, mismo patrón que `servidor-api-e2e.ts`) y su
// propio servidor Vite en puertos distintos, para no chocar con la suite
// de Lote 4 si corre en paralelo. Produce las dos capturas reales exigidas
// por DEFINICION-DE-HECHO §2.3: `docs/capturas/lote8-superadmin.png` y
// `docs/capturas/lote8-cuentas-canal.png` — ambas contra la app real
// renderizada, sin ningún estado fabricado a mano en el DOM.
//
// Uso: `npx tsx apps/web/e2e/lote8-captura.ts` desde la raíz del repo.
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

const PUERTO_PG = 55499;
const PUERTO_API = 8801;
const PUERTO_WEB = 5191;
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

process.env.JWT_SECRET = "lote8-captura-jwt-secret-de-al-menos-32-caracteres";
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
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-lote8-captura-"));
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
  await servidor.createDatabase("atiende_rv_lote8_captura");

  const superusuario = servidor.getPgClient("atiende_rv_lote8_captura");
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

  const PASSWORD_SUPERADMIN = "clave-captura-superadmin-1234";
  const PASSWORD_ADMIN = "clave-captura-admin-1234";
  const EMAIL_SUPERADMIN = "superadmin@lote8-captura.local";
  const EMAIL_ADMIN = "admin@lote8-captura.local";

  const tenant = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('Casa Bonita Rentals') RETURNING id",
  );
  const tenantId = tenant.rows[0]!.id;
  await superusuario.query("INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'Casa Bonita SA de CV')", [
    tenantId,
  ]);
  await superusuario.query(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria, moneda, direccion_linea1, direccion_ciudad, direccion_pais)
     VALUES ($1, 'Villa Amanecer', 'America/Cancun', 'MXN', 'Av. Coba 123', 'Tulum', 'MX')`,
    [tenantId],
  );
  const unidad = await superusuario.query<{ id: string }>(
    "SELECT id FROM propiedad WHERE tenant_id = $1",
    [tenantId],
  );
  await superusuario.query("INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Suite 1'), ($1, 'Suite 2')", [
    unidad.rows[0]!.id,
  ]);
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantId, EMAIL_ADMIN, await hashContrasena(PASSWORD_ADMIN)],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES (NULL, $1, 'superadmin', $2)`,
    [EMAIL_SUPERADMIN, await hashContrasena(PASSWORD_SUPERADMIN)],
  );

  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: PUERTO_PG,
    database: "atiende_rv_lote8_captura",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  const app = crearApp({ pool });
  const httpServer = serve({ fetch: app.fetch, port: PUERTO_API }, (info) => {
    console.log(`[lote8-captura] API en http://localhost:${info.port}`);
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

    // --- Captura 1: SuperadminPage con banner de romper cristal activo ---
    await page.goto(`http://localhost:${PUERTO_WEB}/login`);
    await page.getByLabel(/correo|email/i).fill(EMAIL_SUPERADMIN);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD_SUPERADMIN);
    await page.getByRole("button", { name: /iniciar sesión|entrar|login/i }).click();
    await page.waitForURL(/\/(calendario)?$/, { timeout: 15_000 }).catch(() => undefined);

    await page.goto(`http://localhost:${PUERTO_WEB}/backoffice/superadmin`);
    await page.getByText("Superadmin", { exact: true }).first().waitFor({ timeout: 15_000 });
    await page.getByRole("cell", { name: "Casa Bonita Rentals" }).waitFor({ timeout: 15_000 });

    // Crear una concesión "romper cristal" real vía UI (motivo + tenant).
    await page.locator("select").first().selectOption({ label: "Casa Bonita Rentals" });
    await page.getByPlaceholder(/Investigación de ticket/i).fill("Captura de evidencia Lote 8 — H-075");
    await page.getByRole("button", { name: /^Romper cristal$/i }).click();
    await page.getByRole("button", { name: /¿Confirmar acceso auditado\?/i }).click();
    await page.getByText(/Acceso "romper cristal" activo/i).waitFor({ timeout: 15_000 });

    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/lote8-superadmin.png"), fullPage: true });
    console.log("[lote8-captura] guardada docs/capturas/lote8-superadmin.png");

    // --- Captura 2: CuentasCanalPage con tipo de conexión honesto ---
    await page.evaluate(() => {
      localStorage.removeItem("atiende-rv-access-token");
      localStorage.removeItem("atiende-rv-usuario-sesion");
    });
    await page.goto(`http://localhost:${PUERTO_WEB}/login`);
    await page.getByLabel(/correo|email/i).fill(EMAIL_ADMIN);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD_ADMIN);
    await page.getByRole("button", { name: /iniciar sesión|entrar|login/i }).click();
    await page.waitForURL(/\/(calendario)?$/, { timeout: 15_000 }).catch(() => undefined);

    await page.goto(`http://localhost:${PUERTO_WEB}/cuentas-canal`);
    await page.getByRole("heading", { name: "Cuentas de canal" }).waitFor({ timeout: 15_000 });

    // Cuenta simulador (bloqueada en producción, honesta en dev).
    await page.locator("select").nth(0).selectOption("vrbo");
    await page.locator("select").nth(1).selectOption("simulador");
    await page.getByRole("textbox").nth(0).fill("Vrbo — cuenta de pruebas");
    await page.getByRole("button", { name: /^Crear cuenta$/i }).click();
    await page.getByText("SIMULADOR — desarrollo/pruebas").first().waitFor({ timeout: 15_000 });

    // Cuenta partner_pendiente con motivo explícito (nunca "pendiente" desnudo).
    await page.locator("select").nth(0).selectOption("booking");
    await page.locator("select").nth(1).selectOption("partner_pendiente");
    await page.getByRole("textbox").nth(0).fill("Booking.com — extranet");
    await page
      .getByPlaceholder(/pausado por el canal/i)
      .fill('Booking.com declara "pausing integrations with new connectivity providers" (connect.booking.com)');
    await page.getByRole("button", { name: /^Crear cuenta$/i }).click();
    await page.getByText(/pausing integrations|Booking\.com declara/i).first().waitFor({ timeout: 15_000 });

    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/lote8-cuentas-canal.png"), fullPage: true });
    console.log("[lote8-captura] guardada docs/capturas/lote8-cuentas-canal.png");
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
    console.error("[lote8-captura] fallo:", err);
    process.exit(1);
  });
