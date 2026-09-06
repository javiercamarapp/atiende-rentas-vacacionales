import { useState } from "react";
import { Check, X } from "lucide-react";
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
import { listarCuentasCanal } from "./api";
import { LISTA_CANALES, type CanalCodigo } from "./catalogoCanales";
import { aEstadoBadge, etiquetaHonesta } from "./estadoConexion";
import { edadLegible } from "../../lib/tiempo/edad";
import { FormularioConectarIcal } from "./FormularioConectarIcal";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";

function IconoCapacidad({ activo, etiqueta }: { activo: boolean; etiqueta: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      title={`${etiqueta}: ${activo ? "sí" : "no"}`}
      aria-label={`${etiqueta}: ${activo ? "sí" : "no"}`}
    >
      {activo ? <Check className="w-3.5 h-3.5 text-[hsl(var(--estado-produccion))]" /> : <X className="w-3.5 h-3.5 text-muted-foreground/50" />}
      {etiqueta}
    </span>
  );
}

/** Matriz de conectividad por cuenta de canal (LOTES.md Lote 4 punto 3,
 * H-015/H-016): estado honesto + capacidades declaradas + latencia
 * declarada con nota de confianza + última sync + formulario iCal. Cada
 * canal del catálogo (docs/fase2/PLAN-CONSTRUCCION.md §6) se muestra
 * siempre, tenga o no una cuenta creada — "no conectado" es un estado
 * honesto, no una fila ausente. */
export function MatrizConectividadPage() {
  const cuentasQuery = useQueryLigero(() => listarCuentasCanal(), []);
  const [formularioAbierto, setFormularioAbierto] = useState<CanalCodigo | null>(null);

  const cuentas = cuentasQuery.datos?.cuentas ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Matriz de conectividad</h1>
        <p className="text-sm text-muted-foreground">
          Estado honesto por canal — nunca "producción" sin evidencia reciente de sync (D-017).
        </p>
      </div>

      <ErrorApiAlerta error={cuentasQuery.error} />

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Capacidades declaradas</TableHead>
              <TableHead>Latencia declarada</TableHead>
              <TableHead>Última sync</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LISTA_CANALES.map((info) => {
              const cuentasDelCanal = cuentas.filter((c) => c.canalCodigo === info.codigo);
              const filas = cuentasDelCanal.length > 0 ? cuentasDelCanal : [null];

              return filas.map((cuenta, idx) => (
                <TableRow key={`${info.codigo}-${cuenta?.id ?? "sin-cuenta"}-${idx}`}>
                  <TableCell className="font-medium align-top">
                    {info.nombre}
                    <p className="text-[11px] text-muted-foreground font-normal">{info.viaDisponibleFase2}</p>
                  </TableCell>
                  <TableCell className="align-top">{cuenta?.nombre ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="align-top space-y-1">
                    <EstadoConexionBadge
                      estado={aEstadoBadge(cuenta?.estadoConexion ?? "no_conectado")}
                      etiqueta={etiquetaHonesta(info.codigo, cuenta?.estadoConexion ?? "no_conectado")}
                    />
                    {cuenta?.esSimulador && (
                      <p className="text-[11px] text-[hsl(var(--estado-simulador))]">SIMULADOR — no es tráfico real</p>
                    )}
                    {info.bloqueoPartnerDirecto && (!cuenta || cuenta.estadoConexion === "no_conectado" || cuenta.estadoConexion === "partner_pendiente") && (
                      <p className="text-[11px] text-muted-foreground">
                        {info.bloqueoPartnerDirecto.motivo} <span className="italic">({info.bloqueoPartnerDirecto.cita})</span>
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-0.5">
                      <IconoCapacidad activo={info.capacidades.import} etiqueta="Import" />
                      <IconoCapacidad activo={info.capacidades.export} etiqueta="Export" />
                      <IconoCapacidad activo={info.capacidades.tarifas} etiqueta="Tarifas" />
                      <IconoCapacidad activo={info.capacidades.mensajes} etiqueta="Mensajes" />
                    </div>
                  </TableCell>
                  <TableCell className="align-top max-w-[220px]">
                    <p className="font-mono text-xs">
                      {info.latencia.texto}{" "}
                      <span className="text-muted-foreground">
                        (confianza {info.latencia.confianza === "sin_evidencia" ? "sin evidencia" : info.latencia.confianza})
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">{info.latencia.nota}</p>
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    {cuenta ? edadLegible(cuenta.ultimaSincronizacionExitosaEn) : "sin cuenta configurada"}
                  </TableCell>
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {LISTA_CANALES.map((info) => (
          <Card key={info.codigo}>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                {info.nombre}
                {info.codigo !== "booking" && (
                  <button
                    type="button"
                    className="text-xs font-normal text-primary hover:underline"
                    onClick={() => setFormularioAbierto((c) => (c === info.codigo ? null : info.codigo))}
                  >
                    {formularioAbierto === info.codigo ? "Cerrar" : "Conectar iCal"}
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{info.notaAntiParidad}</p>
              {info.codigo === "booking" ? (
                <p className="text-xs rounded-md border border-border bg-muted/40 p-2">
                  No disponible — solo vía channel manager certificado o extranet manual. Sin botón de
                  "conectar directo" para Booking.com en ningún flujo de onboarding (PLAN-CONSTRUCCION.md §6).
                </p>
              ) : (
                formularioAbierto === info.codigo && (
                  <FormularioConectarIcal canal={info.codigo} onConectado={() => { setFormularioAbierto(null); cuentasQuery.recargar(); }} />
                )
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
