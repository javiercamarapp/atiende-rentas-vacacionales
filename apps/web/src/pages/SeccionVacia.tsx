import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { BannerEntornoDesarrollo } from "../components/BannerEntornoDesarrollo";

// Página vacía genérica por sección (Lote 0: scaffold puro, sin dominio
// todavía). Cada sección real llega en su propio lote (docs/fase2/LOTES.md):
// Calendario/Canales → Lote 4; Operación → Lote 5; Mensajes → Lote 6;
// Finanzas/Reportes → Lote 7; Propiedades/Administración → Lote 8.
export function SeccionVacia({
  titulo,
  icono: Icono,
  lote,
}: {
  titulo: string;
  icono: LucideIcon;
  lote: string;
}) {
  return (
    <div className="p-6 space-y-4">
      <BannerEntornoDesarrollo />
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icono className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle className="text-lg">{titulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sección aún sin contenido — es un esqueleto del monorepo (Lote 0). La
            funcionalidad real de "{titulo}" se construye en {lote}, según
            docs/fase2/LOTES.md.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
