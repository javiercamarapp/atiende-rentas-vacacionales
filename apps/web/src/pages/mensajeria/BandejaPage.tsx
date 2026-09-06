import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, MessageSquare, Plus } from "lucide-react";
import { Button, Card, CardContent } from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { crearConversacion, obtenerBandeja, obtenerPoliticas, type CanalMensajeria } from "./api";
import { AlertaError } from "./components/AlertaError";
import { BadgeCanalSimulado } from "./components/BadgeCanalSimulado";

/**
 * Bandeja de mensajería (Lote 6, BACKLOG E09, H-059 entregable: "bandeja,
 * hilo con borradores pendientes y Aprobar/Rechazar"). Cada conversación
 * muestra su canal (siempre con el indicador de simulador — H-...
 * "indicador de canal simulado", ningún adaptador real existe hoy) y el
 * número de borradores pendientes de aprobación humana.
 */
export function BandejaPage() {
  const bandejaQuery = useQueryLigero(() => obtenerBandeja(), []);
  const politicasQuery = useQueryLigero(() => obtenerPoliticas(), []);
  const [unidadId, setUnidadId] = useState("");
  const [canal, setCanal] = useState<CanalMensajeria>("airbnb");

  // `useMutacionLigera` memoiza `ejecutar` una sola vez (deps `[]`,
  // apps/web/src/lib/api/queryLigero.ts) — el valor a mutar debe pasarse
  // como ARGUMENTO de `ejecutar(...)`, nunca cerrado sobre el estado local
  // del render en curso (ese closure quedaría congelado en el primer
  // render y siempre vería `unidadId`/`canal` vacíos/iniciales).
  const crearMut = useMutacionLigera(async (unidadIdArg: string, canalArg: CanalMensajeria) => {
    const conversacion = await crearConversacion(unidadIdArg, canalArg);
    bandejaQuery.recargar();
    setUnidadId("");
    return conversacion;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Mensajería</h1>
        <p className="text-sm text-muted-foreground">
          Bandeja de conversaciones con huéspedes. Todo borrador de respuesta requiere aprobación humana explícita
          antes de enviarse — nunca se envía nada automáticamente.
        </p>
      </div>

      {politicasQuery.datos && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {politicasQuery.datos.avisoEscaneoAirbnb}
        </p>
      )}

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="mensajeria-unidad-id">
              ID de unidad
            </label>
            <input
              id="mensajeria-unidad-id"
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
              placeholder="uuid de la unidad"
              className="border rounded-md px-2 py-1 text-sm bg-background w-72"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="mensajeria-canal">
              Canal
            </label>
            <select
              id="mensajeria-canal"
              value={canal}
              onChange={(e) => setCanal(e.target.value as CanalMensajeria)}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            >
              <option value="airbnb">Airbnb</option>
              <option value="vrbo">Vrbo</option>
              <option value="booking">Booking.com</option>
            </select>
          </div>
          <Button
            size="sm"
            disabled={!unidadId || crearMut.enCurso}
            onClick={() => crearMut.ejecutar(unidadId, canal)}
          >
            <Plus className="w-4 h-4" /> Nueva conversación
          </Button>
        </CardContent>
      </Card>

      <AlertaError error={bandejaQuery.error ?? crearMut.error} />

      <div className="space-y-2">
        {bandejaQuery.datos?.conversaciones.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin conversaciones todavía.</p>
        )}
        {bandejaQuery.datos?.conversaciones.map((c) => (
          <Link key={c.id} to={`/mensajes/${c.id}`}>
            <Card className="hover:bg-accent/40 transition-colors">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{c.unidadNombre ?? c.unidadId}</span>
                  <BadgeCanalSimulado canal={c.canalCodigo} />
                </div>
                {c.borradoresPendientes > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5">
                    {c.borradoresPendientes} pendiente{c.borradoresPendientes === 1 ? "" : "s"} de aprobación
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
