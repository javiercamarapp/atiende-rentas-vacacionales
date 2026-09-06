import { describe, expect, it } from "vitest";
import { migraciones } from "../../src/migrations/index.js";
import { ejecutarDryRun } from "../../migrations-tooling/dryRun.js";
import type { Migracion } from "../../src/runner/tipos.js";

describe("dry-run de migraciones contra PGlite efímero (H-088)", () => {
  it("aplica y revierte el catálogo real completo sin dejar rastro", async () => {
    const reporte = await ejecutarDryRun(migraciones);
    expect(reporte.ok).toBe(true);
    expect(reporte.aplicadas.length).toBe(migraciones.length);
    expect(reporte.revertidas.length).toBe(migraciones.length);
  }, 60_000);

  it("reporta ok=false y el mensaje de error si una migración del catálogo falla al aplicarse", async () => {
    const catalogoRoto: Migracion[] = [
      { id: "0001_ok", descripcion: "crea tabla", up: "CREATE TABLE a (id int);", down: "DROP TABLE a;" },
      { id: "0002_rota", descripcion: "sql inválido", up: "ESTO NO ES SQL VALIDO;", down: "SELECT 1;" },
    ];
    const reporte = await ejecutarDryRun(catalogoRoto);
    expect(reporte.ok).toBe(false);
    expect(reporte.error).toBeTruthy();
  });
});
