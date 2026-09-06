import { describe, expect, it } from "vitest";
import { CuotaAgotadaError, GestorCuotaAgente } from "../../src/agentes/cuota.js";

describe("GestorCuotaAgente — presupuesto duro por tenant (H-079, D-016, §Automatización-1)", () => {
  it("reserva y libera cuota correctamente en un ciclo normal", () => {
    const gestor = new GestorCuotaAgente();
    gestor.registrarPresupuesto({ tenantId: "t1", techoTokensPeriodo: 1000, techoLlamadasPeriodo: 10 });

    const { reserva, porcentajeUsadoTrasReserva } = gestor.reservar("t1", 400);
    expect(porcentajeUsadoTrasReserva).toBe(40);
    expect(gestor.saldoRestante("t1")).toEqual({ tokens: 600, llamadas: 9 });

    gestor.liquidar(reserva, 250); // costo real menor a lo reservado
    expect(gestor.saldoRestante("t1")).toEqual({ tokens: 750, llamadas: 9 });
  });

  it("un tenant sin presupuesto registrado falla CERRADO (nunca gasto ilimitado por omisión)", () => {
    const gestor = new GestorCuotaAgente();
    expect(() => gestor.reservar("tenant-sin-registrar", 10)).toThrow(CuotaAgotadaError);
  });

  it("rechaza la reserva (y por lo tanto la llamada al LLM nunca se ejecuta) cuando el saldo de tokens es insuficiente", () => {
    const gestor = new GestorCuotaAgente();
    gestor.registrarPresupuesto({ tenantId: "t1", techoTokensPeriodo: 100, techoLlamadasPeriodo: 10 });

    expect(() => gestor.reservar("t1", 500)).toThrow(CuotaAgotadaError);
    // El saldo no cambia: la reserva fallida nunca se aplicó.
    expect(gestor.saldoRestante("t1")).toEqual({ tokens: 100, llamadas: 10 });
  });

  it("rechaza la reserva cuando se alcanzaría el techo de LLAMADAS del periodo, aunque sobren tokens", () => {
    const gestor = new GestorCuotaAgente();
    gestor.registrarPresupuesto({ tenantId: "t1", techoTokensPeriodo: 1_000_000, techoLlamadasPeriodo: 1 });
    const { reserva } = gestor.reservar("t1", 10);
    gestor.liquidar(reserva, 10);
    expect(() => gestor.reservar("t1", 10)).toThrow(CuotaAgotadaError);
  });

  it("liquidar una reserva ya liquidada lanza (evita doble liquidación que infle el saldo)", () => {
    const gestor = new GestorCuotaAgente();
    gestor.registrarPresupuesto({ tenantId: "t1", techoTokensPeriodo: 1000, techoLlamadasPeriodo: 10 });
    const { reserva } = gestor.reservar("t1", 100);
    gestor.liquidar(reserva, 50);
    expect(() => gestor.liquidar(reserva, 50)).toThrow();
  });

  it("alertaUmbralAlcanzado se activa a partir del 80% de uso (RV18 §3.2)", () => {
    const gestor = new GestorCuotaAgente();
    gestor.registrarPresupuesto({ tenantId: "t1", techoTokensPeriodo: 100, techoLlamadasPeriodo: 10 });
    const resultado = gestor.reservar("t1", 85);
    expect(resultado.alertaUmbralAlcanzado).toBe(true);
  });
});
