import { describe, expect, it } from "vitest";
import { validarPoliticaContrasena } from "../../src/seguridad/passwordPolicy.js";

describe("validarPoliticaContrasena", () => {
  it("acepta una contraseña razonable que no está en la denylist", async () => {
    const r = await validarPoliticaContrasena("un-secreto-poco-comun-42");
    expect(r.valida).toBe(true);
  });

  it("rechaza contraseñas triviales conocidas (insensible a mayúsculas)", async () => {
    expect((await validarPoliticaContrasena("password123")).valida).toBe(false);
    expect((await validarPoliticaContrasena("PASSWORD123")).valida).toBe(false);
    expect((await validarPoliticaContrasena("1234567890")).valida).toBe(false);
  });

  it("con HIBP habilitado, consulta k-anonymity (prefijo de 5, nunca la contraseña completa)", async () => {
    let prefijoRecibido = "";
    const fetchFn = (async (url: string | URL) => {
      const u = String(url);
      prefijoRecibido = u.split("/range/")[1] ?? "";
      // Respuesta HIBP: sufijos de hash con conteos, formato "SUFIJO:conteo".
      return new Response("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5\n", { status: 200 });
    }) as typeof fetch;

    const resultado = await validarPoliticaContrasena("otra-contrasena-distinta-99", {
      hibpHabilitado: true,
      fetchFn,
    });
    expect(prefijoRecibido).toHaveLength(5);
    expect(resultado.valida).toBe(true); // el sufijo de prueba no coincide con el hash real de la contraseña.
  });

  it("con HIBP habilitado y un fallo de red, falla abierto (nunca bloquea por un problema de red)", async () => {
    const fetchFn = (async () => {
      throw new Error("red caída");
    }) as typeof fetch;
    const resultado = await validarPoliticaContrasena("cualquier-contrasena-99", {
      hibpHabilitado: true,
      fetchFn,
    });
    expect(resultado.valida).toBe(true);
  });
});
