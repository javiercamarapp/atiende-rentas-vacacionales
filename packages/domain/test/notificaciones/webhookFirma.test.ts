import { describe, expect, it } from "vitest";
import {
  encabezadoFirmaWebhook,
  firmarPayloadWebhook,
  serializarPayloadWebhook,
  verificarFirmaWebhook,
} from "../../src/notificaciones/webhookFirma.js";
import type { PayloadWebhookNotificacion } from "../../src/notificaciones/tipos.js";

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

describe("firmarPayloadWebhook / verificarFirmaWebhook — H-054 (HMAC por tenant)", () => {
  it("la misma serialización + el mismo secreto siempre produce la misma firma (determinista)", () => {
    const serializado = serializarPayloadWebhook(payload());
    const f1 = firmarPayloadWebhook("secreto-tenant-1", serializado);
    const f2 = firmarPayloadWebhook("secreto-tenant-1", serializado);
    expect(f1).toBe(f2);
    expect(f1).toMatch(/^[0-9a-f]{64}$/); // hex de 32 bytes (SHA-256).
  });

  it("secretos distintos (tenants distintos) producen firmas distintas para el mismo payload", () => {
    const serializado = serializarPayloadWebhook(payload());
    const fA = firmarPayloadWebhook("secreto-tenant-A", serializado);
    const fB = firmarPayloadWebhook("secreto-tenant-B", serializado);
    expect(fA).not.toBe(fB);
  });

  it("encabezadoFirmaWebhook antepone 'sha256=' (convención GitHub/Stripe)", () => {
    expect(encabezadoFirmaWebhook("abc123")).toBe("sha256=abc123");
  });

  it("verificarFirmaWebhook acepta la firma correcta y rechaza cualquier otra", () => {
    const serializado = serializarPayloadWebhook(payload());
    const secreto = "secreto-real-del-tenant";
    const encabezado = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, serializado));

    expect(verificarFirmaWebhook(secreto, serializado, encabezado)).toBe(true);
    expect(verificarFirmaWebhook(secreto, serializado, "sha256=deadbeef")).toBe(false);
    expect(verificarFirmaWebhook("otro-secreto", serializado, encabezado)).toBe(false);
  });

  it("un payload modificado (aunque sea un solo carácter) invalida la firma — integridad garantizada", () => {
    const secreto = "secreto-real-del-tenant";
    const original = serializarPayloadWebhook(payload());
    const encabezado = encabezadoFirmaWebhook(firmarPayloadWebhook(secreto, original));
    const modificado = serializarPayloadWebhook(payload({ cuerpoTexto: "Airbnb sin sync exitosa hace 99999s" }));
    expect(verificarFirmaWebhook(secreto, modificado, encabezado)).toBe(false);
  });

  it("nunca lanza con un encabezado malformado o de longitud distinta", () => {
    const serializado = serializarPayloadWebhook(payload());
    expect(() => verificarFirmaWebhook("s", serializado, "no-es-una-firma-valida")).not.toThrow();
    expect(verificarFirmaWebhook("s", serializado, "no-es-una-firma-valida")).toBe(false);
    expect(() => verificarFirmaWebhook("s", serializado, "")).not.toThrow();
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
});
