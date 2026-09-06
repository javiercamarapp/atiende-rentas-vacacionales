import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { AdminSidebar } from "./AdminSidebar";
import { SesionProvider } from "../../lib/sesion/SesionProvider";

function renderSidebar() {
  return render(
    <MemoryRouter>
      <SesionProvider>
        <AdminSidebar />
      </SesionProvider>
    </MemoryRouter>,
  );
}

describe("AdminSidebar", () => {
  it("muestra las rutas activas de este lote (Calendario, Matriz, Monitor)", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Calendario maestro/i })).toHaveAttribute("href", "/calendario");
    expect(screen.getByRole("link", { name: /Matriz de conectividad/i })).toHaveAttribute("href", "/conectividad");
    expect(screen.getByRole("link", { name: /Monitor de sincronización/i })).toHaveAttribute("href", "/monitor-sync");
  });

  it("Auditoría 2 (P-01): 'Automatización agéntica' ya es un enlace real, no queda ningún placeholder 'Pronto'", () => {
    // Hasta la corrección P-01 (docs/auditoria-2/producto-ux-operacion.md)
    // este era el único item sin `ruta` de todo el sidebar — quedaba
    // "Pronto" para siempre pese a que el backend de Lote 9 ya estaba
    // completo. Esta prueba fijaba ese comportamiento como correcto; ahora
    // fija lo contrario: el grupo "PLATAFORMA" (soloAdmin, acordeón no
    // siempre abierto) se fuerza visible/expandido con sesión de
    // superadmin, y "Automatización agéntica" debe resolver a `/agentes`
    // como cualquier otro ítem activo — sin ningún "Pronto" restante.
    localStorage.setItem("atiende-rv-access-token", "token-de-prueba");
    localStorage.setItem(
      "atiende-rv-usuario-sesion",
      JSON.stringify({ id: "u1", tenantId: null, rol: "superadmin", colaboradorNivel: null }),
    );
    localStorage.setItem("atiende-rv-sidebar-grupo-abierto", "PLATAFORMA");
    try {
      renderSidebar();
      expect(screen.getByRole("link", { name: /Automatización agéntica/i })).toHaveAttribute("href", "/agentes");
      expect(screen.queryByText("Pronto")).not.toBeInTheDocument();
    } finally {
      localStorage.removeItem("atiende-rv-access-token");
      localStorage.removeItem("atiende-rv-usuario-sesion");
      localStorage.removeItem("atiende-rv-sidebar-grupo-abierto");
    }
  });

  it("no tiene violaciones críticas de accesibilidad (axe-core)", async () => {
    const { container } = renderSidebar();
    const resultados = await axe(container);
    expect(resultados.violations).toEqual([]);
  });
});
