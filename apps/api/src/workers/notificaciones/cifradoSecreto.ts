import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * H-054: cifrado AES-256-GCM del secreto HMAC de `webhook_tenant` —
 * implementación PROPIA e independiente de `apps/api/src/seguridad/
 * cifrado.ts` (`KeyringCifradoCanal`, exclusiva de cuenta_canal y en
 * edición activa del Lote 3.2 concurrente durante esta sesión). Mismo
 * algoritmo y forma de 3 columnas (cifrado/iv/tag) que esa clase, pero sin
 * compartir código para no arriesgar tocar un archivo fuera de este lote.
 *
 * Clave: `NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE` (base64 de 32 bytes). Sin
 * definir, se genera una clave EFÍMERA en memoria con una advertencia
 * explícita — mismo patrón exacto que `JWT_SECRET`/`CANAL_CIFRADO_CLAVES`
 * en `apps/api/src/config/env.ts` (nunca falla en desarrollo/pruebas,
 * nunca silencioso: cada arranque sin la variable imprime el aviso).
 */
const ALGORITMO = "aes-256-gcm";
const LONGITUD_IV = 12;

let claveEfimeraAdvertida = false;

function obtenerClave(): Buffer {
  const base64 = process.env.NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE;
  if (base64 && base64.trim() !== "") {
    const clave = Buffer.from(base64, "base64");
    if (clave.length !== 32) {
      throw new Error("NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE debe decodificar a exactamente 32 bytes (AES-256)");
    }
    return clave;
  }
  if (!claveEfimeraAdvertida) {
    claveEfimeraAdvertida = true;
    console.warn(
      "[config] NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE no definido: usando una clave de cifrado efímera generada " +
        "en memoria SOLO para desarrollo/pruebas. Los secretos de webhook cifrados en este arranque no serán " +
        "descifrables en otro proceso.",
    );
  }
  return CLAVE_EFIMERA_PROCESO;
}

const CLAVE_EFIMERA_PROCESO = randomBytes(32);

export interface SecretoCifrado {
  secretoCifrado: Buffer;
  secretoIv: Buffer;
  secretoTag: Buffer;
}

export function cifrarSecretoWebhook(secretoPlano: string): SecretoCifrado {
  const clave = obtenerClave();
  const iv = randomBytes(LONGITUD_IV);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const secretoCifrado = Buffer.concat([cipher.update(secretoPlano, "utf8"), cipher.final()]);
  return { secretoCifrado, secretoIv: iv, secretoTag: cipher.getAuthTag() };
}

export function descifrarSecretoWebhook(datos: SecretoCifrado): string {
  const clave = obtenerClave();
  const decipher = createDecipheriv(ALGORITMO, clave, datos.secretoIv);
  decipher.setAuthTag(datos.secretoTag);
  const descifrado = Buffer.concat([decipher.update(datos.secretoCifrado), decipher.final()]);
  return descifrado.toString("utf8");
}

/** Solo para pruebas: fuerza la re-emisión del aviso de clave efímera en
 * la siguiente llamada a `obtenerClave` (cada archivo de prueba corre en
 * su propio módulo aislado de Vitest, así que en la práctica esto rara
 * vez hace falta — se expone por si un test quisiera verificar el aviso
 * explícitamente). */
export function _resetAvisoClaveEfimeraParaPruebas(): void {
  claveEfimeraAdvertida = false;
}
