import { serve } from "@hono/node-server";
import { crearApp } from "./app.js";
import { cargarConfiguracion } from "./config/env.js";

const config = cargarConfiguracion();
const app = crearApp();

serve({ fetch: app.fetch, port: config.puerto }, (info) => {
  console.log(
    `[api] escuchando en http://localhost:${info.port} (entorno=${config.entorno}, ${config.etiquetaEntorno})`,
  );
});
