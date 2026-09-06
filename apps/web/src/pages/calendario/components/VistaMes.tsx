import { useCallback, useRef, useState } from "react";
import type { RespuestaCalendario } from "@atiende-rv/api/contrato";
import { matrizMes, sumarDias, rangoDeNoches } from "../fechas";
import { NocheCelda } from "./NocheCelda";
import type { SeleccionRango } from "./PanelSeleccion";

const DIAS_ENCABEZADO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Vista mensual de UNA unidad (LOTES.md Lote 4 punto 2). El mismo
 * mecanismo de selección por Pointer Events que el timeline, para que
 * arrastrar en escritorio y tocar en móvil produzcan el mismo conjunto de
 * fechas (ACEPTACION §UX-3). */
export function VistaMes({
  unidadId,
  unidadNombre,
  zonaHoraria,
  mesReferencia,
  calendario,
  onSeleccion,
}: {
  unidadId: string;
  unidadNombre: string;
  zonaHoraria: string;
  mesReferencia: string;
  calendario: RespuestaCalendario | undefined;
  onSeleccion: (s: SeleccionRango) => void;
}) {
  const semanas = matrizMes(mesReferencia);
  const [arrastre, setArrastre] = useState<{ ancla: string; actual: string } | null>(null);
  const arrastrando = useRef(false);

  const commit = useCallback(
    (a: string, b: string) => {
      const [inicio, ultimaSeleccionada] = a <= b ? [a, b] : [b, a];
      const fin = sumarDias(ultimaSeleccionada, 1);
      const noches = rangoDeNoches(inicio, fin).map((f) => calendario?.noches.find((n) => n.fecha === f));
      onSeleccion({ unidadId, unidadNombre, zonaHoraria, inicio, fin, noches });
    },
    [unidadId, unidadNombre, zonaHoraria, calendario, onSeleccion],
  );

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS_ENCABEZADO.map((d) => (
          <div key={d} className="text-[10px] text-center text-muted-foreground font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {semanas.map((semana, i) => (
          <div key={i} className="grid grid-cols-7 gap-1">
            {semana.map((fecha, j) =>
              fecha ? (
                <div key={fecha}>
                  <NocheCelda
                    fecha={fecha}
                    noche={calendario?.noches.find((n) => n.fecha === fecha)}
                    seleccionada={false}
                    enRangoSeleccion={
                      !!arrastre &&
                      fecha >= (arrastre.ancla <= arrastre.actual ? arrastre.ancla : arrastre.actual) &&
                      fecha <= (arrastre.ancla <= arrastre.actual ? arrastre.actual : arrastre.ancla)
                    }
                    onPointerDown={(f) => {
                      arrastrando.current = true;
                      setArrastre({ ancla: f, actual: f });
                    }}
                    onPointerEnter={(f) => {
                      if (arrastrando.current) setArrastre((a) => (a ? { ...a, actual: f } : a));
                    }}
                    onPointerUp={(f) => {
                      if (!arrastrando.current) return;
                      arrastrando.current = false;
                      commit(arrastre?.ancla ?? f, f);
                      setArrastre(null);
                    }}
                    onActivar={(f) => commit(f, f)}
                  />
                </div>
              ) : (
                <div key={`vacio-${j}`} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
