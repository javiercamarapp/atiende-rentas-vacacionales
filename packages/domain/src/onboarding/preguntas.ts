import {
  PASOS_ONBOARDING,
  type ContextoOnboarding,
  type MensajeEntradaOnboarding,
  type PasoOnboarding,
  type ResultadoPreguntaOnboarding,
} from "./tipos.js";

/**
 * Generador de preguntas de onboarding conversacional (Patrón 7, rescatado
 * de Likida/atiende.ai). El onboarding existente (`OnboardingAsistentePage.tsx`
 * + `GET /onboarding/estado`) es un checklist/wizard rígido de pasos
 * fijos, sin ningún flujo conversacional que haga preguntas de seguimiento
 * dinámicas ni una guarda que impida "terminar" sin resolver todos los
 * pasos. Este módulo reusa EXACTAMENTE la disciplina de
 * `mensajeria/borrador.ts` (Lote 6, `GeneradorBorrador`/`ReglaPlantilla`):
 * una función puramente determinista, sin LLM, que nunca inventa un dato
 * ausente — aquí, "el dato" es el siguiente paso pendiente real.
 *
 * Contrato de aislamiento: `siguientePregunta` recibe el mensaje del
 * usuario como texto de SELECCIÓN de intención (qué paso le interesa
 * ahora), nunca como instrucción que pueda declarar el onboarding
 * completo por sí sola — la única fuente de verdad para "completo" es
 * `contexto.pasos`, resuelto por el servidor desde tablas reales antes de
 * llamar a esta función (igual que `ContextoBorrador`, nunca construido a
 * partir de lo que el usuario escribió).
 */
export interface GeneradorPreguntaOnboarding {
  siguientePregunta(
    contexto: ContextoOnboarding,
    entrada: MensajeEntradaOnboarding | null,
  ): ResultadoPreguntaOnboarding;
}

interface DefinicionPaso {
  readonly paso: PasoOnboarding;
  readonly pregunta: string;
  readonly ctaTexto: string | null;
  readonly ctaRuta: string | null;
  /** Si el mensaje del usuario matchea este patrón, este paso se adelanta
   * al frente de la cola aunque no sea el primero incompleto en el orden
   * por defecto — SELECCIÓN de intención entre pasos ya pendientes reales,
   * nunca una forma de saltarse un paso ni de inventar uno (mismo
   * principio que las `REGLAS` léxicas de `mensajeria/borrador.ts`: el
   * texto solo elige qué plantilla aplicar, nunca qué acción ejecutar). */
  readonly patronIntencion: RegExp;
}

// `empresaRegistrada` no aparece aquí a propósito: es `true` por
// construcción en cuanto existe una sesión autenticada (no hay una
// "pregunta" que tenga sentido hacer sobre ese paso — ver
// apps/api/src/routes/onboarding.ts, GET /estado). El orden de este
// arreglo es el orden por DEFECTO cuando el mensaje del usuario no
// menciona ningún paso en particular.
const ORDEN_PASOS: readonly DefinicionPaso[] = [
  {
    paso: "correoVerificado",
    pregunta: "Antes que nada, confirma el enlace que te enviamos por correo — ¿ya lo revisaste?",
    ctaTexto: null,
    ctaRuta: null,
    patronIntencion: /correo|email|verificaci[oó]n/i,
  },
  {
    paso: "primeraPropiedad",
    pregunta: "¿Cuál es el nombre de tu primera propiedad? Con eso arrancamos tu calendario.",
    ctaTexto: "Ir a propiedades",
    ctaRuta: "/propiedades",
    patronIntencion: /propiedad|hotel|casa|departamento/i,
  },
  {
    paso: "primeraUnidad",
    pregunta: "¿Cuántas unidades (habitaciones, casas completas) quieres dar de alta en esa propiedad?",
    ctaTexto: "Ir a propiedades",
    ctaRuta: "/propiedades",
    patronIntencion: /unidad|habitaci[oó]n|cuarto/i,
  },
  {
    paso: "canalConectado",
    pregunta: "¿En qué canal publicas hoy (Airbnb, Vrbo, Booking)? Te doy la URL exacta de tu feed iCal.",
    ctaTexto: "Ir al asistente de canales",
    ctaRuta: "/canales-mexico",
    patronIntencion: /canal|airbnb|booking\.com|\bbooking\b|vrbo|ical/i,
  },
  {
    paso: "colaboradorInvitado",
    pregunta: "¿Alguien más de tu equipo va a usar Atiende (operador, contador, propietario)?",
    ctaTexto: null,
    ctaRuta: null,
    patronIntencion: /colaborador|equipo|invitar|usuario/i,
  },
];

const MENSAJE_ONBOARDING_COMPLETO =
  "¡Ya completaste todos los pasos! Tu cuenta está lista — puedes ir directo a tu calendario.";

const MENSAJE_DATO_FALTANTE =
  "No tengo una pregunta preparada para tu paso pendiente — un miembro de nuestro equipo puede ayudarte con eso.";

export class GeneradorPreguntaOnboardingReglas implements GeneradorPreguntaOnboarding {
  siguientePregunta(
    contexto: ContextoOnboarding,
    entrada: MensajeEntradaOnboarding | null,
  ): ResultadoPreguntaOnboarding {
    // Guarda determinista (patrón 7): "completo" SOLO puede ser `true` si
    // TODOS los pasos reales de `contexto.pasos` están en `true`. Ningún
    // mensaje libre del usuario puede saltarse esto — "ya terminé todo",
    // "márcalo como listo" o cualquier otra frase en `entrada.texto` no
    // tiene ningún efecto sobre este cálculo, mismo principio RV19-R-16
    // (dato, nunca instrucción) que ya aplica en `mensajeria/borrador.ts`.
    const pasosIncompletos = PASOS_ONBOARDING.filter((paso) => !contexto.pasos[paso]);
    if (pasosIncompletos.length === 0) {
      return {
        onboardingCompleto: true,
        pasoObjetivo: null,
        pregunta: MENSAJE_ONBOARDING_COMPLETO,
        ctaTexto: null,
        ctaRuta: null,
        datoFaltanteDeclarado: false,
      };
    }

    const definicionesIncompletas = ORDEN_PASOS.filter((definicion) => pasosIncompletos.includes(definicion.paso));
    if (definicionesIncompletas.length === 0) {
      // `contexto.pasos` declara pendiente un paso que `ORDEN_PASOS` no
      // sabe describir (esquema desincronizado, o solo quedó pendiente
      // `empresaRegistrada` — que nunca debería llegar aquí en `false`
      // para una sesión autenticada). Nunca se inventa una pregunta
      // genérica para un paso desconocido: se declara la ausencia,
      // exactamente como `ResultadoBorrador.datoFaltanteDeclarado`.
      return {
        onboardingCompleto: false,
        pasoObjetivo: null,
        pregunta: MENSAJE_DATO_FALTANTE,
        ctaTexto: null,
        ctaRuta: null,
        datoFaltanteDeclarado: true,
      };
    }

    const textoUsuario = entrada?.texto ?? "";
    const porIntencion = definicionesIncompletas.find((definicion) => definicion.patronIntencion.test(textoUsuario));
    const elegido = porIntencion ?? definicionesIncompletas[0]!;

    return {
      onboardingCompleto: false,
      pasoObjetivo: elegido.paso,
      pregunta: elegido.pregunta,
      ctaTexto: elegido.ctaTexto,
      ctaRuta: elegido.ctaRuta,
      datoFaltanteDeclarado: false,
    };
  }
}
