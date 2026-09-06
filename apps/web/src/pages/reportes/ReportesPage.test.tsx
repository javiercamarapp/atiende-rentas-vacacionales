import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReportesPage } from "./ReportesPage";

vi.mock("./api", () => ({
  obtenerReporteOcupacion: vi.fn(async () => ({
    unidades: [
      {
        unidadId: "u1",
        unidadNombre: "Unidad 1",
        propiedadId: "p1",
        propiedadNombre: "Propiedad A",
        nochesOcupadas: 10,
        nochesDisponibles: 20,
        ocupacionBasisPoints: 5000,
        adrCentavos: 100000,
        revparCentavos: 50000,
      },
    ],
  })),
  obtenerReporteIngresos: vi.fn(async () => ({
    filas: [
      {
        mes: "2026-10",
        canalCodigo: "airbnb",
        propiedadId: "p1",
        propiedadNombre: "Propiedad A",
        ingresosBrutosCentavos: 500000,
        netoCentavos: 400000,
        reservas: 3,
      },
    ],
  })),
  descargarCsv: vi.fn(async () => new Blob(["csv"])),
  decimalDesdeCentavos: (c: number) => (c / 100).toFixed(2),
  porcentajeDesdeBasisPoints: (bp: number) => `${(bp / 100).toFixed(2)}%`,
}));

describe("ReportesPage — H-072/H-073 (ocupación/ADR/RevPAR, ingresos por canal/propiedad/mes)", () => {
  it("muestra la tabla de ocupación con ADR/RevPAR calculados por el backend", async () => {
    render(<ReportesPage />);
    // "Unidad 1" aparece en la barra simple y en la celda de la tabla.
    await waitFor(() => expect(screen.getAllByText("Unidad 1").length).toBeGreaterThan(0));
    // "50.00%" aparece tanto en la barra simple como en la celda de la
    // tabla — ambos son evidencia válida, por eso se usa getAllByText.
    expect(screen.getAllByText("50.00%").length).toBeGreaterThan(0);
    expect(screen.getByText("10/20")).toBeInTheDocument();
  });

  it("muestra la tabla de ingresos agrupados por canal/propiedad/mes", async () => {
    render(<ReportesPage />);
    await waitFor(() => expect(screen.getAllByText("2026-10").length).toBeGreaterThan(0));
    expect(screen.getByText("airbnb")).toBeInTheDocument();
    expect(screen.getAllByText("Propiedad A").length).toBeGreaterThan(0);
  });

  it("ofrece exportación CSV real (botón visible) para ambos reportes", async () => {
    render(<ReportesPage />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /exportar csv/i })).toHaveLength(2));
  });
});
