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

  it("las secciones de otros lotes aparecen deshabilitadas con etiqueta 'Pronto', no como si funcionaran", () => {
    // Lote 8: los lotes 5/6 (limpieza/mensajería) y este mismo lote ya
    // completaron sus items — el único placeholder restante (Lote 9,
    // automatización agéntica) vive en el grupo "PLATAFORMA", que (a)
    // está detrás de `soloAdmin` (invisible sin sesión de admin/
    // superadmin) y (b) es un acordeón colapsado por defecto (solo
    // "ANÁLISIS" es `siempreAbierto`). Se simula una sesión de superadmin
    // y se fuerza el grupo abierto (mismas claves de localStorage que usan
    // `SesionProvider`/`AdminSidebar`) para verificar que ESE placeholder
    // sigue mostrando "Pronto" y no un enlace roto.
    localStorage.setItem("atiende-rv-access-token", "token-de-prueba");
    localStorage.setItem(
      "atiende-rv-usuario-sesion",
      JSON.stringify({ id: "u1", tenantId: null, rol: "superadmin", colaboradorNivel: null }),
    );
    localStorage.setItem("atiende-rv-sidebar-grupo-abierto", "PLATAFORMA");
    try {
      renderSidebar();
      expect(screen.getAllByText("Pronto").length).toBeGreaterThan(0);
      expect(screen.queryByRole("link", { name: /Automatización agéntica/i })).not.toBeInTheDocument();
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
