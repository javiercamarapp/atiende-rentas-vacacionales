import type { PoolClient } from "pg";
import { evaluarAntesDeIncrementar, type RecursoLimitado } from "@atiende-rv/domain/facturacion";
import { ErrorDominio } from "../contrato/errores.js";

/**
 * Aplicación en SERVIDOR de los límites de plan (RV16: "límites por plan
 * aplicados en servidor") — se llama explícitamente al inicio de la
 * MISMA transacción que hace el `INSERT` real del recurso limitado
 * (unidad, cuenta de canal, mensaje de IA), DESPUÉS de `exigirRol` y
 * SIEMPRE antes de ese `INSERT`. Nunca como middleware genérico montado
 * con `app.use`: el punto exacto en el que "se agotaría el plan" depende
 * de qué recurso crea cada ruta (una unidad nueva vs. una cuenta de
 * canal nueva), así que cada ruta pasa su propio `RecursoLimitado`.
 *
 * A3-FACT-02 (docs/auditoria-3/facturacion-onboarding.md) — ALTO,
 * corregido: la versión anterior de esta función abría su PROPIA
 * conexión/transacción (`conSesion(pool, ...)`), separada de la
 * transacción que hacía el `INSERT` real en la ruta llamante — un
 * clásico TOCTOU (time-of-check to time-of-use). Dos peticiones
 * concurrentes podían leer AMBAS "0 de 1" en `medicion_uso_actual` antes
 * de que cualquiera insertara, pasar el chequeo las DOS, e insertar las
 * DOS, excediendo el límite del plan (repro real:
 * tests/auditoria-3/facturacion/limitePlanRace.test.ts).
 *
 * La corrección: esta función ya NO abre su propia conexión — recibe el
 * `PoolClient` de la transacción activa (misma sesión RLS, mismo
 * `BEGIN`/`COMMIT` que el INSERT que la llama) y, como PRIMERA
 * operación, toma un advisory lock TRANSACCIONAL (`pg_advisory_xact_lock`,
 * se libera solo al COMMIT/ROLLBACK de esa transacción — mismo patrón
 * que `bloquearUnidadEnTransaccion` en
 * packages/domain/src/aplicacion/ejecutor.ts y el lock de
 * `owner_statement:` en apps/api/src/routes/finanzas.ts) con una clave
 * namespaced por tenant. Eso serializa, por tenant, cualquier secuencia
 * concurrente de "leer uso -> comparar -> insertar": la segunda petición
 * espera a que la PRIMERA transacción entera termine (COMMIT o ROLLBACK)
 * antes de leer `medicion_uso_actual`, así que ve el uso YA
 * incrementado por la primera — nunca puede pasar el chequeo si el
 * cupo real ya se agotó. Recursos de tenants distintos nunca se
 * bloquean entre sí.
 *
 * Un tenant sin fila en `suscripcion_tenant` (no debería ocurrir tras
 * onboarding, pero un tenant creado por el `POST /tenants` de Superadmin
 * antes de este lote no tiene una) NO se bloquea — fail-open
 * deliberado solo para este caso de transición, documentado, nunca
 * silencioso (ver comentario en el propio código). Un superadmin sin
 * tenant (`tenantId === null`) tampoco está limitado por ningún plan —
 * actúa a nivel de plataforma, no de un tenant específico.
 */
export async function exigirLimitePlanEnTransaccion(
  cliente: PoolClient,
  tenantId: string | null,
  recurso: RecursoLimitado,
): Promise<void> {
  if (!tenantId) return;

  // A3-FACT-02: advisory lock transaccional por tenant, PRIMERA operación
  // — debe tomarse ANTES de leer `medicion_uso_actual` para que serialice
  // de verdad el chequeo con el INSERT posterior de esta misma
  // transacción. La clave incluye un namespace textual
  // ("facturacion_limite_plan:") para no compartir espacio de hash con
  // otros advisory locks del repo que usan UUIDs crudos como clave
  // (`bloquearUnidadEnTransaccion`).
  await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `facturacion_limite_plan:${tenantId}`,
  ]);

  const periodo = new Date().toISOString().slice(0, 7); // "AAAA-MM"

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
  if (!plan) return;

  const { rows: filasUso } = await cliente.query<{
    unidades_activas: number;
    mensajes_ia_mes: number;
    cuentas_canal: number;
  }>("SELECT * FROM medicion_uso_actual($1, $2)", [tenantId, periodo]);
  const uso = filasUso[0]!;

  const resultado = evaluarAntesDeIncrementar({
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

  if (!resultado.permitido) {
    // 402 (Payment Required) a propósito, no 403: el bloqueo se levanta
    // pagando/actualizando de plan, no cambiando de rol ni de permisos.
    // Lanzar aquí, dentro de la transacción de la ruta llamante, hace que
    // su `enTransaccion`/`catch` haga ROLLBACK y libere el advisory lock
    // de inmediato.
    throw new ErrorDominio("plan_limite_alcanzado", resultado.motivo);
  }
}
