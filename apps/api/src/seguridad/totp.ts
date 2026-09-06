import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238, sobre HOTP de RFC 4226) implementado sin dependencias
 * externas — Node solo trae los primitivos (`createHmac`), no un cliente
 * TOTP. Parámetros estándar compatibles con cualquier app autenticadora
 * (Google Authenticator, Authy, 1Password, etc.): SHA-1, 6 dígitos, paso de
 * 30 segundos — SHA-1 aquí NO es una debilidad criptográfica (RFC 6238 lo
 * sigue recomendando para TOTP porque el secreto compartido de 160 bits ya
 * excede el espacio de búsqueda relevante; el HMAC en sí no depende de
 * resistencia a colisiones).
 */

const DIGITOS = 6;
const PASO_SEGUNDOS = 30;
const VENTANA_PASOS = 1; // tolera 1 paso de 30s antes/después (deriva de reloj)

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generarSecretoTotp(): string {
  // 20 bytes (160 bits) — el tamaño recomendado por RFC 4226 §4 para HMAC-SHA1.
  return base32Encode(randomBytes(20));
}

export function otpauthUrl(opciones: { secretBase32: string; cuenta: string; emisor: string }): string {
  const { secretBase32, cuenta, emisor } = opciones;
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: emisor,
    algorithm: "SHA1",
    digits: String(DIGITOS),
    period: String(PASO_SEGUNDOS),
  });
  return `otpauth://totp/${etiqueta}?${params.toString()}`;
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  }
  return salida;
}

function base32Decode(cadena: string): Buffer {
  const limpio = cadena.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const char of limpio) {
    const indice = ALFABETO_BASE32.indexOf(char);
    if (indice === -1) continue;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secretoBase32: string, contador: bigint): string {
  const clave = base32Decode(secretoBase32);
  const bufferContador = Buffer.alloc(8);
  bufferContador.writeBigUInt64BE(contador);
  const hmac = createHmac("sha1", clave).update(bufferContador).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binario =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const codigo = binario % 10 ** DIGITOS;
  return codigo.toString().padStart(DIGITOS, "0");
}

function pasoActual(fechaMs: number): bigint {
  return BigInt(Math.floor(fechaMs / 1000 / PASO_SEGUNDOS));
}

/** Compara `codigo` contra el TOTP calculado en el paso actual y en
 * `VENTANA_PASOS` pasos adyacentes (tolerancia de reloj), en tiempo
 * constante por cada comparación individual. */
export function verificarTotp(secretoBase32: string, codigo: string, ahoraMs: number = Date.now()): boolean {
  const codigoNormalizado = codigo.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(codigoNormalizado)) return false;
  const pasoBase = pasoActual(ahoraMs);
  for (let delta = -VENTANA_PASOS; delta <= VENTANA_PASOS; delta++) {
    const esperado = hotp(secretoBase32, pasoBase + BigInt(delta));
    if (compararConstante(esperado, codigoNormalizado)) return true;
  }
  return false;
}

function compararConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --- Códigos de recuperación ---
//
// 10 códigos de un solo uso, alta entropía (no elegidos por el usuario),
// formato legible "XXXX-XXXX" en base32 sin caracteres ambiguos. Solo se
// persiste el HASH sha256 de cada uno (mismo criterio que refresh_token/
// invitacion_usuario) — el valor en claro se muestra UNA sola vez al
// habilitar MFA y nunca se puede recuperar después.
const CANTIDAD_CODIGOS_RECUPERACION = 10;

export function generarCodigosRecuperacion(cantidad: number = CANTIDAD_CODIGOS_RECUPERACION): string[] {
  const codigos: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const bloque1 = codigoBase32Aleatorio(4);
    const bloque2 = codigoBase32Aleatorio(4);
    codigos.push(`${bloque1}-${bloque2}`);
  }
  return codigos;
}

function codigoBase32Aleatorio(longitud: number): string {
  let salida = "";
  for (let i = 0; i < longitud; i++) {
    salida += ALFABETO_BASE32[randomInt(ALFABETO_BASE32.length)];
  }
  return salida;
}

/** Normaliza (mayúsculas, sin espacios) y hashea un código de recuperación
 * para comparar/almacenar — nunca se guarda el código en claro. */
export function hashearCodigoRecuperacion(codigo: string): string {
  const normalizado = codigo.trim().toUpperCase().replace(/\s+/g, "");
  return createHash("sha256").update(normalizado).digest("hex");
}

export interface CodigoRecuperacionAlmacenado {
  hash: string;
  usadoEn: string | null;
}

/** Busca `codigo` entre `almacenados` (no usados) y, si coincide, devuelve
 * la lista actualizada con ese código marcado como usado — o `null` si
 * ninguno coincide. Comparación en tiempo constante por candidato. */
export function consumirCodigoRecuperacion(
  almacenados: CodigoRecuperacionAlmacenado[],
  codigo: string,
): CodigoRecuperacionAlmacenado[] | null {
  const hashIntento = hashearCodigoRecuperacion(codigo);
  const bufIntento = Buffer.from(hashIntento, "hex");
  let indiceCoincidencia = -1;
  for (let i = 0; i < almacenados.length; i++) {
    const candidato = almacenados[i]!;
    if (candidato.usadoEn !== null) continue;
    const bufCandidato = Buffer.from(candidato.hash, "hex");
    if (bufCandidato.length === bufIntento.length && timingSafeEqual(bufCandidato, bufIntento)) {
      indiceCoincidencia = i;
    }
  }
  if (indiceCoincidencia === -1) return null;
  return almacenados.map((c, i) => (i === indiceCoincidencia ? { ...c, usadoEn: new Date().toISOString() } : c));
}
