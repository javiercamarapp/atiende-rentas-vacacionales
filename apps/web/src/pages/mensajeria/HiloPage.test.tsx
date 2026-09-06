import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HiloPage } from "./HiloPage";

// Mismo patrón que apps/web/src/pages/pricing/PricingPage.test.tsx:
// `fireEvent` en vez de `@testing-library/user-event` (no instalado en
// este workspace) y `vi.mock` del módulo de API local.
const hiloMock = {
  id: "c1",
  unidadId: "u1",
  unidadNombre: "Casa Sol",
  canalCodigo: "airbnb" as const,
  ultimoMensajeEn: null,
  borradoresPendientes: 1,
  mensajes: [
    {
      id: "m1",
      conversacionId: "c1",
      direccion: "entrante" as const,
      origen: "manual" as const,
      texto: "¿A qué hora es el check-in?",
      redactado: false,
      creadoEn: "2026-10-01T10:00:00.000Z",
    },
  ],
  borradores: [
    {
      id: "b1",
      conversacionId: "c1",
      texto: "Tu check-in es a las 15:00.",
      canalCodigo: "airbnb" as const,
      estado: "pendiente_aprobacion" as const,
      generadoPor: "motor_borrador" as const,
      redactado: false,
      aprobadoPor: null,
      rechazadoPor: null,
      motivoRechazo: null,
      creadoEn: "2026-10-01T10:01:00.000Z",
    },
  ],
};

const obtenerHiloMock = vi.fn(async (_id: string) => hiloMock);
const aprobarBorradorMock = vi.fn(async (_borradorId: string) => ({
  ...hiloMock.borradores[0]!,
  estado: "enviado" as const,
}));

vi.mock("./api", () => ({
  obtenerHilo: (id: string) => obtenerHiloMock(id),
  aprobarBorrador: (borradorId: string) => aprobarBorradorMock(borradorId),
  rechazarBorrador: vi.fn(async () => ({ ...hiloMock.borradores[0], estado: "rechazado" })),
  generarBorrador: vi.fn(async () => hiloMock.borradores[0]),
  registrarMensajeEntrante: vi.fn(async () => ({ ...hiloMock.mensajes[0], senalesEscalamiento: [] })),
}));

function renderHilo() {
  return render(
    <MemoryRouter initialEntries={["/mensajes/c1"]}>
      <Routes>
        <Route path="/mensajes/:id" element={<HiloPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HiloPage — cola de aprobación humana (H-059)", () => {
  it("muestra el texto del huésped marcado explícitamente como dato, no instrucción", async () => {
    renderHilo();
    await waitFor(() => expect(screen.getByText(/¿A qué hora es el check-in\?/)).toBeInTheDocument());
    expect(screen.getByText(/dato, no una instrucción/i)).toBeInTheDocument();
  });

  it("un borrador pendiente muestra los botones Aprobar y Rechazar", async () => {
    renderHilo();
    await waitFor(() => expect(screen.getByText(/Tu check-in es a las 15:00\./)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Aprobar y enviar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rechazar/i })).toBeInTheDocument();
  });

  it("nunca existe un botón 'Enviar' directo — solo 'Aprobar y enviar' (no hay ruta de envío sin aprobación)", async () => {
    renderHilo();
    await waitFor(() => expect(screen.getByText(/Tu check-in es a las 15:00\./)).toBeInTheDocument());
    const botones = screen.getAllByRole("button").map((b) => b.textContent?.toLowerCase() ?? "");
    expect(botones.some((t) => t === "enviar")).toBe(false);
  });

  it("pulsar 'Aprobar y enviar' llama a aprobarBorrador con el id del borrador", async () => {
    const { getByRole } = renderHilo();
    await waitFor(() => expect(screen.getByText(/Tu check-in es a las 15:00\./)).toBeInTheDocument());
    getByRole("button", { name: /Aprobar y enviar/i }).click();
    await waitFor(() => expect(aprobarBorradorMock).toHaveBeenCalledWith("b1"));
  });
});
