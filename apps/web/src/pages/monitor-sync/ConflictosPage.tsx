import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@atiende-rv/ui-atiende";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { listarConflictos } from "./api";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";

const ETIQUETA_TIPO: Record<string, string> = {
  capa_cruzada: "Capa cruzada (dos categorías se solapan)",
  overbooking_confirmado: "Overbooking confirmado",
};

/** Página de conflictos con resolución GUIADA (LOTES.md Lote 4 punto 4):
 * nunca ofrece cancelar una reserva de canal desde aquí. La resolución
 * real de un conflicto (qué fila prevalece, si hay que contactar al
 * huésped) es una decisión humana informada por este detalle — esta
 * pantalla dirige al calendario maestro del rango exacto en vez de
 * "resolver" con un botón que fingiría automatizar una decisión de
 * negocio delicada. */
export function ConflictosPage() {
  const activos = useQueryLigero(() => listarConflictos(false), []);
  const historicos = useQueryLigero(() => listarConflictos(true), []);

  const conflictosActivos = activos.datos?.conflictos ?? [];
  const totalHistorico = historicos.datos?.conflictos.length ?? 0;
  const resueltos = totalHistorico - conflictosActivos.length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Conflictos</h1>
        <p className="text-sm text-muted-foreground">
          Resolución guiada — Atiende nunca cancela una reserva de canal automáticamente para "resolver" un
          conflicto.
        </p>
      </div>

      <ErrorApiAlerta error={activos.error} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pendientes ({conflictosActivos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {conflictosActivos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin conflictos pendientes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detectado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflictosActivos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.unidadId}</TableCell>
                    <TableCell>{ETIQUETA_TIPO[c.tipo] ?? c.tipo}</TableCell>
                    <TableCell className="text-xs">{new Date(c.detectadoEn).toLocaleString("es-MX")}</TableCell>
                    <TableCell>
                      <Link to="/calendario" className="text-xs text-primary hover:underline">
                        Revisar en el calendario
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {resueltos >= 0 ? resueltos : 0} conflicto(s) ya resuelto(s) en el histórico de este tenant.
      </p>

      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Cómo se resuelve un conflicto aquí</p>
        <p>1. Ábrelo en el calendario maestro (enlace de arriba) para ver ambas capas involucradas.</p>
        <p>2. Si una es una reserva de canal, el cambio debe hacerse en el canal de origen — Atiende nunca la cancela.</p>
        <p>3. Si el conflicto es entre un bloqueo propio y otra capa, puedes quitar el bloqueo desde el panel de selección del calendario.</p>
      </div>
    </div>
  );
}
