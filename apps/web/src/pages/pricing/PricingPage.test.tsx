import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PricingPage } from "./PricingPage";

// `@testing-library/user-event` no es una dependencia instalada en este
// workspace (apps/web/package.json) — se usa `fireEvent` (ya disponible
// vía @testing-library/react) para no añadir una dependencia nueva al
// árbol compartido desde un lote que corre en paralelo con otros seis.
vi.mock("./api", () => ({
  CANALES_CONOCIDOS: ["airbnb", "vrbo", "booking"],
  listarUnidadesBasico: vi.fn(async () => ({ unidades: [{ id: "u1", nombre: "Unidad 1" }] })),
  obtenerContextoPricing: vi.fn(async () => ({
    unidadId: "u1",
    moneda: "MXN",
    precioBaseNocheCentavos: 100000,
    temporadas: [],
    descuentosDuracion: [],
    reglasMinStay: [],
  })),
  fijarTarifaBase: vi.fn(async () => ({ ok: true })),
  crearTemporada: vi.fn(async () => ({ id: "t1" })),
  crearDescuentoDuracion: vi.fn(async () => ({ id: "d1" })),
  crearMinStay: vi.fn(async () => ({ id: "m1" })),
  crearReglaCanal: vi.fn(async () => ({ id: "r1", avisoDesactivarNativo: null })),
  evaluarPublicacion: vi.fn(async () => ({
    puedePublicar: false,
    mensaje: "Tarifas no sincronizables por iCal hacia \"airbnb\" — ningún adaptador real declara ratesPush",
  })),
  cotizar: vi.fn(async () => ({
    unidadId: "u1",
    moneda: "MXN",
    noches: 7,
    desgloseNoches: [],
    subtotalAntesDescuentoCentavos: 700000,
    descuentoAplicado: { nochesMinimas: 7, porcentajeDescuentoBasisPoints: 1000, fuente: "RV13", montoCentavos: 70000 },
    subtotalConDescuentoCentavos: 630000,
    markupCanalCentavos: 0,
    totalCentavos: 630000,
    violacionesMinStay: [],
  })),
}));

async function seleccionarUnidad() {
  const combobox = await screen.findByRole("combobox");
  fireEvent.change(combobox, { target: { value: "u1" } });
  return combobox;
}

describe("PricingPage — H-068/H-069 (cotización determinista, publicación denegada por defecto)", () => {
  it("al seleccionar una unidad, muestra el precio base actual", async () => {
    render(<PricingPage />);
    await seleccionarUnidad();
    await waitFor(() => expect(screen.getByText(/Precio base: MXN 1000\.00\/noche/)).toBeInTheDocument());
  });

  it("la publicación hacia Airbnb aparece denegada con el mensaje honesto de iCal", async () => {
    render(<PricingPage />);
    await seleccionarUnidad();
    await waitFor(() => expect(screen.getByText(/No publicable/i)).toBeInTheDocument());
    expect(screen.getByText(/no sincronizables por iCal/i)).toBeInTheDocument();
  });

  it("cotizar muestra el total determinista calculado por el backend", async () => {
    const { container } = render(<PricingPage />);
    await seleccionarUnidad();
    await waitFor(() => expect(screen.getByRole("heading", { name: /^cotizar/i })).toBeInTheDocument());
    // PanelCotizar es el último bloque de fechas del árbol renderizado.
    const inputsFecha = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    const [inicio, fin] = inputsFecha.slice(-2);
    fireEvent.change(inicio!, { target: { value: "2026-11-01" } });
    fireEvent.change(fin!, { target: { value: "2026-11-08" } });
    fireEvent.click(screen.getByRole("button", { name: /^cotizar$/i }));
    await waitFor(() => expect(screen.getByText(/Total: MXN 6300\.00/)).toBeInTheDocument());
  });
});
