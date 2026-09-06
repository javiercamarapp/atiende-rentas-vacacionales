import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeSelector } from "./ThemeSelector";

describe("ThemeSelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("renderiza las 3 opciones claro/sistema/oscuro", () => {
    render(<ThemeSelector />);
    expect(screen.getByRole("radio", { name: "Tema claro" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Seguir al sistema" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tema oscuro" })).toBeInTheDocument();
  });

  it("nunca aplica oscuro salvo elección explícita del usuario (no solo por prefers-color-scheme)", () => {
    render(<ThemeSelector />);
    // Por defecto ("claro"), aunque el SO esté en oscuro, la app no lo hereda.
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("radio", { name: "Tema oscuro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
