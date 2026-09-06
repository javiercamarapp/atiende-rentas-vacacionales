import { defineConfig, devices } from "@playwright/test";
import { BASE_URL_API_E2E, BASE_URL_WEB_E2E, PUERTO_WEB_E2E } from "./e2e/constantes";

// E2E mínimo (LOTES.md Lote 4 punto 6): Playwright contra Chrome del
// sistema (`channel: 'chrome'`, sin descargar binarios propios — reutiliza
// la instalación real de Google Chrome de esta máquina, RV20 §8), con dos
// `webServer` administrados por el propio Playwright: la API real con
// simuladores (embedded-postgres + migraciones + fixture, ver
// `e2e/servidor-api-e2e.ts`) y el servidor de desarrollo de Vite apuntando
// a esa API vía `VITE_API_URL`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL_WEB_E2E,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome-escritorio",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "npx tsx e2e/servidor-api-e2e.ts",
      url: `${BASE_URL_API_E2E}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npx vite --port ${PUERTO_WEB_E2E} --strictPort`,
      url: BASE_URL_WEB_E2E,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_API_URL: BASE_URL_API_E2E },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
