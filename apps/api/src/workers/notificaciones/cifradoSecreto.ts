import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { exigeSecretosExplicitos } from "../../config/env.js";

/**
 * H-054: cifrado AES-256-GCM del secreto HMAC de `webhook_tenant` —
 * implementación PROPIA e independiente de `apps/api/src/seguridad/
 * cifrado.ts` (`KeyringCifradoCanal`, exclusiva de cuenta_canal y en
 * edición activa del Lote 3.2 concurrente durante esta sesión). Mismo
 * algoritmo y forma de 3 columnas (cifrado/iv/tag) que esa clase, pero sin
 * compartir código para no arriesgar tocar un archivo fuera de este lote.
 *
 * Clave: `NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE` (base64 de 32 bytes).
 *
 * A3-NOTIF-02 (docs/auditoria-3/calidad.md), corregido: ANTES, sin la
 * variable definida, esta función degradaba SIEMPRE a una clave EFÍMERA
 * generada en memoria — incluida en producción, sin abortar el arranque,
 * a diferencia de `JWT_SECRET`/`CANAL_CIFRADO_CLAVES`
 * (`apps/api/src/config/env.ts`, S-02/S-03) y de `STRIPE_SECRET_KEY`/
 * `STRIPE_WEBHOOK_SECRET` (`construirAdaptadorPagosDesdeEntorno`,
 * A3-FACT-03), que sí exigen el secreto explícito en un entorno
 * productivo. El efecto real: cada arranque productivo sin esta variable
 * usaba una clave distinta y NUNCA persistida — cualquier secreto de
 * webhook cifrado en ese proceso queda indescifrable en cuanto el proceso
 * se recicla (serverless: en cada invocación), rompiendo en silencio el
 * envío de notificaciones salientes firmadas.
 *
 * Ahora, igual que esas dos correcciones previas: si falta la variable Y
 * el entorno es productivo (`exigeSecretosExplicitos`, mismo criterio
 * fail-closed que clasifica NODE_ENV en `apps/api/src/config/env.ts` —
 * cualquier valor ausente o development/test explícito es "no
 * productivo"; cualquier otro, incluido uno desconocido o mal escrito,
 * cuenta como productivo), LANZA en vez de degradar. La clave efímera
 * sigue disponible SOLO fuera de producción (desarrollo/pruebas), con el
 * mismo aviso explícito que antes.
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
  if (exigeSecretosExplicitos(process.env.NODE_ENV)) {
    throw new Error(
      "NOTIFICACIONES_WEBHOOK_CIFRADO_CLAVE es obligatorio cuando NODE_ENV no es 'development'/'test' " +
        "explícito (fail-closed, A3-NOTIF-02). Sin ella, cada arranque productivo cifraría/descifraría " +
        "secretos de webhook con una clave efímera distinta y no persistida. Defínela en la configuración " +
        "del despliegue — ver apps/api/.env.example.",
    );
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
