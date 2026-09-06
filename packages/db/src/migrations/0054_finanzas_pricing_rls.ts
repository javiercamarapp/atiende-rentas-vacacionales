import type { Migracion } from "../runner/tipos.js";

// H-041/H-062/H-068 (D-020, §Roles-4): ENABLE/FORCE ROW LEVEL SECURITY +
// políticas por rol en TODAS las tablas nuevas de Lote 7 (finanzas +
// pricing). Reutiliza los helpers `SECURITY DEFINER` de 0014
// (is_tenant_member/rol_actual/owner_actual/unidad_tenant_id/unidad_owner_id/
// owner_tenant_id/ocupacion_unidad_de), y añade tres helpers propios para
// las cadenas de joins específicas de finanzas (reserva_financiero →
// ocupacion_unidad → unidad → propiedad).
//
// Regla de acceso transversal exigida por el encargo: "propietario solo ve
// sus propios statements; contador solo ve finanzas (nunca calendario)".
// contador NUNCA aparece en las políticas de pricing/tarifas (eso es
// operativo, no financiero) ni en `ocupacion_unidad`/`unidad` (0015, ya
// existente) — solo en las tablas de este archivo.
export const migracion0054FinanzasPricingRls: Migracion = {
  id: "0054_finanzas_pricing_rls",
  descripcion: "helpers + ENABLE/FORCE RLS en tablas de finanzas y pricing (Lote 7)",
  up: `
    CREATE OR REPLACE FUNCTION reserva_financiero_unidad_id(_rf uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT ocupacion_unidad_de(ocupacion_unidad_id) FROM reserva_financiero WHERE id = _rf
    $$;
    CREATE OR REPLACE FUNCTION owner_statement_tenant_id(_statement uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT tenant_id FROM owner_statement WHERE id = _statement
    $$;
    CREATE OR REPLACE FUNCTION owner_statement_owner_id(_statement uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT owner_id FROM owner_statement WHERE id = _statement
    $$;
    CREATE OR REPLACE FUNCTION payout_canal_tenant_id(_payout uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT tenant_id FROM payout_canal WHERE id = _payout
    $$;

    -- H-067/§Roles-4: contador debe poder leer la alerta de RFC de la
    -- unidad asociada a un movimiento financiero SIN ganar acceso a
    -- ocupacion_unidad/unidad en general (0015 los excluye
    -- explícitamente de esos SELECT). Un JOIN normal desde la capa de
    -- aplicación quedaría vacío para contador porque RLS filtraría la fila
    -- de ocupacion_unidad/unidad antes de llegar al JOIN — esta función
    -- SECURITY DEFINER expone solo el campo puntual necesario.
    CREATE OR REPLACE FUNCTION reserva_financiero_rfc_propietario(_rf uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.rfc_propietario
      FROM reserva_financiero rf
      JOIN ocupacion_unidad ou ON ou.id = rf.ocupacion_unidad_id
      JOIN unidad u ON u.id = ou.unidad_id
      WHERE rf.id = _rf
    $$;

    GRANT EXECUTE ON FUNCTION reserva_financiero_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION owner_statement_tenant_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION owner_statement_owner_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION payout_canal_tenant_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION reserva_financiero_rfc_propietario(uuid) TO app_rv;

    ALTER TABLE regla_comision_canal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE regla_comision_canal FORCE ROW LEVEL SECURITY;
    ALTER TABLE reserva_financiero ENABLE ROW LEVEL SECURITY;
    ALTER TABLE reserva_financiero FORCE ROW LEVEL SECURITY;
    ALTER TABLE linea_gasto ENABLE ROW LEVEL SECURITY;
    ALTER TABLE linea_gasto FORCE ROW LEVEL SECURITY;
    ALTER TABLE linea_impuesto ENABLE ROW LEVEL SECURITY;
    ALTER TABLE linea_impuesto FORCE ROW LEVEL SECURITY;
    ALTER TABLE payout_canal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payout_canal FORCE ROW LEVEL SECURITY;
    ALTER TABLE payout_linea ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payout_linea FORCE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement ENABLE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement FORCE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement_linea ENABLE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement_linea FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_base ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_base FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_temporada ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_temporada FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_descuento_duracion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_descuento_duracion FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_min_stay ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_min_stay FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_regla_canal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_regla_canal FORCE ROW LEVEL SECURITY;

    -- regla_comision_canal: configuración financiera, nunca visible para
    -- propietario/operador/limpieza (evita que un propietario infiera la
    -- comisión negociada de OTRO propietario del mismo tenant).
    CREATE POLICY regla_comision_canal_select ON regla_comision_canal FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora', 'contador'));
    CREATE POLICY regla_comision_canal_escritura ON regla_comision_canal FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- reserva_financiero / linea_gasto / linea_impuesto: contador ve todo
    -- el tenant (finanzas consolidadas); propietario solo lo de SUS
    -- unidades (nunca las de otro propietario del mismo tenant).
    CREATE POLICY reserva_financiero_select ON reserva_financiero FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora', 'contador')
          OR (rol_actual() = 'propietario' AND unidad_owner_id(ocupacion_unidad_de(ocupacion_unidad_id)) = owner_actual())
        )
      );
    CREATE POLICY reserva_financiero_escritura ON reserva_financiero FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))));

    CREATE POLICY linea_gasto_select ON linea_gasto FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(reserva_financiero_unidad_id(reserva_financiero_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora', 'contador')
          OR (rol_actual() = 'propietario' AND unidad_owner_id(reserva_financiero_unidad_id(reserva_financiero_id)) = owner_actual())
        )
      );
    CREATE POLICY linea_gasto_escritura ON linea_gasto FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(reserva_financiero_unidad_id(reserva_financiero_id))))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(reserva_financiero_unidad_id(reserva_financiero_id))));

    CREATE POLICY linea_impuesto_select ON linea_impuesto FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(reserva_financiero_unidad_id(reserva_financiero_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora', 'contador')
          OR (rol_actual() = 'propietario' AND unidad_owner_id(reserva_financiero_unidad_id(reserva_financiero_id)) = owner_actual())
        )
      );
    CREATE POLICY linea_impuesto_escritura ON linea_impuesto FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(reserva_financiero_unidad_id(reserva_financiero_id))))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(reserva_financiero_unidad_id(reserva_financiero_id))));

    -- payout_canal / payout_linea: nivel gestor, nunca expuesto a
    -- propietario/operador/limpieza (evita filtrar referencias bancarias de
    -- otros propietarios del mismo payout agregado).
    CREATE POLICY payout_canal_select ON payout_canal FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora', 'contador'));
    CREATE POLICY payout_canal_escritura ON payout_canal FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    CREATE POLICY payout_linea_select ON payout_linea FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), payout_canal_tenant_id(payout_id)) AND rol_actual() IN ('superadmin', 'admin_gestora', 'contador'));
    CREATE POLICY payout_linea_escritura ON payout_linea FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), payout_canal_tenant_id(payout_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), payout_canal_tenant_id(payout_id)));

    -- owner_statement / owner_statement_linea: caso central del encargo
    -- ("propietario A no ve statements de B"). tenant_id está denormalizado
    -- en owner_statement, así que el chequeo de tenant no depende de owner.
    CREATE POLICY owner_statement_select ON owner_statement FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora', 'contador')
          OR (rol_actual() = 'propietario' AND owner_id = owner_actual())
        )
      );
    CREATE POLICY owner_statement_escritura ON owner_statement FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    CREATE POLICY owner_statement_linea_select ON owner_statement_linea FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), owner_statement_tenant_id(statement_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora', 'contador')
          OR (rol_actual() = 'propietario' AND owner_statement_owner_id(statement_id) = owner_actual())
        )
      );
    CREATE POLICY owner_statement_linea_escritura ON owner_statement_linea FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), owner_statement_tenant_id(statement_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), owner_statement_tenant_id(statement_id)));

    -- Pricing: operativo, no financiero — contador SIN acceso (mismo
    -- patrón que unidad/ocupacion_unidad en 0015). Propietario ve solo el
    -- pricing de sus propias unidades (informativo).
    CREATE POLICY tarifa_base_select ON tarifa_base FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR unidad_owner_id(unidad_id) = owner_actual())
      );
    CREATE POLICY tarifa_base_escritura ON tarifa_base FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY tarifa_temporada_select ON tarifa_temporada FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR unidad_owner_id(unidad_id) = owner_actual())
      );
    CREATE POLICY tarifa_temporada_escritura ON tarifa_temporada FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY tarifa_descuento_duracion_select ON tarifa_descuento_duracion FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR unidad_owner_id(unidad_id) = owner_actual())
      );
    CREATE POLICY tarifa_descuento_duracion_escritura ON tarifa_descuento_duracion FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY tarifa_min_stay_select ON tarifa_min_stay FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR unidad_owner_id(unidad_id) = owner_actual())
      );
    CREATE POLICY tarifa_min_stay_escritura ON tarifa_min_stay FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY tarifa_regla_canal_select ON tarifa_regla_canal FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR unidad_owner_id(unidad_id) = owner_actual())
      );
    CREATE POLICY tarifa_regla_canal_escritura ON tarifa_regla_canal FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));
  `,
  down: `
    DROP POLICY IF EXISTS tarifa_regla_canal_escritura ON tarifa_regla_canal;
    DROP POLICY IF EXISTS tarifa_regla_canal_select ON tarifa_regla_canal;
    DROP POLICY IF EXISTS tarifa_min_stay_escritura ON tarifa_min_stay;
    DROP POLICY IF EXISTS tarifa_min_stay_select ON tarifa_min_stay;
    DROP POLICY IF EXISTS tarifa_descuento_duracion_escritura ON tarifa_descuento_duracion;
    DROP POLICY IF EXISTS tarifa_descuento_duracion_select ON tarifa_descuento_duracion;
    DROP POLICY IF EXISTS tarifa_temporada_escritura ON tarifa_temporada;
    DROP POLICY IF EXISTS tarifa_temporada_select ON tarifa_temporada;
    DROP POLICY IF EXISTS tarifa_base_escritura ON tarifa_base;
    DROP POLICY IF EXISTS tarifa_base_select ON tarifa_base;
    DROP POLICY IF EXISTS owner_statement_linea_escritura ON owner_statement_linea;
    DROP POLICY IF EXISTS owner_statement_linea_select ON owner_statement_linea;
    DROP POLICY IF EXISTS owner_statement_escritura ON owner_statement;
    DROP POLICY IF EXISTS owner_statement_select ON owner_statement;
    DROP POLICY IF EXISTS payout_linea_escritura ON payout_linea;
    DROP POLICY IF EXISTS payout_linea_select ON payout_linea;
    DROP POLICY IF EXISTS payout_canal_escritura ON payout_canal;
    DROP POLICY IF EXISTS payout_canal_select ON payout_canal;
    DROP POLICY IF EXISTS linea_impuesto_escritura ON linea_impuesto;
    DROP POLICY IF EXISTS linea_impuesto_select ON linea_impuesto;
    DROP POLICY IF EXISTS linea_gasto_escritura ON linea_gasto;
    DROP POLICY IF EXISTS linea_gasto_select ON linea_gasto;
    DROP POLICY IF EXISTS reserva_financiero_escritura ON reserva_financiero;
    DROP POLICY IF EXISTS reserva_financiero_select ON reserva_financiero;
    DROP POLICY IF EXISTS regla_comision_canal_escritura ON regla_comision_canal;
    DROP POLICY IF EXISTS regla_comision_canal_select ON regla_comision_canal;

    ALTER TABLE tarifa_regla_canal NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_regla_canal DISABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_min_stay NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_min_stay DISABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_descuento_duracion NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_descuento_duracion DISABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_temporada NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_temporada DISABLE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_base NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE tarifa_base DISABLE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement_linea NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement_linea DISABLE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE owner_statement DISABLE ROW LEVEL SECURITY;
    ALTER TABLE payout_linea NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE payout_linea DISABLE ROW LEVEL SECURITY;
    ALTER TABLE payout_canal NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE payout_canal DISABLE ROW LEVEL SECURITY;
    ALTER TABLE linea_impuesto NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE linea_impuesto DISABLE ROW LEVEL SECURITY;
    ALTER TABLE linea_gasto NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE linea_gasto DISABLE ROW LEVEL SECURITY;
    ALTER TABLE reserva_financiero NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE reserva_financiero DISABLE ROW LEVEL SECURITY;
    ALTER TABLE regla_comision_canal NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE regla_comision_canal DISABLE ROW LEVEL SECURITY;

    DROP FUNCTION IF EXISTS reserva_financiero_rfc_propietario(uuid);
    DROP FUNCTION IF EXISTS payout_canal_tenant_id(uuid);
    DROP FUNCTION IF EXISTS owner_statement_owner_id(uuid);
    DROP FUNCTION IF EXISTS owner_statement_tenant_id(uuid);
    DROP FUNCTION IF EXISTS reserva_financiero_unidad_id(uuid);
  `,
};
