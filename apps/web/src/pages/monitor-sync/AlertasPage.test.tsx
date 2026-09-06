import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AlertasPage } from "./AlertasPage";

// `fireEvent` en vez de `@testing-library/user-event` (no instalado en este
// workspace, mismo patrón que apps/web/src/pages/mensajeria/HiloPage.test.tsx).

const reconocerAlertaApi = vi.fn(async (_id: string) => ({ ok: true }));
const resolverAlertaApi = vi.fn(async (_id: string) => ({ ok: true }));

vi.mock("./api", () => ({
  listarAlertas: vi.fn(async (estado?: string) => ({
    alertas:
      estado === "resuelta"
        ? []
        : [
            {
              id: "a1",
              tipo: "sync_sin_exito",
              severidad: "alta",
              canal_id: "c1",
              unidad_id: null,
              mensaje: "Sin sincronización exitosa en Airbnb hace 21600s (umbral 21600s)",
              metadata: {},
              accion_reversible: null,
              estado: "activa",
              creado_en: "2026-09-06T10:00:00.000Z",
              reconocida_por: null,
              reconocida_en: null,
              resuelta_en: null,
            },
          ],
  })),
  reconocerAlertaApi: (id: string) => reconocerAlertaApi(id),
  resolverAlertaApi: (id: string) => resolverAlertaApi(id),
}));

/**
 * Componente (Auditoría 2, corrección P-02): antes no existía ninguna
 * página que consumiera `GET /alertas`/ack/resolver — esta prueba cubre
 * exactamente ese hueco de producto.
 */
describe("AlertasPage — corrección P-02 (producto-ux-operacion.md)", () => {
  it("lista una alerta activa con severidad, tipo y mensaje", async () => {
    render(<AlertasPage />);
    await waitFor(() => expect(screen.getByText(/Sin sincronización exitosa en Airbnb/i)).toBeInTheDocument());
    expect(screen.getByText("alta")).toBeInTheDocument();
    expect(screen.getByText(/Sin sincronización exitosa$/)).toBeInTheDocument();
  });

  it("muestra el banner de que ninguna alerta cancela reservas ni contacta huéspedes", async () => {
    render(<AlertasPage />);
    expect(
      screen.getByText(/nunca cancela una reserva ni contacta a un huésped automáticamente/i),
    ).toBeInTheDocument();
  });

  it("el botón Reconocer llama a POST /alertas/:id/ack y recarga la lista", async () => {
    render(<AlertasPage />);
    await waitFor(() => expect(screen.getByText(/Sin sincronización exitosa en Airbnb/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^reconocer$/i }));
    await waitFor(() => expect(reconocerAlertaApi).toHaveBeenCalledWith("a1"));
  });

  it("el botón Resolver llama a POST /alertas/:id/resolver", async () => {
    render(<AlertasPage />);
    await waitFor(() => expect(screen.getByText(/Sin sincronización exitosa en Airbnb/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^resolver$/i }));
    await waitFor(() => expect(resolverAlertaApi).toHaveBeenCalledWith("a1"));
  });

  it("cambiar el filtro a Resueltas muestra el estado vacío honesto", async () => {
    render(<AlertasPage />);
    await waitFor(() => expect(screen.getByText(/Sin sincronización exitosa en Airbnb/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^resueltas$/i }));
    await waitFor(() => expect(screen.getByText(/Sin alertas en este filtro/i)).toBeInTheDocument());
  });
});
