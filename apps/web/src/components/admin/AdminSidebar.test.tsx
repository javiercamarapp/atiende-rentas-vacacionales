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
    renderSidebar();
    expect(screen.getAllByText("Pronto").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Limpieza/i })).not.toBeInTheDocument();
  });

  it("no tiene violaciones críticas de accesibilidad (axe-core)", async () => {
    const { container } = renderSidebar();
    const resultados = await axe(container);
    expect(resultados.violations).toEqual([]);
  });
});
