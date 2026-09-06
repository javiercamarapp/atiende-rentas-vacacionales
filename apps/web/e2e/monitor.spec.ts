import { test, expect } from "@playwright/test";
import { iniciarSesion, rutaCaptura } from "./auxiliares";

test.describe("Monitor de sincronización", () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesion(page);
    await page.getByRole("link", { name: "Monitor de sincronización" }).click();
    await expect(page.getByRole("heading", { name: "Monitor de sincronización" })).toBeVisible();
  });

  test("muestra edad de sync honesta y encola una sincronización manual", async ({ page }) => {
    // El simulador de Airbnb sincronizó "hace segundos/minutos" en el
    // fixture; Booking.com nunca ha sincronizado.
    await expect(page.getByText("nunca ha sincronizado")).toBeVisible();
    await expect(page.getByText(/no expuesto aún/i).first()).toBeVisible();

    const botonesSync = page.getByRole("button", { name: "Sincronizar ahora" });
    await botonesSync.first().click();
    await expect(page.getByText(/Sincronización encolada/i)).toBeVisible();

    await page.screenshot({ path: rutaCaptura("lote4-monitor-sync.png"), fullPage: true });
  });

  test("la página de conflictos nunca ofrece cancelar una reserva de canal", async ({ page }) => {
    await page.getByRole("link", { name: "Conflictos" }).click();
    await expect(page.getByRole("heading", { name: "Conflictos" })).toBeVisible();
    await expect(page.getByRole("button", { name: /cancelar/i })).toHaveCount(0);
  });
});
