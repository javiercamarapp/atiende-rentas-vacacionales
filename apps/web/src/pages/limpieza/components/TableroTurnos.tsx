import { Card, CardContent } from "@atiende-rv/ui-atiende";
import type { TareaOperativa, TurnoDia } from "../api";
import { formatoLargoFecha } from "../fechas";
import { TarjetaTarea } from "./TarjetaTarea";

/** Tablero de turnos por día/unidad (entregable verificable de Lote 5:
 * "calendario de turnos por día"), H-049/H-053. Diseño de una sola columna
 * que se apila naturalmente en 375px (sin scroll horizontal, REQ de
 * accesibilidad móvil) — el layout de columnas múltiples solo aparece en
 * pantallas anchas vía CSS grid, nunca una tabla con scroll lateral. */
export function TableroTurnos({
  turnos,
  tareaSeleccionadaId,
  onSeleccionarTarea,
}: {
  turnos: TurnoDia[];
  tareaSeleccionadaId: string | null;
  onSeleccionarTarea: (tarea: TareaOperativa) => void;
}) {
  if (turnos.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No hay tareas operativas programadas en este rango de fechas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {turnos.map((turno) => (
        <section key={turno.fecha} aria-label={`Turno del ${turno.fecha}`}>
          <h2 className="text-xs font-mono uppercase tracking-[0.06em] text-muted-foreground mb-2 sticky top-0 bg-background/95 backdrop-blur py-1">
            {formatoLargoFecha(turno.fecha)} · {turno.tareas.length}{" "}
            {turno.tareas.length === 1 ? "tarea" : "tareas"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {turno.tareas.map((tarea) => (
              <TarjetaTarea
                key={tarea.id}
                tarea={tarea}
                seleccionada={tarea.id === tareaSeleccionadaId}
                onSeleccionar={() => onSeleccionarTarea(tarea)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
