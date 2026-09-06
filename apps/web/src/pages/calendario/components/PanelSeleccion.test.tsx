import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NocheCalendario } from "@atiende-rv/api/contrato";
import { PanelSeleccion, type SeleccionRango } from "./PanelSeleccion";

vi.mock("../api", () => ({
  cancelarBloqueo: vi.fn(),
  cancelarReservaDirecta: vi.fn(),
  crearBloqueo: vi.fn(),
  crearReservaDirecta: vi.fn(),
  modificarFechasReserva: vi.fn(),
}));

function noche(overrides: Partial<NocheCalendario>): NocheCalendario {
  return {
    fecha: "2026-11-01",
    ocupada: true,
    ocupacionId: "ocup-1",
    ocupacionInicio: "2026-11-01",
    ocupacionFin: "2026-11-02",
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
  it("una noche de RESERVA_CANAL (esDirecta=false) NUNCA muestra un botón de cancelar/desbloquear, aunque traiga ocupacionId", () => {
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
    render(
      <PanelSeleccion
        seleccion={{ ...seleccionBase, noches: [noche({ estado: "conflicto_pendiente" })] }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it("una reserva DIRECTA (ocupacionId viene del contrato, no de una caché de sesión) sí ofrece cancelar/modificar", () => {
    render(
      <PanelSeleccion
        seleccion={{
          ...seleccionBase,
          noches: [noche({ esDirecta: true, origenCanal: null, ocupacionId: "ocup-preexistente" })],
        }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /cancelar reserva/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /modificar fechas/i })).toBeInTheDocument();
  });

  it("un bloqueo del propietario ofrece quitar pero nunca modificar fechas", () => {
    render(
      <PanelSeleccion
        seleccion={{
          ...seleccionBase,
          noches: [noche({ capa: "bloqueo", razon: "BLOQUEO_PROPIETARIO", esDirecta: false, origenCanal: null })],
        }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /quitar bloqueo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /modificar fechas/i })).not.toBeInTheDocument();
  });

  it("una noche ocupada sin ocupacionId no ofrece acciones, con nota honesta (no un botón roto)", () => {
    render(
      <PanelSeleccion
        seleccion={{
          ...seleccionBase,
          noches: [noche({ esDirecta: true, origenCanal: null, ocupacionId: null, ocupacionInicio: null, ocupacionFin: null })],
        }}
        onLimpiar={() => {}}
        onCambio={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no devolvió `ocupacionId`/i)).toBeInTheDocument();
  });
});
