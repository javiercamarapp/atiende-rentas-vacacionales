// Separado de badge.tsx (react-refresh/only-export-components: un archivo
// de componente no debe exportar también valores no-componente).
import { cva } from "class-variance-authority";

export const badgeVariants = cva(
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
