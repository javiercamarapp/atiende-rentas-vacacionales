// Base portada tal cual de atiende-restaurantes (src/components/ui/badge.tsx,
// D-015), extendida con las variantes de estado de conexión de canal propias
// de esta vertical (D-017, D-019, DEFINICION-DE-HECHO §1): cada estado tiene
// su propio color Y su propio texto — el color nunca es la única señal.
import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";
import { badgeVariants } from "./badge-variants";
import { ETIQUETA_ESTADO_CONEXION, type EstadoConexionCanal } from "./badge-estado-conexion";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

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

export { Badge };
