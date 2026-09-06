import type { PoolClient } from "pg";
import type { SesionDb } from "../db/contexto.js";
import type { ContextoAuth } from "./autenticacion.js";

/** Traduce el contexto de auth (ya verificado por el JWT) a la sesión de
 * base de datos que `apps/api/src/db/contexto.ts` fija con `SET LOCAL`. */
export function sesionDeAuth(auth: ContextoAuth): SesionDb {
  return {
    usuarioId: auth.usuarioId,
    tenantId: auth.tenantId,
    rol: auth.rol,
    colaboradorNivel: auth.colaboradorNivel,
  };
}

/**
 * H-045: acceso "romper cristal" — un Superadmin Atiende (sin tenant_id
 * propio) leyendo/modificando datos de un tenant ajeno. `is_tenant_member`
 * (packages/db migración 0014) ya trata a superadmin como miembro
 * honorario de cualquier tenant a nivel de RLS, así que el acceso en sí
 * nunca falla — lo que exige §Auditoría-1 es que quede una entrada
 * explícita con motivo, insertada aquí desde la capa de aplicación (un
 * simple SELECT no dispara ningún trigger de tabla).
 */
export async function registrarAccesoRomperCristal(
  cliente: PoolClient,
  parametros: { actorId: string; tenantId: string; motivo: string; recurso: string },
): Promise<void> {
  await cliente.query(
    `INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_nuevos)
     VALUES ($1, $2, 'ACCESO_ROMPER_CRISTAL', $3, $4, $5::jsonb)`,
    [
      parametros.recurso,
      parametros.tenantId,
      parametros.actorId,
      parametros.tenantId,
      JSON.stringify({ motivo: parametros.motivo }),
    ],
  );
  // Nota: `fila_id` guarda aquí el `tenant_id` accedido (no una fila de
  // negocio concreta) — un acceso "romper cristal" es sobre el tenant como
  // conjunto, no sobre una fila individual; `tabla` guarda el nombre del
  // recurso/endpoint que originó el acceso (p. ej. "calendario_unidad").
}
