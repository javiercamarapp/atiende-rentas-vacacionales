import { AlertTriangle } from "lucide-react";

// Banner obligatorio de todo Lote 0 (instrucción del constructor + regla de
// oro de docs/fase2/DEFINICION-DE-HECHO.md §1): ninguna pantalla de este
// scaffold puede insinuar una conexión productiva. Visible sin scroll, sin
// tooltip, en cada sección vacía del panel.
export function BannerEntornoDesarrollo() {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-lg border border-[hsl(var(--estado-partner-pendiente)/0.4)] bg-[hsl(var(--estado-partner-pendiente)/0.12)] px-4 py-3 text-sm text-foreground"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-[hsl(var(--estado-partner-pendiente))]" strokeWidth={1.75} />
      <span className="font-medium">Entorno de desarrollo — sin conexiones productivas</span>
    </div>
  );
}
