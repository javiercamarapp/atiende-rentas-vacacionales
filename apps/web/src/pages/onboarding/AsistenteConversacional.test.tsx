import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AsistenteConversacional } from "./AsistenteConversacional";

const conversarOnboardingMock = vi.fn();

vi.mock("./api", () => ({
  conversarOnboarding: (mensaje?: string) => conversarOnboardingMock(mensaje),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <AsistenteConversacional />
    </MemoryRouter>,
  );
}

describe("AsistenteConversacional (patrón 7, rescatado de Likida/atiende.ai)", () => {
  it("al montarse, pregunta SIN mensaje (orden por defecto) y muestra la pregunta + CTA del servidor", async () => {
    conversarOnboardingMock.mockResolvedValue({
      onboardingCompleto: false,
      pasoObjetivo: "primeraPropiedad",
      pregunta: "¿Cuál es el nombre de tu primera propiedad?",
      ctaTexto: "Ir a propiedades",
      ctaRuta: "/propiedades",
      datoFaltanteDeclarado: false,
      pasos: {},
    });
    renderWidget();

    expect(await screen.findByText("¿Cuál es el nombre de tu primera propiedad?")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Ir a propiedades" })).toBeInTheDocument();
    expect(conversarOnboardingMock).toHaveBeenCalledWith(undefined);
  });

  it("escribir una pregunta y enviarla llama a conversarOnboarding con el mensaje del usuario", async () => {
    conversarOnboardingMock.mockResolvedValue({
      onboardingCompleto: false,
      pasoObjetivo: "canalConectado",
      pregunta: "Inicial",
      ctaTexto: null,
      ctaRuta: null,
      datoFaltanteDeclarado: false,
      pasos: {},
    });
    renderWidget();
    await screen.findByText("Inicial");

    conversarOnboardingMock.mockResolvedValue({
      onboardingCompleto: false,
      pasoObjetivo: "canalConectado",
      pregunta: "Te doy la URL exacta de tu feed iCal para Airbnb.",
      ctaTexto: "Ir al asistente de canales",
      ctaRuta: "/canales-mexico",
      datoFaltanteDeclarado: false,
      pasos: {},
    });

    fireEvent.change(screen.getByLabelText(/Escribe tu pregunta/i), { target: { value: "¿cómo conecto mi Airbnb?" } });
    fireEvent.click(screen.getByRole("button", { name: "Preguntar" }));

    expect(await screen.findByText("Te doy la URL exacta de tu feed iCal para Airbnb.")).toBeInTheDocument();
    expect(conversarOnboardingMock).toHaveBeenLastCalledWith("¿cómo conecto mi Airbnb?");
  });

  it("onboardingCompleto=true muestra el CTA de calendario y OCULTA el formulario de pregunta (guarda determinista visible en la UI)", async () => {
    conversarOnboardingMock.mockResolvedValue({
      onboardingCompleto: true,
      pasoObjetivo: null,
      pregunta: "¡Ya completaste todos los pasos!",
      ctaTexto: null,
      ctaRuta: null,
      datoFaltanteDeclarado: false,
      pasos: {},
    });
    renderWidget();

    expect(await screen.findByText("¡Ya completaste todos los pasos!")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Ir a mi calendario" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preguntar" })).not.toBeInTheDocument();
  });

  it("datoFaltanteDeclarado=true muestra el aviso de 'no hay respuesta automática' en vez de inventar un CTA", async () => {
    conversarOnboardingMock.mockResolvedValue({
      onboardingCompleto: false,
      pasoObjetivo: null,
      pregunta: "No tengo una pregunta preparada para tu paso pendiente.",
      ctaTexto: null,
      ctaRuta: null,
      datoFaltanteDeclarado: true,
      pasos: {},
    });
    renderWidget();

    expect(await screen.findByText(/No tenemos una respuesta automática/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("un fallo de red muestra un error legible sin tumbar el widget", async () => {
    conversarOnboardingMock.mockRejectedValue(new Error("red caída"));
    renderWidget();

    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo cargar el asistente/i);
  });

  it("el botón Preguntar está deshabilitado con el campo vacío", async () => {
    conversarOnboardingMock.mockResolvedValue({
      onboardingCompleto: false,
      pasoObjetivo: "primeraPropiedad",
      pregunta: "Inicial",
      ctaTexto: null,
      ctaRuta: null,
      datoFaltanteDeclarado: false,
      pasos: {},
    });
    renderWidget();
    await screen.findByText("Inicial");

    await waitFor(() => expect(screen.getByRole("button", { name: "Preguntar" })).toBeDisabled());
  });
});
