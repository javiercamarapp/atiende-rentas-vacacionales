// Script de captura de evidencia real para Lote 3.4 (RV22, canales de
// distribución usados en México) — NO forma parte de la suite
// `npm run test:e2e` (no está registrado en `playwright.config.ts`,
// archivo compartido de Lote 4 que este lote no toca): arranca su PROPIA
// API real (embedded-postgres + migraciones + fixture, mismo patrón que
// `servidor-api-e2e.ts`/`lote8-captura.ts`) y su propio servidor Vite en
// puertos distintos, para no chocar con otras suites/capturas si corren
// en paralelo. Produce las dos capturas exigidas por la construcción:
// `docs/capturas/lote3-4-matriz-mexico.png` y
// `docs/capturas/lote3-4-asistente-expedia.png` — ambas contra la app
// real renderizada, con datos reales del catálogo `canal_catalogo`
// (migración 0110), sin ningún estado fabricado a mano en el DOM.
//
// Uso: `npx tsx apps/web/e2e/lote3-4-captura.ts` desde la raíz del repo.
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

const PUERTO_PG = 55634;
const PUERTO_API = 8934;
const PUERTO_WEB = 5334;
const USUARIO_APP = "app_rv";
const PASSWORD_APP = "app_rv_dev_change_in_prod";

process.env.JWT_SECRET = "lote3-4-captura-jwt-secret-de-al-menos-32-caracteres";
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
  const databaseDir = await mkdtemp(join(tmpdir(), "atiende-rv-lote3-4-captura-"));
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
  await servidor.createDatabase("atiende_rv_lote3_4_captura");

  const superusuario = servidor.getPgClient("atiende_rv_lote3_4_captura");
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

  const PASSWORD_ADMIN = "clave-captura-canales-mx-1234";
  const EMAIL_ADMIN = "admin@lote3-4-captura.local";

  const tenant = await superusuario.query<{ id: string }>(
    "INSERT INTO tenant (nombre) VALUES ('Riviera Maya Rentals') RETURNING id",
  );
  const tenantId = tenant.rows[0]!.id;
  await superusuario.query(
    `INSERT INTO usuario (tenant_id, email, rol, password_hash) VALUES ($1, $2, 'admin_gestora', $3)`,
    [tenantId, EMAIL_ADMIN, await hashContrasena(PASSWORD_ADMIN)],
  );

  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: PUERTO_PG,
    database: "atiende_rv_lote3_4_captura",
    user: USUARIO_APP,
    password: PASSWORD_APP,
  });
  const app = crearApp({ pool });
  const httpServer = serve({ fetch: app.fetch, port: PUERTO_API }, (info) => {
    console.log(`[lote3-4-captura] API en http://localhost:${info.port}`);
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
    page.on("pageerror", (err) => console.log("[browser-error]", err.message));

    // Login directo contra la API (bypass de la UI de /login — Lote 3.2
    // tiene en curso un cambio no relacionado que rompe el bundle del
    // cliente en esa pantalla ahora mismo, "node:crypto externalizado";
    // el token real emitido por /auth/login es idéntico al que la UI
    // usaría, así que la captura de las páginas de ESTE lote no depende
    // de que esa pantalla concreta esté sana en este instante).
    const loginResp = await fetch(`http://localhost:${PUERTO_API}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL_ADMIN, password: PASSWORD_ADMIN }),
    });
    const { accessToken } = (await loginResp.json()) as { accessToken: string };
    await page.goto(`http://localhost:${PUERTO_WEB}/`);
    await page.evaluate((token) => localStorage.setItem("atiende-rv-access-token", token), accessToken);

    // --- Captura 1: matriz de canales México (niveles A/B/C completos) ---
    await page.goto(`http://localhost:${PUERTO_WEB}/canales-mexico`);
    await page.getByRole("heading", { name: /Canales de distribución/i }).waitFor({ timeout: 15_000 });
    await page.getByText("Nivel A").first().waitFor({ timeout: 15_000 });
    await page.getByText(/Best Day/i).first().waitFor({ timeout: 15_000 });
    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/lote3-4-matriz-mexico.png"), fullPage: true });
    console.log("[lote3-4-captura] guardada docs/capturas/lote3-4-matriz-mexico.png");

    // --- Captura 2: asistente de conexión de Expedia (Nivel B) ---
    await page.goto(`http://localhost:${PUERTO_WEB}/canales-mexico/expedia?via=api_partner`);
    await page.getByText(/Expedia Group/i).first().waitFor({ timeout: 15_000 });
    await page.getByText(/nunca se marca manualmente/i).waitFor({ timeout: 15_000 });
    await page.screenshot({ path: join(import.meta.dirname, "../../../docs/capturas/lote3-4-asistente-expedia.png"), fullPage: true });
    console.log("[lote3-4-captura] guardada docs/capturas/lote3-4-asistente-expedia.png");
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
    console.error("[lote3-4-captura] fallo:", err);
    process.exit(1);
  });
