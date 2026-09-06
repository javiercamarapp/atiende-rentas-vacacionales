import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RutaConRol } from "./RutaConRol";
import { SesionProvider } from "../../lib/sesion/SesionProvider";

const CLAVE_TOKEN = "atiende-rv-access-token";
const CLAVE_USUARIO = "atiende-rv-usuario-sesion";

function sembrarSesion(rol: string) {
  localStorage.setItem(CLAVE_TOKEN, "token-de-prueba");
  localStorage.setItem(CLAVE_USUARIO, JSON.stringify({ id: "u1", tenantId: null, rol, colaboradorNivel: null }));
}

function renderProtegido(roles: string[]) {
  return render(
    <MemoryRouter>
      <SesionProvider>
        <RutaConRol roles={roles as never}>
          <div>contenido-protegido</div>
        </RutaConRol>
      </SesionProvider>
    </MemoryRouter>,
  );
}

// Auditoría 2, P-08: antes de este componente, navegar por URL directa a
// una ruta restringida montaba la página completa y apilaba 2-3 cajas de
// error 403 (una por cada llamada a la API que la página disparaba). Esta
// prueba fija el comportamiento correcto: con un rol sin permiso, NI
// SIQUIERA se monta `children` — no hay llamadas a la API que puedan
// fallar, porque nunca se ejecutan.
describe("RutaConRol", () => {
  afterEach(() => {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
  });

  it("renderiza children cuando el rol de la sesión está permitido", () => {
    sembrarSesion("superadmin");
    renderProtegido(["superadmin", "admin_gestora"]);
    expect(screen.getByText("contenido-protegido")).toBeInTheDocument();
  });

  it("muestra UNA sola pantalla de 'sin acceso' (no children) con un rol no permitido", () => {
    sembrarSesion("operador");
    renderProtegido(["superadmin", "admin_gestora"]);
    expect(screen.queryByText("contenido-protegido")).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it("muestra 'sin acceso' sin sesión (defensivo — RutaProtegida ya redirige a /login en ese caso real)", () => {
    renderProtegido(["superadmin", "admin_gestora"]);
    expect(screen.queryByText("contenido-protegido")).not.toBeInTheDocument();
    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });
});
