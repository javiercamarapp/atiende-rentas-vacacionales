import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado en reposo de credenciales de cuenta de canal (H-046,
 * §RV19/21-13): AES-256-GCM, un nonce (IV) de 12 bytes aleatorio por
 * operación de cifrado (nunca reutilizado con la misma clave) y el tag de
 * autenticación de 16 bytes de GCM guardado por separado — así una
 * modificación del ciphertext en la base de datos se detecta al descifrar
 * en vez de devolver basura silenciosamente.
 *
 * Rotación de clave (documentada, REQ-141): `CANAL_CIFRADO_CLAVES` en el
 * entorno es una lista `version:claveBase64,version:claveBase64,...`. Se
 * cifra siempre con la ÚLTIMA versión de la lista (la más nueva); se
 * descifra probando la versión indicada en `credenciales_clave_version` de
 * la fila. Rotar la clave es: (1) añadir una versión nueva al final de la
 * lista sin quitar las anteriores, (2) desplegar, (3) re-cifrar
 * perezosamente cada cuenta_canal la próxima vez que se actualice (o con
 * un job de rotación explícito, no incluido en este lote — documentado
 * como pendiente en docs/PROGRESO.md), (4) una vez que ninguna fila use ya
 * una versión vieja, retirarla de la lista.
 */

export interface ClaveCifrado {
  version: string;
  clave: Buffer;
}

export interface CredencialesCifradas {
  cifrado: Buffer;
  iv: Buffer;
  tag: Buffer;
  claveVersion: string;
}

const LONGITUD_IV = 12;
const LONGITUD_CLAVE_BYTES = 32; // AES-256

function parsearKeyring(valor: string): ClaveCifrado[] {
  const entradas = valor
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);
  if (entradas.length === 0) {
    throw new Error(
      "CANAL_CIFRADO_CLAVES vacío: se requiere al menos una clave 'version:base64' de 32 bytes para cifrar credenciales de canal",
    );
  }
  return entradas.map((entrada) => {
    const separador = entrada.indexOf(":");
    if (separador === -1) {
      throw new Error(`Entrada de CANAL_CIFRADO_CLAVES inválida (esperado 'version:base64'): "${entrada}"`);
    }
    const version = entrada.slice(0, separador);
    const clave = Buffer.from(entrada.slice(separador + 1), "base64");
    if (clave.length !== LONGITUD_CLAVE_BYTES) {
      throw new Error(
        `Clave de cifrado de canal versión "${version}" debe tener ${LONGITUD_CLAVE_BYTES} bytes tras decodificar base64 (tiene ${clave.length})`,
      );
    }
    return { version, clave };
  });
}

export class KeyringCifradoCanal {
  private readonly claves: ClaveCifrado[];

  constructor(valorEntorno: string) {
    this.claves = parsearKeyring(valorEntorno);
  }

  /** La clave más nueva del keyring — siempre la última de la lista. */
  private claveActiva(): ClaveCifrado {
    return this.claves[this.claves.length - 1]!;
  }

  private buscarClave(version: string): ClaveCifrado {
    const encontrada = this.claves.find((c) => c.version === version);
    if (!encontrada) {
      throw new Error(`No se encontró la clave de cifrado de canal versión "${version}" en el keyring activo`);
    }
    return encontrada;
  }

  cifrar(textoPlano: string): CredencialesCifradas {
    const { version, clave } = this.claveActiva();
    const iv = randomBytes(LONGITUD_IV);
    const cipher = createCipheriv("aes-256-gcm", clave, iv);
    const cifrado = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { cifrado, iv, tag, claveVersion: version };
  }

  descifrar(datos: CredencialesCifradas): string {
    const { clave } = this.buscarClave(datos.claveVersion);
    const decipher = createDecipheriv("aes-256-gcm", clave, datos.iv);
    decipher.setAuthTag(datos.tag);
    const descifrado = Buffer.concat([decipher.update(datos.cifrado), decipher.final()]);
    return descifrado.toString("utf8");
  }
}

/** Genera una clave de 32 bytes en base64, lista para pegar en
 * `CANAL_CIFRADO_CLAVES=v1:<esto>` — utilidad de desarrollo/rotación, sin
 * uso en runtime del servidor. */
export function generarClaveCifradoBase64(): string {
  return randomBytes(LONGITUD_CLAVE_BYTES).toString("base64");
}
