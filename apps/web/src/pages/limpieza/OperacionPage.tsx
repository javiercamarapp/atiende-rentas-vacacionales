import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Card, CardContent, useIsMobile } from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { useSesion } from "../../lib/sesion/SesionProvider";
import {
  obtenerCalendarioTareas,
  procesarEventosCheckout,
  type ResultadoProcesarEventos,
  type TareaOperativa,
} from "./api";
import { AlertaError } from "./components/AlertaError";
import { DetalleTarea } from "./components/DetalleTarea";
import { TableroTurnos } from "./components/TableroTurnos";
import { hoyIso, sumarDias } from "./fechas";

const DIAS_VISIBLES = 14;

/**
 * Página de operación (Lote 5, BACKLOG E08): tablero de turnos por día/
 * unidad + detalle de tarea con checklist/incidencias. Usable en 375px para
 * personal de limpieza (H-053): en móvil se muestra el tablero O el
 * detalle, nunca ambos a la vez; en escritorio, lado a lado.
 */
export function OperacionPage() {
  const { usuario } = useSesion();
  const esMobile = useIsMobile();
  const [desde, setDesde] = useState(hoyIso());
  const [tareaSeleccionada, setTareaSeleccionada] = useState<TareaOperativa | null>(null);
  const hasta = sumarDias(desde, DIAS_VISIBLES);

  const [resultadoProcesar, setResultadoProcesar] = useState<ResultadoProcesarEventos | null>(null);
  const turnosQuery = useQueryLigero(() => obtenerCalendarioTareas(desde, hasta), [desde, hasta]);
  const procesarMut = useMutacionLigera(async () => {
    const resultado = await procesarEventosCheckout();
    setResultadoProcesar(resultado);
    turnosQuery.recargar();
    return resultado;
  });

  const puedeGestionar =
    usuario?.rol === "superadmin" ||
    usuario?.rol === "admin_gestora" ||
    (usuario?.rol === "operador" && usuario.colaboradorNivel !== "solo_calendario");

  const mostrarTablero = !esMobile || tareaSeleccionada === null;
  const mostrarDetalle = !esMobile || tareaSeleccionada !== null;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-display font-semibold">Operación — Limpieza y mantenimiento</h1>
          <p className="text-sm text-muted-foreground">
            Turnos de limpieza generados por checkout, mantenimiento e inspecciones.
          </p>
        </div>
        {puedeGestionar && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => procesarMut.ejecutar()}
            disabled={procesarMut.enCurso}
            title="Genera/reprograma/cancela tareas de limpieza desde checkouts confirmados, modificados o cancelados"
          >
            <RefreshCw className="w-4 h-4" /> Procesar checkouts pendientes
          </Button>
        )}
      </div>

      {resultadoProcesar && (
        <p className="text-xs text-muted-foreground">
          Procesados: {resultadoProcesar.procesados} · Creadas: {resultadoProcesar.tareasCreadas.length} ·
          Reprogramadas: {resultadoProcesar.tareasReprogramadas.length} · Canceladas:{" "}
          {resultadoProcesar.tareasCanceladas.length}
        </p>
      )}

      <AlertaError error={turnosQuery.error ?? procesarMut.error} />

      {!esMobile && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDesde((d) => sumarDias(d, -DIAS_VISIBLES))}>
            ← Anterior
          </Button>
          <span className="text-xs font-mono text-muted-foreground">
            {desde} → {hasta}
          </span>
          <Button variant="outline" size="sm" onClick={() => setDesde((d) => sumarDias(d, DIAS_VISIBLES))}>
            Siguiente →
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
        {mostrarTablero && (
          <div>
            {turnosQuery.cargando && (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">Cargando turnos…</CardContent>
              </Card>
            )}
            {!turnosQuery.cargando && (
              <TableroTurnos
                turnos={turnosQuery.datos?.turnos ?? []}
                tareaSeleccionadaId={tareaSeleccionada?.id ?? null}
                onSeleccionarTarea={setTareaSeleccionada}
              />
            )}
          </div>
        )}

        {mostrarDetalle && tareaSeleccionada && (
          <DetalleTarea
            tareaId={tareaSeleccionada.id}
            nombreUnidadInicial={tareaSeleccionada.unidadNombre ?? `Unidad ${tareaSeleccionada.unidadId.slice(0, 8)}`}
            onVolver={() => setTareaSeleccionada(null)}
            onCambio={() => turnosQuery.recargar()}
          />
        )}

        {mostrarDetalle && !tareaSeleccionada && !esMobile && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Selecciona una tarea del tablero para ver su checklist e incidencias.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
