import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SuperadminPage } from "./SuperadminPage";

vi.mock("./api", () => ({
  listarTenants: vi.fn(async () => ({
    tenants: [
      {
        id: "t1",
        nombre: "Tenant Demo",
        tipo: "empresa_gestora",
        estado: "activo",
        suspendidoMotivo: null,
        creadoEn: "2026-01-01T00:00:00Z",
        metricas: {
          unidadesTotal: 5,
          cuentasCanalTotal: 2,
          cuentasCanalConfiguradas: 1,
          cuentasCanalSimulador: 1,
          alertasAbiertas: 0,
          outboxPendiente: 0,
        },
      },
    ],
  })),
  listarAccesosRomperCristal: vi.fn(async () => ({
    accesos: [
      {
        id: "a1",
        tenantId: "t1",
        motivo: "Investigación de ticket #7",
        alcance: "general",
        creadoEn: "2026-01-01T00:00:00Z",
        expiraEn: "2099-01-01T00:00:00Z",
        revocadoEn: null,
      },
    ],
  })),
  listarFlags: vi.fn(async () => ({
    flags: [
      {
        id: "sync.canal_pausado_por_alerta",
        descripcion: "Pausa reversible de push",
        categoriaRiesgo: "operativo",
        valorGlobal: false,
        valorEfectivo: false,
        overrideDeTenant: false,
      },
    ],
  })),
  crearTenant: vi.fn(),
  suspenderTenant: vi.fn(),
  activarTenant: vi.fn(),
  crearAccesoRomperCristal: vi.fn(),
  revocarAccesoRomperCristal: vi.fn(),
  establecerFlag: vi.fn(),
}));

describe("SuperadminPage — H-074/H-075 (directorio + banner de romper cristal)", () => {
  it("muestra el rótulo 'Superadmin' y el directorio de tenants con métricas", async () => {
    render(<SuperadminPage />);
    expect(screen.getByText("Superadmin")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Tenant Demo").length).toBeGreaterThan(0));
    expect(screen.getByText("activo")).toBeInTheDocument();
  });

  it("muestra un banner persistente mientras hay una concesión 'romper cristal' vigente", async () => {
    render(<SuperadminPage />);
    await waitFor(() =>
      expect(screen.getByText(/Acceso "romper cristal" activo/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Investigación de ticket #7/)).toBeInTheDocument();
  });
});
