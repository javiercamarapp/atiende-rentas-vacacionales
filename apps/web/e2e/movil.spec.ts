import { test, expect } from "@playwright/test";
import { iniciarSesion, rutaCaptura } from "./auxiliares";

// LOTES.md Lote 4: "usable en 375 px" + captura docs/capturas/
// lote4-movil-375.png. La deuda heredada de Restaurantes (D-015, §1.7:
// "el panel admin de Restaurantes no tiene experiencia mobile real") se
// decide explícitamente NO heredarse tal cual para el calendario — se
// verifica aquí que la página no produce scroll horizontal del body
// (aunque el propio timeline sí scrollea horizontalmente dentro de su
// contenedor, por diseño: muchas noches en una pantalla angosta).
test.describe("Calendario en viewport móvil (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("el calendario y la leyenda son usables en 375px, sin scroll horizontal del body", async ({ page }) => {
    await iniciarSesion(page);
    await expect(page.getByRole("heading", { name: "Calendario maestro" })).toBeVisible();

    const overflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflowHorizontal).toBe(false);

    await page.screenshot({ path: rutaCaptura("lote4-movil-375.png"), fullPage: true });
  });
});
