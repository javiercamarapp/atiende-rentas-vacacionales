import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SolicitudesArcoPage } from "./SolicitudesArcoPage";

// Mismo patrón que apps/web/src/pages/mensajeria/HiloPage.test.tsx: `vi.mock`
// del módulo de API local del propio directorio de la página.
const ticketMock = {
  id: "t1",
  tipoDerecho: "acceso" as const,
  jurisdiccion: "mx_lfpdppp" as const,
  solicitanteNombre: "Persona de Prueba",
  solicitanteEmail: "persona@example.com",
  descripcion: null,
  estado: "recibida" as const,
  responsableId: null,
  recibidaEn: "2026-09-01T10:00:00.000Z",
  plazoLimite: "2026-09-29T10:00:00.000Z",
  vencida: false,
  resueltaEn: null,
  resolucionNotas: null,
};

const ticketVencidoMock = {
  ...ticketMock,
  id: "t2",
  solicitanteNombre: "Persona Vencida",
  solicitanteEmail: "vencida@example.com",
  plazoLimite: "2020-01-01T00:00:00.000Z",
  vencida: true,
};

const listarMock = vi.fn(async (_estado?: string) => ({
  pagina: 1,
  tamano: 100,
  total: 2,
  entradas: [ticketMock, ticketVencidoMock],
}));
const actualizarMock = vi.fn(async (_id: string, cuerpo: unknown) => ({ ...ticketMock, ...(cuerpo as object) }));
const crearMock = vi.fn(async (_cuerpo: unknown) => ticketMock);

vi.mock("./api", () => ({
  listarSolicitudesArco: (estado?: string) => listarMock(estado),
  crearSolicitudArco: (cuerpo: unknown) => crearMock(cuerpo),
  actualizarSolicitudArco: (id: string, cuerpo: unknown) => actualizarMock(id, cuerpo),
  listarUsuariosBasico: async () => ({ usuarios: [{ id: "u1", email: "admin@example.com" }] }),
}));

describe("SolicitudesArcoPage — REQ-151 (bandeja de solicitudes ARCO/RGPD)", () => {
  it("muestra los tickets de la bandeja con su estado y marca el vencido", async () => {
    render(<SolicitudesArcoPage />);
    await waitFor(() => expect(screen.getByText("Persona de Prueba")).toBeInTheDocument());
    expect(screen.getByText("Persona Vencida")).toBeInTheDocument();
    // Dos filas "Recibida" (badges, no el <option> del filtro de estado).
    expect(screen.getAllByText("Recibida", { selector: "div" })).toHaveLength(2);
  });

  it("nunca ofrece un botón para borrar un ticket — solo 'Gestionar' (ningún DELETE en la UI)", async () => {
    render(<SolicitudesArcoPage />);
    await waitFor(() => expect(screen.getByText("Persona de Prueba")).toBeInTheDocument());
    const botones = screen.getAllByRole("button").map((b) => b.textContent?.toLowerCase() ?? "");
    expect(botones.some((t) => t.includes("borrar") || t.includes("eliminar"))).toBe(false);
  });

  it("abrir 'Gestionar' y guardar sin nota de resolución al pasar a 'resuelta' NO llama a actualizarSolicitudArco (el botón queda deshabilitado)", async () => {
    render(<SolicitudesArcoPage />);
    await waitFor(() => expect(screen.getByText("Persona de Prueba")).toBeInTheDocument());
    screen.getAllByRole("button", { name: /Gestionar/i })[0]!.click();

    await waitFor(() => expect(screen.getByLabelText(/^Estado$/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^Estado$/), { target: { value: "resuelta" } });

    const guardar = await screen.findByRole("button", { name: /^Guardar$/i });
    expect(guardar).toBeDisabled();
    expect(actualizarMock).not.toHaveBeenCalled();
  });

  it("con nota de resolución, 'Guardar' llama a actualizarSolicitudArco con estado y resolucionNotas", async () => {
    render(<SolicitudesArcoPage />);
    await waitFor(() => expect(screen.getByText("Persona de Prueba")).toBeInTheDocument());
    screen.getAllByRole("button", { name: /Gestionar/i })[0]!.click();

    await screen.findByLabelText(/^Estado$/);
    fireEvent.change(screen.getByLabelText(/^Estado$/), { target: { value: "resuelta" } });
    fireEvent.change(screen.getByLabelText(/Nota de resolución/i), {
      target: { value: "Se le dio acceso a sus datos por correo." },
    });

    const guardar = screen.getByRole("button", { name: /^Guardar$/i });
    expect(guardar).not.toBeDisabled();
    guardar.click();

    await waitFor(() =>
      expect(actualizarMock).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ estado: "resuelta", resolucionNotas: "Se le dio acceso a sus datos por correo." }),
      ),
    );
  });
});
