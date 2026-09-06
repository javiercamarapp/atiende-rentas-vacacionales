import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
// Subpath ESPECÍFICO (redondeo.js), NUNCA el barril `@atiende-rv/domain/finanzas`
// completo — ese barril reexporta `statement.ts`, que importa `node:crypto`
// a nivel de módulo; Vite lo externaliza en el navegador y el mero
// `import` (sin llegar a llamarlo) revienta toda la SPA en modo dev con
// "Cannot access node:crypto.createHash in client code" — verificado en
// vivo con el script de captura de este mismo lote. Mismo criterio ya
// establecido en apps/web/src/pages/finanzas/api.ts y pages/reportes/api.ts.
import { decimalDesdeCentavos } from "@atiende-rv/domain/finanzas/redondeo";
import { BorradorBanner } from "./components/BorradorBanner";
import { PublicaFooter, PublicaHeader } from "./components/PublicaHeader";
import { obtenerPlanesPublicos, type PlanPublico } from "./api";

// Lote 3.3 (RV16) — página de precios pública. TODO precio que se
// muestra viene de `GET /facturacion/planes` (el catálogo real de la
// base de datos, editable por Superadmin) — nunca un número hardcodeado
// en este componente, para que un cambio de precio en backoffice se
// refleje aquí sin tocar código.
function formatoUsd(centavos: number): string {
  return `$${decimalDesdeCentavos(centavos)}`;
}

export function PreciosPage() {
  const [planes, setPlanes] = useState<PlanPublico[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerPlanesPublicos()
      .then((r) => setPlanes(r.planes))
      .catch(() => setError("No se pudieron cargar los planes en este momento."));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicaHeader />
      <main className="mx-auto max-w-5xl px-6 py-14">
        <h1 className="text-center text-3xl font-bold text-foreground">Precios</h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Cuota base por unidad/mes con escalones que bajan por volumen, más un add-on opcional de IA
          conversacional facturado aparte.
        </p>

        <div className="mx-auto mt-6 max-w-2xl">
          <BorradorBanner>
            Estas cifras son un borrador comercial ancorado en precios públicos de la competencia — ver{" "}
            <span className="font-medium">docs/investigacion/RV16-modelo-negocio-costos.md</span>. No son
            precios definitivos; el equipo de pricing puede ajustarlos en cualquier momento desde backoffice.
          </BorradorBanner>
        </div>

        {error && <p className="mt-8 text-center text-sm text-destructive">{error}</p>}
        {!planes && !error && <p className="mt-8 text-center text-sm text-muted-foreground">Cargando planes…</p>}

        {planes && (
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {planes.map((plan) => (
              <Card key={plan.codigo} className="flex flex-col">
                <CardHeader>
                  <CardTitle>{plan.nombre}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.descripcion}</p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <p className="text-3xl font-bold text-foreground">
                    {formatoUsd(plan.escalones[0]?.precioCentavosPorUnidad ?? 0)}
                    <span className="text-sm font-normal text-muted-foreground"> USD/unidad/mes</span>
                  </p>
                  <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                    {plan.escalones.map((escalon, i) => (
                      <li key={i}>
                        {escalon.hastaUnidades === null
                          ? `Más allá de ${plan.escalones[i - 1]?.hastaUnidades ?? 0} unidades: ${formatoUsd(escalon.precioCentavosPorUnidad)}/unidad`
                          : `Hasta ${escalon.hastaUnidades} unidades: ${formatoUsd(escalon.precioCentavosPorUnidad)}/unidad`}
                      </li>
                    ))}
                    <li>{plan.diasPrueba} días de prueba gratuita</li>
                    <li>
                      {plan.limites.cuentasCanalMax === null
                        ? "Cuentas de canal ilimitadas"
                        : `Hasta ${plan.limites.cuentasCanalMax} cuentas de canal`}
                    </li>
                  </ul>
                  {plan.addOnsDisponibles.length > 0 && (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground">Add-ons de IA disponibles</p>
                      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                        {plan.addOnsDisponibles.map((addOn) => (
                          <li key={addOn.codigo}>
                            {addOn.nombre} — {formatoUsd(addOn.precioCentavosMes)}/mes
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-auto pt-6">
                    <Button asChild className="w-full">
                      <Link to={`/onboarding?plan=${plan.codigo}`}>Empezar con {plan.nombre}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <PublicaFooter />
    </div>
  );
}
