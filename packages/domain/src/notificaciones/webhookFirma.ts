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
 *
 * A3-NOTIF-01 (auditoría-3, MEDIO): la firma incluye un timestamp de
 * ENVÍO como componente ESTRUCTURAL de la cadena firmada
 * (`"${timestamp}.${payload}"`), exactamente el mismo algoritmo que este
 * repo ya usa correctamente para Stripe
 * (`packages/domain/src/facturacion/pagos/stripe.ts`,
 * `verificarYParsearWebhook`). Sin esto, un payload+firma capturado por
 * cualquier vía fuera del control de Atiende (p. ej. un proxy/log del
 * lado del tenant) seguiría siendo válido para siempre — la verificación
 * rechaza cualquier timestamp fuera de `TOLERANCIA_TIMESTAMP_SEGUNDOS`
 * aunque el HMAC en sí sea correcto, acotando la ventana de un ataque de
 * repetición al mismo margen que Stripe.
 */

/** Tolerancia de reloj para la verificación de firma del webhook —
 * idéntico valor y razonamiento que `TOLERANCIA_TIMESTAMP_SEGUNDOS` de
 * `facturacion/pagos/stripe.ts` (5 minutos, recomendación oficial de
 * Stripe): un webhook con timestamp más viejo (o "del futuro" por más de
 * este margen) que esto se rechaza aunque la firma HMAC sea correcta. */
export const TOLERANCIA_TIMESTAMP_SEGUNDOS = 5 * 60;

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

/**
 * Timestamp de envío (segundos Unix, entero) como componente ESTRUCTURAL
 * de la firma — nunca un dato de negocio del payload (`emitidoEn` sigue
 * siendo eso: metadata del evento, no anti-replay). Se firma
 * `"${timestampUnixSegundos}.${payloadSerializado}"`, igual que Stripe.
 */
export function firmarPayloadWebhook(secretoHmac: string, timestampUnixSegundos: number, payloadSerializado: string): string {
  return createHmac("sha256", secretoHmac).update(`${timestampUnixSegundos}.${payloadSerializado}`).digest("hex");
}

/** Header exacto a enviar/esperar para la firma — `sha256=<hex>`. El
 * timestamp viaja SEPARADO, en su propio header (`x-atiende-timestamp`,
 * ver `webhookSaliente.ts`) — mismo criterio simple sugerido en la
 * auditoría, en vez de empaquetar ambos en un solo header tipo
 * `t=...,v1=...` de Stripe. */
export function encabezadoFirmaWebhook(firmaHex: string): string {
  return `sha256=${firmaHex}`;
}

/**
 * Verificación en tiempo constante (`timingSafeEqual`) — nunca compara
 * strings con `===`, que filtraría por temporización cuántos bytes
 * coinciden. Devuelve `false` (nunca lanza) ante cualquier firma
 * malformada, incluida una de longitud distinta.
 *
 * ANTI-REPLAY: rechaza (`false`) si `timestampRecibido` no es un número
 * finito, o si su distancia a "ahora" excede `toleranciaSegundos` — ESTA
 * comprobación corre ANTES de tocar la firma, así que una firma
 * criptográficamente válida pero de un timestamp viejo (una repetición)
 * se rechaza igual. `opciones.ahoraMs` permite inyectar el reloj en
 * pruebas (mismo patrón que `resolverPersonalizado`/`fetchImpl` en
 * `webhookSaliente.ts` para no depender de temporizadores reales).
 */
export function verificarFirmaWebhook(
  secretoHmac: string,
  timestampRecibido: string | number,
  payloadSerializado: string,
  encabezadoRecibido: string,
  opciones: { ahoraMs?: number; toleranciaSegundos?: number } = {},
): boolean {
  const timestampNum = typeof timestampRecibido === "number" ? timestampRecibido : Number(timestampRecibido);
  if (!Number.isFinite(timestampNum)) return false;

  const tolerancia = opciones.toleranciaSegundos ?? TOLERANCIA_TIMESTAMP_SEGUNDOS;
  const ahoraMs = opciones.ahoraMs ?? Date.now();
  const edadSegundos = Math.abs(ahoraMs / 1000 - timestampNum);
  if (!Number.isFinite(edadSegundos) || edadSegundos > tolerancia) return false;

  const esperado = encabezadoFirmaWebhook(firmarPayloadWebhook(secretoHmac, timestampNum, payloadSerializado));
  const bufEsperado = Buffer.from(esperado, "utf8");
  const bufRecibido = Buffer.from(encabezadoRecibido, "utf8");
  if (bufEsperado.length !== bufRecibido.length) return false;
  return timingSafeEqual(bufEsperado, bufRecibido);
}
