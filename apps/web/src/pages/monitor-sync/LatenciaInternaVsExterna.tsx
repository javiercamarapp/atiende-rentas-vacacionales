import {
  Badge,
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
import { useQueryLigero } from "../../lib/api/queryLigero";
import { obtenerSaludDetallada } from "./api";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";

/**
 * H-073 (REQ-039/REQ-171, §RV19/21-8): las dos tablas de esta sección
 * consumen `/health/detallado`.`latenciaResumen` — que ya separa, del
 * lado del backend (`resumenLatenciaEtiquetada`), la latencia INTERNA
 * MEDIDA (outbox: evento→efecto aplicado, cronometrada por este sistema)
 * de la latencia EXTERNA DECLARADA (nunca medida, viene de constantes
 * documentadas por canal en `packages/adapters`). Se renderizan como DOS
 * tablas separadas con títulos explícitos — nunca una fila mezclada — para
 * que nadie confunda "medido" con "declarado, confianza baja/media" (RV20
 * §3, ya citado en la copy existente de esta página).
 */
export function LatenciaInternaVsExterna() {
  const { datos, error, cargando } = useQueryLigero(() => obtenerSaludDetallada(), []);
  const interna = datos?.latenciaResumen.internaMedidaMs ?? [];
  const externa = datos?.latenciaResumen.externaDeclaradaConfianzaSegundos ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Latencia interna <Badge variant="secondary">medida</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Evento de outbox → efecto aplicado, cronometrada por este sistema. p50/p95/p99 en milisegundos.
          </p>
        </CardHeader>
        <CardContent>
          <ErrorApiAlerta error={error} />
          {!cargando && interna.length === 0 && !error && (
            <p className="text-xs text-muted-foreground italic">Sin observaciones todavía en este proceso.</p>
          )}
          {interna.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead className="text-right">n</TableHead>
                  <TableHead className="text-right">p50</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">p99</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interna.map((fila, i) => (
                  <TableRow key={i}>
                    <TableCell>{fila.canal ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{fila.cuentaCanalId ? fila.cuentaCanalId.slice(0, 8) : "—"}</TableCell>
                    <TableCell>{fila.tipoEvento ?? "—"}</TableCell>
                    <TableCell className="text-right">{fila.cuenta}</TableCell>
                    <TableCell className="text-right">{Math.round(fila.p50)} ms</TableCell>
                    <TableCell className="text-right">{Math.round(fila.p95)} ms</TableCell>
                    <TableCell className="text-right">{Math.round(fila.p99)} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Latencia externa <Badge variant="outline">declarada (confianza)</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Nunca medida por este sistema — cifra documentada por cada canal (ver packages/adapters). No comparable
            directamente contra la latencia interna.
          </p>
        </CardHeader>
        <CardContent>
          {!cargando && externa.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Sin ciclos de sync declarados todavía en este proceso.</p>
          )}
          {externa.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Confianza</TableHead>
                  <TableHead className="text-right">Segundos declarados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {externa.map((fila, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(fila.labels.canal ?? "—")}</TableCell>
                    <TableCell>{String(fila.labels.confianza ?? "—")}</TableCell>
                    <TableCell className="text-right">{fila.valor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
