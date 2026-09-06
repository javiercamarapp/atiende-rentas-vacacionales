import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CuentasCanalPage } from "./CuentasCanalPage";

// Sesión mínima de tenant (admin_gestora) — evita el selector de tenant de
// superadmin, que requiere una concesión "romper cristal" aparte.
vi.mock("../../lib/sesion/SesionProvider", () => ({
  useSesion: () => ({
    usuario: { id: "u1", tenantId: "t1", rol: "admin_gestora", colaboradorNivel: null },
    autenticado: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("./api", () => ({
  listarTenants: vi.fn(async () => ({ tenants: [] })),
  listarCuentasCanal: vi.fn(async () => ({
    cuentas: [
      {
        id: "c1",
        canalCodigo: "vrbo",
        nombre: "Cuenta simulador",
        tipoConexion: "simulador",
        estadoConexion: "simulador",
        credencialesConfiguradas: false,
        motivoPartnerPendiente: null,
        esSimulador: true,
      },
      {
        id: "c2",
        canalCodigo: "booking",
        nombre: "Booking directo",
        tipoConexion: "partner_pendiente",
        estadoConexion: "partner_pendiente",
        credencialesConfiguradas: false,
        motivoPartnerPendiente: "pausado por el canal — connect.booking.com",
        esSimulador: false,
      },
    ],
  })),
  crearCuentaCanal: vi.fn(),
}));

describe("CuentasCanalPage — H-011/H-012 (tipo de conexión honesto, sin credenciales)", () => {
  it("una cuenta simulador lleva el banner 'SIMULADOR — desarrollo/pruebas'", async () => {
    render(<CuentasCanalPage />);
    await waitFor(() => expect(screen.getByText("Cuenta simulador")).toBeInTheDocument());
    expect(screen.getAllByText(/SIMULADOR/).length).toBeGreaterThan(0);
  });

  it("una cuenta partner_pendiente muestra el motivo explícito, nunca 'pendiente' desnudo", async () => {
    render(<CuentasCanalPage />);
    await waitFor(() => expect(screen.getByText("Booking directo")).toBeInTheDocument());
    expect(screen.getByText(/pausado por el canal/)).toBeInTheDocument();
  });

  it("nunca se muestra 'configurada' cuando no hay credenciales", async () => {
    render(<CuentasCanalPage />);
    await waitFor(() => expect(screen.getAllByText("no configurada").length).toBe(2));
  });

  it("el formulario de alta exige motivo cuando se elige 'partner pendiente'", async () => {
    render(<CuentasCanalPage />);
    const selects = await screen.findAllByRole("combobox");
    const selectTipoConexion = selects[selects.length - 1]!;
    fireEvent.change(selectTipoConexion, { target: { value: "partner_pendiente" } });
    expect(screen.getByPlaceholderText(/pausado por el canal/)).toBeInTheDocument();
  });
});
