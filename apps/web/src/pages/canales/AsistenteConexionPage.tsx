import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, EstadoConexionBadge } from "@atiende-rv/ui-atiende";
import { useQueryLigero } from "../../lib/api/queryLigero";
import { obtenerAsistenteConexion } from "./api";
import { aEstadoBadgeCatalogo, etiquetaEstadoCatalogo } from "./estadoCatalogo";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";

/**
 * Asistente de conexión por canal (Lote 3.4, RV22): qué necesita el
 * usuario para avanzar (solicitud de partner, credenciales, URL iCal) —
 * SIN NINGÚN botón para "marcar como conectado" (RV22-R-06): el único
 * camino real hacia un estado distinto es cargar credenciales/URL reales
 * y esperar evidencia de sincronización (matriz de conectividad y
 * `/cuentas-canal`, fuera de esta pantalla).
 */
export function AsistenteConexionPage() {
  const { canalCodigo = "" } = useParams<{ canalCodigo: string }>();
  const [params] = useSearchParams();
  const via = params.get("via") ?? undefined;

  const asistenteQuery = useQueryLigero(() => obtenerAsistenteConexion(canalCodigo, via), [canalCodigo, via]);
  const info = asistenteQuery.datos;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <Link to="/canales-mexico" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="w-4 h-4" /> Volver a la matriz de canales
      </Link>

      <ErrorApiAlerta error={asistenteQuery.error} />

      {info && (
        <>
          <div>
            <h1 className="text-lg font-display font-semibold">{info.nombre}</h1>
            <p className="text-xs text-muted-foreground font-mono">
              Nivel {info.nivel} · vía {info.viaTecnica}
            </p>
          </div>

          <EstadoConexionBadge estado={aEstadoBadgeCatalogo(info.estadoHonesto)} etiqueta={etiquetaEstadoCatalogo(info.estadoHonesto)} />

          {info.motivo && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Motivo</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {info.motivo}
                <p className="text-[11px] text-muted-foreground italic mt-1">Fuente: {info.fuente}</p>
              </CardContent>
            </Card>
          )}

          {info.puenteCanalCodigo && (
            <Card>
              <CardContent className="text-sm pt-4">
                Este canal se conecta <strong>vía puente</strong>: a través de{" "}
                <Link to={`/canales-mexico/${info.puenteCanalCodigo}`} className="text-primary hover:underline">
                  {info.puenteCanalCodigo}
                </Link>
                , no con una integración directa propia.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Qué necesitas conseguir</CardTitle>
            </CardHeader>
            <CardContent>
              {info.requisitosCredenciales.length > 0 ? (
                <ul className="list-disc list-inside text-sm space-y-1">
                  {info.requisitosCredenciales.map((req) => (
                    <li key={req}>{req}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ningún requisito de credenciales aplica a este canal.</p>
              )}
              {info.urlProcesoOficial && (
                <a
                  href={info.urlProcesoOficial}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Ir al proceso oficial <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pasos</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside text-sm space-y-1">
                {info.pasos.map((paso, i) => (
                  <li key={i}>{paso}</li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {info.avisoNoAutoconexion}
          </div>
        </>
      )}
    </div>
  );
}
