import type { Migracion } from "../runner/tipos.js";

// Rango 0130+: fix/mensajeria-nativa-por-canal (auditoría de producción
// 2026-09-09, hallazgo "el motor de intención real de Lote 9
// (`EjecutorTools`/`proveedorClaude.ts`) nunca queda conectado a la cola
// de aprobación humana de mensajería de Lote 6" — el único generador que
// insertaba en `borrador_mensaje` era `GeneradorBorradorPlantillas`,
// determinista y sin LLM).
//
// `generado_por` (migración 0042) solo aceptaba 'motor_borrador' |
// 'plantilla' | 'manual' — esta migración agrega 'agente_llm' para que
// `apps/api/src/routes/mensajeria/borradores.ts` pueda marcar
// explícitamente un borrador producido por `invocarRondaAgente`
// (`apps/api/src/agentes/servicio.ts`, ya real: usa `ProveedorLLMClaude`
// cuando el flag + `ANTHROPIC_API_KEY` están habilitados para el tenant, o
// `ProveedorLLMSimulado` si no) — nunca se reutiliza 'motor_borrador' para
// esto: un operador que revisa la cola de aprobación debe poder distinguir
// "plantilla determinista" de "modelo de lenguaje" sin adivinar. El
// borrador sigue aterrizando en 'pendiente_aprobacion' y pasando por
// exactamente la misma máquina de estados de `colaAprobacion.ts` — esta
// migración NO toca esa máquina de estados ni el CHECK de coherencia de
// `estado`/`aprobado_por`/`rechazado_por`.
export const migracion0130MensajeriaBorradorAgenteLlm: Migracion = {
  id: "0130_mensajeria_borrador_agente_llm",
  descripcion: "mensajeria: borrador_mensaje.generado_por admite 'agente_llm'",
  up: `
    ALTER TABLE borrador_mensaje DROP CONSTRAINT borrador_mensaje_generado_por_check;
    ALTER TABLE borrador_mensaje ADD CONSTRAINT borrador_mensaje_generado_por_check
      CHECK (generado_por IN ('motor_borrador', 'plantilla', 'manual', 'agente_llm'));
  `,
  down: `
    ALTER TABLE borrador_mensaje DROP CONSTRAINT borrador_mensaje_generado_por_check;
    ALTER TABLE borrador_mensaje ADD CONSTRAINT borrador_mensaje_generado_por_check
      CHECK (generado_por IN ('motor_borrador', 'plantilla', 'manual'));
  `,
};
