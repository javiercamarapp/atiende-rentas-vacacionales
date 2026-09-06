import type { NocheCalendario } from "@atiende-rv/api/contrato";
import { claveCapaDeNoche, infoCapa, ETIQUETA_ESTADO } from "../capas";
import { formatoCortoFecha } from "../fechas";
import { cn } from "@atiende-rv/ui-atiende";

export interface PropsNocheCelda {
  fecha: string;
  noche: NocheCalendario | undefined;
  seleccionada: boolean;
  enRangoSeleccion: boolean;
  onPointerDown: (fecha: string) => void;
  onPointerEnter: (fecha: string) => void;
  onPointerUp: (fecha: string) => void;
  onActivar: (fecha: string) => void;
  compacto?: boolean;
}

/** Celda de una noche: color+texto de su capa, tooltip con origen/UID de
 * canal/capa/estado (LOTES.md Lote 4 punto 2), seleccionable por
 * mouse/touch (Pointer Events unifica ambos, ACEPTACION §UX-3) y por
 * teclado (`Enter`/`Espacio` activa la misma selección que un tap). */
export function NocheCelda({
  fecha,
  noche,
  seleccionada,
  enRangoSeleccion,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
  onActivar,
  compacto,
}: PropsNocheCelda) {
  const clave = claveCapaDeNoche(
    noche ?? { ocupada: false, razon: null, estado: null, esDirecta: false },
  );
  const capa = infoCapa(clave);
  const { dia, diaSemana } = formatoCortoFecha(fecha);

  const detalle = noche?.ocupada
    ? `${capa.etiqueta} — estado: ${noche.estado ? ETIQUETA_ESTADO[noche.estado] : "—"}${
        noche.origenCanal ? ` — canal: ${noche.origenCanal}` : ""
      }`
    : "Libre — sin ocupación";

  return (
    <button
      type="button"
      data-fecha={fecha}
      title={`${fecha} (${diaSemana}) — ${detalle}`}
      aria-label={`${fecha}, ${diaSemana}. ${detalle}${seleccionada ? ". Seleccionada" : ""}`}
      aria-pressed={seleccionada}
      onPointerDown={() => onPointerDown(fecha)}
      onPointerEnter={() => onPointerEnter(fecha)}
      onPointerUp={() => onPointerUp(fecha)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivar(fecha);
        }
      }}
      className={cn(
        "relative flex flex-col items-center justify-center border border-border/60 text-[10px] leading-tight transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:z-10",
        compacto ? "h-10 w-9 shrink-0" : "h-16 w-full",
        capa.clases,
        (seleccionada || enRangoSeleccion) && "ring-2 ring-foreground ring-offset-1 ring-offset-background z-10",
      )}
    >
      <span className="font-mono font-semibold">{dia}</span>
      {!compacto && <span className="opacity-80">{diaSemana}</span>}
    </button>
  );
}
