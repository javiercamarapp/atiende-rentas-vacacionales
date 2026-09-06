import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TableroTurnos } from "./TableroTurnos";
import type { TareaOperativa, TurnoDia } from "../api";

function tarea(id: string, unidadId: string, unidadNombre = `Unidad ${unidadId}`): TareaOperativa {
  return {
    id,
    unidadId,
    unidadNombre,
    ocupacionUnidadId: null,
    bufferOcupacionId: null,
    tipo: "limpieza",
    estado: "pendiente",
    prioridad: "media",
    asignadoA: null,
    esProveedorExterno: false,
    programadaPara: "2026-06-05",
    slaVenceEn: null,
    completadaEn: null,
    notas: null,
  };
}

describe("TableroTurnos", () => {
  it("muestra un mensaje cuando no hay turnos en el rango", () => {
    const { getByText } = render(<TableroTurnos turnos={[]} tareaSeleccionadaId={null} onSeleccionarTarea={() => {}} />);
    expect(getByText(/No hay tareas operativas programadas/)).toBeInTheDocument();
  });

  it("agrupa las tareas por día y muestra el conteo por turno", () => {
    const turnos: TurnoDia[] = [
      { fecha: "2026-06-05", tareas: [tarea("t1", "u1"), tarea("t2", "u2")] },
      { fecha: "2026-06-06", tareas: [tarea("t3", "u1")] },
    ];
    const { getByText, getAllByRole } = render(
      <TableroTurnos turnos={turnos} tareaSeleccionadaId={null} onSeleccionarTarea={() => {}} />,
    );
    expect(getByText(/2 tareas/)).toBeInTheDocument();
    expect(getByText(/1 tarea\b/)).toBeInTheDocument();
    expect(getAllByRole("button")).toHaveLength(3);
  });

  it("marca como seleccionada la tarjeta cuya tarea coincide con tareaSeleccionadaId", () => {
    const turnos: TurnoDia[] = [{ fecha: "2026-06-05", tareas: [tarea("t1", "u1")] }];
    const onSeleccionarTarea = vi.fn();
    const { getByRole } = render(
      <TableroTurnos turnos={turnos} tareaSeleccionadaId="t1" onSeleccionarTarea={onSeleccionarTarea} />,
    );
    expect(getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});
