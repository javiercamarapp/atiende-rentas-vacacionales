import { useCallback, useRef, useState } from "react";
import type { RespuestaCalendario } from "@atiende-rv/api/contrato";
import { formatoCortoFecha, rangoDeNoches, sumarDias } from "../fechas";
import { NocheCelda } from "./NocheCelda";
import type { SeleccionRango } from "./PanelSeleccion";

export interface FilaUnidad {
  unidadId: string;
  unidadNombre: string;
  zonaHoraria: string;
  calendario: RespuestaCalendario | undefined;
}

/** Timeline multi-unidad: filas = unidades, columnas = noches del rango
 * navegable (LOTES.md Lote 4 punto 2). Selección por Pointer Events
 * (mouse+touch unificados, ACEPTACION §UX-3) dentro de UNA fila a la vez —
 * arrastrar entre unidades distintas no mezcla rangos de dos unidades. */
export function VistaTimeline({
  filas,
  desde,
  hasta,
  onSeleccion,
}: {
  filas: FilaUnidad[];
  desde: string;
  hasta: string;
  onSeleccion: (s: SeleccionRango) => void;
}) {
  const noches = rangoDeNoches(desde, hasta);
  const [arrastre, setArrastre] = useState<{ unidadId: string; ancla: string; actual: string } | null>(null);
  const arrastrando = useRef(false);

  const commit = useCallback(
    (unidadId: string, a: string, b: string) => {
      const fila = filas.find((f) => f.unidadId === unidadId);
      if (!fila) return;
      const [inicio, ultimaSeleccionada] = a <= b ? [a, b] : [b, a];
      const fin = sumarDias(ultimaSeleccionada, 1);
      const nochesSeleccion = rangoDeNoches(inicio, fin).map((f) =>
        fila.calendario?.noches.find((n) => n.fecha === f),
      );
      onSeleccion({
        unidadId,
        unidadNombre: fila.unidadNombre,
        zonaHoraria: fila.zonaHoraria,
        inicio,
        fin,
        noches: nochesSeleccion,
      });
    },
    [filas, onSeleccion],
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border" role="table" aria-label="Calendario maestro — línea de tiempo multi-unidad">
      <div className="min-w-max">
        <div className="flex sticky top-0 z-20 bg-card border-b border-border" role="row">
          <div className="w-36 shrink-0 px-2 py-2 text-xs font-semibold text-muted-foreground border-r border-border" role="columnheader">
            Unidad
          </div>
          {noches.map((fecha) => {
            const { dia, diaSemana, mes } = formatoCortoFecha(fecha);
            return (
              <div
                key={fecha}
                role="columnheader"
                className="h-10 w-9 shrink-0 flex flex-col items-center justify-center text-[10px] text-muted-foreground border-r border-border/40"
              >
                <span className="font-mono">{dia}</span>
                <span>
                  {diaSemana}
                  {fecha.endsWith("-01") ? ` ${mes}` : ""}
                </span>
              </div>
            );
          })}
        </div>

        {filas.map((fila) => (
          <div key={fila.unidadId} className="flex border-b border-border/60" role="row">
            <div className="w-36 shrink-0 px-2 py-2 text-xs font-medium text-foreground border-r border-border truncate" role="rowheader">
              {fila.unidadNombre}
            </div>
            {noches.map((fecha) => {
              const noche = fila.calendario?.noches.find((n) => n.fecha === fecha);
              const enArrastre =
                arrastre?.unidadId === fila.unidadId &&
                fecha >= (arrastre.ancla <= arrastre.actual ? arrastre.ancla : arrastre.actual) &&
                fecha <= (arrastre.ancla <= arrastre.actual ? arrastre.actual : arrastre.ancla);
              return (
                <NocheCelda
                  key={fecha}
                  fecha={fecha}
                  noche={noche}
                  compacto
                  seleccionada={false}
                  enRangoSeleccion={enArrastre}
                  onPointerDown={(f) => {
                    arrastrando.current = true;
                    setArrastre({ unidadId: fila.unidadId, ancla: f, actual: f });
                  }}
                  onPointerEnter={(f) => {
                    if (arrastrando.current) {
                      setArrastre((a) => (a && a.unidadId === fila.unidadId ? { ...a, actual: f } : a));
                    }
                  }}
                  onPointerUp={(f) => {
                    if (!arrastrando.current) return;
                    arrastrando.current = false;
                    const ancla = arrastre?.unidadId === fila.unidadId ? arrastre.ancla : f;
                    commit(fila.unidadId, ancla, f);
                    setArrastre(null);
                  }}
                  onActivar={(f) => commit(fila.unidadId, f, f)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
