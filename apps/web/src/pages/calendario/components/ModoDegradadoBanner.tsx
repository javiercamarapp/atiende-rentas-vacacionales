import { AlertTriangle } from "lucide-react";

/**
 * H-091/REQ-166 (§Operación-3): señalización visible en UI del modo
 * degradado de solo-lectura del calendario — se muestra únicamente cuando
 * `GET /health/detallado` reporta `modoDegradadoCalendario: true` (el
 * PRIMARIO, base de escritura, no responde). Mismo patrón visual (franja
 * ámbar, `role="status"`) que `SuperadminPage.tsx`/`MonitorSyncPage.tsx`
 * para otros avisos operativos no destructivos — esto NO es un error del
 * usuario, es un estado real de la infraestructura.
 */
export function ModoDegradadoBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-semibold">Modo degradado: calendario en solo lectura</p>
        <p className="text-amber-800 dark:text-amber-300">
          La base de datos primaria no responde. Puedes seguir consultando el calendario (servido desde la
          réplica de lectura), pero crear, modificar o cancelar reservas/bloqueos no está disponible por ahora,
          y el envío automático de disponibilidad a los canales quedó pausado hasta que un operador confirme
          que el primario volvió a responder.
        </p>
      </div>
    </div>
  );
}
