import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportIcalUrl } from "./ExportIcalUrl";

vi.mock("../calendario/api", () => ({
  listarUnidades: vi.fn(async () => ({
    unidades: [{ id: "u1", propiedadId: "p1", ownerId: null, nombre: "Depto 101", duracionMinimaNoches: 1 }],
  })),
}));

const obtenerUrlExportIcal = vi.fn(async (unidadId: string, canalCodigo: string) => ({
  unidadId,
  canalCodigo,
  token: "token-abc",
  url: `https://api.example/feed/ical/token-abc.ics`,
  rotadoEn: null,
}));
const rotarUrlExportIcal = vi.fn(async (unidadId: string, canalCodigo: string) => ({
  unidadId,
  canalCodigo,
  token: "token-nuevo",
  url: `https://api.example/feed/ical/token-nuevo.ics`,
  rotadoEn: "2026-09-06T00:00:00.000Z",
}));

vi.mock("./api", () => ({
  obtenerUrlExportIcal: (...args: [string, string]) => obtenerUrlExportIcal(...args),
  rotarUrlExportIcal: (...args: [string, string]) => rotarUrlExportIcal(...args),
}));

describe("ExportIcalUrl — Lote 11B corrección #3", () => {
  it("al elegir una unidad muestra la URL real y el botón Copiar la copia al portapapeles", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ExportIcalUrl canal="airbnb" />);

    await waitFor(() => expect(screen.getByText(/Depto 101/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Unidad para exportar a airbnb/i), { target: { value: "u1" } });

    await waitFor(() => expect(screen.getByDisplayValue(/token-abc\.ics/)).toBeInTheDocument());
    expect(obtenerUrlExportIcal).toHaveBeenCalledWith("u1", "airbnb");

    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://api.example/feed/ical/token-abc.ics"));
    expect(screen.getByRole("button", { name: /copiado/i })).toBeInTheDocument();
  });

  it("rotar reemplaza la URL mostrada por la nueva", async () => {
    render(<ExportIcalUrl canal="vrbo" />);

    await waitFor(() => expect(screen.getByText(/Depto 101/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Unidad para exportar a vrbo/i), { target: { value: "u1" } });
    await waitFor(() => expect(screen.getByDisplayValue(/token-abc\.ics/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /rotar/i }));
    await waitFor(() => expect(screen.getByDisplayValue(/token-nuevo\.ics/)).toBeInTheDocument());
    expect(rotarUrlExportIcal).toHaveBeenCalledWith("u1", "vrbo");
  });
});
