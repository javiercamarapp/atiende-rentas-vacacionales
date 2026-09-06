import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FinanzasPage } from "./FinanzasPage";

const listarStatementsMock = vi.fn(async (_ownerId?: string) => ({
  statements: [
    {
      id: "s1",
      ownerId: "owner-1",
      periodoInicio: "2026-10-01",
      periodoFin: "2026-11-01",
      version: 1,
      moneda: "MXN",
      netoCentavos: 75600,
      generadoEn: "2026-11-02T00:00:00.000Z",
    },
  ],
}));

vi.mock("./api", () => ({
  listarStatements: (ownerId?: string) => listarStatementsMock(ownerId),
  listarReglasComision: vi.fn(async () => ({ reglas: [] })),
  crearReglaComision: vi.fn(),
  generarStatement: vi.fn(),
  registrarMovimiento: vi.fn(),
  obtenerMovimiento: vi.fn(),
  importarPayout: vi.fn(),
  urlDescargaStatement: (id: string) => `/finanzas/statements/${id}/descarga`,
  decimalDesdeCentavos: (c: number) => (c / 100).toFixed(2),
}));

let usuarioMock: { rol: string; colaboradorNivel: string | null } | null = null;
vi.mock("../../lib/sesion/SesionProvider", () => ({
  useSesion: () => ({ usuario: usuarioMock, autenticado: usuarioMock !== null, cargandoInicial: false, login: vi.fn(), logout: vi.fn() }),
}));

describe("FinanzasPage — vista limitada por rol (RV12 §1)", () => {
  // Las consultas usan `getByRole("heading", ...)` (nunca `getByText` suelto)
  // porque el párrafo de descripción de la página menciona, en prosa, las
  // mismas palabras que los títulos de sección ("reglas de comisión de
  // canal", "conciliación de payouts") — un `getByText` colisionaría con
  // ese párrafo para los roles admin/contador.
  it("rol propietario: ve sus statements pero NUNCA los controles administrativos (generar/reglas/payouts)", async () => {
    usuarioMock = { rol: "propietario", colaboradorNivel: null };
    render(<FinanzasPage />);
    await waitFor(() => expect(screen.getByText(/2026-10-01/)).toBeInTheDocument());
    expect(screen.getByText(/mis liquidaciones/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Generar owner statement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Conciliación de payouts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Reglas de comisión de canal/i })).not.toBeInTheDocument();
  });

  it("rol admin_gestora: ve los controles de generación de statement y payouts", async () => {
    usuarioMock = { rol: "admin_gestora", colaboradorNivel: null };
    render(<FinanzasPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Generar owner statement/i })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /Conciliación de payouts/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Reglas de comisión de canal/i })).toBeInTheDocument();
  });

  it("rol contador: ve reglas de comisión de solo lectura, sin generar statements ni payouts", async () => {
    usuarioMock = { rol: "contador", colaboradorNivel: null };
    render(<FinanzasPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Reglas de comisión de canal/i })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: /Generar owner statement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Conciliación de payouts/i })).not.toBeInTheDocument();
  });
});
