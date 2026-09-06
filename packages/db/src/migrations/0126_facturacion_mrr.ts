import type { Migracion } from "../runner/tipos.js";

// Lote 3.3 (RV16) — MRR estimado de Superadmin (GET /facturacion/mrr).
//
// Encontrado con una prueba de integración real (H-075/H-076, Lote 8,
// migración 0061_acceso_romper_cristal.ts): desde ese lote, superadmin
// YA NO es "miembro honorario" incondicional de cualquier tenant en
// `is_tenant_member` — necesita una concesión "romper cristal" auditada
// y con vigencia acotada para leer el CONTENIDO de negocio de un tenant
// específico. Un `SELECT ... FROM suscripcion_tenant` con sesión de
// superadmin (sin conceción) devuelve 0 filas EN SILENCIO — verificado en
// vivo al construir `GET /facturacion/mrr`.
//
// Exigirle a Superadmin abrir una concesión de "romper cristal" por
// tenant solo para ver un agregado de MRR sería absurdo (el mismo
// razonamiento que ya llevó a la política `tenant_select_superadmin_
// directorio` de 0061: un directorio/agregado de plataforma no es "leer
// el contenido de negocio de un tenant específico"). Esta función
// SECURITY DEFINER expone el mínimo necesario para calcular el agregado
// (nunca datos de negocio distintos de la suscripción/plan/conteo de
// unidades) y revalida `rol_actual() = 'superadmin'` dentro de sí misma
// — la ruta HTTP (`apps/api/src/routes/facturacion.ts`) sigue haciendo su
// propio `exigirRol` también (defensa en profundidad).
export const migracion0126FacturacionMrr: Migracion = {
  id: "0126_facturacion_mrr",
  descripcion: "facturacion_listar_activas_para_mrr() — agregado de plataforma para Superadmin, sin romper cristal",
  up: `
    CREATE FUNCTION facturacion_listar_activas_para_mrr()
    RETURNS TABLE(tenant_id uuid, plan_codigo text, add_ons_activos jsonb, unidades_activas integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF rol_actual() IS DISTINCT FROM 'superadmin' THEN
        RAISE EXCEPTION 'solo Superadmin puede consultar el agregado de MRR' USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN QUERY
        SELECT
          st.tenant_id,
          st.plan_codigo,
          st.add_ons_activos,
          (SELECT count(*)::int FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE p.tenant_id = st.tenant_id)
        FROM suscripcion_tenant st
        WHERE st.estado = 'activa';
    END;
    $$;
    REVOKE ALL ON FUNCTION facturacion_listar_activas_para_mrr() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_listar_activas_para_mrr() TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS facturacion_listar_activas_para_mrr();
  `,
};
