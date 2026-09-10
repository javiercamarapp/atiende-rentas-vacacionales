// AdminSidebar real de Atiende (LOTES.md Lote 4, punto 1), portado del
// patrón verificado de atiende-restaurantes (src/components/admin/
// AdminSidebar.tsx, solo lectura): acordeón por grupo (ANÁLISIS siempre
// abierto, el resto se recuerda entre sesiones), logo + ThemeSelector,
// bloque de usuario/logout. Adaptado a `react-router-dom` (NavLink en vez
// del callback `onSectionChange` del hermano, porque este panel sí navega
// por URL) y a las `menuSections` de rentas vacacionales de
// docs/fase2/PLAN-CONSTRUCCION.md §1.7.
//
// Items sin página real detrás quedan `disabled` con etiqueta "Pronto" —
// igual que en el hermano — porque cada uno pertenece a un lote paralelo
// (5-10) que aún no ha aterrizado. Solo las 3 rutas de este lote
// (Calendario maestro, Matriz de conectividad, Monitor de sincronización)
// están activas; el resto documenta su lote de origen en el título.
import { useState } from "react";
import {
  Bell,
  ChevronDown,
  CreditCard,
  HelpCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserRound,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { AtiendeMark, AtiendeWordmark, ThemeSelector, cn } from "@atiende-rv/ui-atiende";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { listarAlertas } from "../../pages/monitor-sync/api";
import { MENU_SECTIONS } from "./admin-menu-sections";

const CLAVE_GRUPO_ABIERTO = "atiende-rv-sidebar-grupo-abierto";

/** `abiertoMovil`/`onCerrarMovil`: por debajo de `md` el sidebar es un
 * drawer superpuesto, cerrado por defecto (LOTES.md Lote 4: "usable en
 * 375 px" — decisión explícita de NO heredar el gap de mobile de
 * Restaurantes documentado en PLAN-CONSTRUCCION.md §1.7, ya que aquí sí
 * hay caso de uso in-situ en pantalla angosta). En `md+` estas props se
 * ignoran (el sidebar siempre está visible, estático). */
export function AdminSidebar({
  abiertoMovil = false,
  onCerrarMovil,
}: {
  abiertoMovil?: boolean;
  onCerrarMovil?: () => void;
}) {
  const { usuario, logout } = useSesion();
  const [collapsed, setCollapsed] = useState(false);
  // Badge de alertas abiertas (Auditoría 2, P-02): visible sin entrar a la
  // página de Alertas, igual que el patrón de "N conflicto(s) pendiente(s)"
  // ya usado en MonitorSyncPage. Se ignora el error silenciosamente aquí —
  // el sidebar no es lugar para mostrar una caja de error de red; la propia
  // página de Alertas sí la muestra si la recarga falla.
  const alertasActivas = useQueryLigero(() => listarAlertas("activa"), []);
  const totalAlertasActivas = alertasActivas.datos?.alertas.length ?? 0;
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLAVE_GRUPO_ABIERTO) || "CALENDARIO";
    } catch {
      return "CALENDARIO";
    }
  });

  const alternarGrupo = (titulo: string) => {
    setGrupoAbierto((actual) => {
      const nuevo = actual === titulo ? null : titulo;
      try {
        localStorage.setItem(CLAVE_GRUPO_ABIERTO, nuevo ?? "");
      } catch {
        // sidebar sigue funcionando sin persistencia entre sesiones.
      }
      return nuevo;
    });
  };

  const gruposVisibles = MENU_SECTIONS.filter(
    (g) => !g.soloAdmin || usuario?.rol === "superadmin" || usuario?.rol === "admin_gestora",
  );

  return (
    <>
      {abiertoMovil && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onCerrarMovil}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Navegación principal"
        className={cn(
          "flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0 h-screen transition-transform duration-300",
          "fixed inset-y-0 left-0 z-40 md:sticky md:top-0 md:z-auto md:translate-x-0",
          abiertoMovil ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16 w-64" : "w-64",
        )}
      >
      <div className="h-14 px-3.5 flex items-center justify-between shrink-0 border-b border-sidebar-border">
        {!collapsed ? (
          <AtiendeWordmark markClassName="h-6 w-auto" />
        ) : (
          <AtiendeMark className="h-6 w-auto md:block hidden" />
        )}
        {collapsed && <AtiendeWordmark markClassName="h-6 w-auto md:hidden" />}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            className="hidden md:flex w-6 h-6 rounded-md border border-sidebar-border items-center justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/60 transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={onCerrarMovil}
            aria-label="Cerrar menú"
            className="md:hidden w-6 h-6 rounded-md border border-sidebar-border flex items-center justify-center text-sidebar-foreground/70"
          >
            <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
        {gruposVisibles.map((grupo) => {
          const abierta = grupo.siempreAbierto || grupoAbierto === grupo.titulo;
          return (
            <div key={grupo.titulo}>
              {!collapsed &&
                (grupo.siempreAbierto ? (
                  <p className="px-2.5 mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-sidebar-foreground/60">
                    {grupo.titulo}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => alternarGrupo(grupo.titulo)}
                    aria-expanded={abierta}
                    className="w-full flex items-center justify-between px-2.5 mb-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
                  >
                    {grupo.titulo}
                    <ChevronDown className={cn("w-3 h-3 transition-transform", abierta && "rotate-180")} />
                  </button>
                ))}
              {(abierta || collapsed) && (
                <div className="space-y-0.5">
                  {grupo.items.map((item) => (
                    <div key={item.id}>
                      {item.ruta ? (
                        <NavLink
                          to={item.ruta}
                          onClick={onCerrarMovil}
                          className={({ isActive }) =>
                            cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                            )
                          }
                        >
                          <item.icono className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                          {!collapsed && (
                            <span className="flex-1 flex items-center justify-between min-w-0 gap-2">
                              <span className="truncate">{item.etiqueta}</span>
                              {item.id === "alertas" && totalAlertasActivas > 0 && (
                                <span
                                  aria-label={`${totalAlertasActivas} alerta(s) abierta(s)`}
                                  className="shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground"
                                >
                                  {totalAlertasActivas}
                                </span>
                              )}
                            </span>
                          )}
                        </NavLink>
                      ) : (
                        <div
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-sidebar-foreground/40 cursor-not-allowed"
                          title={item.lote ? `Llega en ${item.lote}` : undefined}
                        >
                          <item.icono className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                          {!collapsed && (
                            <span className="flex-1 flex items-center justify-between min-w-0 gap-2">
                              <span className="truncate">{item.etiqueta}</span>
                              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-sidebar-foreground/40 shrink-0">
                                Pronto
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bloque de cuenta — mismo patrón de dos capas que dashboard/chrome.tsx
          de Likida (y el mismo fix ya aplicado en atiende-restaurantes/
          citas-reservaciones/licitaciones/hoteles): zona hundida a todo lo
          ancho (bg-sidebar-accent + sombra interior) y tarjeta de usuario
          SOBREPUESTA (margen negativo, fondo/borde/sombra propios). */}
      <div className="shrink-0 border-t border-sidebar-border">
        {!collapsed && (
          <div className="bg-sidebar-accent/60 px-2 pt-2 pb-5 space-y-0.5 shadow-[inset_0_2px_5px_-2px_rgba(0,0,0,0.08)]">
            <button
              type="button"
              disabled
              title="Centro de ayuda: todavía no existe esta sección en Atiende Rentas."
              className="mb-1 flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-sidebar-border bg-sidebar px-3 py-1.5 text-[13px] text-sidebar-foreground/50"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">Centro de ayuda</span>
            </button>
            {/* Mismos 5 ítems y mismo orden que el bloque ABAJO real de
                Likida; activo = píldora sólida bg-primary (azul de
                atiende). "Mi perfil" es la única ruta real hoy (/cuenta) —
                el resto sigue "Pronto". */}
            <button
              type="button"
              disabled
              title="Notificaciones: todavía no existe una sección propia en Atiende Rentas."
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-[13px] text-sidebar-foreground/40 cursor-not-allowed"
            >
              <span className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">Notificaciones</span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-sidebar-foreground/40 shrink-0">Pronto</span>
            </button>
            <NavLink
              to="/cuenta"
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
                )
              }
            >
              <UserRound className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">Mi perfil</span>
            </NavLink>
            <button
              type="button"
              disabled
              title="Plan y facturación: todavía no existe esta pantalla en Atiende Rentas."
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-[13px] text-sidebar-foreground/40 cursor-not-allowed"
            >
              <span className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">Plan y facturación</span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-sidebar-foreground/40 shrink-0">Pronto</span>
            </button>
            <button
              type="button"
              disabled
              title="Configuración: todavía no existe esta pantalla en Atiende Rentas."
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-[13px] text-sidebar-foreground/40 cursor-not-allowed"
            >
              <span className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">Configuración</span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-sidebar-foreground/40 shrink-0">Pronto</span>
            </button>
            <div className="pt-1.5 pb-0.5 flex justify-center">
              <ThemeSelector />
            </div>
          </div>
        )}

        <div className={cn("relative px-2 pb-2", collapsed ? "-mt-1" : "-mt-3.5")}>
          {!collapsed ? (
            <div className="flex items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar p-2 shadow-sm">
              <NavLink
                to="/cuenta"
                className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium shrink-0"
                title="Mi cuenta"
              >
                {usuario?.rol?.charAt(0).toUpperCase() ?? "A"}
              </NavLink>
              <NavLink to="/cuenta" className="flex-1 min-w-0">
                <p className="text-[13px] text-sidebar-foreground truncate">{usuario?.rol ?? "Sin sesión"}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-sidebar-foreground/60">
                  {usuario?.colaboradorNivel ?? "—"}
                </p>
              </NavLink>
              <button
                type="button"
                onClick={logout}
                aria-label="Cerrar sesión"
                className="text-destructive hover:opacity-70 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={logout}
              aria-label="Cerrar sesión"
              className="w-full flex items-center justify-center py-1.5 rounded-xl border border-sidebar-border bg-sidebar shadow-sm text-sidebar-foreground/70 hover:text-destructive"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      </aside>
    </>
  );
}
