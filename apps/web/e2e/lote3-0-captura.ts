// Script de captura de evidencia real para Lote 3.0 (H-071 paridad de
// precios, H-073 percentiles de latencia interna vs. externa declarada)
// — NO forma parte de la suite `npm run test:e2e`. Mismo patrón que
// `lote8-captura.ts`: arranca su PROPIA API real (embedded-postgres +
// migraciones + fixture) y su propio servidor Vite en puertos propios.
//
// Uso: `npx tsx apps/web/e2e/lote3-0-captura.ts` desde la raíz del repo.
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

const PUERTO_PG = 55611;
const PUERTO_API = 8811;
const PUERTO_WEB = 5211;
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

process.env.JWT_SECRET = "lote3-0-captura-jwt-secret-de-al-menos-32-caracteres";
process.env.CANAL_CIFRADO_CLAVES = "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
// Lote 3.2 (H-096): CORS ahora usa `credentials: true` para la cookie
// httpOnly de refresh del cliente 'web' — un origen comodín "*" es
// rechazado por el navegador en ese modo (CORS spec), a diferencia de
// cuando se escribió `lote8-captura.ts`. Origen exacto del Vite de este
// script.
process.env.WEB_ORIGIN = `http://localhost:${5211}`;

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
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-lote3-0-captura-"));
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
  await servidor.createDatabase("atiende_rv_lote3_0_captura");

  const superusuario = servidor.getPgClient("atiende_rv_lote3_0_captura");
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

  const PASSWORD_ADMIN = "clave-captura-admin-lote3-0-1234";
  const EMAIL_ADMIN = "admin@lote3-0-captura.local";

  const tenant = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('Rentas del Caribe') RETURNING id",
  );
  const tenantId = tenant.rows[0]!.id;
  await superusuario.query("INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES ($1, 'Rentas del Caribe SA de CV')", [
    tenantId,
  ]);
  const propiedad = await superusuario.query<{ id: string }>(
    `INSERT INTO propiedad (tenant_id, nombre, zona_horaria, moneda) VALUES ($1, 'Villa Costera', 'America/Cancun', 'MXN') RETURNING id`,
    [tenantId],
  );
  const unidad = await superusuario.query<{ id: string }>(
    "INSERT INTO unidad (propiedad_id, nombre) VALUES ($1, 'Suite Vista al Mar') RETURNING id",
    [propiedad.rows[0]!.id],
  );
  const unidadId = unidad.rows[0]!.id;
  await superusuario.query(
    `INSERT INTO tarifa_base (unidad_id, precio_noche_centavos, moneda, vigente_desde) VALUES ($1, 100000, 'MXN', CURRENT_DATE)`,
    [unidadId],
  );
  const canalAirbnb = await superusuario.query<{ id: string }>("SELECT id FROM canal WHERE codigo = 'airbnb'");
  await superusuario.query(
    `INSERT INTO tarifa_regla_canal (unidad_id, canal_id, markup_basis_points, activo) VALUES ($1, $2, 1500, true)`,
    [unidadId, canalAirbnb.rows[0]!.id],
  );
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantId, EMAIL_ADMIN, await hashContrasena(PASSWORD_ADMIN)],
  );

  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: PUERTO_PG,
    database: "atiende_rv_lote3_0_captura",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  const app = crearApp({ pool });
  const httpServer = serve({ fetch: app.fetch, port: PUERTO_API }, (info) => {
    console.log(`[lote3-0-captura] API en http://localhost:${info.port}`);
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (err) => console.log("[browser-error]", err.message));

    await page.goto(`http://localhost:${PUERTO_WEB}/login`);
    await page.getByLabel(/correo|email/i).fill(EMAIL_ADMIN);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD_ADMIN);
    await page.getByRole("button", { name: /iniciar sesión|entrar|login/i }).click();
    await page.waitForURL(/\/(calendario)?$/, { timeout: 15_000 }).catch(() => undefined);

    // --- Captura 1: Pricing — comparador de paridad de precios (H-071) ---
    await page.goto(`http://localhost:${PUERTO_WEB}/pricing`);
    await page.getByRole("heading", { name: "Pricing", exact: true }).waitFor({ timeout: 15_000 });
    await page.locator("select").first().selectOption({ label: "Suite Vista al Mar" });
    await page.getByText("Paridad de precios entre canales").waitFor({ timeout: 15_000 });

    await page.getByPlaceholder("1000.00").fill("1000");
    await page.getByPlaceholder("Precio publicado hoy").fill("1400");
    await page.getByRole("button", { name: /Detectar violaciones de paridad/i }).click();
    await page.getByText(/violación\(es\) detectada\(s\)/i).waitFor({ timeout: 15_000 });

    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/lote3-0-pricing-paridad.png"), fullPage: true });
    console.log("[lote3-0-captura] guardada docs/capturas/lote3-0-pricing-paridad.png");

    // --- Captura 2: Monitor de sincronización — latencia interna vs. externa (H-073) ---
    await page.goto(`http://localhost:${PUERTO_WEB}/monitor-sync`);
    await page.getByRole("heading", { name: "Monitor de sincronización" }).waitFor({ timeout: 15_000 });
    await page.getByText("Latencia interna").first().waitFor({ timeout: 15_000 });
    await page.getByText("medida", { exact: true }).first().waitFor({ timeout: 15_000 });
    await page.getByText("declarada (confianza)").first().waitFor({ timeout: 15_000 });

    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/lote3-0-monitor-latencia.png"), fullPage: true });
    console.log("[lote3-0-captura] guardada docs/capturas/lote3-0-monitor-latencia.png");
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
    console.error("[lote3-0-captura] fallo:", err);
    process.exit(1);
  });
