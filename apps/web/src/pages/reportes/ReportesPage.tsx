import { useState } from "react";
import { Download } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { AlertaError } from "./components/AlertaError";
import { BarraSimple } from "./components/BarraSimple";
import {
  decimalDesdeCentavos,
  descargarCsv,
  obtenerReporteIngresos,
  obtenerReporteOcupacion,
  porcentajeDesdeBasisPoints,
} from "./api";

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaDelMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function primerDiaMesSiguiente(): string {
  const d = new Date();
  const siguiente = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return siguiente.toISOString().slice(0, 10);
}

function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reporting (Lote 7, BACKLOG E12): ocupación/ADR/RevPAR e ingresos por
 * canal/propiedad/mes — todo derivado de `reserva`/`reserva_financiero` vía
 * apps/api/src/routes/reportes.ts, sin duplicar cálculo aquí. Exportación
 * CSV real (no un mockup) y gráficas simples sin librería externa.
 *
 * H-072: la tabla de ocupación también muestra las noches bloqueadas por
 * limpieza pendiente (cruce real con `tarea_operativa` de Lote 5) y el
 * RevPAR ajustado sobre el inventario realmente vendible.
 */
export function ReportesPage() {
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(primerDiaMesSiguiente());

  const ocupacionQuery = useQueryLigero(() => obtenerReporteOcupacion(desde, hasta), [desde, hasta]);
  const ingresosQuery = useQueryLigero(() => obtenerReporteIngresos(desde, hasta), [desde, hasta]);

  const exportarOcupacion = useMutacionLigera(async () => {
    const blob = await descargarCsv("/reportes/ocupacion", { desde, hasta });
    descargarBlob(blob, `reporte-ocupacion-${desde}-a-${hasta}.csv`);
  });
  const exportarIngresos = useMutacionLigera(async () => {
    const blob = await descargarCsv("/reportes/ingresos", { desde, hasta });
    descargarBlob(blob, `reporte-ingresos-${desde}-a-${hasta}.csv`);
  });

  const unidades = ocupacionQuery.datos?.unidades ?? [];
  const filasIngresos = ingresosQuery.datos?.filas ?? [];

  const datosBarraOcupacion = unidades.map((u) => ({
    etiqueta: u.unidadNombre,
    valor: u.ocupacionBasisPoints,
    detalle: u.propiedadNombre,
  }));

  const ingresosPorMes = new Map<string, number>();
  for (const f of filasIngresos) {
    ingresosPorMes.set(f.mes, (ingresosPorMes.get(f.mes) ?? 0) + f.ingresosBrutosCentavos);
  }
  const datosBarraIngresos = [...ingresosPorMes.entries()].map(([mes, centavos]) => ({ etiqueta: mes, valor: centavos }));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Ocupación, ADR, RevPAR e ingresos por canal/propiedad/mes — derivados de reservas y statements, sin
          duplicar el cálculo financiero.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          />
        </label>
      </div>

      <AlertaError error={ocupacionQuery.error ?? ingresosQuery.error ?? exportarOcupacion.error ?? exportarIngresos.error} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Ocupación / ADR / RevPAR por unidad</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportarOcupacion.ejecutar()} disabled={exportarOcupacion.enCurso}>
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {ocupacionQuery.cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!ocupacionQuery.cargando && (
            <>
              <BarraSimple datos={datosBarraOcupacion} formatearValor={porcentajeDesdeBasisPoints} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Noches ocupadas</TableHead>
                    <TableHead>Bloqueadas por limpieza</TableHead>
                    <TableHead>Ocupación</TableHead>
                    <TableHead>ADR</TableHead>
                    <TableHead>RevPAR</TableHead>
                    <TableHead>RevPAR ajustado (limpieza)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unidades.map((u) => (
                    <TableRow key={u.unidadId}>
                      <TableCell>{u.unidadNombre}</TableCell>
                      <TableCell>{u.propiedadNombre}</TableCell>
                      <TableCell>
                        {u.nochesOcupadas}/{u.nochesDisponibles}
                      </TableCell>
                      <TableCell>{u.nochesBloqueadasLimpiezaPendiente ?? 0}</TableCell>
                      <TableCell>{porcentajeDesdeBasisPoints(u.ocupacionBasisPoints)}</TableCell>
                      <TableCell>{decimalDesdeCentavos(u.adrCentavos)}</TableCell>
                      <TableCell>{decimalDesdeCentavos(u.revparCentavos)}</TableCell>
                      <TableCell>{decimalDesdeCentavos(u.revparAjustadoLimpiezaCentavos ?? u.revparCentavos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Ingresos por canal / propiedad / mes</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportarIngresos.ejecutar()} disabled={exportarIngresos.enCurso}>
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {ingresosQuery.cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!ingresosQuery.cargando && (
            <>
              <BarraSimple datos={datosBarraIngresos} formatearValor={decimalDesdeCentavos} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Ingresos brutos</TableHead>
                    <TableHead>Neto</TableHead>
                    <TableHead>Reservas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasIngresos.map((f, i) => (
                    <TableRow key={`${f.mes}-${f.canalCodigo}-${f.propiedadId}-${i}`}>
                      <TableCell>{f.mes}</TableCell>
                      <TableCell className="capitalize">{f.canalCodigo}</TableCell>
                      <TableCell>{f.propiedadNombre}</TableCell>
                      <TableCell>{decimalDesdeCentavos(f.ingresosBrutosCentavos)}</TableCell>
                      <TableCell>{decimalDesdeCentavos(f.netoCentavos)}</TableCell>
                      <TableCell>{f.reservas}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
