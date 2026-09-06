// Carga de configuración por variables de entorno (Lote 0, scaffold).
// Sin valores reales embebidos: todo viene de `process.env`, documentado en
// `.env.example`. Ningún adaptador de canal ni credencial vive aquí todavía
// (eso llega en Lote 2/3) — este módulo solo resuelve lo que apps/api
// necesita para arrancar (puerto, entorno, origen CORS).

export interface ConfiguracionApi {
  puerto: number;
  entorno: "development" | "test" | "production";
  etiquetaEntorno: string;
  origenWeb: string;
}

function leerEntorno(valor: string | undefined): ConfiguracionApi["entorno"] {
  if (valor === "test" || valor === "production") return valor;
  return "development";
}

export function cargarConfiguracion(env: NodeJS.ProcessEnv = process.env): ConfiguracionApi {
  const entorno = leerEntorno(env.NODE_ENV);
  return {
    puerto: Number.parseInt(env.PORT ?? "8787", 10),
    entorno,
    // Nunca "producción" por defecto (D-017): un despliegue sin variable
    // explícita se etiqueta como desarrollo, el estado más conservador.
    etiquetaEntorno: env.APP_ENV_LABEL ?? "desarrollo",
    origenWeb: env.WEB_ORIGIN ?? "http://localhost:5173",
  };
}
