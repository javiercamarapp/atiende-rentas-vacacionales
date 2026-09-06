import { Link, Navigate } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { PublicaFooter, PublicaHeader } from "./components/PublicaHeader";

// Lote 3.3 — landing pública. Propuesta de valor HONESTA (D-017/D-019,
// DEFINICION-DE-HECHO): "calendario unificado" con la latencia DECLARADA
// por canal (nunca "tiempo real" — cada canal sincroniza por polling, con
// su propia ventana; ver docs/investigacion/RV22-canales-mexico.md), y el
// estado REAL de conectividad por canal (iCal disponible hoy vs. partner
// pendiente de aprobación) — la misma clasificación que usa
// `/canales-mexico` dentro del panel, nunca "todos los canales
// conectados" como afirmación de marketing.
const CANALES_DESTACADOS: Array<{ nombre: string; estado: "ical_disponible" | "partner_pendiente"; nota: string }> = [
  { nombre: "Airbnb", estado: "ical_disponible", nota: "iCal — ventana de disponibilidad de 2 años declarada por Airbnb" },
  { nombre: "Vrbo", estado: "ical_disponible", nota: "iCal disponible hoy" },
  { nombre: "Agoda", estado: "ical_disponible", nota: "iCal disponible hoy" },
  { nombre: "Booking.com", estado: "partner_pendiente", nota: "Requiere aprobación de partner (OTA/B.XML) — en trámite" },
  { nombre: "Expedia Group", estado: "partner_pendiente", nota: "Sandbox de partner integrado — pendiente de aprobación en producción" },
];

export function LandingPage() {
  const { autenticado } = useSesion();
  if (autenticado) return <Navigate to="/calendario" replace />;

  return (
    <div className="min-h-screen bg-background">
      <PublicaHeader />

      <main>
        <section className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Un calendario para todos tus canales — con la latencia real de cada uno, a la vista.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Atiende Rentas Vacacionales sincroniza Airbnb, Vrbo, Agoda, Booking.com y Expedia en un solo
            calendario. Nunca decimos "tiempo real": cada canal sincroniza por su propia vía y con su propia
            latencia declarada — la mostramos siempre, no la escondemos.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/onboarding">Empezar gratis</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/precios">Ver precios</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-muted/30 py-14">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="text-center text-2xl font-semibold text-foreground">Estado real de conectividad por canal</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
              Mostramos el estado verdadero de cada canal, no una promesa de marketing. "iCal disponible" es un
              feed que ya funciona hoy; "partner pendiente" significa que la integración directa existe en
              código pero espera la aprobación del canal — ver la matriz completa en{" "}
              <Link to="/estado" className="underline">
                estado del sistema
              </Link>
              .
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CANALES_DESTACADOS.map((canal) => (
                <Card key={canal.nombre}>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base">{canal.nombre}</CardTitle>
                    <span
                      className={
                        canal.estado === "ical_disponible"
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }
                    >
                      {canal.estado === "ical_disponible" ? "iCal disponible" : "Partner pendiente"}
                    </span>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{canal.nota}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-center text-2xl font-semibold text-foreground">Cómo funciona</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-primary">1. Regístrate</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea tu empresa gestora y tu cuenta de administrador en un formulario.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">2. Conecta tus canales</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Un asistente guiado te dice exactamente qué feed iCal pegar en cada canal.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">3. Invita a tu equipo</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Operadores, contadores y propietarios, cada uno con el nivel de acceso correcto.
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicaFooter />
    </div>
  );
}
