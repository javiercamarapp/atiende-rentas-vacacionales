// Base portada tal cual de atiende-restaurantes (src/components/ui/badge.tsx,
// D-015), extendida con las variantes de estado de conexión de canal propias
// de esta vertical (D-017, D-019, DEFINICION-DE-HECHO §1): cada estado tiene
// su propio color Y su propio texto — el color nunca es la única señal.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",

        // Estados de conexión de canal (enum cerrado de getConnectionState(),
        // D-017/RV17 §6.2) + "simulador" e "ical", que la UI también debe
        // poder distinguir de forma inequívoca (D-019, REQ-164).
        "no-conectado": "border-transparent bg-muted text-muted-foreground",
        simulador:
          "border-transparent bg-[hsl(var(--estado-simulador)/0.15)] text-[hsl(var(--estado-simulador))]",
        ical: "border-transparent bg-[hsl(var(--estado-ical)/0.15)] text-[hsl(var(--estado-ical))]",
        "partner-pendiente":
          "border-transparent bg-[hsl(var(--estado-partner-pendiente)/0.15)] text-[hsl(var(--estado-partner-pendiente))]",
        sandbox: "border-transparent bg-[hsl(var(--estado-sandbox)/0.15)] text-[hsl(var(--estado-sandbox))]",
        produccion:
          "border-transparent bg-[hsl(var(--estado-produccion)/0.15)] text-[hsl(var(--estado-produccion))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export type EstadoConexionCanal =
  | "no_conectado"
  | "simulador"
  | "ical"
  | "bloqueado_por_partner"
  | "sandbox"
  | "produccion";

// Copy honesto por estado (D-017: "producción" nunca se afirma sin
// evidencia; PLAN-CONSTRUCCION.md §6: Booking.com usa etiquetas propias como
// "pausado por el canal", nunca genéricas). El componente que consuma este
// mapa en Lote 4 puede sobreescribir la etiqueta para casos especiales
// (p. ej. Booking.com "SIN EVIDENCIA"), pero el valor por defecto ya es
// honesto y nunca dice "conectado"/"producción" sin calificar.
export const ETIQUETA_ESTADO_CONEXION: Record<EstadoConexionCanal, string> = {
  no_conectado: "No conectado",
  simulador: "SIMULADOR — desarrollo/pruebas",
  ical: "iCal",
  bloqueado_por_partner: "Bloqueado por partner",
  sandbox: "Sandbox",
  produccion: "Producción",
};

const VARIANTE_POR_ESTADO: Record<EstadoConexionCanal, BadgeProps["variant"]> = {
  no_conectado: "no-conectado",
  simulador: "simulador",
  ical: "ical",
  bloqueado_por_partner: "partner-pendiente",
  sandbox: "sandbox",
  produccion: "produccion",
};

// Badge de estado de conexión: siempre color + texto explícito juntos, nunca
// un punto de color solo (DEFINICION-DE-HECHO §1, regla de oro). `etiqueta`
// permite sobreescribir el texto por defecto para casos honestos especiales
// (p. ej. "pausado por el canal", "SIN EVIDENCIA") sin tocar el color base.
export function EstadoConexionBadge({
  estado,
  etiqueta,
  className,
}: {
  estado: EstadoConexionCanal;
  etiqueta?: string;
  className?: string;
}) {
  return (
    <Badge variant={VARIANTE_POR_ESTADO[estado]} className={className}>
      {etiqueta ?? ETIQUETA_ESTADO_CONEXION[estado]}
    </Badge>
  );
}

export { Badge, badgeVariants };
