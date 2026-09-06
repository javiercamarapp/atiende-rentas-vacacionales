import { AlertTriangle } from "lucide-react";
import type { CanalMensajeria } from "../api";

const NOMBRE_CANAL: Record<CanalMensajeria, string> = {
  airbnb: "Airbnb",
  vrbo: "Vrbo",
  booking: "Booking.com",
};

/** Indicador de canal simulado (LOTES.md Lote 6: "indicador de canal
 * simulado"). Ningún adaptador real de mensajería existe hoy
 * (`packages/adapters` no declara `messaging` para ningún canal) — este
 * badge es deliberadamente visible en cada envío para que nadie confunda
 * el simulador con una conexión productiva (D-019). */
export function BadgeCanalSimulado({ canal }: { canal: CanalMensajeria }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
      title={`Sin canal de mensajería real conectado para ${NOMBRE_CANAL[canal]} — este mensaje se envía por el SIMULADOR de desarrollo/pruebas`}
    >
      <AlertTriangle className="w-3 h-3" />
      {NOMBRE_CANAL[canal]} · simulado
    </span>
  );
}
