import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

/**
 * Hashing de contraseñas con `scrypt` nativo de Node (H-040): se eligió
 * sobre `argon2` porque `argon2` requiere un binding nativo compilado
 * (node-gyp) que no siempre está disponible en el entorno de build/CI de
 * este monorepo, mientras que `node:crypto.scrypt` es parte del runtime
 * (sin dependencia externa, sin binario que pueda faltar en un entorno
 * distinto). Parámetros: N=16384 (2^14), r=8, p=1 — el mínimo recomendado
 * por RFC 7914 para hashing interactivo de contraseñas en 2024+, con sal
 * aleatoria de 16 bytes por contraseña (nunca reutilizada) y comparación
 * en tiempo constante contra timing attacks.
 */

function scrypt(contrasena: string, sal: Buffer, longitudClave: number, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(contrasena, sal, longitudClave, opciones, (error, derivada) => {
      if (error) reject(error);
      else resolve(derivada);
    });
  });
}

const LONGITUD_SAL = 16;
const LONGITUD_CLAVE = 64;
const PARAMETROS_SCRYPT = { N: 16384, r: 8, p: 1 } as const;

export async function hashContrasena(contrasenaEnClaro: string): Promise<string> {
  const sal = randomBytes(LONGITUD_SAL);
  const derivada = (await scrypt(contrasenaEnClaro, sal, LONGITUD_CLAVE, PARAMETROS_SCRYPT)) as Buffer;
  return `scrypt$${PARAMETROS_SCRYPT.N}$${PARAMETROS_SCRYPT.r}$${PARAMETROS_SCRYPT.p}$${sal.toString("base64")}$${derivada.toString("base64")}`;
}

export async function verificarContrasena(contrasenaEnClaro: string, hashAlmacenado: string): Promise<boolean> {
  const partes = hashAlmacenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, salB64, derivadaB64] = partes as [string, string, string, string, string, string];
  const N = Number.parseInt(nStr, 10);
  const r = Number.parseInt(rStr, 10);
  const p = Number.parseInt(pStr, 10);
  const sal = Buffer.from(salB64, "base64");
  const derivadaAlmacenada = Buffer.from(derivadaB64, "base64");

  const derivadaIntento = (await scrypt(contrasenaEnClaro, sal, derivadaAlmacenada.length, { N, r, p })) as Buffer;
  if (derivadaIntento.length !== derivadaAlmacenada.length) return false;
  return timingSafeEqual(derivadaIntento, derivadaAlmacenada);
}
