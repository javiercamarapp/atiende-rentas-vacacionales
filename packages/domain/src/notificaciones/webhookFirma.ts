import { createHmac, timingSafeEqual } from "node:crypto";
import type { PayloadWebhookNotificacion } from "./tipos.js";

/**
 * H-054: firma HMAC-SHA256 de webhooks salientes por tenant — mismo
 * patrón que GitHub/Stripe (`sha256=<hex>` en un header dedicado), para
 * que el receptor pueda verificar que el payload realmente vino de
 * Atiende y no fue falsificado ni modificado en tránsito. Determinista
 * dado el mismo secreto+bytes (usa `node:crypto`, como ya hace
 * `resolucionVersion.ts`/`finanzas/statement.ts` con `createHash` — sin
 * IO real, solo cómputo).
 */

/** Serialización CANÓNICA y estable del payload — el mismo objeto SIEMPRE
 * produce los mismos bytes, así que firmar y luego `JSON.stringify` de
 * nuevo en el receptor con las mismas claves en el mismo orden reproduce
 * la firma. Nunca se firma un objeto con orden de claves no determinista. */
export function serializarPayloadWebhook(payload: PayloadWebhookNotificacion): string {
  return JSON.stringify({
    version: payload.version,
    tipoEvento: payload.tipoEvento,
    titulo: payload.titulo,
    cuerpoTexto: payload.cuerpoTexto,
    metadata: payload.metadata,
    emitidoEn: payload.emitidoEn,
  });
}

export function firmarPayloadWebhook(secretoHmac: string, payloadSerializado: string): string {
  return createHmac("sha256", secretoHmac).update(payloadSerializado).digest("hex");
}

/** Header exacto a enviar/esperar — `sha256=<hex>`. */
export function encabezadoFirmaWebhook(firmaHex: string): string {
  return `sha256=${firmaHex}`;
}

/**
 * Verificación en tiempo constante (`timingSafeEqual`) — nunca compara
 * strings con `===`, que filtraría por temporización cuántos bytes
 * coinciden. Devuelve `false` (nunca lanza) ante cualquier firma
 * malformada, incluida una de longitud distinta.
 */
export function verificarFirmaWebhook(secretoHmac: string, payloadSerializado: string, encabezadoRecibido: string): boolean {
  const esperado = encabezadoFirmaWebhook(firmarPayloadWebhook(secretoHmac, payloadSerializado));
  const bufEsperado = Buffer.from(esperado, "utf8");
  const bufRecibido = Buffer.from(encabezadoRecibido, "utf8");
  if (bufEsperado.length !== bufRecibido.length) return false;
  return timingSafeEqual(bufEsperado, bufRecibido);
}
