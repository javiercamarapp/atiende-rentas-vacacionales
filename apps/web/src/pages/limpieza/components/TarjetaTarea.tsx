import { AlertTriangle, ExternalLink, User } from "lucide-react";
import { cn } from "@atiende-rv/ui-atiende";
import type { TareaOperativa } from "../api";
import { EtiquetaEstadoTarea, EtiquetaPrioridad, EtiquetaTipoTarea } from "./EtiquetaEstadoTarea";

function tareaVencida(tarea: TareaOperativa): boolean {
  if (!tarea.slaVenceEn || tarea.completadaEn) return false;
  return new Date(tarea.slaVenceEn).getTime() < Date.now();
}

/** Tarjeta de tarea operativa — tamaño de toque amplio (mín. 44px) y texto
 * siempre legible en 375px (H-053/§UX móvil de Lote 5): un solo botón que
 * ocupa toda la tarjeta, sin controles anidados pequeños. */
export function TarjetaTarea({
  tarea,
  seleccionada,
  onSeleccionar,
}: {
  tarea: TareaOperativa;
  seleccionada: boolean;
  onSeleccionar: () => void;
}) {
  const vencida = tareaVencida(tarea);
  const nombreUnidad = tarea.unidadNombre ?? `Unidad ${tarea.unidadId.slice(0, 8)}`;
  return (
    <button
      type="button"
      onClick={onSeleccionar}
      aria-pressed={seleccionada}
      className={cn(
        "w-full text-left rounded-xl border bg-card p-3 space-y-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        seleccionada ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm truncate">{nombreUnidad}</p>
        <EtiquetaEstadoTarea estado={tarea.estado} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <EtiquetaTipoTarea tipo={tarea.tipo} />
        <EtiquetaPrioridad prioridad={tarea.prioridad} />
        {tarea.esProveedorExterno && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ExternalLink className="w-3 h-3" /> Proveedor externo
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 truncate">
          <User className="w-3.5 h-3.5 shrink-0" />
          {tarea.asignadoA ? "Asignada" : "Sin asignar"}
        </span>
        {vencida && (
          <span className="inline-flex items-center gap-1 text-destructive font-medium shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" /> SLA vencido
          </span>
        )}
      </div>
    </button>
  );
}
