import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { AtiendeMark } from "@atiende-rv/ui-atiende";
import { AdminSidebar } from "./AdminSidebar";
import { BannerEntornoDesarrollo } from "../BannerEntornoDesarrollo";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { peticion } from "../../lib/api/cliente";

interface RespuestaSalud {
  status: string;
  entorno: string;
  etiquetaEntorno: string;
  aviso: string;
}

/** Layout admin real (sustituye `DevShellNav`, LOTES.md Lote 4 punto 1):
 * sidebar + banner de entorno de desarrollo cuando la API corre con
 * simuladores/entorno no productivo, más una barra superior solo-móvil
 * (`md:hidden`) con el botón que abre el sidebar como drawer — decisión
 * explícita de SÍ dar experiencia mobile real (a diferencia del gap
 * documentado en Restaurantes, PLAN-CONSTRUCCION.md §1.7), porque
 * "usable en 375 px" es un requisito explícito de este lote. El banner se
 * decide por lo que la propia API declara en `GET /health`
 * (`etiquetaEntorno`) — nunca se asume "producción" del lado del cliente;
 * si la API no responde, el default es mostrar el banner (el estado más
 * conservador, D-017). */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { datos } = useQueryLigero<RespuestaSalud>(() => peticion("/health"), []);
  const esProduccion = datos?.entorno === "production" && datos?.etiquetaEntorno === "producción";
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar abiertoMovil={menuMovilAbierto} onCerrarMovil={() => setMenuMovilAbierto(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-12 shrink-0 border-b border-border flex items-center gap-2 px-3 bg-card">
          <button
            type="button"
            onClick={() => setMenuMovilAbierto(true)}
            aria-label="Abrir menú de navegación"
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground hover:bg-muted"
          >
            <Menu className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <AtiendeMark className="h-5 w-auto" />
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 pb-0">{!esProduccion && <BannerEntornoDesarrollo />}</div>
          {children}
        </main>
      </div>
    </div>
  );
}
