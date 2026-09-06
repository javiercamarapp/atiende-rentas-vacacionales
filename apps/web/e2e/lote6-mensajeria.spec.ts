import { test, expect } from "@playwright/test";
import { iniciarSesion, rutaCaptura } from "./auxiliares";
import { UNIDAD_LIBRE_ID_E2E } from "./constantes";

/**
 * E2E de Lote 6 (BACKLOG E09, mensajería con aprobación humana) —
 * entregable verificable de docs/fase2/LOTES.md ("un borrador generado no
 * se envía sin que un humano pulse 'aprobar'") + captura real
 * `docs/capturas/lote6-bandeja.png`.
 *
 * Reutiliza el `webServer` compartido de `playwright.config.ts` (Lote 4:
 * API real + embedded-postgres + `e2e/servidor-api-e2e.ts`) sin
 * modificarlo — crea su propia conversación sobre `UNIDAD_LIBRE_ID_E2E`
 * enteramente desde la UI (sin llamadas HTTP directas), para que la
 * captura refleje exactamente lo que ve un operador real.
 */
test.describe("Mensajería — bandeja, hilo y aprobación humana (Lote 6)", () => {
  test("crear conversación, generar borrador y verlo pendiente de aprobación en la bandeja", async ({ page }) => {
    await iniciarSesion(page);

    await page.getByRole("button", { name: "OPERACIÓN" }).click();
    await page.getByRole("link", { name: "Mensajería" }).click();
    await expect(page.getByRole("heading", { name: "Mensajería" })).toBeVisible();

    // H-061/§Privacidad-2: aviso de escaneo de mensajes visible en la propia bandeja.
    await expect(page.getByRole("note")).toContainText(/escaneados|analizados/i);

    await page.getByLabel("ID de unidad").fill(UNIDAD_LIBRE_ID_E2E);
    await page.getByLabel("Canal").selectOption("airbnb");
    await page.getByRole("button", { name: "Nueva conversación" }).click();

    const tarjeta = page.getByText("Depto E2E 102").first();
    await expect(tarjeta).toBeVisible();
    await tarjeta.click();

    await expect(page.getByRole("heading", { name: "Depto E2E 102" })).toBeVisible();
    // Indicador de canal simulado (ningún adaptador real de mensajería existe hoy).
    await expect(page.getByText(/Airbnb · simulado/)).toBeVisible();

    await page
      .getByPlaceholder("Registrar mensaje entrante del huésped (simulador o transcripción manual)")
      .fill("¿A qué hora es el check-in?");
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(page.getByText(/dato, no una instrucción/i)).toBeVisible();

    await page.getByRole("button", { name: "Generar borrador de respuesta" }).click();
    await expect(page.getByText("pendiente aprobacion")).toBeVisible();

    // El borrador NUNCA se envía solo — Aprobar y Rechazar están visibles,
    // no existe un botón "Enviar" directo en toda la pantalla.
    await expect(page.getByRole("button", { name: "Aprobar y enviar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rechazar" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Enviar$/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Volver a la bandeja" }).click();
    await expect(page.getByText(/1 pendiente de aprobación/)).toBeVisible();

    await page.screenshot({ path: rutaCaptura("lote6-bandeja.png"), fullPage: true });
  });
});
