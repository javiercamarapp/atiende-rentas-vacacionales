// Cliente de API tipado desde el contrato compartido (LOTES.md Lote 4,
// punto 5: "Cliente de API tipado desde el contrato; manejo de errores
// tipados"). Envuelve `fetch` sin ninguna dependencia adicional — la base
// URL viene de `VITE_API_URL` (dev: http://localhost:8787, e2e: puerto
// dedicado, ver apps/web/e2e/servidor-api-e2e.ts).
import type { CodigoError, CuerpoErrorHttp } from "@atiende-rv/api/contrato";

export const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";

const CLAVE_TOKEN = "atiende-rv-access-token";

export function tokenGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function guardarToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // localStorage puede no estar disponible (SSR/privado) — sesión solo en
    // memoria en ese caso, degradación silenciosa aceptable para un panel
    // interno de desarrollo.
  }
}

/** Error tipado del contrato — nunca un `Error` genérico para una respuesta
 * de la API, así la UI puede distinguir `409 unidad_no_disponible` de
 * `422 rango_invalido` sin parsear el texto humano (LOTES.md Lote 3). */
export class ErrorApi extends Error {
  readonly codigo: CodigoError | "red";
  readonly status: number;
  readonly detalles?: unknown;

  constructor(codigo: CodigoError | "red", mensaje: string, status: number, detalles?: unknown) {
    super(mensaje);
    this.name = "ErrorApi";
    this.codigo = codigo;
    this.status = status;
    this.detalles = detalles;
  }
}

export interface OpcionesPeticion {
  metodo?: "GET" | "POST" | "PATCH" | "DELETE";
  cuerpo?: unknown;
  query?: Record<string, string | number | undefined>;
}

function construirUrl(ruta: string, query?: OpcionesPeticion["query"]): string {
  const url = new URL(ruta.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [clave, valor] of Object.entries(query)) {
      if (valor !== undefined) url.searchParams.set(clave, String(valor));
    }
  }
  return url.toString();
}

/** Petición autenticada genérica. Lanza siempre `ErrorApi` en fallos (red o
 * HTTP) — nunca deja pasar un `Response` sin envolver, para que cada
 * pantalla pueda mostrar el código de error tal como lo definió el
 * contrato (409/422/etc.), no un mensaje genérico "algo salió mal". */
export async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { metodo = "GET", cuerpo, query } = opciones;
  const token = tokenGuardado();

  let respuesta: Response;
  try {
    respuesta = await fetch(construirUrl(ruta, query), {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (err) {
    throw new ErrorApi(
      "red",
      "No se pudo contactar la API. Verifica tu conexión o que el entorno de desarrollo esté corriendo.",
      0,
      err,
    );
  }

  if (respuesta.status === 204 || respuesta.status === 202) {
    if (respuesta.status === 202) {
      return (await respuesta.json().catch(() => ({}))) as T;
    }
    return undefined as T;
  }

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : undefined;

  if (!respuesta.ok) {
    const cuerpoError = datos as CuerpoErrorHttp | undefined;
    throw new ErrorApi(
      cuerpoError?.error?.codigo ?? "error_interno",
      cuerpoError?.error?.mensaje ?? `Error HTTP ${respuesta.status}`,
      respuesta.status,
      cuerpoError?.error?.detalles,
    );
  }

  return datos as T;
}
