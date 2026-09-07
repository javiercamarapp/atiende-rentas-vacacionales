import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hostRequiereSslPorDefecto,
  resolverSslPg,
  construirOpcionesPoolServerless,
  obtenerPoolServerlessCompartido,
  _reiniciarCachePoolsServerless,
} from "../../src/runner/conexionServerless.js";

describe("hostRequiereSslPorDefecto", () => {
  it("reconoce el host directo de Supabase", () => {
    expect(hostRequiereSslPorDefecto("postgres://u:p@db.abcxyz.supabase.co:5432/postgres")).toBe(true);
  });

  it("reconoce el session pooler y el transaction pooler de Supabase (mismo sufijo de host)", () => {
    expect(
      hostRequiereSslPorDefecto("postgres://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres"),
    ).toBe(true);
    expect(
      hostRequiereSslPorDefecto("postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres"),
    ).toBe(true);
  });

  it("no reconoce localhost ni un host arbitrario", () => {
    expect(hostRequiereSslPorDefecto("postgres://u:p@localhost:5432/db")).toBe(false);
    expect(hostRequiereSslPorDefecto("postgres://u:p@mi-postgres-propio.example.com:5432/db")).toBe(false);
  });

  it("una URL inválida no lanza — simplemente no se reconoce como Supabase", () => {
    expect(hostRequiereSslPorDefecto("no-es-una-url")).toBe(false);
    expect(hostRequiereSslPorDefecto("")).toBe(false);
  });
});

describe("resolverSslPg", () => {
  it("sin variables de entorno y host no-Supabase: undefined (pg decide, sin TLS)", () => {
    expect(resolverSslPg("postgres://u:p@localhost:5432/db", {})).toBeUndefined();
  });

  it("host de Supabase: TLS con verificación de certificado activada por defecto", () => {
    expect(resolverSslPg("postgres://u:p@db.abcxyz.supabase.co:5432/postgres", {})).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("DATABASE_SSL=require fuerza TLS incluso en un host que no es Supabase", () => {
    expect(resolverSslPg("postgres://u:p@localhost:5432/db", { DATABASE_SSL: "require" })).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("DATABASE_SSL_NO_VERIFY=true desactiva rejectUnauthorized SOLO si TLS ya está activo", () => {
    expect(
      resolverSslPg("postgres://u:p@db.abcxyz.supabase.co:5432/postgres", {
        DATABASE_SSL_NO_VERIFY: "true",
      }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("DATABASE_SSL_NO_VERIFY=true sin TLS activo no tiene efecto (sigue undefined)", () => {
    expect(
      resolverSslPg("postgres://u:p@localhost:5432/db", { DATABASE_SSL_NO_VERIFY: "true" }),
    ).toBeUndefined();
  });

  it("cualquier valor de DATABASE_SSL distinto de 'require' no fuerza TLS por sí solo", () => {
    expect(resolverSslPg("postgres://u:p@localhost:5432/db", { DATABASE_SSL: "true" })).toBeUndefined();
  });
});

describe("construirOpcionesPoolServerless", () => {
  it("valores por defecto: pool pequeño e idle/connection timeout bajos", () => {
    const opciones = construirOpcionesPoolServerless("postgres://u:p@localhost:5432/db", {});
    expect(opciones.max).toBe(3);
    expect(opciones.idleTimeoutMillis).toBe(5_000);
    expect(opciones.connectionTimeoutMillis).toBe(5_000);
    expect(opciones.ssl).toBeUndefined();
    expect(opciones.connectionString).toBe("postgres://u:p@localhost:5432/db");
  });

  it("respeta overrides por variable de entorno", () => {
    const opciones = construirOpcionesPoolServerless("postgres://u:p@localhost:5432/db", {
      DATABASE_POOL_MAX: "5",
      DATABASE_POOL_IDLE_TIMEOUT_MS: "1000",
      DATABASE_POOL_CONNECTION_TIMEOUT_MS: "2000",
    });
    expect(opciones.max).toBe(5);
    expect(opciones.idleTimeoutMillis).toBe(1000);
    expect(opciones.connectionTimeoutMillis).toBe(2000);
  });

  it("un valor de entorno inválido (no numérico, negativo) cae al valor por defecto", () => {
    const opciones = construirOpcionesPoolServerless("postgres://u:p@localhost:5432/db", {
      DATABASE_POOL_MAX: "no-es-un-numero",
    });
    expect(opciones.max).toBe(3);

    const opcionesNegativo = construirOpcionesPoolServerless("postgres://u:p@localhost:5432/db", {
      DATABASE_POOL_MAX: "-1",
    });
    expect(opcionesNegativo.max).toBe(3);
  });

  it("incluye SSL cuando el host es de Supabase", () => {
    const opciones = construirOpcionesPoolServerless("postgres://u:p@db.abcxyz.supabase.co:5432/postgres", {});
    expect(opciones.ssl).toEqual({ rejectUnauthorized: true });
  });
});

describe("obtenerPoolServerlessCompartido", () => {
  afterEach(async () => {
    await _reiniciarCachePoolsServerless();
  });

  it("reutiliza el MISMO pool entre llamadas sucesivas con la misma URL (variable de módulo)", () => {
    const url = "postgres://u:p@localhost:5432/db";
    const pool1 = obtenerPoolServerlessCompartido(url, {});
    const pool2 = obtenerPoolServerlessCompartido(url, {});
    expect(pool1).toBe(pool2);
  });

  it("crea un pool DISTINTO para una URL distinta", () => {
    const poolA = obtenerPoolServerlessCompartido("postgres://u:p@localhost:5432/a", {});
    const poolB = obtenerPoolServerlessCompartido("postgres://u:p@localhost:5432/b", {});
    expect(poolA).not.toBe(poolB);
  });

  it("_reiniciarCachePoolsServerless limpia el caché — la siguiente llamada crea un pool nuevo", async () => {
    const url = "postgres://u:p@localhost:5432/db";
    const pool1 = obtenerPoolServerlessCompartido(url, {});
    await _reiniciarCachePoolsServerless();
    const pool2 = obtenerPoolServerlessCompartido(url, {});
    expect(pool1).not.toBe(pool2);
  });

  it("nunca lanza una excepción no capturada ante un evento 'error' de una conexión ociosa", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pool = obtenerPoolServerlessCompartido("postgres://u:p@localhost:5432/db", {});
    expect(() => pool.emit("error", new Error("conexión reciclada por el servidor"))).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
