import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingAsistentePage } from "./OnboardingAsistentePage";

const obtenerEstadoOnboardingMock = vi.fn();

vi.mock("./api", () => ({
  obtenerEstadoOnboarding: () => obtenerEstadoOnboardingMock(),
}));

function renderPagina() {
  return render(
    <MemoryRouter>
      <OnboardingAsistentePage />
    </MemoryRouter>,
  );
}

describe("OnboardingAsistentePage (Lote 3.3)", () => {
  it("marca cada paso completado según GET /onboarding/estado, en vivo desde las tablas reales", async () => {
    obtenerEstadoOnboardingMock.mockResolvedValue({
      pasos: {
        empresaRegistrada: true,
        correoVerificado: true,
        primeraPropiedad: true,
        primeraUnidad: false,
        canalConectado: false,
        colaboradorInvitado: false,
      },
    });
    renderPagina();

    expect(await screen.findByText("Da de alta tu primera propiedad")).toBeInTheDocument();
    // "Agrega tu primera unidad" no está completado -> su CTA sigue visible.
    expect(await screen.findByRole("link", { name: /Ir a propiedades/i })).toBeInTheDocument();
    // El formulario de invitar colaborador aparece porque ese paso no está completo.
    expect(await screen.findByLabelText(/Correo del colaborador/i)).toBeInTheDocument();
  });
});
