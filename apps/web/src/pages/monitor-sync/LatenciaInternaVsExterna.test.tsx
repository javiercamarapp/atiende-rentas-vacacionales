import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LatenciaInternaVsExterna } from "./LatenciaInternaVsExterna";

vi.mock("./api", () => ({
  obtenerSaludDetallada: vi.fn(async () => ({
    status: "ok",
    latenciaResumen: {
      internaMedidaMs: [
        { canal: "airbnb", cuentaCanalId: "cc-1234567890", tipoEvento: "cerrar_disponibilidad", cuenta: 12, p50: 150, p95: 400, p99: 900 },
      ],
      externaDeclaradaConfianzaSegundos: [{ labels: { canal: "airbnb", confianza: "baja-media" }, valor: 10800 }],
    },
  })),
}));

/**
 * H-073: cubre el requisito explícito de "separadas, con etiqueta clara" —
 * las dos tablas deben aparecer con sus rótulos "medida"/"declarada
 * (confianza)" visibles, y nunca una fila que mezcle ambas cifras.
 */
describe("LatenciaInternaVsExterna", () => {
  it("muestra la tabla de latencia interna MEDIDA con p50/p95/p99 por canal", async () => {
    render(<LatenciaInternaVsExterna />);
    await waitFor(() => expect(screen.getByText("150 ms")).toBeInTheDocument());
    expect(screen.getByText("medida")).toBeInTheDocument();
    expect(screen.getByText("400 ms")).toBeInTheDocument();
    expect(screen.getByText("900 ms")).toBeInTheDocument();
    expect(screen.getAllByText("airbnb").length).toBeGreaterThan(0);
  });

  it("muestra la tabla de latencia externa DECLARADA (confianza) por separado, sin percentiles", async () => {
    render(<LatenciaInternaVsExterna />);
    await waitFor(() => expect(screen.getByText("declarada (confianza)")).toBeInTheDocument());
    expect(screen.getByText("baja-media")).toBeInTheDocument();
    expect(screen.getByText("10800")).toBeInTheDocument();
  });
});
