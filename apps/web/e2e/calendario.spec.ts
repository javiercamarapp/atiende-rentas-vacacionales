import { test, expect } from "@playwright/test";
import { iniciarSesion, rutaCaptura } from "./auxiliares";
import { fechaOffsetIso, OFFSET_NOCHE_LIBRE } from "./constantes";

// LOTES.md Lote 4 punto 6, entregable verificable de docs/fase2/LOTES.md
// (Lote 4): "crear bloqueo → aparece en el timeline"; "intento de cancelar
// reserva de canal no existe en la UI". Corre contra la API real con el
// fixture de `e2e/servidor-api-e2e.ts` (4 razones de bloqueo + una reserva
// de canal, todas relativas a "hoy" para no salirse nunca de la ventana
// de 21 noches del timeline por defecto).
test.describe("Calendario maestro", () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesion(page);
  });

  test("muestra las categorías del fixture con su razón exacta y captura la vista", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Calendario maestro" })).toBeVisible();
    await expect(page.getByText("Reserva de canal (importada)")).toBeVisible();
    await expect(page.getByText("Bloqueo del propietario")).toBeVisible();

    // Selecciona la primera noche de la reserva de canal (offset +1) y
    // confirma que el panel muestra el detalle y NUNCA un botón de
    // cancelar/desbloquear (ACEPTACION §UX-1).
    const fechaReservaCanal = fechaOffsetIso(1);
    await page.locator(`button[data-fecha="${fechaReservaCanal}"]`).first().click();
    await expect(page.getByText(/nunca la cancela ni la modifica/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /cancelar/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /desbloquear/i })).toHaveCount(0);

    await page.screenshot({ path: rutaCaptura("lote4-calendario-timeline.png"), fullPage: true });
  });

  test("crear bloqueo en un rango libre lo hace aparecer en el timeline", async ({ page }) => {
    const fechaLibre = fechaOffsetIso(OFFSET_NOCHE_LIBRE);
    // Ambas unidades tienen esa fecha libre en el fixture — se toma la
    // fila de "Depto E2E 102" (completamente libre) explícitamente por
    // fila, no por índice posicional del botón.
    const fila = page.locator('div[role="row"]', { hasText: "Depto E2E 102" });
    const celdaLibre = fila.locator(`button[data-fecha="${fechaLibre}"]`);
    await celdaLibre.click();

    await expect(page.getByRole("button", { name: "Crear bloqueo" })).toBeVisible();
    await page.getByRole("button", { name: "Crear bloqueo" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Confirmar bloqueo" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Tras recargar el calendario, esa misma celda ya no es "libre".
    await expect(celdaLibre).toHaveAttribute("aria-label", /Bloqueo del propietario/);
  });

  test("cambia entre vista de línea de tiempo, mes y lista sin error (ACEPTACION §UX-3)", async ({ page }) => {
    await page.getByRole("tab", { name: "Mes" }).click();
    await expect(page.getByLabel("Unidad")).toBeVisible();
    await page.getByRole("tab", { name: "Lista" }).click();
    await page.getByRole("tab", { name: "Línea de tiempo" }).click();
    await expect(page.getByRole("table", { name: /línea de tiempo/i })).toBeVisible();
  });
});
