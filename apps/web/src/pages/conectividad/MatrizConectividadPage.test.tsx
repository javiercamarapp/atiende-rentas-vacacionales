import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MatrizConectividadPage } from "./MatrizConectividadPage";

vi.mock("./api", () => ({
  listarCuentasCanal: vi.fn(async () => ({
    cuentas: [
      {
        id: "c1",
        canalCodigo: "booking",
        nombre: "Booking — cuenta demo",
        estadoConexion: "partner_pendiente",
        esSimulador: false,
        ultimaSincronizacionExitosaEn: null,
      },
    ],
  })),
  crearCuentaCanal: vi.fn(),
}));

describe("MatrizConectividadPage — ACEPTACION §Conectividad-2/§Conectividad-4", () => {
  it("Booking.com se muestra como 'Pausado por el canal', con la cita de origen — nunca 'pendiente' genérico", async () => {
    render(<MatrizConectividadPage />);
    await waitFor(() => expect(screen.getAllByText(/Booking\.com/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Pausado por el canal/i)).toBeInTheDocument();
    expect(screen.getByText(/b002-archivo\.md/)).toBeInTheDocument();
    expect(screen.queryByText(/^Bloqueado por partner$/)).not.toBeInTheDocument();
  });

  it("Booking.com vía iCal se etiqueta 'SIN EVIDENCIA', nunca con una cifra de latencia inventada", async () => {
    render(<MatrizConectividadPage />);
    await waitFor(() => expect(screen.getAllByText(/SIN EVIDENCIA/).length).toBeGreaterThan(0));
  });

  it("solo Airbnb/Vrbo ofrecen 'Conectar iCal' — Booking.com nunca (PLAN-CONSTRUCCION.md §6)", async () => {
    render(<MatrizConectividadPage />);
    await waitFor(() => expect(screen.getAllByText(/Booking\.com/i).length).toBeGreaterThan(0));
    // Exactamente 2 botones "Conectar iCal" (Airbnb + Vrbo) — ninguno en la
    // tarjeta de Booking.com, que en su lugar muestra el texto fijo de
    // "no disponible — solo vía channel manager...".
    expect(screen.getAllByRole("button", { name: /conectar ical/i })).toHaveLength(2);
    expect(screen.getByText(/solo vía channel manager certificado o extranet manual/i)).toBeInTheDocument();
  });

  it("Airbnb muestra su latencia declarada con nota de confianza baja", async () => {
    render(<MatrizConectividadPage />);
    await waitFor(() => expect(screen.getAllByText(/Airbnb/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/confianza baja/).length).toBeGreaterThan(0);
  });
});
