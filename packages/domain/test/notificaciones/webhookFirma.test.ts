import { describe, expect, it } from "vitest";
import {
  TOLERANCIA_TIMESTAMP_SEGUNDOS,
  encabezadoFirmaWebhook,
  firmarPayloadWebhook,
  serializarPayloadWebhook,
  verificarFirmaWebhook,
} from "../../src/notificaciones/webhookFirma.js";
import type { PayloadWebhookNotificacion } from "../../src/notificaciones/tipos.js";

const AHORA_MS = new Date("2026-09-09T12:00:00.000Z").getTime();
const AHORA_SEGUNDOS = Math.floor(AHORA_MS / 1000);

function payload(overrides: Partial<PayloadWebhookNotificacion> = {}): PayloadWebhookNotificacion {
  return {
    version: 1,
    tipoEvento: "alerta_observabilidad",
    titulo: "Sin sincronización exitosa",
    cuerpoTexto: "Airbnb sin sync exitosa hace 21600s",
    metadata: { canal: "airbnb" },
    emitidoEn: "2026-09-06T10:00:00.000Z",
    ...overrides,
  };
}

describe("firmarPayloadWebhook / verificarFirmaWebhook — H-054 (HMAC por tenant, anti-replay A3-NOTIF-01)", () => {
  it("la misma serialización + el mismo secreto + el mismo timestamp siempre produce la misma firma (determinista)", () => {
    const serializado = serializarPayloadWebhook(payload());
    const f1 = firmarPayloadWebhook("secreto-tenant-1", AHORA_SEGUNDOS, serializado);
    const f2 = firmarPayloadWebhook("secreto-tenant-1", AHORA_SEGUNDOS, serializado);
    expect(f1).toBe(f2);
    expect(f1).toMatch(/^[0-9a-f]{64}$/); // hex de 32 bytes (SHA-256).
  });

  it("timestamps distintos para el mismo secreto+payload producen firmas distintas (el timestamp es ESTRUCTURAL, no decorativo)", () => {
    const serializado = serializarPayloadWebhook(payload());
    const f1 = firmarPayloadWebhook("secreto-tenant-1", AHORA_SEGUNDOS, serializado);
    const f2 = firmarPayloadWebhook("secreto-tenant-1", AHORA_SEGUNDOS + 1, serializado);
    expect(f1).not.toBe(f2);
  });

  it("secretos distintos (tenants distintos) producen firmas distintas para el mismo payload+timestamp", () => {
    const serializado = serializarPayloadWebhook(payload());
    const fA = firmarPayloadWebhook("secreto-tenant-A", AHORA_SEGUNDOS, serializado);
    const fB = firmarPayloadWebhook("secreto-tenant-B", AHORA_SEGUNDOS, serializado);
    expect(fA).not.toBe(fB);
  });

  it("encabezadoFirmaWebhook antepone 'sha256=' (convención GitHub/Stripe)", () => {
    expect(encabezadoFirmaWebhook("abc123")).toBe("sha256=abc123");
  });

  it("verificarFirmaWebhook acepta la firma correcta (timestamp fresco) y rechaza cualquier otra", () => {
    const serializado = serializarPayloadWebhook(payload());
    const secreto = "secreto-real-del-tenant";
    const encabezado = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, AHORA_SEGUNDOS, serializado));

    expect(verificarFirmaWebhook(secreto, AHORA_SEGUNDOS, serializado, encabezado, { ahoraMs: AHORA_MS })).toBe(true);
    expect(verificarFirmaWebhook(secreto, AHORA_SEGUNDOS, serializado, "sha256=deadbeef", { ahoraMs: AHORA_MS })).toBe(false);
    expect(verificarFirmaWebhook("otro-secreto", AHORA_SEGUNDOS, serializado, encabezado, { ahoraMs: AHORA_MS })).toBe(false);
  });

  it("un payload modificado (aunque sea un solo carácter) invalida la firma — integridad garantizada", () => {
    const secreto = "secreto-real-del-tenant";
    const original = serializarPayloadWebhook(payload());
    const encabezado = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, AHORA_SEGUNDOS, original));
    const modificado = serializarPayloadWebhook(payload({ cuerpoTexto: "Airbnb sin sync exitosa hace 99999s" }));
    expect(verificarFirmaWebhook(secreto, AHORA_SEGUNDOS, modificado, encabezado, { ahoraMs: AHORA_MS })).toBe(false);
  });

  it("nunca lanza con un encabezado malformado, un timestamp no numérico, o de longitud distinta", () => {
    const serializado = serializarPayloadWebhook(payload());
    expect(() => verificarFirmaWebhook("s", AHORA_SEGUNDOS, serializado, "no-es-una-firma-valida", { ahoraMs: AHORA_MS })).not.toThrow();
    expect(verificarFirmaWebhook("s", AHORA_SEGUNDOS, serializado, "no-es-una-firma-valida", { ahoraMs: AHORA_MS })).toBe(false);
    expect(() => verificarFirmaWebhook("s", AHORA_SEGUNDOS, serializado, "", { ahoraMs: AHORA_MS })).not.toThrow();
    expect(() => verificarFirmaWebhook("s", "no-soy-un-numero", serializado, "sha256=deadbeef", { ahoraMs: AHORA_MS })).not.toThrow();
    expect(verificarFirmaWebhook("s", "no-soy-un-numero", serializado, "sha256=deadbeef", { ahoraMs: AHORA_MS })).toBe(false);
  });

  it("serializarPayloadWebhook es estable frente al orden de propiedades del objeto de entrada", () => {
    const p1 = payload();
    const p2: PayloadWebhookNotificacion = {
      emitidoEn: p1.emitidoEn,
      metadata: p1.metadata,
      cuerpoTexto: p1.cuerpoTexto,
      titulo: p1.titulo,
      tipoEvento: p1.tipoEvento,
      version: p1.version,
    };
    expect(serializarPayloadWebhook(p1)).toBe(serializarPayloadWebhook(p2));
  });

  // --- A3-NOTIF-01: anti-replay estructural (prueba real de repetición) ---

  it("REPLAY: una firma+timestamp VÁLIDOS pero más viejos que la tolerancia se RECHAZAN, aunque el HMAC en sí sea correcto", () => {
    const secreto = "secreto-real-del-tenant";
    const serializado = serializarPayloadWebhook(payload());
    // El atacante capturó timestamp+firma en el momento del envío original...
    const timestampOriginal = AHORA_SEGUNDOS - TOLERANCIA_TIMESTAMP_SEGUNDOS - 1;
    const encabezado = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, timestampOriginal, serializado));

    // ...la firma es matemáticamente correcta para ese timestamp: si NO
    // hubiera chequeo de tolerancia, esto sería `true` (vulnerable).
    expect(
      verificarFirmaWebhook(secreto, timestampOriginal, serializado, encabezado, {
        ahoraMs: timestampOriginal * 1000,
      }),
    ).toBe(true);

    // ...pero el atacante la repite más tarde ("ahora"), fuera de la
    // ventana de tolerancia: DEBE rechazarse.
    expect(verificarFirmaWebhook(secreto, timestampOriginal, serializado, encabezado, { ahoraMs: AHORA_MS })).toBe(false);
  });

  it("un timestamp exactamente en el borde de la tolerancia se acepta; uno un segundo más viejo se rechaza", () => {
    const secreto = "secreto-real-del-tenant";
    const serializado = serializarPayloadWebhook(payload());

    const timestampEnElBorde = AHORA_SEGUNDOS - TOLERANCIA_TIMESTAMP_SEGUNDOS;
    const encabezadoEnElBorde = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, timestampEnElBorde, serializado));
    expect(verificarFirmaWebhook(secreto, timestampEnElBorde, serializado, encabezadoEnElBorde, { ahoraMs: AHORA_MS })).toBe(true);

    const timestampFueraDeTolerancia = timestampEnElBorde - 1;
    const encabezadoFuera = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, timestampFueraDeTolerancia, serializado));
    expect(verificarFirmaWebhook(secreto, timestampFueraDeTolerancia, serializado, encabezadoFuera, { ahoraMs: AHORA_MS })).toBe(
      false,
    );
  });

  it("un timestamp del FUTURO fuera de tolerancia también se rechaza (no solo repeticiones del pasado)", () => {
    const secreto = "secreto-real-del-tenant";
    const serializado = serializarPayloadWebhook(payload());
    const timestampFuturo = AHORA_SEGUNDOS + TOLERANCIA_TIMESTAMP_SEGUNDOS + 1;
    const encabezado = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, timestampFuturo, serializado));
    expect(verificarFirmaWebhook(secreto, timestampFuturo, serializado, encabezado, { ahoraMs: AHORA_MS })).toBe(false);
  });
});
