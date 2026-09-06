import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { EtiquetaEstadoTarea, EtiquetaPrioridad, EtiquetaTipoTarea } from "./EtiquetaEstadoTarea";
import type { EstadoTareaOperativa, PrioridadTareaOperativa, TipoTareaOperativa } from "../api";

const TODOS_LOS_ESTADOS: EstadoTareaOperativa[] = [
  "pendiente",
  "asignada",
  "en_progreso",
  "completada",
  "bloqueada",
  "cancelada",
];
const TODAS_LAS_PRIORIDADES: PrioridadTareaOperativa[] = ["baja", "media", "alta", "urgente"];
const TODOS_LOS_TIPOS: TipoTareaOperativa[] = ["limpieza", "mantenimiento", "inspeccion"];

describe("EtiquetaEstadoTarea", () => {
  it("muestra siempre un texto explícito por estado (nunca solo color, DEFINICION-DE-HECHO §1)", () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      const { getByText, unmount } = render(<EtiquetaEstadoTarea estado={estado} />);
      expect(getByText(/./)).toBeInTheDocument();
      unmount();
    }
  });

  it("'bloqueada' explica la causa (checklist incompleto, REQ-113) en el propio texto", () => {
    const { getByText } = render(<EtiquetaEstadoTarea estado="bloqueada" />);
    expect(getByText(/checklist incompleto/i)).toBeInTheDocument();
  });

  it("no tiene violaciones críticas de accesibilidad", async () => {
    const { container } = render(
      <div>
        {TODOS_LOS_ESTADOS.map((e) => (
          <EtiquetaEstadoTarea key={e} estado={e} />
        ))}
      </div>,
    );
    const resultados = await axe(container);
    expect(resultados.violations).toEqual([]);
  });
});

describe("EtiquetaPrioridad", () => {
  it("muestra texto por cada prioridad", () => {
    for (const prioridad of TODAS_LAS_PRIORIDADES) {
      const { getByText, unmount } = render(<EtiquetaPrioridad prioridad={prioridad} />);
      expect(getByText(/./)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("EtiquetaTipoTarea", () => {
  it("muestra texto por cada tipo", () => {
    for (const tipo of TODOS_LOS_TIPOS) {
      const { getByText, unmount } = render(<EtiquetaTipoTarea tipo={tipo} />);
      expect(getByText(/./)).toBeInTheDocument();
      unmount();
    }
  });
});
