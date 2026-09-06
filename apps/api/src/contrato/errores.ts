/**
 * Errores de dominio tipados (LOTES.md Lote 3: "errores de dominio
 * explícitos, no 500 genérico"). Cada uno mapea a un código HTTP fijo y a
 * un `codigo` estable que apps/web (Lote 4) puede usar para distinguir
 * casos sin parsear el mensaje humano. `mensaje` nunca debe incluir PII
 * (§RV19/21-7) ni detalles internos (nombre de tabla/columna, stack).
 */

export const CODIGOS_ERROR = [
  "credenciales_invalidas",
  "token_invalido",
  "token_expirado",
  "tenant_forbidden",
  "rol_forbidden",
  "rango_invalido",
  "unidad_no_disponible",
  "conflicto_pendiente",
  "reserva_no_directa",
  "recurso_no_encontrado",
  "validacion",
  "rate_limited",
  "error_interno",
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

const HTTP_POR_CODIGO: Record<CodigoError, number> = {
  credenciales_invalidas: 401,
  token_invalido: 401,
  token_expirado: 401,
  tenant_forbidden: 403,
  rol_forbidden: 403,
  rango_invalido: 422,
  unidad_no_disponible: 409,
  conflicto_pendiente: 409,
  reserva_no_directa: 403,
  recurso_no_encontrado: 404,
  validacion: 422,
  rate_limited: 429,
  error_interno: 500,
};

export class ErrorDominio extends Error {
  readonly codigo: CodigoError;
  readonly httpStatus: number;
  readonly detalles?: unknown;

  constructor(codigo: CodigoError, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.name = "ErrorDominio";
    this.codigo = codigo;
    this.httpStatus = HTTP_POR_CODIGO[codigo];
    this.detalles = detalles;
  }
}

export interface CuerpoErrorHttp {
  error: {
    codigo: CodigoError;
    mensaje: string;
    detalles?: unknown;
  };
}

export function cuerpoError(err: ErrorDominio): CuerpoErrorHttp {
  return {
    error: {
      codigo: err.codigo,
      mensaje: err.message,
      ...(err.detalles !== undefined ? { detalles: err.detalles } : {}),
    },
  };
}
