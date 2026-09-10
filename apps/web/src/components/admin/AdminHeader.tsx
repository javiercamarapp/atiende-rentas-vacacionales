import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageCircle } from "lucide-react";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { listarAlertas } from "../../pages/monitor-sync/api";

/** Cada cuánto se refresca el contador de alertas activas del bell.
 * No hay `React Query` en este repo (LOTES.md Lote 4 punto 5 optó por el
 * equivalente ligero `useQueryLigero`, ver ese archivo) ni un canal
 * realtime para la tabla `alerta` expuesto a `apps/web` (solo REST vía
 * `apps/api`, a diferencia del bell de atiende-restaurantes que sí
 * escucha un `channel()` de Supabase) — un `setInterval` que llama
 * `recargar()` es el equivalente honesto a un `refetchInterval` con lo
 * que ya existe en el repo, sin inventar una dependencia nueva. */
const INTERVALO_REFRESCO_ALERTAS_MS = 30_000;

/** Cuánto se queda visible el aviso de "Chatea con tus datos" antes de
 * cerrarse solo — mismo criterio que un toast, sin instalar una librería
 * de toasts (no hay ninguna en el repo, ver búsqueda documentada en el
 * commit de este archivo) solo para esta única pastilla deshabilitada. */
const DURACION_AVISO_CHAT_MS = 4_000;

/** Header real de escritorio del panel admin (LOTES.md Lote 4 punto 1,
 * pieza que faltaba junto al sidebar y el bloque de cuenta ya cerrados):
 * `hidden md:flex` porque la barra `md:hidden` de `AdminLayout` ya cubre
 * el caso móvil con su propio patrón (drawer), y ambos headers son
 * mutuamente excluyentes por breakpoint, nunca los dos a la vez.
 *
 * Tres piezas, ninguna inventada:
 * - "Chatea con tus datos": no existe ningún backend de chat sobre los
 *   datos de esta vertical todavía — la pastilla queda "falsa-deshabilitada"
 *   (`aria-disabled`, no el atributo `disabled` nativo, para que el click
 *   siga disparando el aviso de por qué) en vez de simular una conversación
 *   o silenciarse sin explicar nada.
 * - Campana de notificaciones: reutiliza `listarAlertas("activa")`
 *   (mismo endpoint/mismo shape que ya consume el badge de la fila
 *   "Alertas" en `AdminSidebar.tsx`) — nunca una cifra inventada. Mientras
 *   no haya una respuesta real (carga inicial o el fetch falló) no se
 *   pinta ningún globo, ni siquiera "0": un cero afirmaría "no hay
 *   alertas" cuando en realidad todavía no lo sabemos.
 * - Píldora de fecha: `Intl.DateTimeFormat("es-MX", …)`, el mismo patrón
 *   ya usado en `AgentesPage.tsx`/`FacturacionPage.tsx` — se revisó primero
 *   y `date-fns` NO es una dependencia de este repo (packages/domain
 *   explícitamente prefirió `Temporal` sobre `date-fns-tz`, ver
 *   `packages/domain/src/fechas.ts`), así que no se añade solo por esta
 *   píldora.
 */
export function AdminHeader() {
  const navigate = useNavigate();

  const alertasQuery = useQueryLigero(() => listarAlertas("activa"), []);
  const { recargar: recargarAlertas } = alertasQuery;
  useEffect(() => {
    const id = setInterval(() => recargarAlertas(), INTERVALO_REFRESCO_ALERTAS_MS);
    return () => clearInterval(id);
  }, [recargarAlertas]);
  const totalAlertasActivas = alertasQuery.datos?.alertas.length;

  const [avisoChatVisible, setAvisoChatVisible] = useState(false);
  useEffect(() => {
    if (!avisoChatVisible) return;
    const id = setTimeout(() => setAvisoChatVisible(false), DURACION_AVISO_CHAT_MS);
    return () => clearTimeout(id);
  }, [avisoChatVisible]);

  const fechaHoy = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <header className="hidden md:flex h-14 shrink-0 items-center justify-end gap-2 border-b border-border bg-card px-4">
      <div className="relative">
        <button
          type="button"
          aria-disabled="true"
          title="Todavía no hay un backend de chat conectado a tus datos en Atiende Rentas Vacacionales."
          onClick={() => setAvisoChatVisible(true)}
          className="flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-muted-foreground/60 cursor-not-allowed hover:bg-muted/50 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
          Chatea con tus datos
        </button>
        {avisoChatVisible && (
          <div
            role="status"
            className="absolute right-0 top-10 z-30 w-64 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-elevated"
          >
            Todavía no hay un backend de chat conectado a tus datos en Atiende Rentas Vacacionales.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate("/monitor-sync/alertas")}
        aria-label={totalAlertasActivas ? `Alertas: ${totalAlertasActivas} activa(s)` : "Alertas"}
        className="relative w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0"
      >
        <Bell className="w-4 h-4" strokeWidth={1.75} />
        {!!totalAlertasActivas && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-mono font-medium leading-4 text-center">
            {totalAlertasActivas > 999 ? "999+" : totalAlertasActivas}
          </span>
        )}
      </button>

      <span className="font-mono text-xs text-muted-foreground border border-border rounded-full px-3 py-1.5 shrink-0">
        {fechaHoy}
      </span>
    </header>
  );
}
