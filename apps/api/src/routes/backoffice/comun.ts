import type { ContextoAuth } from "../../middleware/autenticacion.js";
import { ErrorDominio } from "../../contrato/errores.js";

/**
 * Helpers compartidos de apps/api/src/routes/backoffice/ (Lote 8, carpeta
 * exclusiva de este lote — ver docs/fase2/LOTES.md).
 *
 * `resolverTenantId`: un `admin_gestora`/`operador` siempre opera sobre su
 * propio `auth.tenantId` (nunca puede pasar un `tenantId` distinto en el
 * cuerpo — eso sería exactamente el caso adversarial 18/19 de escalada
 * cross-tenant). Un `superadmin` NO tiene `tenantId` propio: debe indicar
 * explícitamente sobre qué tenant opera. Desde `packages/db` migración
 * 0061, ese `tenantId` explícito no basta por sí solo — `is_tenant_member`
 * (evaluado por CADA política RLS de la fila real) exige además una
 * concesión "romper cristal" vigente para ese usuario+tenant; si no la
 * hay, Postgres devuelve 0 filas (SELECT) o `42501 insufficient_privilege`
 * (INSERT/UPDATE), que `relanzarSiRlsRechazo` traduce a un error de
 * dominio explícito en vez de dejar pasar el código Postgres crudo.
 */
export function resolverTenantId(auth: ContextoAuth, tenantIdCuerpo: string | undefined): string {
  if (auth.rol === "superadmin") {
    if (!tenantIdCuerpo) {
      throw new ErrorDominio("validacion", "superadmin debe indicar tenantId explícitamente");
    }
    return tenantIdCuerpo;
  }
  if (!auth.tenantId) {
    throw new ErrorDominio("tenant_forbidden", "Este usuario no pertenece a ningún tenant");
  }
  if (tenantIdCuerpo && tenantIdCuerpo !== auth.tenantId) {
    throw new ErrorDominio("tenant_forbidden", "No puedes operar sobre un tenant distinto al tuyo");
  }
  return auth.tenantId;
}

/** Traduce el rechazo de RLS (fail-closed, sin concesión "romper cristal"
 * vigente) a un mensaje explícito — nunca deja pasar el código Postgres
 * crudo (42501) como un 500 genérico. */
export async function relanzarSiRlsRechazo<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const codigoPg = (error as { code?: string } | undefined)?.code;
    if (codigoPg === "42501") {
      throw new ErrorDominio(
        "rol_forbidden",
        "Acceso denegado por RLS: si eres superadmin, necesitas una concesión 'romper cristal' vigente para este tenant",
      );
    }
    throw error;
  }
}
