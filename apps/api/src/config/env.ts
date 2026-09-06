// Carga de configuración por variables de entorno (Lote 0, extendida en
// Lote 3 con auth/RLS/cifrado). Sin valores reales embebidos: todo viene de
// `process.env`, documentado en `.env.example`.

export interface ConfiguracionApi {
  puerto: number;
  entorno: "development" | "test" | "production";
  etiquetaEntorno: string;
  origenWeb: string;
  databaseUrl: string;
  jwtSecret: string;
  cifradoCanalClaves: string;
  rateLimit: { ventanaMs: number; maximo: number };
}

function leerEntorno(valor: string | undefined): ConfiguracionApi["entorno"] {
  if (valor === "test" || valor === "production") return valor;
  return "development";
}

/** Valor de desarrollo/CI: NUNCA usado si `JWT_SECRET`/`DATABASE_URL` están
 * presentes en el entorno. Documentado como inseguro a propósito — un
 * despliegue real siempre debe traer su propio secreto (§RV19/21-13). */
const JWT_SECRET_DESARROLLO = "desarrollo-nunca-usar-en-produccion-cambia-este-valor-ya-32b";

export function cargarConfiguracion(env: NodeJS.ProcessEnv = process.env): ConfiguracionApi {
  const entorno = leerEntorno(env.NODE_ENV);
  return {
    puerto: Number.parseInt(env.PORT ?? "8787", 10),
    entorno,
    // Nunca "producción" por defecto (D-017): un despliegue sin variable
    // explícita se etiqueta como desarrollo, el estado más conservador.
    etiquetaEntorno: env.APP_ENV_LABEL ?? "desarrollo",
    origenWeb: env.WEB_ORIGIN ?? "http://localhost:5173",
    databaseUrl: env.DATABASE_URL ?? "",
    jwtSecret: env.JWT_SECRET ?? JWT_SECRET_DESARROLLO,
    // "v1:<base64 32 bytes>" por defecto en desarrollo — jamás usar en
    // producción (H-046, rotación documentada en seguridad/cifrado.ts).
    cifradoCanalClaves:
      env.CANAL_CIFRADO_CLAVES ?? "v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    rateLimit: {
      ventanaMs: Number.parseInt(env.RATE_LIMIT_VENTANA_MS ?? "60000", 10),
      maximo: Number.parseInt(env.RATE_LIMIT_MAXIMO ?? "100", 10),
    },
  };
}
