import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet, type KeyLike } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { validarIdToken } from "../../src/seguridad/oidc.js";

/**
 * Validación de id_token OIDC (Lote 3.2, H-096+) — casos adversariales
 * exigidos por RV19/21-3/OIDC Core §3.1.3.7: firma inválida, `aud`
 * incorrecto, `nonce` distinto, token expirado, `email_verified` falso.
 * Usa un JWKS de PRUEBA generado en memoria (RS256), nunca red real ni el
 * proveedor OIDC simulado — así estas pruebas son deterministas y
 * corren sin abrir ningún puerto.
 */

const ISSUER = "https://issuer.pruebas.test";
const AUDIENCE = "client-id-pruebas";
const NONCE = "nonce-fijo-de-prueba";

let privada: KeyLike;
let jwksBueno: JSONWebKeySet;
let jwksOtraClave: JSONWebKeySet; // JWKS válido pero con una clave DISTINTA a la que firmó — simula firma inválida.

async function firmarIdToken(overrides: Record<string, unknown> = {}, opciones: { exp?: string; kid?: string } = {}) {
  return new SignJWT({
    email: "persona@ejemplo.test",
    email_verified: true,
    nonce: NONCE,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: opciones.kid ?? "kid-bueno" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("sub-123")
    .setIssuedAt()
    .setExpirationTime(opciones.exp ?? "5m")
    .sign(privada);
}

beforeAll(async () => {
  const parBueno = await generateKeyPair("RS256", { extractable: true });
  const parOtro = await generateKeyPair("RS256", { extractable: true });
  privada = parBueno.privateKey;
  const jwkBueno = await exportJWK(parBueno.publicKey);
  const jwkOtro = await exportJWK(parOtro.publicKey);
  jwksBueno = { keys: [{ ...jwkBueno, kid: "kid-bueno", use: "sig", alg: "RS256" }] };
  jwksOtraClave = { keys: [{ ...jwkOtro, kid: "kid-bueno", use: "sig", alg: "RS256" }] };
});

describe("validarIdToken", () => {
  it("acepta un id_token válido firmado por el emisor esperado", async () => {
    const token = await firmarIdToken();
    const claims = await validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno });
    expect(claims.sub).toBe("sub-123");
    expect(claims.email).toBe("persona@ejemplo.test");
    expect(claims.emailVerificado).toBe(true);
  });

  it("rechaza una firma inválida (JWKS con una clave pública distinta a la que firmó)", async () => {
    const token = await firmarIdToken();
    await expect(
      validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksOtraClave }),
    ).rejects.toThrow();
  });

  it("rechaza un 'aud' incorrecto", async () => {
    const token = await firmarIdToken();
    await expect(
      validarIdToken(token, { issuer: ISSUER, audience: "otro-client-id", nonce: NONCE, jwks: jwksBueno }),
    ).rejects.toThrow();
  });

  it("rechaza un 'iss' incorrecto", async () => {
    const token = await firmarIdToken();
    await expect(
      validarIdToken(token, { issuer: "https://issuer-falso.test", audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno }),
    ).rejects.toThrow();
  });

  it("rechaza un 'nonce' distinto al esperado (posible replay)", async () => {
    const token = await firmarIdToken({ nonce: "nonce-distinto" });
    await expect(
      validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno }),
    ).rejects.toThrow(/nonce/);
  });

  it("rechaza un token expirado", async () => {
    const token = await firmarIdToken({}, { exp: "-1s" });
    await expect(
      validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno }),
    ).rejects.toThrow();
  });

  it("rechaza email_verified=false — nunca vincula/crea cuenta con un correo no verificado por el proveedor", async () => {
    const token = await firmarIdToken({ email_verified: false });
    await expect(
      validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno }),
    ).rejects.toThrow(/email_verified/);
  });

  it("rechaza un id_token sin claim 'email'", async () => {
    const token = await new SignJWT({ email_verified: true, nonce: NONCE })
      .setProtectedHeader({ alg: "RS256", kid: "kid-bueno" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("sub-sin-email")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privada);
    await expect(
      validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno }),
    ).rejects.toThrow(/email/);
  });

  it("propaga 'hd' cuando está presente (Google Workspace)", async () => {
    const token = await firmarIdToken({ hd: "empresa.example" });
    const claims = await validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno });
    expect(claims.hd).toBe("empresa.example");
  });

  it("hd es null cuando no está presente", async () => {
    const token = await firmarIdToken();
    const claims = await validarIdToken(token, { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE, jwks: jwksBueno });
    expect(claims.hd).toBeNull();
  });
});
