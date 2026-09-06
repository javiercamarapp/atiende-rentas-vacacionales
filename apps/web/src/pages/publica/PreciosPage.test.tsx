import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PreciosPage } from "./PreciosPage";

const obtenerPlanesPublicosMock = vi.fn();

vi.mock("../../lib/sesion/SesionProvider", () => ({
  useSesion: () => ({ autenticado: false }),
}));

vi.mock("./api", () => ({
  obtenerPlanesPublicos: () => obtenerPlanesPublicosMock(),
}));

function renderPagina() {
  return render(
    <MemoryRouter>
      <PreciosPage />
    </MemoryRouter>,
  );
}

describe("PreciosPage (Lote 3.3, RV16)", () => {
  it("muestra la marca de agua de borrador comercial (nunca precios silenciosamente definitivos)", async () => {
    obtenerPlanesPublicosMock.mockResolvedValue({ planes: [] });
    renderPagina();
    expect(await screen.findByText(/Borrador — no es contenido definitivo/i)).toBeInTheDocument();
  });

  it("renderiza cada plan con su precio del primer escalón y sus add-ons, viniendo SIEMPRE de la API (nunca hardcodeado)", async () => {
    obtenerPlanesPublicosMock.mockResolvedValue({
      planes: [
        {
          codigo: "esencial",
          nombre: "Esencial",
          descripcion: "Para gestoras pequeñas.",
          escalones: [
            { hastaUnidades: 5, precioCentavosPorUnidad: 3500 },
            { hastaUnidades: null, precioCentavosPorUnidad: 3000 },
          ],
          addOnsDisponibles: [
            { codigo: "ia_conversacional_500", nombre: "IA conversacional — 500 mensajes/mes", precioCentavosMes: 1500, mensajesIncluidos: 500 },
          ],
          limites: { unidadesActivasMax: 15, mensajesIaMesMax: null, cuentasCanalMax: 3 },
          diasPrueba: 14,
          moneda: "USD",
          etiquetaPrecio: "borrador_comercial",
          activo: true,
        },
      ],
    });
    renderPagina();

    expect(await screen.findByText("Esencial")).toBeInTheDocument();
    expect(screen.getByText("$35.00")).toBeInTheDocument();
    expect(screen.getByText(/Hasta 5 unidades: \$35\.00\/unidad/)).toBeInTheDocument();
    expect(screen.getByText(/IA conversacional — 500 mensajes\/mes — \$15\.00\/mes/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Empezar con Esencial/i })).toHaveAttribute(
      "href",
      "/onboarding?plan=esencial",
    );
  });

  it("muestra un error si la API no responde, en vez de quedar en 'Cargando' para siempre", async () => {
    obtenerPlanesPublicosMock.mockRejectedValue(new Error("red"));
    renderPagina();
    expect(await screen.findByText(/No se pudieron cargar los planes/i)).toBeInTheDocument();
  });
});
