import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, EstadoConexionBadge } from "./badge";
import type { EstadoConexionCanal } from "./badge-estado-conexion";

describe("Badge", () => {
  it("renderiza cada variante de estado de conexión explícita", () => {
    const variantes = [
      "no-conectado",
      "simulador",
      "ical",
      "partner-pendiente",
      "sandbox",
      "produccion",
    ] as const;

    render(
      <>
        {variantes.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </>,
    );

    for (const v of variantes) {
      expect(screen.getByText(v)).toBeInTheDocument();
    }
  });
});

describe("EstadoConexionBadge", () => {
  it("nunca muestra 'Producción' sin texto explícito, y cada estado lleva etiqueta legible propia (D-017)", () => {
    const estados: EstadoConexionCanal[] = [
      "no_conectado",
      "simulador",
      "ical",
      "bloqueado_por_partner",
      "sandbox",
      "produccion",
    ];

    render(
      <>
        {estados.map((estado) => (
          <EstadoConexionBadge key={estado} estado={estado} />
        ))}
      </>,
    );

    expect(screen.getByText("No conectado")).toBeInTheDocument();
    expect(screen.getByText("SIMULADOR — desarrollo/pruebas")).toBeInTheDocument();
    expect(screen.getByText("iCal")).toBeInTheDocument();
    expect(screen.getByText("Bloqueado por partner")).toBeInTheDocument();
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
    expect(screen.getByText("Producción")).toBeInTheDocument();
  });

  it("permite sobreescribir la etiqueta para un caso honesto especial (p. ej. Booking.com 'SIN EVIDENCIA')", () => {
    render(<EstadoConexionBadge estado="ical" etiqueta="SIN EVIDENCIA — no verificado" />);
    expect(screen.getByText("SIN EVIDENCIA — no verificado")).toBeInTheDocument();
  });
});
