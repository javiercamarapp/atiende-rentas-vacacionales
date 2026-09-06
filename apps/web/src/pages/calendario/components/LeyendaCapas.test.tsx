import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { LeyendaCapas } from "./LeyendaCapas";
import { TODAS_LAS_CAPAS } from "../capas";

describe("LeyendaCapas", () => {
  it("muestra las 6 categorías con su etiqueta de texto (nunca solo color)", () => {
    const { getByText } = render(<LeyendaCapas />);
    for (const capa of TODAS_LAS_CAPAS) {
      expect(getByText(capa.etiqueta)).toBeInTheDocument();
    }
  });

  it("no tiene violaciones críticas de accesibilidad (axe-core, ACEPTACION §UX-4)", async () => {
    const { container } = render(<LeyendaCapas />);
    const resultados = await axe(container);
    // Se compara la lista de violaciones directamente (en vez del matcher
    // `toHaveNoViolations` de jest-axe, incompatible con el `expect` de
    // Vitest en este toolchain — verificado en esta sesión: falla con
    // `expectAssertion.call is not a function`, un gap de interoperabilidad
    // jest/vitest, no un fallo de axe-core en sí) para que el reporte de
    // violaciones completo aparezca en el mensaje de fallo si algo rompe.
    expect(resultados.violations).toEqual([]);
  });
});
