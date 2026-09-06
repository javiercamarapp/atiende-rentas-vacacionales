import { Link } from "react-router-dom";
import { AlertTriangle, BellRing } from "lucide-react";
import { Card, CardContent } from "@atiende-rv/ui-atiende";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { listarAlertas, listarConflictos, listarCuentasCanal } from "./api";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";
import { CuentaSyncCard } from "./CuentaSyncCard";
import { LatenciaInternaVsExterna } from "./LatenciaInternaVsExterna";

export function MonitorSyncPage() {
  const cuentasQuery = useQueryLigero(() => listarCuentasCanal(), []);
  const conflictosQuery = useQueryLigero(() => listarConflictos(false), []);
  const alertasQuery = useQueryLigero(() => listarAlertas("activa"), []);

  const cuentas = cuentasQuery.datos?.cuentas ?? [];
  const conflictosPendientes = conflictosQuery.datos?.conflictos ?? [];
  const alertasActivas = alertasQuery.datos?.alertas ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Monitor de sincronización</h1>
        <p className="text-sm text-muted-foreground">
          Edad de última sync, estado por cuenta y conflictos activos. Latencia interna y latencia por canal
          se muestran siempre por separado (RV20 §3) — nunca sumadas en una sola cifra.
        </p>
      </div>

      {conflictosPendientes.length > 0 && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {conflictosPendientes.length} conflicto(s) pendiente(s) de resolución.{" "}
          <Link to="/monitor-sync/conflictos" className="underline font-medium">
            Ver conflictos
          </Link>
        </div>
      )}

      {alertasActivas.length > 0 && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
        >
          <BellRing className="w-4 h-4 shrink-0" />
          {alertasActivas.length} alerta(s) abierta(s) del motor de observabilidad.{" "}
          <Link to="/monitor-sync/alertas" className="underline font-medium">
            Ver alertas
          </Link>
        </div>
      )}

      <ErrorApiAlerta error={cuentasQuery.error} />

      <LatenciaInternaVsExterna />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cuentas.map((cuenta) => (
          <CuentaSyncCard key={cuenta.id} cuenta={cuenta} />
        ))}

        {!cuentasQuery.cargando && cuentas.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No hay cuentas de canal configuradas. Ve a{" "}
              <Link to="/conectividad" className="underline">
                Matriz de conectividad
              </Link>{" "}
              para conectar una.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
