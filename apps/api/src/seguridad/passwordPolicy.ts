import { createHash } from "node:crypto";

/**
 * Política de contraseñas (Lote 3.2, H-096+) sobre el mínimo de longitud
 * ya exigido por el contrato (`CuerpoRegistro`/`CuerpoRestablecerPassword`/
 * `CuerpoCambiarPassword`: `z.string().min(10)`, apps/api/src/contrato/
 * tipos.ts) — este módulo cubre lo que `zod` no puede expresar como un
 * simple `.min()`: una lista de contraseñas comprometidas/triviales
 * conocidas, y opcionalmente (desactivado por defecto) una consulta
 * k-anonymity contra la API pública "Have I Been Pwned" (HIBP).
 *
 * HIBP k-anonymity (https://haveibeenpwned.com/API/v3#PwnedPasswords):
 * NUNCA se envía la contraseña ni su hash completo — solo los primeros 5
 * caracteres hex del SHA-1, y se compara el sufijo devuelto localmente.
 * Desactivado por defecto (`POLITICA_CONTRASENA_HIBP=false`) porque
 * depende de red externa y no debe bloquear pruebas/CI ni un entorno sin
 * salida a internet — cuando está activo, un fallo de red NUNCA bloquea
 * el registro/cambio de contraseña (fail-open deliberado para ESTA
 * verificación específica: es una recomendación de higiene, no un control
 * de acceso — lo que sí es fail-closed es la longitud mínima, que zod ya
 * garantiza antes de llegar aquí).
 */

// Lista corta y deliberadamente NO exhaustiva de las contraseñas triviales
// más comunes que sí alcanzan 10 caracteres (evita el caso obvio
// "1234567890"/"contraseña1" sin pretender sustituir una lista real de
// contraseñas comprometidas — para eso está la verificación HIBP opcional).
const DENYLIST_TRIVIALES = new Set([
  "1234567890",
  "12345678901",
  "contraseña1",
  "contrasena1",
  "password123",
  "passw0rd123",
  "qwertyuiop",
  "administrador",
  "administrator",
]);

export interface OpcionesPoliticaContrasena {
  hibpHabilitado?: boolean;
  fetchFn?: typeof fetch;
}

export interface ResultadoPoliticaContrasena {
  valida: boolean;
  motivo?: string;
}

export async function validarPoliticaContrasena(
  password: string,
  opciones: OpcionesPoliticaContrasena = {},
): Promise<ResultadoPoliticaContrasena> {
  const normalizada = password.trim().toLowerCase();
  if (DENYLIST_TRIVIALES.has(normalizada)) {
    return { valida: false, motivo: "Esta contraseña es demasiado común, elige una distinta" };
  }

  if (opciones.hibpHabilitado) {
    try {
      const comprometida = await estaComprometidaHibp(password, opciones.fetchFn ?? fetch);
      if (comprometida) {
        return { valida: false, motivo: "Esta contraseña aparece en filtraciones públicas conocidas, elige una distinta" };
      }
    } catch {
      // Fail-open deliberado (ver comentario de cabecera): un problema de
      // red al consultar HIBP nunca debe bloquear registro/cambio de
      // contraseña.
    }
  }

  return { valida: true };
}

async function estaComprometidaHibp(password: string, fetchFn: typeof fetch): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefijo = sha1.slice(0, 5);
  const sufijo = sha1.slice(5);
  const respuesta = await fetchFn(`https://api.pwnedpasswords.com/range/${prefijo}`, {
    headers: { "Add-Padding": "true" },
  });
  if (!respuesta.ok) return false;
  const texto = await respuesta.text();
  return texto.split("\n").some((linea) => linea.split(":")[0]?.trim() === sufijo);
}
