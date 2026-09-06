import { useState } from "react";
import { ArrowLeft, Camera, Check } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../../lib/api/queryLigero";
import { completarChecklistItem, completarTarea, obtenerTarea } from "../api";
import { AlertaError } from "./AlertaError";
import { EtiquetaEstadoTarea, EtiquetaPrioridad, EtiquetaTipoTarea } from "./EtiquetaEstadoTarea";
import { IncidenciasUnidad } from "./IncidenciasUnidad";

/**
 * Detalle de tarea con checklist (H-051, REQ-113: fotos + timestamp por
 * ítem, checklist incompleto bloquea completar la tarea) e incidencias de
 * mantenimiento de la unidad (H-055). Usable en 375px: un solo botón "Volver"
 * para navegación móvil en vez de un layout de dos columnas fijo.
 */
export function DetalleTarea({
  tareaId,
  nombreUnidadInicial,
  onVolver,
  onCambio,
}: {
  tareaId: string;
  /** Nombre conocido desde la tarjeta del tablero — se muestra mientras
   * `obtenerTarea` resuelve; una vez cargada, se usa `tarea.unidadNombre`
   * (resuelto server-side, ver `../api.ts`). */
  nombreUnidadInicial: string;
  onVolver: () => void;
  onCambio: () => void;
}) {
  const [rutasFoto, setRutasFoto] = useState<Record<string, string>>({});

  const tareaQuery = useQueryLigero(() => obtenerTarea(tareaId), [tareaId]);
  const completarItemMut = useMutacionLigera(async (itemId: string) => {
    const ruta = rutasFoto[itemId]?.trim();
    await completarChecklistItem(tareaId, itemId, ruta ? { fotos: [{ rutaAlmacenamiento: ruta }] } : {});
    tareaQuery.recargar();
    onCambio();
  });
  const completarTareaMut = useMutacionLigera(async () => {
    const resultado = await completarTarea(tareaId);
    tareaQuery.recargar();
    onCambio();
    return resultado;
  });

  const tarea = tareaQuery.datos;

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={onVolver} className="lg:hidden">
        <ArrowLeft className="w-4 h-4" /> Volver al tablero
      </Button>

      {tareaQuery.cargando && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">Cargando tarea…</CardContent>
        </Card>
      )}

      <AlertaError error={tareaQuery.error} />

      {tarea && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">{tarea.unidadNombre ?? nombreUnidadInicial}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Programada para {tarea.programadaPara}
                    {tarea.notas ? ` · ${tarea.notas}` : ""}
                  </p>
                </div>
                <EtiquetaEstadoTarea estado={tarea.estado} />
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <EtiquetaTipoTarea tipo={tarea.tipo} />
                <EtiquetaPrioridad prioridad={tarea.prioridad} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Checklist</h3>
                {tarea.checklist.length === 0 && (
                  <p className="text-sm text-muted-foreground">Esta tarea no tiene checklist.</p>
                )}
                <ul className="space-y-2">
                  {tarea.checklist.map((item) => (
                    <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                      <div className="flex items-start gap-2 min-w-0">
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                            item.completado ? "bg-primary border-primary" : "border-muted-foreground/40"
                          }`}
                        >
                          {item.completado && <Check className="w-3 h-3 text-primary-foreground" />}
                        </span>
                        <div className="min-w-0">
                          <p className={`text-sm ${item.completado ? "line-through text-muted-foreground" : ""}`}>
                            {item.descripcion}
                          </p>
                          {item.completado && item.completadoEn && (
                            <p className="text-[11px] text-muted-foreground">
                              Completado {new Date(item.completadoEn).toLocaleString("es-MX")}
                            </p>
                          )}
                        </div>
                      </div>
                      {!item.completado && (
                        <div className="flex items-center gap-1.5">
                          <label htmlFor={`foto-${item.id}`} className="sr-only">
                            Ruta de foto (dev-local) para {item.descripcion}
                          </label>
                          <div className="flex items-center gap-1 rounded-md border border-input px-2 py-1.5 min-w-0 flex-1">
                            <Camera className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <input
                              id={`foto-${item.id}`}
                              type="text"
                              placeholder="dev-local/foto.jpg (opcional)"
                              value={rutasFoto[item.id] ?? ""}
                              onChange={(e) => setRutasFoto((r) => ({ ...r, [item.id]: e.target.value }))}
                              className="text-xs bg-transparent outline-none w-full min-w-0"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => completarItemMut.ejecutar(item.id)}
                            disabled={completarItemMut.enCurso}
                            className="shrink-0"
                          >
                            Completar
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <AlertaError error={completarItemMut.error ?? completarTareaMut.error} />

              {tarea.estado !== "completada" && tarea.estado !== "cancelada" && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => completarTareaMut.ejecutar()}
                  disabled={completarTareaMut.enCurso}
                >
                  Completar tarea
                </Button>
              )}
              {tarea.estado === "completada" && (
                <p className="text-sm text-green-700 dark:text-green-500">
                  Tarea completada{tarea.completadaEn ? ` el ${new Date(tarea.completadaEn).toLocaleString("es-MX")}` : ""}.
                </p>
              )}
            </CardContent>
          </Card>

          <IncidenciasUnidad unidadId={tarea.unidadId} tareaOrigenId={tarea.id} />
        </>
      )}
    </div>
  );
}
