import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingAsistentePage } from "./OnboardingAsistentePage";

const obtenerEstadoOnboardingMock = vi.fn();
// Patrón 7 (asistente conversacional, AsistenteConversacional.tsx):
// mockeada aparte y probada en su propio archivo
// (AsistenteConversacional.test.tsx) — aquí solo necesita no lanzar para
// que esta página siga probando el checklist estático sin interferencia.
const conversarOnboardingMock = vi.fn().mockResolvedValue({
  onboardingCompleto: false,
  pasoObjetivo: "primeraPropiedad",
  pregunta: "¿Cuál es el nombre de tu primera propiedad?",
  // Deliberadamente SIN cta aquí (a diferencia del caso real): el
  // checklist de abajo ya trae su propio link "Ir a propiedades" para el
  // mismo paso — duplicar el texto haría que `findByRole("link", ...)`
  // encuentre dos coincidencias y falle. El CTA del widget conversacional
  // se prueba en aislamiento en AsistenteConversacional.test.tsx.
  ctaTexto: null,
  ctaRuta: null,
  datoFaltanteDeclarado: false,
  pasos: {},
});

vi.mock("./api", () => ({
  obtenerEstadoOnboarding: () => obtenerEstadoOnboardingMock(),
  conversarOnboarding: (mensaje?: string) => conversarOnboardingMock(mensaje),
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
