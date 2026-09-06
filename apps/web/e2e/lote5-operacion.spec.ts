import { test, expect } from "@playwright/test";
import { iniciarSesion, rutaCaptura } from "./auxiliares";
import { BASE_URL_API_E2E, EMAIL_E2E, PASSWORD_E2E, UNIDAD_LIBRE_ID_E2E } from "./constantes";

/**
 * E2E de Lote 5 (BACKLOG E08, operación de limpieza/mantenimiento) —
 * entregable verificable de docs/fase2/LOTES.md ("confirmar un checkout de
 * prueba crea una tarea de limpieza vinculada") + capturas reales
 * `docs/capturas/lote5-turnos.png` y `docs/capturas/lote5-movil-375.png`.
 *
 * Reutiliza el `webServer` compartido de `playwright.config.ts` (Lote 4:
 * API real + embedded-postgres + `e2e/servidor-api-e2e.ts`) y las
 * constantes/ayudas de ese lote (`constantes.ts`, `auxiliares.ts`) sin
 * modificarlas — este spec crea SU PROPIA data (un usuario 'limpieza' y una
 * reserva sobre `UNIDAD_LIBRE_ID_E2E`) vía llamadas HTTP directas a la API
 * real ya levantada, exactamente como lo haría cualquier cliente externo,
 * antes de ejercitar la UI con Playwright.
 */

