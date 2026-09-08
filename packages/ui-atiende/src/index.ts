// Barril público de @atiende-rv/ui-atiende. Solo activos visuales portados
// de atiende-restaurantes (D-015) + las variantes de estado propias de esta
// vertical — sin lógica de negocio ni secretos (docs/fase2/LOTES.md, Lote 0).
export { cn } from "./lib/utils";
export { useIsMobile } from "./hooks/use-mobile";

export { AtiendeMark, AtiendeWordmark } from "./AtiendeLogo";
export { ThemeSelector } from "./ThemeSelector";
export { StatCard, TrendStatCard } from "./StatCard";

export { Button, type ButtonProps } from "./ui/button";
export { buttonVariants } from "./ui/button-variants";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./ui/table";
export { Badge, EstadoConexionBadge, type BadgeProps } from "./ui/badge";
export { badgeVariants } from "./ui/badge-variants";
export { ETIQUETA_ESTADO_CONEXION, type EstadoConexionCanal } from "./ui/badge-estado-conexion";
