import { describe, expect, it } from "vitest";
import { generarClaveCifradoBase64, KeyringCifradoCanal } from "../../src/seguridad/cifrado.js";

describe("KeyringCifradoCanal (AES-256-GCM, H-046)", () => {
  const keyring = new KeyringCifradoCanal(`v1:${generarClaveCifradoBase64()}`);

  it("cifra y descifra el mismo texto plano", () => {
    const original = "token-secreto-de-canal-xyz";
    const cifrado = keyring.cifrar(original);
    expect(keyring.descifrar(cifrado)).toBe(original);
  });

  it("el ciphertext nunca contiene el texto plano ni es igual a él", () => {
    const original = "otra-credencial-super-secreta";
    const cifrado = keyring.cifrar(original);
    expect(cifrado.cifrado.toString("latin1")).not.toContain(original);
    expect(cifrado.cifrado.toString("base64")).not.toBe(Buffer.from(original).toString("base64"));
  });

  it("dos cifrados del mismo texto usan IV distinto (nunca reutilizado)", () => {
    const a = keyring.cifrar("mismo-texto");
    const b = keyring.cifrar("mismo-texto");
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.cifrado.equals(b.cifrado)).toBe(false);
  });

  it("descifrar con una clave de versión desconocida falla explícitamente", () => {
    const cifrado = keyring.cifrar("texto");
    expect(() => keyring.descifrar({ ...cifrado, claveVersion: "v999-inexistente" })).toThrow();
  });

  it("rotación: un keyring con dos versiones descifra datos cifrados con la versión anterior", () => {
    const claveV1 = generarClaveCifradoBase64();
    const keyringV1 = new KeyringCifradoCanal(`v1:${claveV1}`);
    const cifradoConV1 = keyringV1.cifrar("dato-viejo");

    const claveV2 = generarClaveCifradoBase64();
    const keyringRotado = new KeyringCifradoCanal(`v1:${claveV1},v2:${claveV2}`);
    expect(keyringRotado.descifrar(cifradoConV1)).toBe("dato-viejo");

    // Lo nuevo se cifra siempre con la clave más reciente (v2).
    const cifradoNuevo = keyringRotado.cifrar("dato-nuevo");
    expect(cifradoNuevo.claveVersion).toBe("v2");
  });

  it("rechaza una clave con longitud distinta a 32 bytes", () => {
    expect(() => new KeyringCifradoCanal("v1:Y29ydGE=")).toThrow();
  });
});
