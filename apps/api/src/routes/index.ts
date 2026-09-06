import { Hono } from "hono";

// Registro de rutas de apps/api. Punto de fusión compartido documentado en
// docs/fase2/LOTES.md (cabecera): cada lote posterior añade su propio
// `app.route(...)` aquí, en un commit pequeño y separado — nunca reescribe
// este archivo completo. En el Lote 0 no hay rutas de dominio todavía, solo
// el router vacío que Lote 3 (apps/api/routes/) y siguientes irán llenando.
export function registrarRutas(app: Hono): Hono {
  return app;
}
