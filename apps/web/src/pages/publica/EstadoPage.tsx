import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { PublicaFooter, PublicaHeader } from "./components/PublicaHeader";
import { obtenerSaludApi, obtenerSaludDetallada, type SaludApi, type SaludDetallada } from "./api";

// Lote 3.3 — página de estado del sistema, pública. Nunca inventa un
// estado: lee directamente de `GET /health` y `GET /health/detallado`
// (apps/api/src/app.ts / workers/observabilidad/rutas.ts) — el mismo
// endpoint que usa cualquier monitor externo. Si la API no responde, esta
// página lo dice explícitamente en vez de mostrar un "todo bien" por
// defecto.
export function EstadoPage() {
  const [salud, setSalud] = useState<SaludApi | "error" | null>(null);
  const [detallada, setDetallada] = useState<SaludDetallada | "error" | null>(null);

  useEffect(() => {
    obtenerSaludApi()
      .then(setSalud)
      .catch(() => setSalud("error"));
    obtenerSaludDetallada()
      .then(setDetallada)
      .catch(() => setDetallada("error"));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicaHeader />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-3xl font-bold text-foreground">Estado del sistema</h1>
        <p className="mt-3 text-muted-foreground">
          Estado leído en vivo de la API — nunca un texto fijo. Si algo aquí dice "sin configurar" o "error",
          es porque la API misma lo está reportando así en este momento.
        </p>

        <div className="mt-8 grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">API</CardTitle>
            </CardHeader>
            <CardContent>
              {salud === null && <p className="text-sm text-muted-foreground">Consultando…</p>}
              {salud === "error" && <p className="text-sm text-destructive">No se pudo contactar la API.</p>}
              {salud && salud !== "error" && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd className="font-medium text-foreground">{salud.status}</dd>
                  <dt className="text-muted-foreground">Entorno</dt>
                  <dd className="font-medium text-foreground">{salud.etiquetaEntorno}</dd>
                  <dt className="text-muted-foreground">Base de datos</dt>
                  <dd className="font-medium text-foreground">
                    {salud.baseDeDatos === "ok" || salud.baseDeDatos === "configurada"
                      ? "Conectada"
                      : salud.baseDeDatos === "error"
                        ? "Con error"
                        : "Sin configurar todavía"}
                  </dd>
                  <dt className="text-muted-foreground col-span-2 mt-2 text-xs italic">{salud.aviso}</dt>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Base de datos (chequeo con conexión real)</CardTitle>
            </CardHeader>
            <CardContent>
              {detallada === null && <p className="text-sm text-muted-foreground">Consultando…</p>}
              {detallada === "error" && <p className="text-sm text-destructive">No se pudo obtener el detalle.</p>}
              {detallada && detallada !== "error" && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Conectada</dt>
                  <dd className="font-medium text-foreground">{detallada.db.conectada ? "Sí" : "No"}</dd>
                  <dt className="text-muted-foreground">Cola de eventos pendientes</dt>
                  <dd className="font-medium text-foreground">{detallada.outbox.tamanoCola ?? "—"}</dd>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canales de distribución</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              iCal (Airbnb, Vrbo, Agoda) disponible hoy. Booking.com y Expedia Group: integración directa
              implementada, pendiente de aprobación de partner — ver la matriz completa dentro del panel
              (requiere sesión) en <code>/canales-mexico</code>.
            </CardContent>
          </Card>
        </div>
      </main>
      <PublicaFooter />
    </div>
  );
}
