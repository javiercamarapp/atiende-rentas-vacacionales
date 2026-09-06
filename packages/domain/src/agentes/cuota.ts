/**
 * Presupuesto duro de IA por tenant (H-079, D-016, RV18 §3.2): reservado
 * ANTES de cada llamada al proveedor LLM, nunca facturado/verificado
 * después. Patrón directo de `reserveLlmBudget`/`settleLlmBudget` de
 * Likida [RV18-F-10]: (a) se estima el costo/tokens máximos posibles de la
 * llamada, (b) se verifica que el saldo del tenant cubre esa reserva, (c)
 * si no alcanza, la llamada NO se ejecuta — se degrada a una respuesta
 * determinista, (d) al terminar se liquida el costo/tokens reales y se
 * libera la diferencia.
 *
 * Registro de referencia en memoria (mismo patrón que `RegistroFlags` de
 * Lote 10, `packages/domain/src/flags/registro.ts`): persistencia real
 * multi-instancia es responsabilidad de la capa que lo envuelva
 * (`apps/api/src/routes/agentes`, tabla `agente_cuota_tenant`), sin
 * cambiar este contrato.
 */

export class CuotaAgotadaError extends Error {
  constructor(
    readonly tenantId: string,
    readonly tipo: "tokens" | "llamadas",
    readonly disponible: number,
    readonly solicitado: number,
  ) {
    super(
      `Presupuesto de IA agotado para el tenant: ${tipo} disponible=${disponible}, solicitado=${solicitado}. ` +
        `No se pudo generar el borrador; el presupuesto de IA de este mes se agotó — contactar a soporte ` +
        `o esperar al ciclo siguiente.`,
    );
    this.name = "CuotaAgotadaError";
  }
}

export interface PresupuestoTenant {
  readonly tenantId: string;
  /** Techo de tokens/mes (o el periodo que defina el plan) — 0 tokens
   * gastados nunca implica gasto ilimitado; un tenant sin fila registrada
   * no tiene presupuesto (falla cerrado, nunca abierto). */
  readonly techoTokensPeriodo: number;
  readonly techoLlamadasPeriodo: number;
}

interface EstadoPresupuesto {
  readonly definicion: PresupuestoTenant;
  tokensReservados: number;
  tokensLiquidados: number;
  llamadasReservadas: number;
  llamadasLiquidadas: number;
}

export interface ReservaCuota {
  readonly tenantId: string;
  readonly tokensReservados: number;
  liquidada: boolean;
}

/** `true` cuando el saldo restante del tenant cayó al 80% o más de su
 * techo tras la reserva — usado para la alerta de RV18 §3.2 ("alerta al
 * 80%, corte duro al 100%"). */
export interface ResultadoReserva {
  readonly reserva: ReservaCuota;
  readonly porcentajeUsadoTrasReserva: number;
  readonly alertaUmbralAlcanzado: boolean;
}

const UMBRAL_ALERTA_PORCENTAJE = 80;

export class GestorCuotaAgente {
  private readonly estados = new Map<string, EstadoPresupuesto>();

  registrarPresupuesto(definicion: PresupuestoTenant): void {
    this.estados.set(definicion.tenantId, {
      definicion,
      tokensReservados: 0,
      tokensLiquidados: 0,
      llamadasReservadas: 0,
      llamadasLiquidadas: 0,
    });
  }

  private obtener(tenantId: string): EstadoPresupuesto {
    const estado = this.estados.get(tenantId);
    if (!estado) {
      // Fallar cerrado (RV18 §3.2): un tenant sin presupuesto registrado
      // NUNCA tiene gasto ilimitado por omisión.
      throw new CuotaAgotadaError(tenantId, "tokens", 0, 0);
    }
    return estado;
  }

  /**
   * Reserva ANTES de invocar al proveedor. Lanza `CuotaAgotadaError` si el
   * techo de tokens O el techo de llamadas del periodo ya se alcanzaría
   * con esta reserva — la llamada real nunca se ejecuta en ese caso
   * (H-079, §Automatización-1).
   */
  reservar(tenantId: string, techoTokensSalidaEstimado: number): ResultadoReserva {
    const estado = this.obtener(tenantId);
    const tokensComprometidos = estado.tokensLiquidados + estado.tokensReservados + techoTokensSalidaEstimado;
    if (tokensComprometidos > estado.definicion.techoTokensPeriodo) {
      throw new CuotaAgotadaError(
        tenantId,
        "tokens",
        estado.definicion.techoTokensPeriodo - (estado.tokensLiquidados + estado.tokensReservados),
        techoTokensSalidaEstimado,
      );
    }
    const llamadasComprometidas = estado.llamadasLiquidadas + estado.llamadasReservadas + 1;
    if (llamadasComprometidas > estado.definicion.techoLlamadasPeriodo) {
      throw new CuotaAgotadaError(
        tenantId,
        "llamadas",
        estado.definicion.techoLlamadasPeriodo - (estado.llamadasLiquidadas + estado.llamadasReservadas),
        1,
      );
    }

    estado.tokensReservados += techoTokensSalidaEstimado;
    estado.llamadasReservadas += 1;

    const porcentajeUsadoTrasReserva = Math.round(
      ((estado.tokensLiquidados + estado.tokensReservados) / estado.definicion.techoTokensPeriodo) * 100,
    );

    return {
      reserva: { tenantId, tokensReservados: techoTokensSalidaEstimado, liquidada: false },
      porcentajeUsadoTrasReserva,
      alertaUmbralAlcanzado: porcentajeUsadoTrasReserva >= UMBRAL_ALERTA_PORCENTAJE,
    };
  }

  /** Liquida la reserva con el costo/tokens REALES reportados por el
   * proveedor (nunca el nominal) y libera la diferencia. Idempotente:
   * liquidar una reserva ya liquidada lanza, para que un bug de doble
   * liquidación no infle el saldo disponible. */
  liquidar(reserva: ReservaCuota, tokensSalidaReales: number): void {
    if (reserva.liquidada) {
      throw new Error(`La reserva del tenant ${reserva.tenantId} ya fue liquidada — doble liquidación evitada`);
    }
    const estado = this.obtener(reserva.tenantId);
    estado.tokensReservados -= reserva.tokensReservados;
    estado.llamadasReservadas -= 1;
    estado.tokensLiquidados += tokensSalidaReales;
    estado.llamadasLiquidadas += 1;
    (reserva as { liquidada: boolean }).liquidada = true;
  }

  saldoRestante(tenantId: string): { tokens: number; llamadas: number } {
    const estado = this.obtener(tenantId);
    return {
      tokens: estado.definicion.techoTokensPeriodo - estado.tokensLiquidados - estado.tokensReservados,
      llamadas: estado.definicion.techoLlamadasPeriodo - estado.llamadasLiquidadas - estado.llamadasReservadas,
    };
  }
}