function fechaOffsetHoy(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const EMAIL_LIMPIEZA_E2E = "limpieza.e2e@atiende-rv.local";
const PASSWORD_LIMPIEZA_E2E = "clave-limpieza-e2e-1234";

interface FixtureLote5 {
  tareaId: string;
  incidenciaId: string;
}

async function api<T>(
  ruta: string,
  opciones: { metodo?: string; token?: string; cuerpo?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL_API_E2E}${ruta}`, {
    method: opciones.metodo ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opciones.token ? { authorization: `Bearer ${opciones.token}` } : {}),
    },
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`${opciones.metodo ?? "GET"} ${ruta} → ${res.status}: ${texto}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function prepararFixture(offsetBase: number): Promise<FixtureLote5> {
  const { accessToken } = await api<{ accessToken: string }>("/auth/login", {
    metodo: "POST",
    cuerpo: { email: EMAIL_E2E, password: PASSWORD_E2E },
  });

  // Usuario 'limpieza' propio de este spec (idempotente: si ya existe de una
  // corrida anterior en el mismo proceso de `webServer`, el 422 de email
  // duplicado se ignora — el login posterior es lo único que importa).
  await api("/usuarios", {
    metodo: "POST",
    token: accessToken,
    cuerpo: { email: EMAIL_LIMPIEZA_E2E, password: PASSWORD_LIMPIEZA_E2E, rol: "limpieza" },
  }).catch(() => undefined);

  // `offsetBase` distinto por test (misma unidad, mismo webServer/DB
  // compartido durante toda la corrida de Playwright) para que las dos
  // reservas de este spec nunca se solapen entre sí (409 unidad_no_disponible).
  const inicio = fechaOffsetHoy(offsetBase);
  const fin = fechaOffsetHoy(offsetBase + 2);
  const reserva = await api<{ id: string }>("/reservas", {
    metodo: "POST",
    token: accessToken,
    cuerpo: { unidadId: UNIDAD_LIBRE_ID_E2E, rango: { inicio, fin } },
  });

  const procesado = await api<{ tareasCreadas: string[] }>("/operacion/tareas/procesar-eventos", {
    metodo: "POST",
    token: accessToken,
  });
  // Puede que una corrida previa del mismo spec ya haya creado la tarea de
  // esta reserva — en ese caso se busca por unidad/fecha en vez de asumir
  // que `tareasCreadas` tiene la de esta corrida.
  let tareaId = procesado.tareasCreadas[0];
  if (!tareaId) {
    const { tareas } = await api<{ tareas: { id: string; unidadId: string; programadaPara: string }[] }>(
      `/operacion/tareas?unidadId=${UNIDAD_LIBRE_ID_E2E}&programadaPara=${fin}`,
      { token: accessToken },
    );
    tareaId = tareas[0]?.id;
  }
  if (!tareaId) throw new Error("No se pudo obtener el id de la tarea de limpieza generada por el checkout");

  const usuarios = await api<{ usuarios: { id: string; email: string }[] }>("/usuarios", { token: accessToken });
  const usuarioLimpieza = usuarios.usuarios.find((u) => u.email === EMAIL_LIMPIEZA_E2E);
  if (!usuarioLimpieza) throw new Error("No se encontró el usuario de limpieza recién creado");

  await api(`/operacion/tareas/${tareaId}/asignar`, {
    metodo: "PATCH",
    token: accessToken,
    cuerpo: { asignadoA: usuarioLimpieza.id, esProveedorExterno: true },
  });

  const incidencia = await api<{ id: string }>("/operacion/incidencias", {
    metodo: "POST",
    token: accessToken,
    cuerpo: {
      unidadId: UNIDAD_LIBRE_ID_E2E,
      tareaOrigenId: tareaId,
      severidad: "grave",
      titulo: "Fuga de agua bajo el fregadero",
      descripcion: "Detectada al iniciar el checklist de limpieza — requiere plomero antes del próximo huésped.",
      // Se solapa deliberadamente con la reserva (inicio..fin = offsetBase
      // .. offsetBase+2) para demostrar en el propio E2E que confirmar el
      // bloqueo NUNCA cancela la reserva activa (REQ-118, D-011) — solo
      // genera alerta capa_cruzada.
      propuestaBloqueoRango: { inicio: fechaOffsetHoy(offsetBase + 1), fin: fechaOffsetHoy(offsetBase + 2) },
    },
  });

  return { tareaId, incidenciaId: incidencia.id };
}

test.describe("Operación — tablero de turnos y detalle de tarea (Lote 5)", () => {
  test("confirmar un checkout de prueba crea una tarea de limpieza vinculada, visible en el tablero de turnos", async ({
    page,
  }) => {
    const OFFSET_BASE = 2;
    const fixture = await prepararFixture(OFFSET_BASE);

    await iniciarSesion(page);
    // El grupo "OPERACIÓN" del acordeón del sidebar empieza colapsado
    // (default persistido = "CALENDARIO", AdminSidebar.tsx) — hay que
    // expandirlo antes de que el link exista en el DOM.
    await page.getByRole("button", { name: "OPERACIÓN" }).click();
    await page.getByRole("link", { name: "Limpieza/mantenimiento" }).click();
    await expect(page.getByRole("heading", { name: "Operación — Limpieza y mantenimiento" })).toBeVisible();

    const tarjeta = page.getByRole("button", { name: /Depto E2E 102/ }).first();
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.getByText("Proveedor externo")).toBeVisible();

    await tarjeta.click();
    await expect(page.getByRole("heading", { name: "Checklist" })).toBeVisible();
    await expect(page.getByText("Incidencias de mantenimiento")).toBeVisible();
    await expect(page.getByText("Fuga de agua bajo el fregadero")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar bloqueo de mantenimiento" })).toBeVisible();

    await page.screenshot({ path: rutaCaptura("lote5-turnos.png"), fullPage: true });

    // Decisión de producto explícita (REQ-118, D-011, RV11 §e): confirmar el
    // bloqueo de mantenimiento NUNCA cancela la reserva — se verifica aquí
    // con la propia API tras la confirmación humana desde la UI.
    await page.getByRole("button", { name: "Confirmar bloqueo de mantenimiento" }).click();
    await expect(page.getByText(/Bloqueo de mantenimiento confirmado/)).toBeVisible();

    const { accessToken } = await api<{ accessToken: string }>("/auth/login", {
      metodo: "POST",
      cuerpo: { email: EMAIL_E2E, password: PASSWORD_E2E },
    });
    const nocheSolapada = fechaOffsetHoy(OFFSET_BASE + 1);
    const calendario = await api<{ noches: { fecha: string; razon: string | null; estado: string | null }[] }>(
      `/unidades/${UNIDAD_LIBRE_ID_E2E}/calendario?desde=${fechaOffsetHoy(OFFSET_BASE)}&hasta=${fechaOffsetHoy(OFFSET_BASE + 3)}`,
      { token: accessToken },
    );
    const noche = calendario.noches.find((n) => n.fecha === nocheSolapada);
    // RESERVA_CANAL (precedencia 4) sigue dominando sobre MANTENIMIENTO
    // (precedencia 2, D-002) — el bloqueo se confirmó, pero la reserva
    // JAMÁS se canceló ni perdió su estado 'confirmado'.
    expect(noche?.razon).toBe("RESERVA_CANAL");
    expect(noche?.estado).toBe("confirmado");
    void fixture;
  });
});

test.describe("Operación en viewport móvil (375px) — rol limpieza", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("el personal de limpieza ve y opera SU tarea asignada en 375px, sin scroll horizontal del body", async ({
    page,
  }) => {
    await prepararFixture(6);

    // Login directo como el usuario 'limpieza' (no admin_gestora) — mismo
    // formulario que `iniciarSesion`, con credenciales propias de este
    // spec, para mostrar la vista REAL y acotada del portal de proveedor
    // externo (H-053), no la vista de un administrador.
    await page.goto("/login");
    await page.getByLabel("Correo").fill(EMAIL_LIMPIEZA_E2E);
    await page.getByLabel("Contraseña").fill(PASSWORD_LIMPIEZA_E2E);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL("**/calendario");
    // En 375px el sidebar es un drawer cerrado por defecto (AdminLayout.tsx)
    // — hay que abrirlo con el botón de hamburguesa antes de navegar.
    await page.getByRole("button", { name: "Abrir menú de navegación" }).click();
    await page.getByRole("button", { name: "OPERACIÓN" }).click();
    await page.getByRole("link", { name: "Limpieza/mantenimiento" }).click();
    await page.waitForURL("**/operacion");

    await expect(page.getByRole("heading", { name: "Operación — Limpieza y mantenimiento" })).toBeVisible();
    // Sin permiso de gestión: nunca ve el botón de procesar checkouts.
    await expect(page.getByRole("button", { name: /Procesar checkouts pendientes/ })).toHaveCount(0);

    const overflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflowHorizontal).toBe(false);

    const tarjeta = page.getByRole("button", { name: /Depto E2E 102/ }).first();
    await expect(tarjeta).toBeVisible();
    await tarjeta.click();

    await expect(page.getByRole("button", { name: "Volver al tablero" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Checklist" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Completar" }).first()).toBeVisible();

    await page.screenshot({ path: rutaCaptura("lote5-movil-375.png"), fullPage: true });
  });
});
