import { useEffect, useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
// Subpath ESPECÍFICO — ver el comentario equivalente en
// apps/web/src/pages/publica/PreciosPage.tsx (nunca el barril
// `@atiende-rv/domain/finanzas` completo desde código de navegador).
import { decimalDesdeCentavos } from "@atiende-rv/domain/finanzas/redondeo";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { ErrorApi } from "../../lib/api/cliente";
import { iniciarCheckout, obtenerMrrEstimado, obtenerPortal, obtenerSuscripcion, type EstadoSuscripcion, type MrrEstimado } from "./api";

function usd(centavos: number): string {
  return `$${decimalDesdeCentavos(centavos)} USD`;
}

const ETIQUETA_ESTADO: Record<EstadoSuscripcion["estado"], string> = {
  prueba: "En prueba",
  activa: "Activa",
  pago_pendiente: "Pago pendiente",
  cancelada: "Cancelada",
  vencida: "Vencida",
};

function SeccionMrrSuperadmin() {
  const [mrr, setMrr] = useState<MrrEstimado | "error" | null>(null);

  useEffect(() => {
    obtenerMrrEstimado()
      .then(setMrr)
      .catch(() => setMrr("error"));
  }, []);

  if (mrr === "error") return null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">MRR — vista de Superadmin</CardTitle>
      </CardHeader>
      <CardContent>
        {mrr === null ? (
          <p className="text-sm text-muted-foreground">Calculando…</p>
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground">
              {usd(mrr.mrrCentavos)}{" "}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                estimación
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {mrr.tenantsActivosContados} tenant(s) con suscripción activa — calculado en vivo, no es una cifra
              contable cerrada.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function FacturacionPage() {
  const { usuario } = useSesion();
  const [suscripcion, setSuscripcion] = useState<EstadoSuscripcion | "error" | null>(null);
  const [accion, setAccion] = useState<string | null>(null);

  function cargar() {
    obtenerSuscripcion()
      .then(setSuscripcion)
      .catch(() => setSuscripcion("error"));
  }

  useEffect(cargar, []);

  async function alActualizarPlan() {
    if (suscripcion === null || suscripcion === "error") return;
    setAccion(null);
    try {
      const { url } = await iniciarCheckout(suscripcion.planCodigo, suscripcion.addOnsActivos);
      window.location.href = url;
    } catch (err) {
      setAccion(err instanceof ErrorApi ? err.message : "No se pudo iniciar el checkout.");
    }
  }

  async function alAbrirPortal() {
    setAccion(null);
    try {
      const { url } = await obtenerPortal();
      window.location.href = url;
    } catch (err) {
      setAccion(err instanceof ErrorApi ? err.message : "No se pudo abrir el portal de facturación.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">Facturación</h1>

      {suscripcion === "error" && (
        <p className="mt-6 text-sm text-destructive">No se pudo cargar tu suscripción.</p>
      )}
      {suscripcion === null && <p className="mt-6 text-sm text-muted-foreground">Cargando…</p>}

      {suscripcion && suscripcion !== "error" && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{suscripcion.plan.nombre}</CardTitle>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {ETIQUETA_ESTADO[suscripcion.estado]}
              </span>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Unidades activas</dt>
                <dd className="text-foreground">{suscripcion.uso.unidadesActivas}</dd>
                <dt className="text-muted-foreground">Mensajes de IA este mes</dt>
                <dd className="text-foreground">{suscripcion.uso.mensajesIaMes}</dd>
                <dt className="text-muted-foreground">Cuentas de canal</dt>
                <dd className="text-foreground">{suscripcion.uso.cuentasCanal}</dd>
                {suscripcion.finPeriodoPruebaEn && (
                  <>
                    <dt className="text-muted-foreground">Prueba termina</dt>
                    <dd className="text-foreground">
                      {new Date(suscripcion.finPeriodoPruebaEn).toLocaleDateString("es-MX")}
                    </dd>
                  </>
                )}
              </dl>

              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Desglose del periodo
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    borrador comercial
                  </span>
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {suscripcion.desglose.lineasEscalon.map((linea, i) => (
                    <li key={i}>
                      {linea.unidades} unidad(es) × {usd(linea.precioCentavosPorUnidad)} = {usd(linea.subtotalCentavos)}
                    </li>
                  ))}
                  {suscripcion.desglose.lineasAddOns.map((addOn) => (
                    <li key={addOn.codigo}>
                      {addOn.nombre}: {usd(addOn.precioCentavosMes)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  Total estimado del periodo: {usd(suscripcion.desglose.totalCentavos)}
                </p>
              </div>

              {accion && <p className="mt-3 text-sm text-destructive">{accion}</p>}

              <div className="mt-4 flex gap-2">
                <Button onClick={alActualizarPlan}>Actualizar plan / pagar</Button>
                <Button variant="outline" onClick={alAbrirPortal}>
                  Portal de facturación
                </Button>
              </div>
            </CardContent>
          </Card>

          {usuario?.rol === "superadmin" && <SeccionMrrSuperadmin />}
        </div>
      )}
    </div>
  );
}
