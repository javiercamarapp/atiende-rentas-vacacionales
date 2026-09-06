import { describe, expect, it } from "vitest";
import { migraciones } from "../../src/migrations/index.js";
import { validarNumeroPropuesto, verificarOrdenYColisiones } from "../../migrations-tooling/ordenColisiones.js";
import type { Migracion } from "../../src/runner/tipos.js";

describe("orden y colisiones de numeración entre lotes (H-088)", () => {
  it("el catálogo real no tiene números duplicados ni fuera de rango, y está en orden ascendente", () => {
    const reporte = verificarOrdenYColisiones(migraciones);
    expect(reporte.formatoInvalido).toEqual([]);
    expect(reporte.numerosDuplicados).toEqual([]);
    expect(reporte.fueraDeRango).toEqual([]);
    expect(reporte.ordenAscendente).toBe(true);
    expect(reporte.ok).toBe(true);
  });

  it("cada migración real cae en el rango del lote que la numeró (spot check)", () => {
    const reporte = verificarOrdenYColisiones(migraciones);
    const porId = new Map(reporte.analizadas.map((a) => [a.id, a]));
    expect(porId.get("0001_extensiones")?.loteAsignado).toBe("Lote 1 (núcleo)");
    expect(porId.get("0010_usuario_roles_credenciales")?.loteAsignado).toBe("Lote 3");
    expect(porId.get("0020_cuenta_canal")?.loteAsignado).toBe("Lote 2");
    expect(porId.get("0080_outbox_consumido_observabilidad")?.loteAsignado).toBe("Lote 10");
    expect(porId.get("0081_alerta")?.loteAsignado).toBe("Lote 10");
    expect(porId.get("0090_cuenta_canal_cifrado")?.loteAsignado).toBe("Extensiones cruzadas");
  });

  it("detecta dos migraciones con el mismo número (colisión real entre lotes)", () => {
    const catalogo: Migracion[] = [
      { id: "0020_cuenta_canal", descripcion: "d1", up: "SELECT 1;", down: "SELECT 1;" },
      { id: "0020_otra_cosa", descripcion: "d2", up: "SELECT 1;", down: "SELECT 1;" },
    ];
    const reporte = verificarOrdenYColisiones(catalogo);
    expect(reporte.numerosDuplicados).toEqual([20]);
    expect(reporte.ok).toBe(false);
  });

  it("detecta un id con formato inválido (sin prefijo NNNN_)", () => {
    const catalogo: Migracion[] = [{ id: "sin_numero", descripcion: "d", up: "SELECT 1;", down: "SELECT 1;" }];
    const reporte = verificarOrdenYColisiones(catalogo);
    expect(reporte.formatoInvalido).toEqual(["sin_numero"]);
    expect(reporte.ok).toBe(false);
  });

  it("detecta orden no ascendente (migración insertada fuera de secuencia en memoria)", () => {
    const catalogo: Migracion[] = [
      { id: "0002_b", descripcion: "d", up: "SELECT 1;", down: "SELECT 1;" },
      { id: "0001_a", descripcion: "d", up: "SELECT 1;", down: "SELECT 1;" },
    ];
    const reporte = verificarOrdenYColisiones(catalogo);
    expect(reporte.ordenAscendente).toBe(false);
    expect(reporte.ok).toBe(false);
  });

  it("validarNumeroPropuesto acepta un número dentro del rango de Lote 10 (0080-0089) libre", () => {
    const resultado = validarNumeroPropuesto(85, "Lote 10", migraciones);
    expect(resultado.ok).toBe(true);
  });

  it("validarNumeroPropuesto rechaza un número fuera del rango del lote pedido", () => {
    const resultado = validarNumeroPropuesto(25, "Lote 10", migraciones);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toMatch(/fuera del rango/);
  });

  it("validarNumeroPropuesto rechaza un número ya usado en el catálogo actual", () => {
    const resultado = validarNumeroPropuesto(20, "Lote 2", migraciones);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toMatch(/Ya existe/);
  });
});
