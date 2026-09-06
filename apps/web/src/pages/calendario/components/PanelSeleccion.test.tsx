import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NocheCalendario } from "@atiende-rv/api/contrato";
import { PanelSeleccion, type SeleccionRango } from "./PanelSeleccion";

vi.mock("../cacheOcupaciones", () => ({
  buscarOcupacionCreada: vi.fn(),
  quitarOcupacionCreada: vi.fn(),
  registrarOcupacionCreada: vi.fn(),
}));
vi.mock("../api", () => ({
  cancelarBloqueo: vi.fn(),
  cancelarReservaDirecta: vi.fn(),
  crearBloqueo: vi.fn(),
  crearReservaDirecta: vi.fn(),
  modificarFechasReserva: vi.fn(),
}));

import { buscarOcupacionCreada } from "../cacheOcupaciones";

function noche(overrides: Partial<NocheCalendario>): NocheCalendario {
  return {
    fecha: "2026-11-01",
    ocupada: true,
    capa: "reserva",
    razon: "RESERVA_CANAL",
    estado: "confirmado",
    origenCanal: "airbnb",
    esDirecta: false,
    ...overrides,
  };
}

const seleccionBase: Omit<SeleccionRango, "noches"> = {
  unidadId: "u1",
  unidadNombre: "Depto 101",
  zonaHoraria: "America/Mexico_City",
  inicio: "2026-11-01",
  fin: "2026-11-02",
};

describe("PanelSeleccion — ACEPTACION §UX-1: nunca cancelar una reserva de canal", () => {
  it("una noche de RESERVA_CANAL importada (esDirecta=false) NUNCA muestra un botón de cancelar/desbloquear", () => {
    vi.mocked(buscarOcupacionCreada).mockReturnValue(null);
    render(
      <PanelSeleccion
        seleccion={{ ...seleccionBase, noches: [noche({ esDirecta: false })] }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /desbloquear/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nunca la cancela ni la modifica/i)).toBeInTheDocument();
  });

  it("un conflicto pendiente tampoco ofrece cancelar", () => {
    vi.mocked(buscarOcupacionCreada).mockReturnValue(null);
    render(
      <PanelSeleccion
        seleccion={{ ...seleccionBase, noches: [noche({ estado: "conflicto_pendiente" })] }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it("una reserva DIRECTA creada en esta sesión (con id en caché) sí ofrece cancelar/modificar", () => {
    vi.mocked(buscarOcupacionCreada).mockReturnValue({
      id: "ocup-1",
      tipo: "reserva",
      unidadId: "u1",
      inicio: "2026-11-01",
      fin: "2026-11-02",
    });
    render(
      <PanelSeleccion
        seleccion={{ ...seleccionBase, noches: [noche({ esDirecta: true, origenCanal: null })] }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /cancelar reserva/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /modificar fechas/i })).toBeInTheDocument();
  });

  it("una entrada preexistente sin id en caché no ofrece acciones, con nota honesta (no un botón roto)", () => {
    vi.mocked(buscarOcupacionCreada).mockReturnValue(null);
    render(
      <PanelSeleccion
        seleccion={{ ...seleccionBase, noches: [noche({ esDirecta: true, origenCanal: null })] }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/todavía no expone/i)).toBeInTheDocument();
  });
});
