import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AsistenteConexionPage } from "./AsistenteConexionPage";

const obtenerAsistenteConexionMock = vi.fn();
vi.mock("./api", () => ({
  obtenerAsistenteConexion: (...args: unknown[]) => obtenerAsistenteConexionMock(...args),
}));

function renderizarEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/canales-mexico/:canalCodigo" element={<AsistenteConexionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AsistenteConexionPage — nunca permite marcar 'conectado' manualmente (RV22-R-06)", () => {
  it("Booking.com: muestra motivo, requisitos, pasos y el aviso de no-autoconexión", async () => {
    obtenerAsistenteConexionMock.mockResolvedValueOnce({
      canalCodigo: "booking",
      nombre: "Booking.com — API Connectivity (OTA/B.XML)",
      nivel: "B",
      viaTecnica: "api_partner",
      estadoHonesto: "partner_pendiente",
      urlProcesoOficial: "https://connect.booking.com",
      requisitosCredenciales: ["Machine account de Booking.com"],
      motivo: "Booking pausa nuevos connectivity providers (connect.booking.com, 2026-09-06)",
      fuente: "RV22 F03, D-011",
      puenteCanalCodigo: null,
      pasos: ["Solicita el acceso de partner en 'URL del proceso oficial'."],
      avisoNoAutoconexion: "El estado de conexión nunca se marca manualmente.",
    });

    renderizarEn("/canales-mexico/booking?via=api_partner");

    await waitFor(() => expect(screen.getAllByText(/Booking\.com/).length).toBeGreaterThan(0));
    expect(screen.getByText(/pausa nuevos connectivity providers/)).toBeInTheDocument();
    expect(screen.getByText(/Machine account de Booking\.com/)).toBeInTheDocument();
    expect(screen.getByText(/nunca se marca manualmente/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /marcar.*conectad/i })).not.toBeInTheDocument();
  });

  it("Despegar: muestra el enlace al canal puente (SiteMinder)", async () => {
    obtenerAsistenteConexionMock.mockResolvedValueOnce({
      canalCodigo: "despegar",
      nombre: "Despegar/Decolar (vía puente)",
      nivel: "B",
      viaTecnica: "channel_manager_puente",
      estadoHonesto: "partner_pendiente",
      urlProcesoOficial: null,
      requisitosCredenciales: [],
      motivo: "Sin API/spec técnica pública propia",
      fuente: "RV22 F16-F19",
      puenteCanalCodigo: "siteminder",
      pasos: ["Contrata/activa el contrato comercial con el proveedor puente."],
      avisoNoAutoconexion: "El estado de conexión nunca se marca manualmente.",
    });

    renderizarEn("/canales-mexico/despegar");

    await waitFor(() => expect(screen.getAllByText(/Despegar/).length).toBeGreaterThan(0));
    expect(screen.getByText(/se conecta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "siteminder" })).toHaveAttribute("href", "/canales-mexico/siteminder");
  });
});
