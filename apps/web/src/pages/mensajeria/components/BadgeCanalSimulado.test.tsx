import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { BadgeCanalSimulado } from "./BadgeCanalSimulado";
import type { CanalMensajeria } from "../api";

const TODOS_LOS_CANALES: CanalMensajeria[] = ["airbnb", "vrbo", "booking"];

describe("BadgeCanalSimulado (LOTES.md Lote 6: indicador de canal simulado)", () => {
  it("siempre muestra el texto 'simulado' — nunca se puede confundir con una conexión real (D-019)", () => {
    for (const canal of TODOS_LOS_CANALES) {
      const { getByText, unmount } = render(<BadgeCanalSimulado canal={canal} />);
      expect(getByText(/simulado/i)).toBeInTheDocument();
      unmount();
    }
  });

  it("el title explica explícitamente que no hay canal de mensajería real conectado", () => {
    const { getByTitle } = render(<BadgeCanalSimulado canal="airbnb" />);
    expect(getByTitle(/sin canal de mensajería real conectado/i)).toBeInTheDocument();
  });

  it("no tiene violaciones críticas de accesibilidad", async () => {
    const { container } = render(
      <div>
        {TODOS_LOS_CANALES.map((c) => (
          <BadgeCanalSimulado key={c} canal={c} />
        ))}
      </div>,
    );
    const resultados = await axe(container);
    expect(resultados.violations).toEqual([]);
  });
});
