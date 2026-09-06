import type { ItemInventarioUnidad } from "./tipos.js";

/**
 * Inventario mínimo de ropa blanca/consumibles por unidad (H-052, REQ-115).
 * `aplicarConsumo` es pura: calcula el nuevo nivel y si cruza el umbral
 * mínimo (alerta de stock bajo); la capa de aplicación es quien persiste el
 * nuevo nivel y decide a quién notificar la alerta.
 */
export interface ResultadoConsumoInventario {
  cantidadNueva: number;
  cruzaUmbralMinimo: boolean;
}

export function aplicarConsumo(item: ItemInventarioUnidad, cantidadConsumida: number): ResultadoConsumoInventario {
  if (cantidadConsumida < 0) {
    throw new Error("cantidadConsumida no puede ser negativa");
  }
  const cantidadNueva = Math.max(0, item.cantidadActual - cantidadConsumida);
  const estabaPorEncimaDelUmbral = item.cantidadActual >= item.umbralMinimo;
  const quedaPorDebajoDelUmbral = cantidadNueva < item.umbralMinimo;
  return {
    cantidadNueva,
    cruzaUmbralMinimo: estabaPorEncimaDelUmbral && quedaPorDebajoDelUmbral,
  };
}

export function stockBajo(item: Pick<ItemInventarioUnidad, "cantidadActual" | "umbralMinimo">): boolean {
  return item.cantidadActual < item.umbralMinimo;
}
