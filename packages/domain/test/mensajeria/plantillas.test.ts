import { describe, expect, it } from "vitest";
import {
  PlantillaNoAprobadaError,
  VariablePlantillaFaltanteError,
  exigirPlantillaAprobadaParaProgramar,
  extraerVariables,
  renderizarPlantilla,
  type PlantillaMensaje,
} from "../../src/mensajeria/plantillas.js";

function plantilla(overrides: Partial<PlantillaMensaje> = {}): PlantillaMensaje {
  return {
    evento: "confirmacion",
    idioma: "es",
    canal: "airbnb",
    cuerpo: "¡Hola {{nombreHuesped}}! Tu reserva en {{propiedadNombre}} está confirmada.",
    aprobadaPorTenant: true,
    activa: true,
    ...overrides,
  };
}

describe("motor de plantillas (H-056)", () => {
  it("extrae variables sin duplicados", () => {
    expect(extraerVariables("{{a}} y {{b}} y {{a}} de nuevo")).toEqual(["a", "b"]);
  });

  it("renderiza sustituyendo todas las variables", () => {
    const texto = renderizarPlantilla(plantilla(), {
      nombreHuesped: "Ana",
      propiedadNombre: "Casa Sol",
    });
    expect(texto).toBe("¡Hola Ana! Tu reserva en Casa Sol está confirmada.");
  });

  it("nunca inventa un valor faltante — lanza en su lugar", () => {
    expect(() => renderizarPlantilla(plantilla(), { nombreHuesped: "Ana" })).toThrow(
      VariablePlantillaFaltanteError,
    );
  });

  it("H-056: solo plantillas aprobadas por el tenant pueden programarse", () => {
    expect(() => exigirPlantillaAprobadaParaProgramar(plantilla({ aprobadaPorTenant: false }))).toThrow(
      PlantillaNoAprobadaError,
    );
    expect(() => exigirPlantillaAprobadaParaProgramar(plantilla({ activa: false }))).toThrow(
      PlantillaNoAprobadaError,
    );
    expect(() => exigirPlantillaAprobadaParaProgramar(plantilla())).not.toThrow();
  });
});
