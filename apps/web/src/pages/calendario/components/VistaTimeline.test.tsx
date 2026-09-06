import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VistaTimeline, type FilaUnidad } from "./VistaTimeline";

const FILA: FilaUnidad = {
  unidadId: "u1",
  unidadNombre: "Depto Playa",
  zonaHoraria: "America/Cancun",
  calendario: { unidadId: "u1", noches: [] },
};

/**
 * Auditoría 2, corrección P-05 (producto-ux-operacion.md): antes la zona
 * horaria de la propiedad solo era visible tras seleccionar una noche/
 * rango en PanelSeleccion.tsx — no "a simple vista" en la vista por
 * defecto (Línea de tiempo). Esta prueba fija que ahora aparece en la
 * cabecera de cada fila sin ninguna interacción del usuario.
 */
describe("VistaTimeline — corrección P-05", () => {
  it("muestra la zona horaria de la propiedad junto al nombre de la unidad, sin seleccionar nada", () => {
    render(<VistaTimeline filas={[FILA]} desde="2026-09-06" hasta="2026-09-08" onSeleccion={vi.fn()} />);
    expect(screen.getByText("Depto Playa")).toBeInTheDocument();
    expect(screen.getByText("America/Cancun")).toBeInTheDocument();
  });
});
