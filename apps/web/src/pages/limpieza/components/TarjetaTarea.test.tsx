import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { axe } from "jest-axe";
import { TarjetaTarea } from "./TarjetaTarea";
import type { TareaOperativa } from "../api";

function tarea(overrides: Partial<TareaOperativa> = {}): TareaOperativa {
  return {
    id: "t1",
    unidadId: "u1",
    unidadNombre: "Depto 101",
    ocupacionUnidadId: "o1",
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
    ...overrides,
  };
}

describe("TarjetaTarea", () => {
  it("muestra el nombre de la unidad y el estado", () => {
    const { getByText } = render(<TarjetaTarea tarea={tarea()} seleccionada={false} onSeleccionar={() => {}} />);
    expect(getByText("Depto 101")).toBeInTheDocument();
    expect(getByText("Pendiente")).toBeInTheDocument();
  });

  it("usa un nombre de respaldo si unidadNombre es null (rol sin acceso a `unidad`)", () => {
    const { getByText } = render(
      <TarjetaTarea
        tarea={tarea({ unidadNombre: null, unidadId: "abcdef12-3456-7890-abcd-ef1234567890" })}
        seleccionada={false}
        onSeleccionar={() => {}}
      />,
    );
    expect(getByText(/^Unidad abcdef12/)).toBeInTheDocument();
  });

  it("muestra 'Sin asignar' cuando asignadoA es null y 'Asignada' cuando tiene responsable", () => {
    const { getByText, rerender } = render(<TarjetaTarea tarea={tarea()} seleccionada={false} onSeleccionar={() => {}} />);
    expect(getByText("Sin asignar")).toBeInTheDocument();

    rerender(<TarjetaTarea tarea={tarea({ asignadoA: "u-limpieza-1" })} seleccionada={false} onSeleccionar={() => {}} />);
    expect(getByText("Asignada")).toBeInTheDocument();
  });

  it("muestra la alerta de SLA vencido cuando corresponde", () => {
    const { getByText } = render(
      <TarjetaTarea tarea={tarea({ slaVenceEn: "2020-01-01T00:00:00.000Z" })} seleccionada={false} onSeleccionar={() => {}} />,
    );
    expect(getByText("SLA vencido")).toBeInTheDocument();
  });

  it("invoca onSeleccionar al hacer clic (área de toque completa)", () => {
    const onSeleccionar = vi.fn();
    const { getByRole } = render(<TarjetaTarea tarea={tarea()} seleccionada={false} onSeleccionar={onSeleccionar} />);
    fireEvent.click(getByRole("button"));
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });

  it("no tiene violaciones críticas de accesibilidad", async () => {
    const { container } = render(<TarjetaTarea tarea={tarea()} seleccionada={false} onSeleccionar={() => {}} />);
    const resultados = await axe(container);
    expect(resultados.violations).toEqual([]);
  });
});
