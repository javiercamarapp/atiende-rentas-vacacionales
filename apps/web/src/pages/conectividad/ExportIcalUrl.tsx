import { useState } from "react";
import { Button } from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { listarUnidades } from "../calendario/api";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";
import { obtenerUrlExportIcal, rotarUrlExportIcal } from "./api";
import type { CanalCodigo } from "./catalogoCanales";

/** Lote 11B, corrección #3: "URL de exportación iCal propia — mostrarla en
 * la matriz de conectividad con botón copiar". Reemplaza el placeholder
 * honesto que dejó Lote 4 ("aún no expuesta por la API") ahora que
 * `GET/POST /export-ical/:unidadId/:canalCodigo` existen. El feed es por
 * UNIDAD (no por propiedad ni por cuenta de canal, D-004/H-026), así que
 * este bloque exige elegir una unidad antes de poder mostrar/copiar nada. */
export function ExportIcalUrl({ canal }: { canal: CanalCodigo }) {
  const unidadesQuery = useQueryLigero(() => listarUnidades(), []);
  const [unidadId, setUnidadId] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const obtenerMutacion = useMutacionLigera((idUnidad: string) => obtenerUrlExportIcal(idUnidad, canal));
  const rotarMutacion = useMutacionLigera((idUnidad: string) => rotarUrlExportIcal(idUnidad, canal));

  const unidades = unidadesQuery.datos?.unidades ?? [];

  async function alElegirUnidad(idUnidad: string) {
    setUnidadId(idUnidad);
    setUrl(null);
    setCopiado(false);
    if (!idUnidad) return;
    const resultado = await obtenerMutacion.ejecutar(idUnidad);
    setUrl(resultado.url);
  }

  async function alRotar() {
    if (!unidadId) return;
    setCopiado(false);
    const resultado = await rotarMutacion.ejecutar(unidadId);
    setUrl(resultado.url);
  }

  async function alCopiar() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiado(true);
  }

  return (
    <div className="space-y-1.5 border-t border-border pt-2 mt-2">
      <p className="text-xs font-medium text-muted-foreground">URL de exportación propia (para pegar en {canal})</p>
      <select
        aria-label={`Unidad para exportar a ${canal}`}
        value={unidadId}
        onChange={(e) => void alElegirUnidad(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
      >
        <option value="">Elegir unidad…</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>

      {url && (
        <div className="space-y-1">
          <div className="flex gap-1">
            <input
              readOnly
              value={url}
              aria-label="URL de exportación"
              className="w-full rounded-md border border-input bg-muted/40 px-2 py-1 text-[11px] font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => void alCopiar()}>
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => void alRotar()}
            disabled={rotarMutacion.enCurso}
          >
            {rotarMutacion.enCurso ? "Rotando…" : "Rotar (invalida la URL anterior de inmediato)"}
          </button>
        </div>
      )}
      <ErrorApiAlerta error={obtenerMutacion.error ?? rotarMutacion.error} />
    </div>
  );
}
