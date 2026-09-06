import type { Migracion } from "../runner/tipos.js";

// H-074: "salud agregada de integraciones por canal" y métricas por tenant
// (unidades, cuentas de canal, alertas abiertas, tamaño de outbox) para el
// panel de superadmin — SIN exigir una concesión "romper cristal" por
// tenant, a propósito: son CONTEOS agregados, nunca contenido de negocio
// (ningún nombre de huésped/propietario, ninguna credencial, ninguna
// fecha de reserva individual), el mismo criterio que ya distingue el
// directorio de tenants (`0061_acceso_romper_cristal.ts`) de sus datos de
// negocio. `SECURITY DEFINER` + chequeo de rol explícito dentro de la
// función (no vía RLS, que exige is_tenant_member por fila): un
// superadmin que solo quiere saber "cuántas unidades tiene el tenant X"
// para decidir si vale la pena investigar más no necesita ya declarar un
// motivo — el motivo se exige en el momento de leer datos concretos
// (romper cristal), no en el de ver un número.
export const migracion0063BackofficeMetricasTenant: Migracion = {
  id: "0063_backoffice_metricas_tenant",
  descripcion: "backoffice_metricas_tenants(): conteos agregados por tenant para el panel de superadmin",
  up: `
    CREATE OR REPLACE FUNCTION backoffice_metricas_tenants(_tenant_id uuid DEFAULT NULL)
    RETURNS TABLE (
      tenant_id                     uuid,
      unidades_total                bigint,
      cuentas_canal_total           bigint,
      cuentas_canal_configuradas    bigint,
      cuentas_canal_simulador       bigint,
      alertas_abiertas              bigint,
      outbox_pendiente              bigint
    )
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF rol_actual() <> 'superadmin' THEN
        RAISE EXCEPTION insufficient_privilege USING MESSAGE = 'backoffice_metricas_tenants: solo superadmin';
      END IF;

      RETURN QUERY
      SELECT
        t.id,
        COALESCE((SELECT count(*) FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE p.tenant_id = t.id), 0),
        COALESCE((SELECT count(*) FROM cuenta_canal cc WHERE cc.tenant_id = t.id), 0),
        COALESCE((SELECT count(*) FROM cuenta_canal cc WHERE cc.tenant_id = t.id AND cc.credenciales_cifradas IS NOT NULL), 0),
        COALESCE((SELECT count(*) FROM cuenta_canal cc WHERE cc.tenant_id = t.id AND cc.es_simulador), 0),
        COALESCE((
          SELECT count(*) FROM alerta a
          JOIN unidad u2 ON u2.id = a.unidad_id
          JOIN propiedad p2 ON p2.id = u2.propiedad_id
          WHERE p2.tenant_id = t.id AND a.estado = 'activa'
        ), 0),
        COALESCE((
          SELECT count(*) FROM outbox_evento o
          JOIN ocupacion_unidad oc ON oc.id = o.ocupacion_unidad_id
          JOIN unidad u3 ON u3.id = oc.unidad_id
          JOIN propiedad p3 ON p3.id = u3.propiedad_id
          WHERE p3.tenant_id = t.id AND o.procesado_en IS NULL
        ), 0)
      FROM tenant t
      WHERE _tenant_id IS NULL OR t.id = _tenant_id;
    END;
    $$;

    REVOKE ALL ON FUNCTION backoffice_metricas_tenants(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION backoffice_metricas_tenants(uuid) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS backoffice_metricas_tenants(uuid);
  `,
};
