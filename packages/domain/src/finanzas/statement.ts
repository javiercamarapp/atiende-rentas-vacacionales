import { createHash } from "node:crypto";
import { calcularMovimientoReserva } from "./movimiento.js";
import { sumarCentavos } from "./redondeo.js";
import type {
  EntradaMovimientoReserva,
  LineaStatement,
  OwnerStatementCalculado,
  PeriodoStatement,
} from "./tipos.js";

/**
 * Genera el owner statement de un periodo a partir de un conjunto de
 * reservas ya resueltas por `calcularMovimientoReserva` (H-062: "calculado
 * desde `reserva`, nunca al revés" — esta función nunca recibe ni ajusta un
 * total manual, solo agrega líneas ya calculadas por reserva).
 *
 * Idempotencia (H-062, entregable del Lote 7): el `hashContenido` resultante
 * es una función determinista de (ownerId, periodo, moneda, y el conjunto
 * ordenado de líneas). Volver a generar el statement con exactamente las
 * mismas reservas/entradas produce el mismo hash — el llamador (capa de
 * aplicación en apps/api) decide, comparando este hash contra el de la
 * última versión persistida, si debe crear una versión nueva o devolver la
 * existente sin duplicar.
 */
export function generarOwnerStatement(params: {
  ownerId: string;
  periodo: PeriodoStatement;
  moneda: string;
  reservas: EntradaMovimientoReserva[];
}): OwnerStatementCalculado {
  const { ownerId, periodo, moneda, reservas } = params;

  const lineas: LineaStatement[] = [];
  for (const entrada of [...reservas].sort((a, b) => a.ocupacionUnidadId.localeCompare(b.ocupacionUnidadId))) {
    if (entrada.moneda !== moneda) {
      throw new Error(
        `Reserva ${entrada.ocupacionUnidadId} está en moneda "${entrada.moneda}", el statement es en "${moneda}" — conversión de moneda fuera de alcance de este motor (decisión de producto pendiente)`,
      );
    }
    const movimiento = calcularMovimientoReserva(entrada);

    lineas.push({
      ocupacionUnidadId: movimiento.ocupacionUnidadId,
      tipo: "ingreso",
      descripcion: "Ingreso bruto de reserva",
      montoCentavos: movimiento.ingresoBrutoCentavos,
      moneda,
    });
    if (movimiento.comisionCanalCentavos > 0) {
      lineas.push({
        ocupacionUnidadId: movimiento.ocupacionUnidadId,
        tipo: "comision_canal",
        descripcion: `Comisión de canal (${movimiento.comisionCanalFuente})`,
        montoCentavos: movimiento.comisionCanalCentavos,
        moneda,
      });
    }
    if (movimiento.comisionGestorCentavos > 0) {
      lineas.push({
        ocupacionUnidadId: movimiento.ocupacionUnidadId,
        tipo: "comision_gestor",
        descripcion: "Comisión del gestor",
        montoCentavos: movimiento.comisionGestorCentavos,
        moneda,
      });
    }
    for (const gasto of entrada.gastos) {
      lineas.push({
        ocupacionUnidadId: movimiento.ocupacionUnidadId,
        tipo: "gasto",
        descripcion: gasto.descripcion ?? gasto.tipo,
        montoCentavos: gasto.montoCentavos,
        moneda,
      });
    }
    for (const impuesto of entrada.impuestos) {
      lineas.push({
        ocupacionUnidadId: movimiento.ocupacionUnidadId,
        tipo: "impuesto",
        descripcion: `${impuesto.tipo} (revisión legal/fiscal pendiente — B-005)${impuesto.nota ? `: ${impuesto.nota}` : ""}`,
        montoCentavos: impuesto.montoCentavos,
        moneda,
      });
    }
  }

  const ingresosBrutosCentavos = sumarCentavos(...lineas.filter((l) => l.tipo === "ingreso").map((l) => l.montoCentavos));
  const comisionCanalCentavos = sumarCentavos(
    ...lineas.filter((l) => l.tipo === "comision_canal").map((l) => l.montoCentavos),
  );
  const comisionGestorCentavos = sumarCentavos(
    ...lineas.filter((l) => l.tipo === "comision_gestor").map((l) => l.montoCentavos),
  );
  const gastosCentavos = sumarCentavos(...lineas.filter((l) => l.tipo === "gasto").map((l) => l.montoCentavos));
  const impuestosCentavos = sumarCentavos(...lineas.filter((l) => l.tipo === "impuesto").map((l) => l.montoCentavos));
  const netoCentavos =
    ingresosBrutosCentavos - comisionCanalCentavos - comisionGestorCentavos - gastosCentavos - impuestosCentavos;

  const hashContenido = calcularHashStatement({ ownerId, periodo, moneda, lineas });

  return {
    ownerId,
    periodo,
    moneda,
    ingresosBrutosCentavos,
    comisionCanalCentavos,
    comisionGestorCentavos,
    gastosCentavos,
    impuestosCentavos,
    netoCentavos,
    lineas,
    hashContenido,
  };
}

export function calcularHashStatement(params: {
  ownerId: string;
  periodo: PeriodoStatement;
  moneda: string;
  lineas: LineaStatement[];
}): string {
  const lineasCanonicas = [...params.lineas]
    .map((l) => `${l.ocupacionUnidadId ?? ""}|${l.tipo}|${l.descripcion}|${l.montoCentavos}|${l.moneda}`)
    .sort()
    .join(";");
  const canonico = `${params.ownerId}|${params.periodo.inicio}|${params.periodo.fin}|${params.moneda}|${lineasCanonicas}`;
  return createHash("sha256").update(canonico).digest("hex");
}

/** `true` si un statement recién calculado es idéntico (mismo hash) a la
 * última versión persistida — el llamador debe devolver esa versión en vez
 * de crear una nueva (idempotencia de generación, H-062). */
export function esMismoContenidoQueVersionAnterior(
  calculado: OwnerStatementCalculado,
  hashVersionAnterior: string | null,
): boolean {
  return hashVersionAnterior !== null && hashVersionAnterior === calculado.hashContenido;
}
