import { test, expect } from "@playwright/test";
import { rutaCaptura } from "./auxiliares";

/**
 * Lote 3.3 (RV16/RV19) — E2E real contra el harness compartido
 * (`playwright.config.ts` + `e2e/servidor-api-e2e.ts`, mismo patrón que
 * `lote3-2-google-simulado.spec.ts`): landing pública, onboarding
 * self-serve de punta a punta (registro → login → asistente guiado →
 * calendario), y facturación — con capturas reales.
 *
 * Nota (verificado en vivo en este entorno): un script standalone con
 * `chromium.launch()` propio NO logra que el navegador alcance el puerto
 * de una API arrancada aparte en el mismo proceso (`net::ERR_FAILED` en
 * TODAS las peticiones cross-port, incluido `GET /health` público) — el
 * runner oficial de `@playwright/test` (este archivo) sí puede, por eso
 * este spec usa el harness compartido en vez de un script ad-hoc.
 */
test.describe("Landing pública", () => {
  test("propuesta de valor honesta + estado real de canales, sin sesión", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Un calendario para todos tus canales/i })).toBeVisible();
    await expect(page.getByText(/Partner pendiente/i).first()).toBeVisible();
    await expect(page.getByText(/nunca decimos "tiempo real"/i)).toBeVisible();
    await page.screenshot({ path: rutaCaptura("lote3-3-landing.png"), fullPage: true });
  });
});

test.describe("Onboarding self-serve de punta a punta", () => {
  const correo = `admin.e2e-onboarding-${Date.now()}@atiende-rv.local`;
  const password = "clave-e2e-onboarding-super-1234";

  test("registro público → revisa tu correo → login → asistente guiado → calendario", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByLabel(/Nombre comercial/i).fill("Rentas E2E Playwright");
    await page.getByLabel(/Razón social/i).fill("Rentas E2E Playwright S.A. de C.V.");
    await page.getByLabel(/Tu correo/i).fill(correo);
    await page.getByLabel(/Contraseña/i).fill(password);
    await page.getByRole("button", { name: /Crear mi cuenta/i }).click();

    await expect(page.getByRole("heading", { name: /Revisa tu correo/i })).toBeVisible();
    await expect(page.getByText(correo)).toBeVisible();

    // Login inmediatamente (sin completar la verificación de correo —
    // ese flujo, incluido el envío/consumo real del token, ya lo cubre
    // el E2E de Lote 3.2; aquí se prueba que el asistente post-registro
    // funciona de punta a punta).
    await page.getByRole("link", { name: /Ir a iniciar sesión/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Correo").fill(correo);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL("**/calendario");
    await expect(page.getByRole("heading", { name: "Calendario maestro" })).toBeVisible();

    // Asistente guiado — checklist real (empresa registrada, todo lo
    // demás pendiente para un tenant recién creado).
    await page.goto("/onboarding/asistente");
    await expect(page.getByRole("heading", { name: /Asistente de arranque/i })).toBeVisible();
    await expect(page.getByText(/Invita a tu equipo/i)).toBeVisible();
    await expect(page.getByLabel(/Correo del colaborador/i)).toBeVisible();
    await page.screenshot({ path: rutaCaptura("lote3-3-onboarding.png"), fullPage: true });

    // El asistente lleva de vuelta al calendario (onboarding → calendario).
    await page.getByRole("link", { name: /Ir a mi calendario/i }).click();
    await page.waitForURL("**/calendario");
    await expect(page.getByRole("heading", { name: "Calendario maestro" })).toBeVisible();

    // Facturación — suscripción de prueba real creada por el propio
    // registro self-serve (plan "esencial", RV16 borrador comercial).
    await page.goto("/facturacion");
    await expect(page.getByText("Esencial")).toBeVisible();
    await expect(page.getByText("En prueba")).toBeVisible();
    await expect(page.getByText(/Total estimado del periodo/i)).toBeVisible();
    await expect(page.getByText(/borrador comercial/i).first()).toBeVisible();
    await page.screenshot({ path: rutaCaptura("lote3-3-facturacion.png"), fullPage: true });
  });
});
