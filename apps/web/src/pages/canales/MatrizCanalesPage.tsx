import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EstadoConexionBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@atiende-rv/ui-atiende";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { listarCatalogoCanales, type ViaCanalCatalogo } from "./api";
import { aEstadoBadgeCatalogo, etiquetaEstadoCatalogo, LEYENDA_NIVELES } from "./estadoCatalogo";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";

function BadgeNivel({ nivel }: { nivel: "A" | "B" | "C" }) {
  const color =
    nivel === "A"
      ? "bg-[hsl(var(--estado-produccion))]/15 text-[hsl(var(--estado-produccion))]"
      : nivel === "B"
        ? "bg-[hsl(var(--estado-sandbox))]/15 text-[hsl(var(--estado-sandbox))]"
        : "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{nivel}</span>;
}

/**
 * Matriz de conectividad — canales de distribución usados en México
 * (Lote 3.4, RV22): TODOS los canales del catálogo declarativo (`canal_
 * catalogo`, migración 0110), agrupados por nivel A/B/C con leyenda
 * explícita, cada vía con su estado honesto, capacidades declaradas,
 * latencia+confianza, y un enlace al asistente de conexión. A diferencia
 * de `../conectividad/MatrizConectividadPage.tsx` (Lote 4, solo Airbnb/
 * Vrbo/Booking con cuenta ya creada), esta página cubre el catálogo
 * COMPLETO de ~20 canales, tengan o no una cuenta configurada — es la
 * vista de "qué existe y qué hace falta", no la de cuentas activas.
 */
export function MatrizCanalesPage() {
  const catalogoQuery = useQueryLigero(() => listarCatalogoCanales(), []);
  const canales = catalogoQuery.datos?.canales ?? [];

  const filas: Array<{ canalCodigo: string; nombre: string; via: ViaCanalCatalogo }> = canales.flatMap((c) =>
    c.vias.map((via) => ({ canalCodigo: c.canalCodigo, nombre: c.nombre, via })),
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Canales de distribución — México</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo completo por nivel (RV22) — estado honesto por vía técnica, nunca "conectado" sin evidencia real de
          sincronización.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {(["A", "B", "C"] as const).map((nivel) => (
          <div key={nivel} className="flex items-start gap-2 rounded-lg border border-border p-2">
            <BadgeNivel nivel={nivel} />
            <div>
              <p className="text-xs font-semibold">{LEYENDA_NIVELES[nivel].titulo}</p>
              <p className="text-[11px] text-muted-foreground">{LEYENDA_NIVELES[nivel].descripcion}</p>
            </div>
          </div>
        ))}
      </div>

      <ErrorApiAlerta error={catalogoQuery.error} />

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nivel</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Vía técnica</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Latencia declarada</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(({ canalCodigo, nombre, via }) => (
              <TableRow key={`${canalCodigo}-${via.viaTecnica}`}>
                <TableCell className="align-top">
                  <BadgeNivel nivel={via.nivel} />
                </TableCell>
                <TableCell className="font-medium align-top">
                  {nombre}
                  {via.puenteCanalCodigo && (
                    <p className="text-[11px] text-muted-foreground">vía puente: {via.puenteCanalCodigo}</p>
                  )}
                </TableCell>
                <TableCell className="align-top text-xs font-mono">{via.viaTecnica}</TableCell>
                <TableCell className="align-top space-y-1">
                  <EstadoConexionBadge estado={aEstadoBadgeCatalogo(via.estadoHonesto)} etiqueta={etiquetaEstadoCatalogo(via.estadoHonesto)} />
                  {via.motivo && <p className="text-[11px] text-muted-foreground max-w-[260px]">{via.motivo}</p>}
                </TableCell>
                <TableCell className="align-top text-xs">
                  {via.latencia ? (
                    <>
                      <p className="font-mono">{via.latencia.texto}</p>
                      <p className="text-muted-foreground">confianza {via.latencia.confianza}</p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">n/a</span>
                  )}
                </TableCell>
                <TableCell className="align-top text-[11px] text-muted-foreground italic">{via.fuente}</TableCell>
                <TableCell className="align-top">
                  <Link
                    to={`/canales-mexico/${canalCodigo}?via=${encodeURIComponent(via.viaTecnica)}`}
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    Ver asistente
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Sobre esta matriz</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            Ningún canal se muestra "conectado" por marcarlo manualmente — el estado cambia únicamente con evidencia
            real de sincronización, aunque el código del adaptador y su simulador ya existan y estén probados.
          </p>
          <p>
            Los canales de Mercado Libre y Facebook Marketplace no sincronizan disponibilidad: son solo publicación
            manual, sin motor de reservas propio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
