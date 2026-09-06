// Navegación provisional del shell de Lote 0 (scaffold), NO el `AdminSidebar`
// real: docs/fase2/LOTES.md dice explícitamente que `AdminSidebar.tsx` con
// `menuSections` reales del dominio es responsabilidad de Lote 4 ("necesita
// menuSections reales del dominio"). Este componente vive fuera de
// `apps/web/components/admin/` a propósito, para no ocupar el path que Lote 4
// va a crear, y usa una lista plana (sin acordeón) para no parecerse al
// patrón final y evitar cualquier confusión de que esto ya es el entregable
// de Lote 4.
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Building2,
  Radio,
  BookOpenCheck,
  Wrench,
  MessageSquare,
  Wallet,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { AtiendeWordmark, ThemeSelector, cn } from "@atiende-rv/ui-atiende";

export interface SeccionNav {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
}

// Secciones de la vertical de rentas vacacionales (nombres cortos pedidos
// para el shell de Lote 0; el agrupamiento por acordeón de
// docs/fase2/PLAN-CONSTRUCCION.md §1.7 —ANÁLISIS/CALENDARIO/OPERACIÓN/
// NEGOCIO/PLATAFORMA— es responsabilidad de Lote 4).
export const SECCIONES_NAV: SeccionNav[] = [
  { ruta: "/calendario", etiqueta: "Calendario", icono: CalendarDays },
  { ruta: "/propiedades", etiqueta: "Propiedades", icono: Building2 },
  { ruta: "/canales", etiqueta: "Canales", icono: Radio },
  { ruta: "/reservas", etiqueta: "Reservas", icono: BookOpenCheck },
  { ruta: "/operacion", etiqueta: "Operación", icono: Wrench },
  { ruta: "/mensajes", etiqueta: "Mensajes", icono: MessageSquare },
  { ruta: "/finanzas", etiqueta: "Finanzas", icono: Wallet },
  { ruta: "/reportes", etiqueta: "Reportes", icono: BarChart3 },
  { ruta: "/administracion", etiqueta: "Administración", icono: ShieldCheck },
];

export function DevShellNav() {
  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between gap-2">
        <AtiendeWordmark markClassName="h-6 w-auto" />
        <ThemeSelector />
      </div>
      <nav aria-label="Secciones de la plataforma" className="flex-1 overflow-y-auto p-2 space-y-1">
        {SECCIONES_NAV.map(({ ruta, etiqueta, icono: Icono }) => (
          <NavLink
            key={ruta}
            to={ruta}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-menu transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )
            }
          >
            <Icono className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{etiqueta}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
        Lote 0 — shell de desarrollo
      </div>
    </aside>
  );
}
