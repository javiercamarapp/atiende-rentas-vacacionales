import { afterEach, describe, expect, it } from "vitest";
import { BookingMessagingClient, BookingMessagingChannelAdapter } from "@atiende-rv/adapters";
import { BookingMessagingApiSimulator } from "../src/booking-api/mensajeria.js";

/**
 * Prueba de contrato: `BookingMessagingClient`/`BookingMessagingChannelAdapter`
 * (`@atiende-rv/adapters`, construidos contra la spec pública de Booking.com
 * — ver cabecera de `booking/mensajeria.ts`) contra
 * `BookingMessagingApiSimulator` real por HTTP en localhost. Esto NO prueba
 * nada contra Booking.com real (sigue sin credenciales de partner, D-011) —
 * solo verifica que el cliente arma exactamente las peticiones que el
 * simulador (que replica el contrato documentado) espera, incluyendo
 * autenticación, reenvío hasta confirmar, y reautenticación tras un 401.
 */
describe("Mensajería Booking.com — contrato contra BookingMessagingApiSimulator", () => {
  let sim: BookingMessagingApiSimulator | null = null;

  afterEach(async () => {
    if (sim) await sim.detener();
    sim = null;
  });

  const credenciales = { clientId: "cid-prueba", clientSecret: "csecret-prueba" };

  it("se autentica y envía un mensaje aprobado a una conversación real del simulador", async () => {
    sim = new BookingMessagingApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();

    const cliente = new BookingMessagingClient({
      baseUrlAutenticacion: urlBase,
      baseUrlMensajeria: urlBase,
      permitirHttpLocalDeSimulador: true,
    });
    const adaptador = new BookingMessagingChannelAdapter(
      credenciales,
      { credencialesPresentes: true, esSimulador: false, ultimaSincronizacionExitosaEn: null, ventanaMaximaMs: 0, partnerAprobado: false, esSandbox: false },
      cliente,
    );

    expect(adaptador.obtenerEstadoConexion()).toBe("partner_pendiente");

    const resultado = await adaptador.enviarMensajeAprobado({
      borradorId: "borrador-1",
      texto: "Hola, tu check-in es a las 3pm.",
      aprobadoPor: "usuario-1",
      idExternoPropiedad: "prop-123",
      idExternoConversacion: "conv-abc",
    });

    expect(resultado.idExternoMensaje).toBeTruthy();
    expect(sim.mensajesEnviados).toHaveLength(1);
    expect(sim.mensajesEnviados[0]).toEqual({
      propertyId: "prop-123",
      conversationId: "conv-abc",
      content: "Hola, tu check-in es a las 3pm.",
    });
  });

  it("rechaza enviarMensajeAprobado sin identificadores externos (nunca adivina property/conversation id)", async () => {
    sim = new BookingMessagingApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    const adaptador = new BookingMessagingChannelAdapter(
      credenciales,
      { credencialesPresentes: true, esSimulador: false, ultimaSincronizacionExitosaEn: null, ventanaMaximaMs: 0, partnerAprobado: false, esSandbox: false },
      new BookingMessagingClient({ baseUrlAutenticacion: urlBase, baseUrlMensajeria: urlBase, permitirHttpLocalDeSimulador: true }),
    );

    await expect(
      adaptador.enviarMensajeAprobado({ borradorId: "b1", texto: "hola", aprobadoPor: "u1" }),
    ).rejects.toThrow(/idExternoPropiedad e idExternoConversacion/);
  });

  it("recibe mensajes entrantes pendientes y los reenvía hasta que se confirman (D-005: nunca se pierde uno)", async () => {
    sim = new BookingMessagingApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    const cliente = new BookingMessagingClient({ baseUrlAutenticacion: urlBase, baseUrlMensajeria: urlBase, permitirHttpLocalDeSimulador: true });
    const adaptador = new BookingMessagingChannelAdapter(
      credenciales,
      { credencialesPresentes: true, esSimulador: false, ultimaSincronizacionExitosaEn: null, ventanaMaximaMs: 0, partnerAprobado: false, esSandbox: false },
      cliente,
    );

    await fetch(`${urlBase}/interno/encolar-mensaje-entrante`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageThreadId: "hilo-1", content: "¿A qué hora es el check-in?" }),
    });

    const primeraLectura = await adaptador.recibirMensajesPendientes();
    expect(primeraLectura.mensajes).toHaveLength(1);
    expect(primeraLectura.mensajes[0]!.texto).toBe("¿A qué hora es el check-in?");
    expect(primeraLectura.mensajes[0]!.idExternoConversacion).toBe("hilo-1");
    expect(sim.pendientesSinConfirmar).toBe(1); // aún no confirmado — sigue "pendiente" en el canal

    const segundaLecturaSinConfirmar = await adaptador.recibirMensajesPendientes();
    expect(segundaLecturaSinConfirmar.mensajes).toHaveLength(1); // reenviado, no se perdió

    await adaptador.confirmarRecepcion(primeraLectura.cantidadParaConfirmar);
    expect(sim.pendientesSinConfirmar).toBe(0);

    const terceraLectura = await adaptador.recibirMensajesPendientes();
    expect(terceraLectura.mensajes).toHaveLength(0); // ya confirmado, deja de reenviarse
  });

  it("se reautentica automáticamente una vez tras un 401 y completa el envío (token expirado)", async () => {
    sim = new BookingMessagingApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    const cliente = new BookingMessagingClient({ baseUrlAutenticacion: urlBase, baseUrlMensajeria: urlBase, permitirHttpLocalDeSimulador: true });
    const adaptador = new BookingMessagingChannelAdapter(
      credenciales,
      { credencialesPresentes: true, esSimulador: false, ultimaSincronizacionExitosaEn: null, ventanaMaximaMs: 0, partnerAprobado: false, esSandbox: false },
      cliente,
    );

    // Primer envío: obtiene y cachea un token.
    await adaptador.enviarMensajeAprobado({
      borradorId: "b1",
      texto: "primer mensaje",
      aprobadoPor: "u1",
      idExternoPropiedad: "prop-1",
      idExternoConversacion: "conv-1",
    });

    // El simulador invalida el token vigente — como si hubiera expirado.
    await fetch(`${urlBase}/interno/expirar-token`, { method: "POST" });

    // El cliente sigue teniendo el token viejo cacheado (no expiró por
    // reloj), pero el servidor ahora lo rechaza con 401 — debe
    // reautenticarse una sola vez y completar el envío igual.
    const resultado = await adaptador.enviarMensajeAprobado({
      borradorId: "b2",
      texto: "segundo mensaje, tras token invalidado",
      aprobadoPor: "u1",
      idExternoPropiedad: "prop-1",
      idExternoConversacion: "conv-1",
    });

    expect(resultado.idExternoMensaje).toBeTruthy();
    expect(sim.mensajesEnviados).toHaveLength(2);
  });

  it("rechaza baseUrl fuera del allowlist (SSRF-lite): no acepta un host arbitrario aunque sea https", () => {
    expect(
      () => new BookingMessagingClient({ baseUrlAutenticacion: "https://ejemplo-no-permitido.test", baseUrlMensajeria: "https://ejemplo-no-permitido.test" }),
    ).toThrow(/no está permitido/);
  });

  it("rechaza el simulador local si no se pasa permitirHttpLocalDeSimulador explícito (D-019)", async () => {
    sim = new BookingMessagingApiSimulator({ entorno: "pruebas" });
    const { urlBase } = await sim.iniciar();
    expect(() => new BookingMessagingClient({ baseUrlAutenticacion: urlBase, baseUrlMensajeria: urlBase })).toThrow(
      /no está permitido/,
    );
  });
});
