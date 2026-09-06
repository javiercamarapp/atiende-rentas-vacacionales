import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";

const loginMock = vi.fn();
const completarLoginConMfaMock = vi.fn();
const obtenerConfigAuthMock = vi.fn();

vi.mock("../../lib/sesion/SesionProvider", () => ({
  useSesion: () => ({
    usuario: null,
    autenticado: false,
    cargandoInicial: false,
    login: loginMock,
    completarLoginConMfa: completarLoginConMfaMock,
    logout: vi.fn(),
  }),
}));

vi.mock("../../auth/api", () => ({
  obtenerConfigAuth: () => obtenerConfigAuthMock(),
  urlIniciarGoogle: () => "http://localhost:8787/auth/google/inicio",
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

// `fireEvent` en vez de `@testing-library/user-event` (no instalado en
// este paquete — mismo criterio que apps/web/src/pages/mensajeria/
// HiloPage.test.tsx).
describe("LoginPage (Lote 3.2)", () => {
  it("el botón de Google aparece deshabilitado con el motivo cuando GET /auth/config lo reporta así", async () => {
    obtenerConfigAuthMock.mockResolvedValue({
      googleHabilitado: false,
      googleMotivoDeshabilitado: "Google Sign-In no está configurado en este entorno",
      registroAbierto: false,
    });
    renderLogin();

    const boton = await screen.findByRole("button", { name: /Continuar con Google/i });
    expect(boton).toBeDisabled();
    expect(await screen.findByText(/Google Sign-In no está configurado/i)).toBeInTheDocument();
  });

  it("el botón de Google está habilitado cuando la config lo permite", async () => {
    obtenerConfigAuthMock.mockResolvedValue({ googleHabilitado: true, googleMotivoDeshabilitado: null, registroAbierto: false });
    renderLogin();

    const boton = await screen.findByRole("button", { name: /Continuar con Google/i });
    await waitFor(() => expect(boton).not.toBeDisabled());
  });

  it("con MFA pendiente, muestra el paso 2 en vez de completar la sesión", async () => {
    obtenerConfigAuthMock.mockResolvedValue({ googleHabilitado: false, googleMotivoDeshabilitado: null, registroAbierto: false });
    loginMock.mockResolvedValue({ estado: "mfa_requerido", mfaToken: "mfa-token-de-prueba" });
    renderLogin();

    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: "persona@ejemplo.test" } });
    fireEvent.change(screen.getByLabelText(/^Contraseña$/i), { target: { value: "clave-super-secreta-99" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));

    expect(await screen.findByText(/Verificación en dos pasos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Código de tu app de autenticación/i)).toBeInTheDocument();
  });

  it("un código MFA incorrecto muestra el error tipado sin perder el paso 2", async () => {
    obtenerConfigAuthMock.mockResolvedValue({ googleHabilitado: false, googleMotivoDeshabilitado: null, registroAbierto: false });
    loginMock.mockResolvedValue({ estado: "mfa_requerido", mfaToken: "mfa-token-de-prueba" });
    const { ErrorApi } = await import("../../lib/api/cliente");
    completarLoginConMfaMock.mockRejectedValue(new ErrorApi("mfa_invalido", "Código de verificación inválido", 401));

    renderLogin();
    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: "persona@ejemplo.test" } });
    fireEvent.change(screen.getByLabelText(/^Contraseña$/i), { target: { value: "clave-super-secreta-99" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));
    await screen.findByText(/Verificación en dos pasos/i);

    fireEvent.change(screen.getByLabelText(/Código de tu app de autenticación/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Verificar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Código de verificación inválido/i);
  });
});
