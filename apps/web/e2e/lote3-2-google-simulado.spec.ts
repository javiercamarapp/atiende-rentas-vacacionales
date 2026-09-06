import { test, expect } from "@playwright/test";
import { iniciarSesion, rutaCaptura } from "./auxiliares";
import { BASE_URL_API_E2E, EMAIL_E2E } from "./constantes";

/**
 * Lote 3.2 (H-096+) — E2E del flujo completo de Google Sign-In contra el
 * proveedor OIDC SIMULADO (apps/api/src/seguridad/oidcSimulado.ts), sin
 * depender de la cuenta real de Google Cloud ni de red externa.
 *
 * El botón "Continuar con Google" de `LoginPage` refleja la configuración
 * REAL de Google (`GET /auth/config`) — en este entorno E2E no hay
 * `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` configurados (a propósito:
 * nunca se simula tener credenciales reales que no existen), así que ese
 * botón aparece deshabilitado, que es exactamente el comportamiento
 * correcto a probar en el otro spec. Este spec en cambio ejercita el
 * MISMO callback/vinculación/emisión de cookies que usaría Google real,
 * navegando directo a `GET /auth/oidc-simulado-login/inicio` — la vía que
 * unit/integration ya prueban por HTTP, aquí verificada de punta a punta
 * en un navegador real hasta llegar al calendario.
 *
 * Usa el email del admin_gestora YA SEMBRADO por el fixture
 * (`EMAIL_E2E`): vincular una identidad OIDC a una cuenta local existente
 * por email verificado está SIEMPRE permitido (independiente de
 * `tenant.politica_vinculacion_google`) — ver apps/api/src/routes/auth.ts,
 * `manejarCallbackOidc`.
 */
test.describe("Login con Google (proveedor OIDC simulado)", () => {
  test("vincula con la cuenta existente y llega al calendario con sesión real", async ({ page }) => {
    await page.goto(`${BASE_URL_API_E2E}/auth/oidc-simulado-login/inicio`);

    // Página del proveedor OIDC simulado — mismo formulario que un E2E
    // completaría en el selector de cuenta real de Google.
    await expect(page.getByRole("heading", { name: /Elegir identidad de prueba/i })).toBeVisible();
    const campoCorreo = page.locator('input[name="email"]');
    await campoCorreo.fill("");
    await campoCorreo.fill(EMAIL_E2E);
    await expect(page.locator('input[name="emailVerificado"]')).toBeChecked();
    await page.getByRole("button", { name: "Continuar" }).click();

    // El callback de apps/api fija las cookies de sesión y redirige a
    // GoogleCompletadoPage, que canjea la cookie por un access token y
    // navega a /calendario — nunca hay un token en la URL en ningún punto
    // de esta cadena de redirects.
    await page.waitForURL("**/calendario");
    await expect(page.getByRole("heading", { name: "Calendario maestro" })).toBeVisible();
    expect(page.url()).not.toContain("access_token");
    expect(page.url()).not.toContain("refreshToken");

    await page.screenshot({ path: rutaCaptura("lote3-2-login-google.png"), fullPage: true });
  });
});

test.describe("Mi cuenta — MFA", () => {
  test("iniciar MFA muestra el QR y el secreto manual", async ({ page }) => {
    await iniciarSesion(page);
    await page.goto("/cuenta");
    await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();

    await page.getByRole("button", { name: "Habilitar MFA" }).click();
    await expect(page.getByAltText("Código QR para configurar MFA")).toBeVisible();
    await expect(page.getByText(/O ingresa manualmente/)).toBeVisible();

    await page.screenshot({ path: rutaCaptura("lote3-2-cuenta-mfa.png"), fullPage: true });
  });
});
