import type { EstadoConexionCanalContrato } from "@atiende-rv/api/contrato";
import type { EstadoConexionCanal } from "@atiende-rv/ui-atiende";
import type { CanalCodigo } from "./catalogoCanales";
import { CATALOGO_CANALES } from "./catalogoCanales";

/** El contrato de Lote 3 (`EstadoConexionCanalContrato`) usa `partner_pendiente`;
 * el badge portado de Restaurantes (`EstadoConexionCanal` en ui-atiende,
 * Lote 0) usa `bloqueado_por_partner` para el mismo concepto — se
 * reconcilian aquí en vez de tocar ninguno de los dos paquetes
 * compartidos (fuera del alcance de este lote). */
export function aEstadoBadge(estado: EstadoConexionCanalContrato): EstadoConexionCanal {
  if (estado === "partner_pendiente") return "bloqueado_por_partner";
  return estado;
}

/** Etiqueta honesta por canal — sobreescribe el texto genérico del badge
 * cuando PLAN-CONSTRUCCION.md §6 exige una redacción exacta (p. ej.
 * Booking.com "pausado por el canal", nunca "pendiente"). */
export function etiquetaHonesta(canal: CanalCodigo, estado: EstadoConexionCanalContrato): string | undefined {
  if (estado !== "partner_pendiente" && estado !== "no_conectado") return undefined;
  const info = CATALOGO_CANALES[canal];
  if (canal === "booking" && info.bloqueoPartnerDirecto) {
    return "Pausado por el canal";
  }
  return undefined;
}
