import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MatrizCanalesPage } from "./MatrizCanalesPage";

vi.mock("./api", () => ({
  listarCatalogoCanales: vi.fn(async () => ({
    canales: [
      {
        canalCodigo: "airbnb",
        nombre: "Airbnb — iCal",
        vias: [
          {
            viaTecnica: "ical_import_export",
            nivel: "A",
            estadoHonesto: "ical",
            capacidades: {},
            latencia: { texto: "~3 horas", confianza: "baja-media", minutosEstimados: 180 },
            urlProcesoOficial: "https://www.airbnb.mx/help/article/99",
            requisitosCredenciales: ["URL del calendario iCal"],
            motivo: null,
            fuente: "RV22 F01-F02, D-003",
            puenteCanalCodigo: null,
          },
        ],
      },
      {
        canalCodigo: "bestday",
        nombre: "Best Day",
        vias: [
          {
            viaTecnica: "ninguna",
            nivel: "C",
            estadoHonesto: "no_aplica",
            capacidades: {},
            latencia: null,
            urlProcesoOficial: null,
            requisitosCredenciales: [],
            motivo: "Sin evidencia verificable de ningún tipo",
            fuente: "RV22 F20-F21",
            puenteCanalCodigo: null,
          },
        ],
      },
      {
        canalCodigo: "despegar",
        nombre: "Despegar/Decolar (vía puente)",
        vias: [
          {
            viaTecnica: "channel_manager_puente",
            nivel: "B",
            estadoHonesto: "partner_pendiente",
            capacidades: {},
            latencia: null,
            urlProcesoOficial: null,
            requisitosCredenciales: [],
            motivo: "Sin API/spec técnica pública propia",
            fuente: "RV22 F16-F19",
            puenteCanalCodigo: "siteminder",
          },
        ],
      },
    ],
  })),
}));

describe("MatrizCanalesPage — catálogo completo A/B/C (RV22)", () => {
  it("muestra la leyenda de los 3 niveles", async () => {
    render(
      <MemoryRouter>
        <MatrizCanalesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText(/Airbnb/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Nivel A/)).toBeInTheDocument();
    expect(screen.getByText(/Nivel B/)).toBeInTheDocument();
    expect(screen.getByText(/Nivel C/)).toBeInTheDocument();
  });

  it("Best Day (Nivel C) muestra 'No aplica' con su motivo, nunca un estado de conexión honesto genérico", async () => {
    render(
      <MemoryRouter>
        <MatrizCanalesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText(/Best Day/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/No aplica/)).toBeInTheDocument();
    expect(screen.getByText(/Sin evidencia verificable/)).toBeInTheDocument();
  });

  it("Despegar muestra 'vía puente: siteminder'", async () => {
    render(
      <MemoryRouter>
        <MatrizCanalesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText(/Despegar/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/vía puente: siteminder/)).toBeInTheDocument();
  });

  it("cada fila enlaza a su asistente de conexión, nunca a un botón 'marcar conectado'", async () => {
    render(
      <MemoryRouter>
        <MatrizCanalesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText(/Ver asistente/i).length).toBe(3));
    expect(screen.queryByText(/marcar.*conectad/i)).not.toBeInTheDocument();
  });
});
