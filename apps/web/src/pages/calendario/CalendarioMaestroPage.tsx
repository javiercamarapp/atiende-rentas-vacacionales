import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Card, CardContent } from "@atiende-rv/ui-atiende";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { listarPropiedades, listarUnidades, obtenerCalendarioUnidad } from "./api";
import { hoyIso, sumarDias } from "./fechas";
import { LeyendaCapas } from "./components/LeyendaCapas";
import { VistaTimeline, type FilaUnidad } from "./components/VistaTimeline";
import { VistaMes } from "./components/VistaMes";
import { VistaLista } from "./components/VistaLista";
import { PanelSeleccion, type SeleccionRango } from "./components/PanelSeleccion";
import { ErrorApiAlerta } from "./components/ErrorApiAlerta";

type ModoVista = "timeline" | "mes" | "lista";
const NOCHES_VISIBLES_TIMELINE = 21;

export function CalendarioMaestroPage() {
  const [modo, setModo] = useState<ModoVista>("timeline");
  const [desde, setDesde] = useState(hoyIso());
  const [unidadMes, setUnidadMes] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<SeleccionRango | null>(null);

  const hasta = sumarDias(desde, NOCHES_VISIBLES_TIMELINE);

  const propiedadesQuery = useQueryLigero(() => listarPropiedades(), []);
  const unidadesQuery = useQueryLigero(() => listarUnidades(), []);

  const zonaHorariaPorPropiedad = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of propiedadesQuery.datos?.propiedades ?? []) mapa.set(p.id, p.zonaHoraria);
    return mapa;
  }, [propiedadesQuery.datos]);

  const unidades = unidadesQuery.datos?.unidades ?? [];

  const calendariosQuery = useQueryLigero(async () => {
    const resultados = await Promise.all(
      unidades.map((u) => obtenerCalendarioUnidad(u.id, desde, hasta)),
    );
    return new Map(resultados.map((r) => [r.unidadId, r]));
  }, [unidades.map((u) => u.id).join(","), desde, hasta]);

  function recargarTodo() {
    calendariosQuery.recargar();
    setSeleccion(null);
  }

  const filas: FilaUnidad[] = unidades.map((u) => ({
    unidadId: u.id,
    unidadNombre: u.nombre,
    zonaHoraria: zonaHorariaPorPropiedad.get(u.propiedadId) ?? "sin definir",
    calendario: calendariosQuery.datos?.get(u.id),
  }));

  const unidadSeleccionadaMes = filas.find((f) => f.unidadId === (unidadMes ?? filas[0]?.unidadId));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-display font-semibold">Calendario maestro</h1>
          <p className="text-sm text-muted-foreground">
            Ocupación por unidad — reservas, bloqueos y conflictos en una sola fuente de verdad.
          </p>
        </div>
        <div role="tablist" aria-label="Vista del calendario" className="flex rounded-full border border-border p-0.5">
          {(
            [
              ["timeline", "Línea de tiempo"],
              ["mes", "Mes"],
              ["lista", "Lista"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              role="tab"
              aria-selected={modo === valor}
              onClick={() => setModo(valor)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                modo === valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <LeyendaCapas />

      {(propiedadesQuery.error || unidadesQuery.error || calendariosQuery.error) && (
        <ErrorApiAlerta error={propiedadesQuery.error ?? unidadesQuery.error ?? calendariosQuery.error} />
      )}

      {modo !== "mes" && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Rango anterior"
            onClick={() => setDesde((d) => sumarDias(d, -NOCHES_VISIBLES_TIMELINE))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground">
            {desde} → {hasta}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Rango siguiente"
            onClick={() => setDesde((d) => sumarDias(d, NOCHES_VISIBLES_TIMELINE))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div>
          {(unidadesQuery.cargando || calendariosQuery.cargando) && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">Cargando calendario…</CardContent>
            </Card>
          )}

          {!unidadesQuery.cargando && filas.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                No hay unidades registradas todavía para este tenant.
              </CardContent>
            </Card>
          )}

          {!unidadesQuery.cargando && filas.length > 0 && modo === "timeline" && (
            <VistaTimeline filas={filas} desde={desde} hasta={hasta} onSeleccion={setSeleccion} />
          )}

          {!unidadesQuery.cargando && filas.length > 0 && modo === "lista" && (
            <VistaLista filas={filas} desde={desde} hasta={hasta} onSeleccion={setSeleccion} />
          )}

          {!unidadesQuery.cargando && filas.length > 0 && modo === "mes" && unidadSeleccionadaMes && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="selector-unidad-mes" className="text-xs text-muted-foreground">
                  Unidad
                </label>
                <select
                  id="selector-unidad-mes"
                  value={unidadSeleccionadaMes.unidadId}
                  onChange={(e) => setUnidadMes(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {filas.map((f) => (
                    <option key={f.unidadId} value={f.unidadId}>
                      {f.unidadNombre}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1 ml-auto">
                  <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => setDesde((d) => sumarDias(d, -30))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => setDesde((d) => sumarDias(d, 30))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <VistaMes
                unidadId={unidadSeleccionadaMes.unidadId}
                unidadNombre={unidadSeleccionadaMes.unidadNombre}
                zonaHoraria={unidadSeleccionadaMes.zonaHoraria}
                mesReferencia={desde}
                calendario={unidadSeleccionadaMes.calendario}
                onSeleccion={setSeleccion}
              />
            </div>
          )}
        </div>

        <PanelSeleccion seleccion={seleccion} onLimpiar={() => setSeleccion(null)} onCambio={recargarTodo} />
      </div>
    </div>
  );
}
