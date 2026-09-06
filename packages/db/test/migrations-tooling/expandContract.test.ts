import { describe, expect, it } from "vitest";
import { migraciones } from "../../src/migrations/index.js";
import {
  MARCADOR_PERMITE_DESTRUCTIVO,
  analizarMigracion,
  verificarCatalogoExpandContract,
} from "../../migrations-tooling/expandContract.js";
import type { Migracion } from "../../src/runner/tipos.js";

describe("expand/contract (H-088)", () => {
  it("el catálogo real (0001-0092) no contiene ningún DROP/ALTER destructivo sin autorizar", () => {
    const reporte = verificarCatalogoExpandContract(migraciones);
    expect(reporte.violaciones).toEqual([]);
    expect(reporte.ok).toBe(true);
  });

  it("detecta DROP TABLE sin el marcador como no autorizado", () => {
    const migracion: Migracion = {
      id: "9999_prueba_destructiva",
      descripcion: "elimina una tabla vieja",
      up: "DROP TABLE tabla_vieja;",
      down: "-- irreversible",
    };
    const analisis = analizarMigracion(migracion);
    expect(analisis.esDestructiva).toBe(true);
    expect(analisis.patronesEncontrados).toContain("DROP TABLE");
    expect(analisis.autorizada).toBe(false);
  });

  it("acepta DROP TABLE cuando la descripción trae el marcador explícito", () => {
    const migracion: Migracion = {
      id: "9999_prueba_destructiva_autorizada",
      descripcion: `elimina una tabla obsoleta ${MARCADOR_PERMITE_DESTRUCTIVO}`,
      up: "DROP TABLE tabla_vieja;",
      down: "-- irreversible",
    };
    const analisis = analizarMigracion(migracion);
    expect(analisis.esDestructiva).toBe(true);
    expect(analisis.autorizada).toBe(true);
  });

  it("una migración puramente expand (solo CREATE TABLE/ADD COLUMN) nunca se marca destructiva", () => {
    const migracion: Migracion = {
      id: "9999_prueba_expand",
      descripcion: "agrega columna nueva",
      up: "ALTER TABLE t ADD COLUMN nueva text; CREATE INDEX idx ON t(nueva);",
      down: "ALTER TABLE t DROP COLUMN nueva;",
    };
    const analisis = analizarMigracion(migracion);
    expect(analisis.esDestructiva).toBe(false);
    expect(analisis.autorizada).toBe(true);
  });

  it("DROP en el down nunca cuenta como destructivo (revertir una tabla creada por la propia migración es esperado)", () => {
    const migracion: Migracion = {
      id: "9999_prueba_down_drop",
      descripcion: "crea tabla nueva",
      up: "CREATE TABLE nueva (id uuid PRIMARY KEY);",
      down: "DROP TABLE IF EXISTS nueva;",
    };
    const analisis = analizarMigracion(migracion);
    expect(analisis.esDestructiva).toBe(false);
  });

  it("verificarCatalogoExpandContract reporta violaciones múltiples si hay varias migraciones sin autorizar", () => {
    const catalogo: Migracion[] = [
      { id: "0001_ok", descripcion: "crea tabla", up: "CREATE TABLE a (id int);", down: "DROP TABLE a;" },
      { id: "0002_mala", descripcion: "borra columna", up: "ALTER TABLE a DROP COLUMN x;", down: "-- n/a" },
      { id: "0003_truncate", descripcion: "vacía tabla", up: "TRUNCATE a;", down: "-- n/a" },
    ];
    const reporte = verificarCatalogoExpandContract(catalogo);
    expect(reporte.ok).toBe(false);
    expect(reporte.violaciones.map((v) => v.id)).toEqual(["0002_mala", "0003_truncate"]);
  });
});
