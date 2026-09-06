import { describe, expect, it } from "vitest";
import { cifrarSecretoWebhook, descifrarSecretoWebhook } from "../../src/workers/notificaciones/cifradoSecreto.js";

describe("cifrarSecretoWebhook / descifrarSecretoWebhook — H-054 (AES-256-GCM)", () => {
  it("round-trip: cifrar y luego descifrar devuelve exactamente el secreto original", () => {
    const secreto = "un-secreto-hmac-realmente-largo-y-aleatorio-1234567890abcdef";
    const cifrado = cifrarSecretoWebhook(secreto);
    expect(descifrarSecretoWebhook(cifrado)).toBe(secreto);
  });

  it("el mismo secreto cifrado dos veces produce IVs distintos (nunca reutiliza el nonce)", () => {
    const secreto = "mismo-secreto";
    const c1 = cifrarSecretoWebhook(secreto);
    const c2 = cifrarSecretoWebhook(secreto);
    expect(c1.secretoIv.equals(c2.secretoIv)).toBe(false);
    expect(c1.secretoCifrado.equals(c2.secretoCifrado)).toBe(false);
  });

  it("descifrar con el tag de autenticación alterado falla (integridad GCM)", () => {
    const cifrado = cifrarSecretoWebhook("secreto");
    const tagAlterado = Buffer.from(cifrado.secretoTag);
    tagAlterado[0] = tagAlterado[0]! ^ 0xff;
    expect(() => descifrarSecretoWebhook({ ...cifrado, secretoTag: tagAlterado })).toThrow();
  });

  it("descifrar con el texto cifrado alterado falla (integridad GCM)", () => {
    const cifrado = cifrarSecretoWebhook("secreto");
    const cifradoAlterado = Buffer.from(cifrado.secretoCifrado);
    cifradoAlterado[0] = cifradoAlterado[0]! ^ 0xff;
    expect(() => descifrarSecretoWebhook({ ...cifrado, secretoCifrado: cifradoAlterado })).toThrow();
  });

  it("respeta NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE cuando está definida (32 bytes en base64)", () => {
    const claveOriginal = process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE;
    try {
      process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE = Buffer.alloc(32, 7).toString("base64");
      const cifrado = cifrarSecretoWebhook("secreto-con-clave-fija");
      expect(descifrarSecretoWebhook(cifrado)).toBe("secreto-con-clave-fija");
    } finally {
      if (claveOriginal === undefined) delete process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE;
      else process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE = claveOriginal;
    }
  });

  it("rechaza una clave de longitud incorrecta en vez de truncarla/rellenarla en silencio", () => {
    const claveOriginal = process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE;
    try {
      process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE = Buffer.alloc(16).toString("base64"); // 16, no 32.
      expect(() => cifrarSecretoWebhook("x")).toThrow(/32 bytes/);
    } finally {
      if (claveOriginal === undefined) delete process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE;
      else process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE = claveOriginal;
    }
  });
});
