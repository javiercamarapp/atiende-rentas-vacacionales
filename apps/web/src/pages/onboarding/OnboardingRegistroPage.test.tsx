import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingRegistroPage } from "./OnboardingRegistroPage";

const registrarEmpresaMock = vi.fn();

vi.mock("../../lib/sesion/SesionProvider", () => ({
  useSesion: () => ({ autenticado: false }),
}));

vi.mock("./api", () => ({
  registrarEmpresa: (...args: unknown[]) => registrarEmpresaMock(...args),
}));

function renderPagina() {
  return render(
    <MemoryRouter>
      <OnboardingRegistroPage />
    </MemoryRouter>,
  );
}

describe("OnboardingRegistroPage (Lote 3.3)", () => {
  it("envía los 4 campos del formulario a POST /onboarding/registro y muestra 'revisa tu correo' al terminar", async () => {
    registrarEmpresaMock.mockResolvedValue({
      tenantId: "t1",
      usuarioId: "u1",
      requiereVerificacionCorreo: true,
      siguientePaso: "verificar_correo_y_login",
    });
    renderPagina();

    fireEvent.change(screen.getByLabelText(/Nombre comercial/i), { target: { value: "Rentas Test" } });
    fireEvent.change(screen.getByLabelText(/Razón social/i), { target: { value: "Rentas Test S.A." } });
    fireEvent.change(screen.getByLabelText(/Tu correo/i), { target: { value: "admin@test.local" } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: "clave-super-secreta-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear mi cuenta/i }));

    await waitFor(() =>
      expect(registrarEmpresaMock).toHaveBeenCalledWith({
        empresaNombre: "Rentas Test",
        empresaRazonSocial: "Rentas Test S.A.",
        adminCorreo: "admin@test.local",
        adminPassword: "clave-super-secreta-1",
        planCodigo: undefined,
      }),
    );
    expect(await screen.findByText(/Revisa tu correo/i)).toBeInTheDocument();
    expect(screen.getByText(/admin@test\.local/)).toBeInTheDocument();
  });

  it("muestra el mensaje de error del servidor si el registro falla", async () => {
    const { ErrorApi } = await import("../../lib/api/cliente");
    registrarEmpresaMock.mockRejectedValue(new ErrorApi("validacion", "El correo ya está en uso", 422));
    renderPagina();

    fireEvent.change(screen.getByLabelText(/Nombre comercial/i), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/Razón social/i), { target: { value: "X S.A." } });
    fireEvent.change(screen.getByLabelText(/Tu correo/i), { target: { value: "x@x.local" } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: "clave-super-secreta-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear mi cuenta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El correo ya está en uso");
  });
});
