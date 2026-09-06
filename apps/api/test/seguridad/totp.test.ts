import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  consumirCodigoRecuperacion,
  generarCodigosRecuperacion,
  generarSecretoTotp,
  hashearCodigoRecuperacion,
  otpauthUrl,
  verificarTotp,
} from "../../src/seguridad/totp.js";

// RFC 6238 Apéndice B usa SHA1/SHA256/SHA512 de 20/32/64 bytes; esta
// implementación es SHA1 de 20 bytes (el modo más compatible con apps
// autenticadoras reales) — el secreto ASCII "12345678901234567890"
// (20 bytes) codificado en base32 es el vector de prueba estándar citado
// por la RFC para el caso SHA1. En el paso T = 1 (time = 59s / 30s = 1),
// la RFC documenta el código HOTP-SHA1 esperado como "94287082".
describe("TOTP (RFC 6238)", () => {
  const SECRETO_RFC_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32("12345678901234567890")

  it("produce el código documentado por RFC 6238 en T=59s (paso 1)", () => {
    // El código de la RFC tiene 8 dígitos; esta implementación usa 6
    // (estándar de facto de las apps autenticadoras) — se valida contra
    // los últimos 6 dígitos del vector de la RFC, que es exactamente lo
    // que produce el mismo cálculo HOTP truncado a 6 dígitos.
    expect(verificarTotp(SECRETO_RFC_BASE32, "287082", 59_000)).toBe(true);
  });

  it("un código válido en T=59s no es válido 10 pasos después (300s)", () => {
    expect(verificarTotp(SECRETO_RFC_BASE32, "287082", 59_000 + 300_000)).toBe(false);
  });

  it("tolera ±1 paso de deriva de reloj (30s) pero no ±2", () => {
    const secreto = generarSecretoTotp();
    const ahora = Date.UTC(2026, 0, 1, 12, 0, 0);
    // Genera el código válido para "ahora" verificando con el mismo reloj.
    expect(verificarTotp(secreto, codigoEn(secreto, ahora), ahora)).toBe(true);
    expect(verificarTotp(secreto, codigoEn(secreto, ahora), ahora + 30_000)).toBe(true);
    expect(verificarTotp(secreto, codigoEn(secreto, ahora), ahora - 30_000)).toBe(true);
    expect(verificarTotp(secreto, codigoEn(secreto, ahora), ahora + 90_000)).toBe(false);
  });

  it("rechaza un código con formato inválido sin lanzar", () => {
    const secreto = generarSecretoTotp();
    expect(verificarTotp(secreto, "abcdef")).toBe(false);
    expect(verificarTotp(secreto, "12345")).toBe(false);
    expect(verificarTotp(secreto, "")).toBe(false);
  });

  it("genera un otpauth:// URL bien formado", () => {
    const secreto = generarSecretoTotp();
    const url = otpauthUrl({ secretBase32: secreto, cuenta: "persona@ejemplo.test", emisor: "Atiende" });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain(`secret=${secreto}`);
    expect(url).toContain("issuer=Atiende");
  });

  function codigoEn(secreto: string, ahoraMs: number): string {
    // Fuerza la búsqueda de un código correcto probando verificarTotp con
    // fuerza bruta sería redundante; en su lugar, replica el cálculo
    // usando el propio verificarTotp con una ventana amplia no es
    // necesario porque generamos el código con la misma función pública
    // indirectamente: usamos un secreto conocido y probamos los 10 dígitos
    // más comunes sería frágil. En cambio, exportamos el cálculo a través
    // de una segunda llamada: como no exponemos `hotp` directamente,
    // generamos el código esperado reimplementando el mismo algoritmo
    // mínimo aquí solo para esta prueba de tolerancia de reloj.
    return calcularHotpParaPrueba(secreto, Math.floor(ahoraMs / 1000 / 30));
  }
});

// Reimplementación mínima e independiente (mismo algoritmo RFC 4226) solo
// para esta prueba de tolerancia de reloj — deliberadamente NO importa
// nada del módulo bajo prueba, para no volver la prueba una tautología.
function calcularHotpParaPrueba(secretoBase32: string, contador: number): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const limpio = secretoBase32.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const char of limpio) {
    const indice = alfabeto.indexOf(char);
    if (indice === -1) continue;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const clave = Buffer.from(bytes);
  const bufferContador = Buffer.alloc(8);
  bufferContador.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac("sha1", clave).update(bufferContador).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binario =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binario % 1_000_000).toString().padStart(6, "0");
}

describe("Códigos de recuperación MFA", () => {
  it("genera 10 códigos únicos con formato XXXX-XXXX", () => {
    const codigos = generarCodigosRecuperacion();
    expect(codigos).toHaveLength(10);
    expect(new Set(codigos).size).toBe(10);
    for (const c of codigos) expect(c).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  });

  it("hashea de forma determinista e insensible a mayúsculas/espacios", () => {
    const codigos = generarCodigosRecuperacion(1);
    const codigo = codigos[0]!;
    expect(hashearCodigoRecuperacion(codigo)).toBe(hashearCodigoRecuperacion(codigo.toLowerCase()));
    expect(hashearCodigoRecuperacion(codigo)).toBe(hashearCodigoRecuperacion(` ${codigo} `));
  });

  it("consumirCodigoRecuperacion marca el código correcto como usado y rechaza reutilizarlo", () => {
    const codigos = generarCodigosRecuperacion(3);
    const almacenados = codigos.map((c) => ({ hash: hashearCodigoRecuperacion(c), usadoEn: null as string | null }));

    const actualizado = consumirCodigoRecuperacion(almacenados, codigos[1]!);
    expect(actualizado).not.toBeNull();
    expect(actualizado!.filter((c) => c.usadoEn !== null)).toHaveLength(1);

    // Reutilizar el mismo código ya marcado como usado debe fallar.
    const segundoIntento = consumirCodigoRecuperacion(actualizado!, codigos[1]!);
    expect(segundoIntento).toBeNull();
  });

  it("rechaza un código que no está en la lista", () => {
    const codigos = generarCodigosRecuperacion(2);
    const almacenados = codigos.map((c) => ({ hash: hashearCodigoRecuperacion(c), usadoEn: null as string | null }));
    expect(consumirCodigoRecuperacion(almacenados, "ZZZZ-ZZZZ")).toBeNull();
  });
});
