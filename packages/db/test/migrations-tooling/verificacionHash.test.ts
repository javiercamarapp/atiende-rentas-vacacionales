import { describe, expect, it } from "vitest";
import {
  calcularHashMigracion,
  verificarHashesMigraciones,
  type FilaMigracionAplicada,
} from "../../migrations-tooling/verificacionHash.js";
import type { Migracion } from "../../src/runner/tipos.js";

/**
 * D-DSD-14 (regresión permanente): el runner original rastreaba
 * aplicación SOLO por `id` en `schema_migrations`, sin hash de contenido
 * — un `id` ya aplicado reescrito con un `up` distinto (rebase/merge
 * descuidado) se saltaba en silencio, dejando el esquema real divergido
 * del código fuente sin ninguna señal. Estas pruebas cubren la lógica
 * pura de detección (sin BD); la integración real contra
 * `aplicarMigraciones` (que debe fallar fuerte) vive en
 * `packages/db/test/migraciones.test.ts`.
 */
describe("calcularHashMigracion", () => {
  it("es determinista para el mismo contenido de `up`", () => {
    const migracion: Migracion = { id: "0001_x", descripcion: "d", up: "CREATE TABLE t (id int);", down: "" };
    expect(calcularHashMigracion(migracion)).toBe(calcularHashMigracion(migracion));
  });

  it("cambia si el `up` cambia, aunque el id sea el mismo", () => {
    const v1: Migracion = { id: "0001_x", descripcion: "d", up: "CREATE TABLE t (id int);", down: "" };
    const v2: Migracion = { id: "0001_x", descripcion: "d", up: "CREATE TABLE t (id int, campo text);", down: "" };
    expect(calcularHashMigracion(v1)).not.toBe(calcularHashMigracion(v2));
  });
});

describe("verificarHashesMigraciones", () => {
  it("ok=true cuando todos los hashes almacenados coinciden con el catálogo", () => {
    const catalogo: Migracion[] = [
      { id: "0001_a", descripcion: "d", up: "SELECT 1;", down: "" },
      { id: "0002_b", descripcion: "d", up: "SELECT 2;", down: "" },
    ];
    const aplicadas: FilaMigracionAplicada[] = catalogo.map((m) => ({ id: m.id, hash: calcularHashMigracion(m) }));

    const reporte = verificarHashesMigraciones(catalogo, aplicadas);
    expect(reporte.ok).toBe(true);
    expect(reporte.drift).toEqual([]);
  });

  it("detecta drift: un id aplicado con hash almacenado distinto del `up` actual del catálogo", () => {
    const catalogoOriginal: Migracion = { id: "9500_x", descripcion: "d", up: "CREATE TABLE demo_v1 (id int);", down: "" };
    const hashOriginal = calcularHashMigracion(catalogoOriginal);

    // El catálogo en memoria ahora tiene un `up` DISTINTO para el mismo id
    // (el archivo se reescribió tras un rebase).
    const catalogoReescrito: Migracion[] = [
      { id: "9500_x", descripcion: "d reescrita", up: "CREATE TABLE demo_v2 (id int, extra text);", down: "" },
    ];

    const reporte = verificarHashesMigraciones(catalogoReescrito, [{ id: "9500_x", hash: hashOriginal }]);
    expect(reporte.ok).toBe(false);
    expect(reporte.drift).toHaveLength(1);
    expect(reporte.drift[0]!.id).toBe("9500_x");
    expect(reporte.drift[0]!.hashAlmacenado).toBe(hashOriginal);
    expect(reporte.drift[0]!.hashEsperado).toBe(calcularHashMigracion(catalogoReescrito[0]!));
  });

  it("un id aplicado SIN hash persistido (adopción retroactiva) no cuenta como drift", () => {
    const catalogo: Migracion[] = [{ id: "0001_a", descripcion: "d", up: "SELECT 1;", down: "" }];
    const reporte = verificarHashesMigraciones(catalogo, [{ id: "0001_a", hash: null }]);
    expect(reporte.ok).toBe(true);
    expect(reporte.drift).toEqual([]);
    expect(reporte.sinHashRegistrado).toEqual(["0001_a"]);
  });

  it("reporta ids aplicados que ya no existen en el catálogo en memoria, sin tratarlos como drift", () => {
    const catalogo: Migracion[] = [{ id: "0001_a", descripcion: "d", up: "SELECT 1;", down: "" }];
    const reporte = verificarHashesMigraciones(catalogo, [
      { id: "0001_a", hash: calcularHashMigracion(catalogo[0]!) },
      { id: "0002_eliminada_del_catalogo", hash: "cualquier-hash" },
    ]);
    expect(reporte.ok).toBe(true);
    expect(reporte.drift).toEqual([]);
    expect(reporte.aplicadasFueraDeCatalogo).toEqual(["0002_eliminada_del_catalogo"]);
  });

  it("el catálogo real de producción no tiene drift contra sí mismo (sanity check)", async () => {
    const { migraciones } = await import("../../src/migrations/index.js");
    const aplicadas: FilaMigracionAplicada[] = migraciones.map((m) => ({ id: m.id, hash: calcularHashMigracion(m) }));
    const reporte = verificarHashesMigraciones(migraciones, aplicadas);
    expect(reporte.ok).toBe(true);
  });
});
