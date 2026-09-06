import type { SenalEscalamiento } from "./tipos.js";

/**
 * Triggers de escalamiento a humano (H-060, REQ-110/REQ-146). Fuente:
 * RV10 (d) — sin política formal de plataforma que lo exija, práctica de
 * producto de terceros documentada por Guesty `[R]`: "AI handles volume.
 * Humans handle nuance", reservando intervención humana para quejas,
 * emergencias, reembolsos y trato VIP.
 *
 * Puramente informativo/heurístico por palabra clave — NUNCA ejecuta
 * ninguna acción por sí mismo (ni cancela, ni reembolsa, ni contacta):
 * solo devuelve etiquetas para que la cola de aprobación humana
 * (`colaAprobacion.ts`) las muestre y priorice.
 */
const PATRONES: Record<SenalEscalamiento, RegExp> = {
  queja: /\b(queja|inaceptable|terrible|p[eé]sim[oa]|decepcionad[oa]|reseñ?a\s+de\s+1\s+estrella)\b/i,
  emergencia: /\b(emergencia|fuga\s+de\s+gas|incendio|inundaci[oó]n|no\s+puedo\s+entrar|urgente|peligro)\b/i,
  reembolso: /\b(reembolso|devoluci[oó]n\s+de\s+dinero|devu[eé]lv(?:e|an)me\s+mi\s+dinero)\b/i,
  vip: /\b(cliente\s+vip|huésped\s+frecuente|trato\s+preferencial)\b/i,
};

/** Función pura sobre el TEXTO como dato (RV19-R-16) — nunca cambia el
 * conjunto de herramientas disponibles ni el rol del llamador. */
export function detectarSenalesEscalamiento(texto: string): SenalEscalamiento[] {
  const senales: SenalEscalamiento[] = [];
  for (const [senal, patron] of Object.entries(PATRONES) as [SenalEscalamiento, RegExp][]) {
    if (patron.test(texto)) senales.push(senal);
  }
  return senales;
}
