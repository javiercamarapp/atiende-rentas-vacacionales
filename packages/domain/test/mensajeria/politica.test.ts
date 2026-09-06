import { describe, expect, it } from "vitest";
import {
  ContenidoProhibidoError,
  MensajeExcedeLongitudError,
  contieneLenguajeExcluyente,
  detectarContactoOPago,
  validarMensajeSaliente,
} from "../../src/mensajeria/politica.js";

describe("políticas de canal (H-057, H-058)", () => {
  it("§Mensajería-1: un mensaje de 4001 caracteres hacia Airbnb es rechazado antes del envío", () => {
    const texto = "a".repeat(4001);
    expect(() => validarMensajeSaliente({ canal: "airbnb", texto, reservaConfirmada: true })).toThrow(
      MensajeExcedeLongitudError,
    );
  });

  it("acepta exactamente el límite (4000) sin rechazar", () => {
    const texto = "a".repeat(4000);
    const resultado = validarMensajeSaliente({ canal: "airbnb", texto, reservaConfirmada: true });
    expect(resultado.texto).toHaveLength(4000);
  });

  it("Booking/Vrbo también aplican el límite interno declarado de 4000 caracteres", () => {
    const texto = "a".repeat(4001);
    expect(() => validarMensajeSaliente({ canal: "booking", texto, reservaConfirmada: true })).toThrow(
      MensajeExcedeLongitudError,
    );
    expect(() => validarMensajeSaliente({ canal: "vrbo", texto, reservaConfirmada: true })).toThrow(
      MensajeExcedeLongitudError,
    );
  });

  it("detecta correo, teléfono y enlace de pago", () => {
    const hallazgos = detectarContactoOPago(
      "Escríbeme a maria@ejemplo.com o al 55 1234 5678, o paga por PayPal en https://paypal.me/x",
    );
    expect(hallazgos.emails).toHaveLength(1);
    expect(hallazgos.telefonos.length).toBeGreaterThan(0);
    expect(hallazgos.urls.length).toBeGreaterThan(0);
    expect(hallazgos.palabrasPago.length).toBeGreaterThan(0);
  });

  it("§Mensajería-1: Airbnb BLOQUEA (rechaza) un mensaje con contacto directo antes de confirmar la reserva", () => {
    expect(() =>
      validarMensajeSaliente({
        canal: "airbnb",
        texto: "Mejor escríbeme a mi correo maria@ejemplo.com para darte un descuento fuera de la plataforma",
        reservaConfirmada: false,
      }),
    ).toThrow(ContenidoProhibidoError);
  });

  it("Airbnb SÍ permite compartir teléfono una vez confirmada la reserva (RV10 (e))", () => {
    const resultado = validarMensajeSaliente({
      canal: "airbnb",
      texto: "Mi teléfono es 55 1234 5678 por si necesitas algo",
      reservaConfirmada: true,
    });
    expect(resultado.redactado).toBe(false);
  });

  it("§Mensajería-2: Booking y Vrbo REDACTAN (no rechazan) contacto directo antes de la reserva", () => {
    const entrada = { texto: "Contáctame al 55 1234 5678 antes de reservar", reservaConfirmada: false } as const;
    const booking = validarMensajeSaliente({ canal: "booking", ...entrada });
    const vrbo = validarMensajeSaliente({ canal: "vrbo", ...entrada });
    expect(booking.redactado).toBe(true);
    expect(booking.texto).not.toContain("1234");
    expect(vrbo.redactado).toBe(true);
  });

  it("bloquea lenguaje excluyente por característica protegida", () => {
    expect(() =>
      validarMensajeSaliente({
        canal: "airbnb",
        texto: "No aceptamos huéspedes de cierta religión en esta propiedad",
        reservaConfirmada: true,
      }),
    ).toThrow(ContenidoProhibidoError);
    expect(contieneLenguajeExcluyente("No aceptamos huéspedes de cierta religión")).toBe(true);
    expect(contieneLenguajeExcluyente("Bienvenido, esperamos tu llegada")).toBe(false);
  });
});
