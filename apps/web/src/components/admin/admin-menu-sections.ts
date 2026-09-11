// Datos del menú de AdminSidebar, separados a su propio archivo (react-refresh/
// only-export-components: un archivo de componente no debe exportar también
// datos/constantes). Ver AdminSidebar.tsx para el render.
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Activity,
  CalendarDays,
  Radio,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  Wallet,
  Tag,
  FileBarChart,
  Building2,
  Link2,
  Globe2,
  Bot,
  ShieldCheck,
  CreditCard,
  Scale,
} from "lucide-react";

interface ItemMenu {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
  ruta?: string;
  lote?: string;
}

interface GrupoMenu {
  titulo: string;
  siempreAbierto?: boolean;
  soloAdmin?: boolean;
  items: ItemMenu[];
}

// Análogas por función a las de Restaurantes (dominio distinto): ver
// docs/fase2/PLAN-CONSTRUCCION.md §1.7 para la asignación exacta de cada
// sección a su lote de origen.
export const MENU_SECTIONS: GrupoMenu[] = [
  {
    titulo: "ANÁLISIS",
    siempreAbierto: true,
    items: [
      { id: "monitor-sync", etiqueta: "Monitor de sincronización", icono: Activity, ruta: "/monitor-sync" },
      { id: "alertas", etiqueta: "Alertas", icono: AlertTriangle, ruta: "/monitor-sync/alertas" },
    ],
  },
  {
    titulo: "CALENDARIO",
    items: [
      { id: "calendario", etiqueta: "Calendario maestro", icono: CalendarDays, ruta: "/calendario" },
      { id: "conectividad", etiqueta: "Matriz de conectividad", icono: Radio, ruta: "/conectividad" },
      { id: "canales-mexico", etiqueta: "Canales México (RV22)", icono: Globe2, ruta: "/canales-mexico" },
      { id: "conflictos", etiqueta: "Conflictos", icono: AlertTriangle, ruta: "/monitor-sync/conflictos" },
    ],
  },
  {
    titulo: "OPERACIÓN",
    items: [
      { id: "limpieza", etiqueta: "Limpieza/mantenimiento", icono: Sparkles, ruta: "/operacion" },
      { id: "mensajeria", etiqueta: "Mensajería", icono: MessageSquare, ruta: "/mensajes" },
    ],
  },
  {
    titulo: "NEGOCIO",
    items: [
      { id: "finanzas", etiqueta: "Finanzas/owners", icono: Wallet, ruta: "/finanzas" },
      { id: "pricing", etiqueta: "Pricing", icono: Tag, ruta: "/pricing" },
      { id: "reportes", etiqueta: "Reportes", icono: FileBarChart, ruta: "/reportes" },
      { id: "facturacion", etiqueta: "Facturación", icono: CreditCard, ruta: "/facturacion" },
    ],
  },
  {
    titulo: "PLATAFORMA",
    soloAdmin: true,
    items: [
      { id: "propiedades", etiqueta: "Propiedades y unidades", icono: Building2, ruta: "/propiedades" },
      { id: "cuentas-canal", etiqueta: "Cuentas de canal", icono: Link2, ruta: "/cuentas-canal" },
      { id: "agentes", etiqueta: "Automatización agéntica", icono: Bot, ruta: "/agentes" },
      { id: "backoffice", etiqueta: "Back office", icono: ShieldCheck, ruta: "/administracion" },
      { id: "estadisticas", etiqueta: "Panel superadmin", icono: BarChart3, ruta: "/backoffice/superadmin" },
      // REQ-151: bandeja de solicitudes ARCO/RGPD.
      { id: "solicitudes-arco", etiqueta: "Solicitudes ARCO/RGPD", icono: Scale, ruta: "/legal/solicitudes-arco" },
    ],
  },
];
