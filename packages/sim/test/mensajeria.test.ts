import { describe, expect, it } from "vitest";
import { SimuladorMensajeria } from "../src/mensajeria/index.js";
import { CredencialesSospechosasDeProduccionError } from "../src/comun/etiquetado.js";

describe("SimuladorMensajeria (Lote 6) — estado honesto, D-019", () => {
  it("siempre reporta obtenerEstadoConexion() === 'simulador'", () => {
    const sim = new SimuladorMensajeria("airbnb");
    expect(sim.obtenerEstadoConexion()).toBe("simulador");
  });

  it("declara la capacidad messaging=true (la única que tiene)", () => {
    const sim = new SimuladorMensajeria("airbnb");
    expect(sim.capacidades.messaging).toBe(true);
    expect(sim.capacidades.reservationsPull).toBe(false);
  });

  it("rechaza arrancar si NODE_ENV luce como producción (D-019)", () => {
    expect(() => new SimuladorMensajeria("airbnb", { entorno: "production" })).toThrow(
      CredencialesSospechosasDeProduccionError,
    );
  });

  it("enviarMensajeAprobado exige aprobadoPor y registra el envío", async () => {
    const sim = new SimuladorMensajeria("vrbo");
    const resultado = await sim.enviarMensajeAprobado({
      borradorId: "b1",
      texto: "Hola, tu reserva está confirmada",
      aprobadoPor: "usuario-1",
    });
    expect(resultado.idExternoMensaje).toContain("sim-vrbo-");
    expect(sim.mensajesEnviados()).toHaveLength(1);
  });

  it("rechaza enviarMensajeAprobado sin aprobadoPor (defensa en profundidad)", async () => {
    const sim = new SimuladorMensajeria("booking");
    await expect(
      sim.enviarMensajeAprobado({ borradorId: "b1", texto: "x", aprobadoPor: "" as unknown as string }),
    ).rejects.toThrow(/requiere 'aprobadoPor'/);
  });
});
