import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, EstadoConexionBadge } from "@atiende-rv/ui-atiende";
import type { CuentaCanalContrato } from "@atiende-rv/api/contrato";
import { useMutacionLigera } from "../../lib/api/queryLigero";
import { sincronizarAhora } from "./api";
import { edadEnMs, edadLegible } from "../../lib/tiempo/edad";
import { aEstadoBadge } from "../conectividad/estadoConexion";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";

const VENTANA_SYNC_RECIENTE_MS = 6 * 60 * 60 * 1000;

export function CuentaSyncCard({ cuenta }: { cuenta: CuentaCanalContrato }) {
  const [resultado, setResultado] = useState<string | null>(null);
  const mutacion = useMutacionLigera(sincronizarAhora);
  const edadMs = edadEnMs(cuenta.ultimaSincronizacionExitosaEn);
  const atrasada = edadMs === null || edadMs > VENTANA_SYNC_RECIENTE_MS;

  async function sincronizar() {
    setResultado(null);
    const r = await mutacion.ejecutar(cuenta.id);
    setResultado(
      r.encolado
        ? "Sincronización encolada (outbox_evento) — la ejecución real la hace el worker de sync, no esta pantalla."
        : "La API no confirmó el encolado.",
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{cuenta.nombre}</CardTitle>
        <EstadoConexionBadge estado={aEstadoBadge(cuenta.estadoConexion)} />
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <dt className="text-muted-foreground">Última sync</dt>
          <dd className={atrasada ? "text-destructive font-medium" : ""}>{edadLegible(cuenta.ultimaSincronizacionExitosaEn)}</dd>
          <dt className="text-muted-foreground">Errores</dt>
          <dd className="text-muted-foreground italic">no expuesto aún (H-035 pendiente)</dd>
          <dt className="text-muted-foreground">Cuarentena</dt>
          <dd className="text-muted-foreground italic">no expuesto aún (H-031/H-035 pendiente)</dd>
          <dt className="text-muted-foreground">Drift</dt>
          <dd className="text-muted-foreground italic">no expuesto aún (H-032/H-035 pendiente)</dd>
        </dl>
        {cuenta.esSimulador && (
          <p className="text-[hsl(var(--estado-simulador))]">SIMULADOR — desarrollo/pruebas, no es tráfico real.</p>
        )}
        <Button size="sm" variant="outline" disabled={mutacion.enCurso} onClick={sincronizar} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          {mutacion.enCurso ? "Encolando…" : "Sincronizar ahora"}
        </Button>
        {resultado && <p className="text-muted-foreground">{resultado}</p>}
        <ErrorApiAlerta error={mutacion.error} />
      </CardContent>
    </Card>
  );
}
