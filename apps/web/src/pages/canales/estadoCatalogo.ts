import type { EstadoConexionCanal } from "@atiende-rv/ui-atiende";
import type { EstadoHonestoCatalogo } from "./api";

/** El vocabulario de catálogo (`canal_catalogo.estado_honesto`, migración
 * 0110) tiene DOS valores que el badge portado de Restaurantes
 * (`EstadoConexionCanal` en ui-atiende) no conoce — `manual` y
 * `no_aplica` — porque son clasificaciones de CATÁLOGO (RV22 Nivel C:
 * "sin vía técnica implementable"), no estados de una conexión en tiempo
 * de ejecución. Se reconcilian aquí, sin tocar el paquete compartido
 * (mismo criterio que `../conectividad/estadoConexion.ts` ya usa para
 * `partner_pendiente` → `bloqueado_por_partner`).
 */
export function aEstadoBadgeCatalogo(estado: EstadoHonestoCatalogo): EstadoConexionCanal {
  if (estado === "partner_pendiente") return "bloqueado_por_partner";
  if (estado === "manual" || estado === "no_aplica") return "no_conectado";
  return estado;
}

export function etiquetaEstadoCatalogo(estado: EstadoHonestoCatalogo): string | undefined {
  if (estado === "manual") return "Manual (sin sincronización)";
  if (estado === "no_aplica") return "No aplica";
  return undefined;
}

export const LEYENDA_NIVELES: Record<"A" | "B" | "C", { titulo: string; descripcion: string }> = {
  A: {
    titulo: "Nivel A — iCal / vía pública sin aprobación",
    descripcion: "Implementable hoy, sin bloqueo de partner. Estado honesto real solo tras sincronización exitosa.",
  },
  B: {
    titulo: "Nivel B — spec pública, bloqueado por partner/credenciales",
    descripcion:
      "Adaptador construido contra la spec pública del canal + simulador etiquetado. Sin credenciales de partner reales, el estado siempre es 'partner pendiente'.",
  },
  C: {
    titulo: "Nivel C — sin vía técnica implementable",
    descripcion: "Publicación manual o no aplicable — nunca se promete sincronización de disponibilidad en este canal.",
  },
};
