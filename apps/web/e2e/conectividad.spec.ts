import { test, expect } from "@playwright/test";
import { iniciarSesion, rutaCaptura } from "./auxiliares";

// ACEPTACION §Conectividad-2/§Conectividad-4: la matriz muestra a
// Booking.com como "pausado por el canal" (nunca "pendiente" genérico) y
// "SIN EVIDENCIA" para su iCal — nunca una cifra de latencia inventada; a
// Airbnb con su latencia declarada y nota de confianza baja/media.
test.describe("Matriz de conectividad", () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesion(page);
    await page.getByRole("link", { name: "Matriz de conectividad" }).click();
    await expect(page.getByRole("heading", { name: "Matriz de conectividad" })).toBeVisible();
  });

  test("Booking.com aparece como partner pendiente / pausado por el canal, con la cita de origen", async ({ page }) => {
    await expect(page.getByText("Pausado por el canal")).toBeVisible();
    await expect(page.getByText(/b002-archivo\.md/)).toBeVisible();
    await expect(page.getByText("SIN EVIDENCIA").first()).toBeVisible();
  });

  test("Booking.com no ofrece 'Conectar iCal' en ningún flujo de onboarding", async ({ page }) => {
    const tarjetaBooking = page.locator("div").filter({ hasText: "Booking.com" }).last();
    await expect(tarjetaBooking.getByRole("button", { name: /conectar ical/i })).toHaveCount(0);
    await expect(page.getByText(/solo vía channel manager certificado/i)).toBeVisible();
  });

  test("Airbnb/Vrbo sí ofrecen conectar iCal, con latencia declarada y confianza", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Conectar iCal" })).toHaveCount(2);
    await expect(page.getByText(/confianza baja/).first()).toBeVisible();

    await page.screenshot({ path: rutaCaptura("lote4-matriz-conectividad.png"), fullPage: true });
  });
});
