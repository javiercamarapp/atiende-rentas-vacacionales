// Constantes compartidas entre `servidor-api-e2e.ts` (bootstrap) y los
// specs de Playwright — puerto fijo (en vez de aleatorio) porque
// `playwright.config.ts` necesita saber de antemano contra qué URL hacer
// el healthcheck del `webServer`. Ids fijos del fixture para que los specs
// puedan navegar directo a una unidad conocida sin tener que descubrirla
// primero por UI.
export const PUERTO_API_E2E = 8799;
export const BASE_URL_API_E2E = `http://localhost:${PUERTO_API_E2E}`;
export const PUERTO_WEB_E2E = 5183;
export const BASE_URL_WEB_E2E = `http://localhost:${PUERTO_WEB_E2E}`;

export const EMAIL_E2E = "admin.e2e@atiende-rv.local";
export const PASSWORD_E2E = "clave-e2e-super-secreta-1234";

export const TENANT_ID_E2E = "00000000-0000-0000-0000-0000000000e2";
export const PROPIEDAD_ID_E2E = "00000000-0000-0000-0000-0000000000e3";
export const UNIDAD_4_RAZONES_ID_E2E = "00000000-0000-0000-0000-0000000000e4";
export const UNIDAD_LIBRE_ID_E2E = "00000000-0000-0000-0000-0000000000e5";

/** Fecha civil local (YYYY-MM-DD), `dias` a partir de hoy — misma lógica
 * que `src/pages/calendario/fechas.ts` (`hoyIso`/`sumarDias`), duplicada
 * aquí a propósito: el bootstrap de la API (Node) y los specs (Chrome vía
 * Playwright) corren en la MISMA máquina con la MISMA hora local, así que
 * calcular "hoy + N días" de forma independiente en ambos produce
 * exactamente las mismas fechas — sin esto, el fixture quedaría fuera de
 * la ventana de 21 noches que el timeline muestra por defecto en cuanto
 * pasen unos meses desde que se escribió este archivo. */
/** Noche libre garantizada dentro de la ventana de 21 noches por defecto,
 * usada por el spec de "crear bloqueo → aparece en el timeline". */
export const OFFSET_NOCHE_LIBRE = 19;

export function fechaOffsetIso(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
