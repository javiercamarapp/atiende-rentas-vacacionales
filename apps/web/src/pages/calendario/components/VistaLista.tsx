import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@atiende-rv/ui-atiende";
import { claveCapaDeNoche, infoCapa, ETIQUETA_ESTADO } from "../capas";
import { rangoDeNoches, sumarDias } from "../fechas";
import type { FilaUnidad } from "./VistaTimeline";
import type { SeleccionRango } from "./PanelSeleccion";

interface RangoAgrupado {
  unidadId: string;
  unidadNombre: string;
  zonaHoraria: string;
  inicio: string;
  fin: string;
  claveCapa: ReturnType<typeof claveCapaDeNoche>;
  estado: string | null;
  origenCanal: string | null;
}

function agruparRangos(fila: FilaUnidad, desde: string, hasta: string): RangoAgrupado[] {
  const noches = rangoDeNoches(desde, hasta);
  const resultado: RangoAgrupado[] = [];
  let actual: RangoAgrupado | null = null;

  for (const fecha of noches) {
    const noche = fila.calendario?.noches.find((n) => n.fecha === fecha);
    const clave = claveCapaDeNoche(noche ?? { ocupada: false, razon: null, estado: null, esDirecta: false });
    if (clave === "libre") {
      actual = null;
      continue;
    }
    if (actual && actual.claveCapa === clave && actual.fin === fecha) {
      actual.fin = sumarDias(fecha, 1);
    } else {
      actual = {
        unidadId: fila.unidadId,
        unidadNombre: fila.unidadNombre,
        zonaHoraria: fila.zonaHoraria,
        inicio: fecha,
        fin: sumarDias(fecha, 1),
        claveCapa: clave,
        estado: noche?.estado ?? null,
        origenCanal: noche?.origenCanal ?? null,
      };
      resultado.push(actual);
    }
  }
  return resultado;
}

/** Vista de lista: mismos datos que timeline/mes, agrupados en rangos
 * contiguos por categoría (LOTES.md Lote 4 punto 2, tercera vista además
 * de línea de tiempo y mes). Útil para lectores de pantalla y para
 * revisar muchas unidades sin desplazamiento horizontal. */
export function VistaLista({
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
  const rangos = filas.flatMap((f) => agruparRangos(f, desde, hasta));

  if (rangos.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">Sin reservas ni bloqueos en el rango visible.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unidad</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Rango</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Origen</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rangos.map((r) => {
          const capa = infoCapa(r.claveCapa);
          return (
            <TableRow key={`${r.unidadId}-${r.inicio}`}>
              <TableCell className="font-medium">{r.unidadNombre}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-2.5 h-2.5 rounded-sm ${capa.clasesLeyenda}`} aria-hidden="true" />
                  {capa.etiqueta}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.inicio} → {r.fin}
              </TableCell>
              <TableCell>{r.estado ? ETIQUETA_ESTADO[r.estado as keyof typeof ETIQUETA_ESTADO] : "—"}</TableCell>
              <TableCell>{r.origenCanal ?? "manual"}</TableCell>
              <TableCell>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    const fila = filas.find((f) => f.unidadId === r.unidadId)!;
                    const noches = rangoDeNoches(r.inicio, r.fin).map((f) =>
                      fila.calendario?.noches.find((n) => n.fecha === f),
                    );
                    onSeleccion({
                      unidadId: r.unidadId,
                      unidadNombre: r.unidadNombre,
                      zonaHoraria: r.zonaHoraria,
                      inicio: r.inicio,
                      fin: r.fin,
                      noches,
                    });
                  }}
                >
                  Ver detalle
                </button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
