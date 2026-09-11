import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { ErrorApi } from "../../lib/api/cliente";
import { conversarOnboarding, type RespuestaConversarOnboarding } from "./api";

/**
 * Patrón 7 (rescatado de Likida/atiende.ai): onboarding conversacional con
 * guardas deterministas. A diferencia del checklist estático de
 * `OnboardingAsistentePage` (pasos fijos, siempre en el mismo orden), este
 * widget deja que el usuario escriba en lenguaje natural qué le interesa
 * ("¿cómo conecto mi Airbnb?") y el servidor (`POST /onboarding/conversar`,
 * `packages/domain/onboarding`, sin LLM) elige la pregunta de seguimiento
 * correspondiente entre los pasos REALMENTE pendientes.
 *
 * Guarda determinista visible aquí: `onboardingCompleto` SOLO puede venir
 * en `true` cuando el servidor ya vio los 6 pasos reales en `true` — este
 * componente nunca lo calcula ni lo infiere del texto que el usuario
 * escribió, solo muestra lo que la respuesta trae (mismo principio que el
 * resto del repo: dato del servidor, nunca instrucción del cliente).
 */
export function AsistenteConversacional() {
  const [respuesta, setRespuesta] = useState<RespuestaConversarOnboarding | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function preguntar(texto?: string) {
    setError(null);
    setCargando(true);
    try {
      const r = await conversarOnboarding(texto);
      setRespuesta(r);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo cargar el asistente.");
    } finally {
      setCargando(false);
    }
  }

  // Primera carga: pregunta sin mensaje — el servidor usa el orden por
  // defecto entre los pasos pendientes reales.
  useEffect(() => {
    preguntar();
  }, []);

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    if (!mensaje.trim()) return;
    void preguntar(mensaje);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Pregúntame por dónde seguir</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {respuesta && (
          <div className="space-y-2">
            <p className="text-sm text-foreground">{respuesta.pregunta}</p>
            {respuesta.datoFaltanteDeclarado && (
              <p className="text-xs text-muted-foreground">
                No tenemos una respuesta automática para esto — escríbenos y te ayudamos directamente.
              </p>
            )}
            {!respuesta.onboardingCompleto && respuesta.ctaTexto && respuesta.ctaRuta && (
              <Button asChild size="sm" variant="outline">
                <Link to={respuesta.ctaRuta}>{respuesta.ctaTexto}</Link>
              </Button>
            )}
            {respuesta.onboardingCompleto && (
              <Button asChild size="sm">
                <Link to="/calendario">Ir a mi calendario</Link>
              </Button>
            )}
          </div>
        )}

        {(!respuesta || !respuesta.onboardingCompleto) && (
          <form onSubmit={alEnviar} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="asistenteMensaje" className="sr-only">
              Escribe tu pregunta
            </label>
            <input
              id="asistenteMensaje"
              type="text"
              placeholder="Ej: ¿cómo conecto mi Airbnb?"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" size="sm" disabled={cargando || !mensaje.trim()}>
              {cargando ? "Preguntando…" : "Preguntar"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
