import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../../lib/api/queryLigero";
import { confirmarBloqueoMantenimiento, crearIncidencia, listarIncidencias, type Incidencia } from "../api";
import { AlertaError } from "./AlertaError";

const ETIQUETA_SEVERIDAD: Record<Incidencia["severidad"], string> = {
  leve: "Leve",
  moderada: "Moderada",
  grave: "Grave",
};

/**
 * Incidencias de mantenimiento de la unidad (H-055, REQ-118): reportar es
 * libre para cualquier rol operativo; confirmar el bloqueo propuesto por una
 * incidencia GRAVE exige un clic humano explícito en este mismo panel —
 * nunca ocurre solo por reportar la incidencia (decisión de producto
 * propia de Atiende, sin precedente de mercado, RV11 §e).
 */
export function IncidenciasUnidad({ unidadId, tareaOrigenId }: { unidadId: string; tareaOrigenId: string }) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [severidad, setSeveridad] = useState<Incidencia["severidad"]>("leve");
  const [descripcion, setDescripcion] = useState("");
  const [rangoInicio, setRangoInicio] = useState("");
  const [rangoFin, setRangoFin] = useState("");

  const incidenciasQuery = useQueryLigero(() => listarIncidencias(unidadId), [unidadId]);
  const crearMut = useMutacionLigera(async () => {
    const propuesta = severidad === "grave" && rangoInicio && rangoFin ? { inicio: rangoInicio, fin: rangoFin } : undefined;
    await crearIncidencia({ unidadId, tareaOrigenId, severidad, titulo, descripcion: descripcion || undefined, propuestaBloqueoRango: propuesta });
    setTitulo("");
    setDescripcion("");
    setRangoInicio("");
    setRangoFin("");
    setMostrarFormulario(false);
    incidenciasQuery.recargar();
  });
  const confirmarMut = useMutacionLigera(async (incidenciaId: string) => {
    await confirmarBloqueoMantenimiento(incidenciaId);
    incidenciasQuery.recargar();
  });

  const incidencias = incidenciasQuery.datos?.incidencias ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Incidencias de mantenimiento</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? "Cancelar" : "Reportar incidencia"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {mostrarFormulario && (
          <form
            className="space-y-2 rounded-lg border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              crearMut.ejecutar();
            }}
          >
            <div className="space-y-1">
              <label htmlFor="incidencia-titulo" className="text-xs text-muted-foreground">
                Título
              </label>
              <input
                id="incidencia-titulo"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm"
                placeholder="Ej. Fuga de agua en baño principal"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="incidencia-severidad" className="text-xs text-muted-foreground">
                Severidad
              </label>
              <select
                id="incidencia-severidad"
                value={severidad}
                onChange={(e) => setSeveridad(e.target.value as Incidencia["severidad"])}
                className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm"
              >
                <option value="leve">Leve</option>
                <option value="moderada">Moderada</option>
                <option value="grave">Grave — puede proponer bloqueo de mantenimiento</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="incidencia-descripcion" className="text-xs text-muted-foreground">
                Descripción (opcional)
              </label>
              <textarea
                id="incidencia-descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm"
                rows={2}
              />
            </div>
            {severidad === "grave" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="incidencia-desde" className="text-xs text-muted-foreground">
                    Bloqueo propuesto — desde
                  </label>
                  <input
                    id="incidencia-desde"
                    type="date"
                    value={rangoInicio}
                    onChange={(e) => setRangoInicio(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="incidencia-hasta" className="text-xs text-muted-foreground">
                    hasta
                  </label>
                  <input
                    id="incidencia-hasta"
                    type="date"
                    value={rangoFin}
                    onChange={(e) => setRangoFin(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm"
                  />
                </div>
              </div>
            )}
            <AlertaError error={crearMut.error} />
            <Button type="submit" disabled={crearMut.enCurso} className="w-full sm:w-auto">
              Reportar
            </Button>
          </form>
        )}

        <AlertaError error={incidenciasQuery.error ?? confirmarMut.error} />

        {incidencias.length === 0 && !incidenciasQuery.cargando && (
          <p className="text-sm text-muted-foreground">Sin incidencias reportadas para esta unidad.</p>
        )}

        <ul className="space-y-2">
          {incidencias.map((incidencia) => (
            <li key={incidencia.id} className="rounded-lg border border-border p-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium min-w-0 truncate">{incidencia.titulo}</p>
                <Badge variant={incidencia.severidad === "grave" ? "destructive" : "outline"}>
                  {ETIQUETA_SEVERIDAD[incidencia.severidad]}
                </Badge>
              </div>
              {incidencia.descripcion && <p className="text-xs text-muted-foreground">{incidencia.descripcion}</p>}
              <p className="text-[11px] font-mono uppercase tracking-[0.04em] text-muted-foreground">
                {incidencia.estado}
              </p>
              {incidencia.estado === "bloqueo_propuesto" && (
                <Button
                  size="sm"
                  onClick={() => confirmarMut.ejecutar(incidencia.id)}
                  disabled={confirmarMut.enCurso}
                >
                  Confirmar bloqueo de mantenimiento
                </Button>
              )}
              {incidencia.estado === "bloqueo_confirmado" && (
                <p className="text-xs text-green-700 dark:text-green-500">
                  Bloqueo de mantenimiento confirmado — nunca cancela reservas existentes.
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
