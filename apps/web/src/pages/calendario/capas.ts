// Render diferenciado de las categorías del calendario (LOTES.md Lote 4,
// punto 2): reserva directa / reserva de canal importada / bloqueo
// propietario / mantenimiento / buffer limpieza / conflicto pendiente.
// `razon` por sí sola NO distingue directa de canal (packages/domain
// escribe siempre `RESERVA_CANAL` como razón de capa='reserva', ver
// packages/domain/src/aplicacion/reservas.ts) — el campo `esDirecta` que
// ya resuelve `apps/api/src/routes/unidades.ts` es la única señal
// correcta, así que toda esta UI se organiza sobre una clave derivada de
// (razon, estado, esDirecta), nunca sobre `razon` sola.
import type { NocheCalendario } from "@atiende-rv/api/contrato";

// `RazonContrato`/`EstadoOcupacionContrato` en el contrato son `z.enum(...)`
// exportados solo como valor (sin `export type X = z.infer<typeof X>` al
// lado, a diferencia de `NocheCalendario`) — se deriva el tipo aquí desde
// los campos ya inferidos de `NocheCalendario` en vez de añadir esos alias
// al contrato compartido (fuera del alcance de este lote, LOTES.md).
type RazonId = NonNullable<NocheCalendario["razon"]>;
type EstadoOcupacionId = NonNullable<NocheCalendario["estado"]>;

export type ClaveCapa =
  | "reserva_directa"
  | "reserva_canal"
  | "bloqueo_propietario"
  | "mantenimiento"
  | "buffer_limpieza"
  | "conflicto_pendiente"
  | "libre";

export interface InfoCapa {
  clave: ClaveCapa;
  etiqueta: string;
  /** Clases de fondo+texto para la celda del timeline/mes (siempre color +
   * texto/patrón juntos, nunca solo color — DEFINICION-DE-HECHO §1). */
  clases: string;
  /** Color plano para chips pequeños (leyenda, lista). */
  clasesLeyenda: string;
  /** true si la razón exacta habilita "cancelar/desbloquear" (nunca para
   * reserva de canal, ACEPTACION §UX-1). */
  cancelablePorPrincipio: boolean;
}

const INFO: Record<ClaveCapa, InfoCapa> = {
  reserva_directa: {
    clave: "reserva_directa",
    etiqueta: "Reserva directa",
    clases: "bg-emerald-700 text-white",
    clasesLeyenda: "bg-emerald-700",
    cancelablePorPrincipio: true,
  },
  reserva_canal: {
    clave: "reserva_canal",
    etiqueta: "Reserva de canal (importada)",
    clases: "bg-sky-700 text-white",
    clasesLeyenda: "bg-sky-700",
    cancelablePorPrincipio: false,
  },
  bloqueo_propietario: {
    clave: "bloqueo_propietario",
    etiqueta: "Bloqueo del propietario",
    clases: "bg-amber-700 text-white",
    clasesLeyenda: "bg-amber-700",
    cancelablePorPrincipio: true,
  },
  mantenimiento: {
    clave: "mantenimiento",
    etiqueta: "Mantenimiento",
    clases: "bg-rose-700 text-white",
    clasesLeyenda: "bg-rose-700",
    cancelablePorPrincipio: true,
  },
  buffer_limpieza: {
    clave: "buffer_limpieza",
    etiqueta: "Buffer de limpieza",
    clases: "bg-teal-700 text-white",
    clasesLeyenda: "bg-teal-700",
    cancelablePorPrincipio: true,
  },
  conflicto_pendiente: {
    clave: "conflicto_pendiente",
    etiqueta: "Conflicto pendiente",
    clases: "bg-destructive text-destructive-foreground border-2 border-dashed border-foreground/60",
    clasesLeyenda: "bg-destructive",
    cancelablePorPrincipio: false,
  },
  libre: {
    clave: "libre",
    etiqueta: "Libre",
    clases: "bg-muted/40 text-muted-foreground",
    clasesLeyenda: "bg-muted",
    cancelablePorPrincipio: false,
  },
};

export function claveCapaDeNoche(noche: Pick<NocheCalendario, "ocupada" | "razon" | "estado" | "esDirecta">): ClaveCapa {
  if (!noche.ocupada || noche.razon === null) return "libre";
  if (noche.estado === "conflicto_pendiente") return "conflicto_pendiente";
  const razon: RazonId = noche.razon;
  if (razon === "RESERVA_CANAL") return noche.esDirecta ? "reserva_directa" : "reserva_canal";
  if (razon === "BLOQUEO_PROPIETARIO") return "bloqueo_propietario";
  if (razon === "MANTENIMIENTO") return "mantenimiento";
  return "buffer_limpieza";
}

export function infoCapa(clave: ClaveCapa): InfoCapa {
  return INFO[clave];
}

export const TODAS_LAS_CAPAS: InfoCapa[] = [
  INFO.reserva_directa,
  INFO.reserva_canal,
  INFO.bloqueo_propietario,
  INFO.mantenimiento,
  INFO.buffer_limpieza,
  INFO.conflicto_pendiente,
];

export const ETIQUETA_ESTADO: Record<EstadoOcupacionId, string> = {
  confirmado: "Confirmado",
  provisional: "Provisional",
  cancelado: "Cancelado",
  conflicto_pendiente: "Conflicto pendiente",
};
