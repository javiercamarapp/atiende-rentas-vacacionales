import { describe, expect, it } from "vitest";
import { aplicarConsumo, stockBajo } from "../../src/limpieza/inventario.js";
import type { ItemInventarioUnidad } from "../../src/limpieza/tipos.js";

function item(overrides: Partial<ItemInventarioUnidad> = {}): ItemInventarioUnidad {
  return {
    id: "i1",
    unidadId: "u1",
    nombre: "Toallas",
    categoria: "ropa_blanca",
    cantidadActual: 10,
    umbralMinimo: 4,
    unidadMedida: "pza",
    ...overrides,
  };
}

describe("aplicarConsumo (H-052, REQ-115)", () => {
  it("descuenta exactamente la cantidad consumida", () => {
    const resultado = aplicarConsumo(item(), 3);
    expect(resultado.cantidadNueva).toBe(7);
  });

  it("nunca baja de 0", () => {
    const resultado = aplicarConsumo(item({ cantidadActual: 2 }), 5);
    expect(resultado.cantidadNueva).toBe(0);
  });

  it("detecta cuando el consumo cruza el umbral mínimo de stock bajo", () => {
    const resultado = aplicarConsumo(item({ cantidadActual: 5, umbralMinimo: 4 }), 3);
    expect(resultado.cantidadNueva).toBe(2);
    expect(resultado.cruzaUmbralMinimo).toBe(true);
  });

  it("no marca cruce de umbral si ya estaba por debajo antes del consumo", () => {
    const resultado = aplicarConsumo(item({ cantidadActual: 2, umbralMinimo: 4 }), 1);
    expect(resultado.cruzaUmbralMinimo).toBe(false);
  });

  it("rechaza un consumo negativo", () => {
    expect(() => aplicarConsumo(item(), -1)).toThrow();
  });
});

describe("stockBajo", () => {
  it("true cuando la cantidad actual está por debajo del umbral", () => {
    expect(stockBajo({ cantidadActual: 1, umbralMinimo: 4 })).toBe(true);
  });
  it("false cuando está en o por encima del umbral", () => {
    expect(stockBajo({ cantidadActual: 4, umbralMinimo: 4 })).toBe(false);
  });
});
