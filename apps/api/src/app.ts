import { Hono } from "hono";
import { cargarConfiguracion } from "./config/env.js";
import { registrarRutas } from "./routes/index.js";

// Construcción de la app Hono, separada de `index.ts` (arranque del server)
// para que las pruebas puedan importar `crearApp()` sin abrir un puerto real.
export function crearApp() {
  const config = cargarConfiguracion();
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      entorno: config.entorno,
      etiquetaEntorno: config.etiquetaEntorno,
      // Recordatorio explícito en el propio healthcheck: Lote 0 es scaffold
      // puro, sin conexiones productivas de ningún canal (DEFINICION-DE-HECHO §1).
      aviso: "Entorno de desarrollo — sin conexiones productivas",
    }),
  );

  registrarRutas(app);

  return app;
}
