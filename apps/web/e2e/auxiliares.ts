import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Page } from "@playwright/test";
import { EMAIL_E2E, PASSWORD_E2E } from "./constantes";

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Ruta absoluta bajo `docs/capturas/` (LOTES.md Lote 4 punto 6:
 * "Capturas reales... Chrome headless o Playwright"). */
export function rutaCaptura(nombre: string): string {
  return path.join(RAIZ_REPO, "docs", "capturas", nombre);
}

export async function iniciarSesion(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL_E2E);
  await page.getByLabel("Contraseña").fill(PASSWORD_E2E);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/calendario");
}
