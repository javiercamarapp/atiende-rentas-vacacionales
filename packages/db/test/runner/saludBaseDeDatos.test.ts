import { describe, expect, it, vi } from "vitest";
import { verificarSaludBaseDeDatos } from "../../src/runner/saludBaseDeDatos.js";
import type { Migracion } from "../../src/runner/tipos.js";

const CATALOGO_PRUEBA: Migracion[] = [
  { id: "0001_a", descripcion: "a", up: "", down: "" },
  { id: "0002_b", descripcion: "b", up: "", down: "" },
];

describe("verificarSaludBaseDeDatos — sin URL", () => {
  it("reporta 'sin_configurar' sin intentar abrir ninguna conexión", async () => {
    const obtenerPool = vi.fn();
    const resultado = await verificarSaludBaseDeDatos("", { obtenerPool });
    expect(resultado).toEqual({ estado: "sin_configurar" });
    expect(obtenerPool).not.toHaveBeenCalled();
  });
});

describe("verificarSaludBaseDeDatos — pool inyectado (unitario, sin red real)", () => {
  it("reporta 'ok' y cuenta migraciones pendientes cuando el SELECT 1 y el conteo responden", async () => {
    const query = vi
      .fn()
      // SELECT 1
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      // SELECT id FROM schema_migrations
      .mockResolvedValueOnce({ rows: [{ id: "0001_a" }] });
    const resultado = await verificarSaludBaseDeDatos("postgres://u:p@host/db", {
      obtenerPool: () => ({ query }),
      catalogoMigraciones: CATALOGO_PRUEBA,
    });
    expect(resultado).toEqual({ estado: "ok", migracionesPendientes: 1 });
  });

  it("reporta 'ok' sin migracionesPendientes si esa consulta secundaria falla (tabla inexistente)", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockRejectedValueOnce(Object.assign(new Error('relation "schema_migrations" does not exist'), { code: "42P01" }));
    const resultado = await verificarSaludBaseDeDatos("postgres://u:p@host/db", {
      obtenerPool: () => ({ query }),
      catalogoMigraciones: CATALOGO_PRUEBA,
    });
    expect(resultado.estado).toBe("ok");
    expect(resultado.migracionesPendientes).toBeUndefined();
  });

  it("reporta 'error' con motivo corto clasificado por código, nunca el mensaje crudo", async () => {
    const errorConCredencial = Object.assign(
      new Error("password authentication failed for user \"postgres\" (host=db.secreto.example, password=hunter2)"),
      { code: "28P01" },
    );
    const query = vi.fn().mockRejectedValueOnce(errorConCredencial);
    const resultado = await verificarSaludBaseDeDatos("postgres://u:p@host/db", {
      obtenerPool: () => ({ query }),
    });
    expect(resultado.estado).toBe("error");
    expect(resultado.motivo).toBe("credenciales inválidas");
    expect(resultado.motivo).not.toMatch(/hunter2|password=|secreto/);
  });

  it.each([
    ["ENOTFOUND", "host no resuelve (DNS)"],
    ["ECONNREFUSED", "conexión rechazada"],
    ["ETIMEDOUT", "timeout de red"],
    ["3D000", "base de datos inexistente"],
    ["ALGO_DESCONOCIDO", "error de conexión (ALGO_DESCONOCIDO)"],
  ])("clasifica el código %s como '%s'", async (codigo, motivoEsperado) => {
    const query = vi.fn().mockRejectedValueOnce(Object.assign(new Error("x"), { code: codigo }));
    const resultado = await verificarSaludBaseDeDatos("postgres://u:p@host/db", { obtenerPool: () => ({ query }) });
    expect(resultado).toEqual({ estado: "error", motivo: motivoEsperado });
  });

  it("nunca tarda más que el timeoutMs configurado, aunque la query nunca resuelva", async () => {
    const query = vi.fn().mockReturnValue(new Promise(() => {})); // nunca resuelve
    const inicio = Date.now();
    const resultado = await verificarSaludBaseDeDatos("postgres://u:p@host/db", {
      obtenerPool: () => ({ query }),
      timeoutMs: 150,
    });
    const duracionMs = Date.now() - inicio;
    expect(resultado.estado).toBe("error");
    expect(resultado.motivo).toBe("timeout tras 150ms");
    expect(duracionMs).toBeLessThan(1000); // muy por debajo de cualquier timeout real de red
  });
});
