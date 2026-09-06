import { useState } from "react";
import {
  Badge,
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
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";
import {
  listarAlertas,
  reconocerAlertaApi,
  resolverAlertaApi,
  type AlertaBackend,
  type EstadoAlerta,
  type TipoAlerta,
} from "./api";

const ETIQUETA_TIPO: Record<TipoAlerta, string> = {
  sync_sin_exito: "Sin sincronización exitosa",
  feed_en_cuarentena: "Feed en cuarentena",
  conflicto_pendiente: "Conflicto de calendario pendiente",
  outbox_atascada: "Cola de eventos atascada",
  drift: "Drift entre feed y base de datos",
  token_canal_revocado: "Token de canal revocado",
};

const VARIANTE_SEVERIDAD: Record<AlertaBackend["severidad"], "destructive" | "secondary" | "outline"> = {
  alta: "destructive",
  media: "secondary",
  baja: "outline",
};

const FILTROS_ESTADO: { valor: EstadoAlerta | "todas"; etiqueta: string }[] = [
  { valor: "activa", etiqueta: "Activas" },
  { valor: "reconocida", etiqueta: "Reconocidas" },
  { valor: "resuelta", etiqueta: "Resueltas" },
  { valor: "todas", etiqueta: "Todas" },
];

/**
 * Página de Alertas (Auditoría 2, corrección P-02): antes de esta
 * corrección el backend (`GET /alertas`, `POST /alertas/:id/ack`,
 * `POST /alertas/:id/resolver`) no tenía ninguna pantalla que lo
 * consumiera — un operador no tenía forma de ver, reconocer o resolver
 * una alerta desde el producto, solo desde la API directamente. Motor de
 * reglas en `apps/api/src/workers/observabilidad/alertas.ts`: el ÚNICO
 * efecto automatizable de una alerta es notificar o pausar
 * reversiblemente el push de un canal — NUNCA cancela una reserva ni
 * contacta a un huésped, y esta página nunca ofrece esas acciones.
 */
export function AlertasPage() {
  const [filtroEstado, setFiltroEstado] = useState<EstadoAlerta | "todas">("activa");
  const alertasQuery = useQueryLigero(
    () => listarAlertas(filtroEstado === "todas" ? undefined : filtroEstado),
    [filtroEstado],
  );
  const ack = useMutacionLigera(reconocerAlertaApi);
  const resolver = useMutacionLigera(resolverAlertaApi);

  const alertas = alertasQuery.datos?.alertas ?? [];

  async function alReconocer(id: string) {
    await ack.ejecutar(id);
    alertasQuery.recargar();
  }

  async function alResolver(id: string) {
    await resolver.ejecutar(id);
    alertasQuery.recargar();
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Alertas</h1>
        <p className="text-sm text-muted-foreground">
          Notificaciones del motor de observabilidad (sync, outbox, drift, conflictos, tokens de canal).
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Una alerta nunca cancela una reserva ni contacta a un huésped automáticamente — su único efecto posible es
        notificar o pausar de forma reversible el envío hacia un canal (ver <code>accion_reversible</code> abajo).
      </div>

      <ErrorApiAlerta error={alertasQuery.error ?? ack.error ?? resolver.error} />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
        {FILTROS_ESTADO.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltroEstado(f.valor)}
            aria-pressed={filtroEstado === f.valor}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              filtroEstado === f.valor
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {FILTROS_ESTADO.find((f) => f.valor === filtroEstado)?.etiqueta} ({alertas.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!alertasQuery.cargando && alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin alertas en este filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severidad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Mensaje</TableHead>
                    <TableHead>Detectada</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertas.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Badge variant={VARIANTE_SEVERIDAD[a.severidad]}>{a.severidad}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{ETIQUETA_TIPO[a.tipo] ?? a.tipo}</TableCell>
                      <TableCell className="text-xs max-w-md">
                        {a.mensaje}
                        {a.accion_reversible && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Acción reversible tomada: <code>{a.accion_reversible}</code>
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(a.creado_en).toLocaleString("es-MX")}</TableCell>
                      <TableCell>
                        <Badge variant={a.estado === "activa" ? "default" : "outline"}>{a.estado}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          {a.estado === "activa" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={ack.enCurso}
                              onClick={() => alReconocer(a.id)}
                            >
                              Reconocer
                            </Button>
                          )}
                          {a.estado !== "resuelta" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={resolver.enCurso}
                              onClick={() => alResolver(a.id)}
                            >
                              Resolver
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
