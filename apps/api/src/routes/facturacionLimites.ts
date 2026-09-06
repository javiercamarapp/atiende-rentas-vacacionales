import type pg from "pg";
import { evaluarAntesDeIncrementar, type RecursoLimitado } from "@atiende-rv/domain/facturacion";
import { ErrorDominio } from "../contrato/errores.js";
import { conSesion } from "../db/contexto.js";
import { sesionDeAuth } from "../middleware/tenant.js";
import type { ContextoAuth } from "../middleware/autenticacion.js";

/**
 * Aplicación en SERVIDOR de los límites de plan (RV16: "límites por plan
 * aplicados en servidor") — se llama explícitamente al inicio de cada
 * ruta que da de alta un recurso limitado (unidad, cuenta de canal,
 * mensaje de IA), DESPUÉS de `exigirRol` y ANTES del `INSERT` real.
 * Nunca como middleware genérico montado con `app.use`: el punto exacto
 * en el que "se agotaría el plan" depende de qué recurso crea cada ruta
 * (una unidad nueva vs. una cuenta de canal nueva), así que cada ruta
 * pasa su propio `RecursoLimitado`.
 *
 * Un tenant sin fila en `suscripcion_tenant` (no debería ocurrir tras
 * onboarding, pero un tenant creado por el `POST /tenants` de Superadmin
 * antes de este lote no tiene una) NO se bloquea — fail-open
 * deliberado solo para este caso de transición, documentado, nunca
 * silencioso (ver comentario en el propio código). Un superadmin sin
 * tenant (`auth.tenantId === null`) tampoco está limitado por ningún
 * plan — actúa a nivel de plataforma, no de un tenant específico.
 */
export async function exigirLimitePlan(pool: pg.Pool, auth: ContextoAuth, recurso: RecursoLimitado): Promise<void> {
  const tenantId = auth.tenantId;
  if (!tenantId) return;

  const periodo = new Date().toISOString().slice(0, 7); // "AAAA-MM"

  const resultado = await conSesion(pool, sesionDeAuth(auth), async (cliente) => {
    const { rows: filasPlan } = await cliente.query<{
      limite_unidades_activas: number | null;
      limite_mensajes_ia_mes: number | null;
      limite_cuentas_canal: number | null;
    }>(
      `SELECT pf.limite_unidades_activas, pf.limite_mensajes_ia_mes, pf.limite_cuentas_canal
       FROM suscripcion_tenant st
       JOIN plan_facturacion pf ON pf.codigo = st.plan_codigo
       WHERE st.tenant_id = $1`,
      [tenantId],
    );
    const plan = filasPlan[0];
    // Tenant de transición (creado antes de este lote, sin suscripción
    // todavía) — ver comentario de cabecera: fail-open documentado, NUNCA
    // silencioso (queda este comentario como única explicación, no hay
    // registro adicional porque no es un evento de seguridad).
    if (!plan) return null;

    const { rows: filasUso } = await cliente.query<{
      unidades_activas: number;
      mensajes_ia_mes: number;
      cuentas_canal: number;
    }>("SELECT * FROM medicion_uso_actual($1, $2)", [tenantId, periodo]);
    const uso = filasUso[0]!;

    return evaluarAntesDeIncrementar({
      recurso,
      limites: {
        unidadesActivasMax: plan.limite_unidades_activas,
        mensajesIaMesMax: plan.limite_mensajes_ia_mes,
        cuentasCanalMax: plan.limite_cuentas_canal,
      },
      uso: {
        tenantId,
        periodo,
        unidadesActivas: uso.unidades_activas,
        mensajesIaMes: uso.mensajes_ia_mes,
        cuentasCanal: uso.cuentas_canal,
      },
    });
  });

  if (resultado && !resultado.permitido) {
    // 402 (Payment Required) a propósito, no 403: el bloqueo se levanta
    // pagando/actualizando de plan, no cambiando de rol ni de permisos.
    throw new ErrorDominio("plan_limite_alcanzado", resultado.motivo);
  }
}
