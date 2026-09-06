import type { Migracion } from "../runner/tipos.js";

// H-066 (RV12 §6, §Auditoría-1): auditoría append-only de TODA mutación
// financiera (statement, gasto, comisión, ajuste de payout). Tablas con
// `tenant_id` directo (regla_comision_canal, payout_canal, owner_statement)
// reutilizan `fn_auditoria_directa()` (definida en 0013, ya disponible
// aquí); las demás necesitan su propia función porque el tenant se deriva
// por una cadena de joins distinta en cada caso.
export const migracion0055FinanzasAuditoria: Migracion = {
  id: "0055_finanzas_auditoria",
  descripcion: "triggers de auditoría en tablas de mutación financiera (Lote 7)",
  up: `
    CREATE OR REPLACE FUNCTION fn_auditoria_reserva_financiero() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_ocupacion uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_ocupacion := COALESCE(NEW.ocupacion_unidad_id, OLD.ocupacion_unidad_id);
      v_tenant := unidad_tenant_id(ocupacion_unidad_de(v_ocupacion));
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, v_actor, v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE OR REPLACE FUNCTION fn_auditoria_linea_financiera() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_reserva_financiero uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_reserva_financiero := COALESCE(NEW.reserva_financiero_id, OLD.reserva_financiero_id);
      v_tenant := unidad_tenant_id(reserva_financiero_unidad_id(v_reserva_financiero));
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, v_actor, v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE OR REPLACE FUNCTION fn_auditoria_payout_linea() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_tenant := payout_canal_tenant_id(COALESCE(NEW.payout_id, OLD.payout_id));
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, v_actor, v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    -- H-062/§Auditoría-1: un ajuste manual a un statement ya generado debe
    -- VERSIONAR, no sobrescribir — este trigger audita cualquier UPDATE que
    -- ocurra de todas formas (defensa en profundidad), aunque la capa de
    -- aplicación (apps/api) nunca debe emitir un UPDATE sobre una fila de
    -- owner_statement ya generada, solo INSERT de una nueva versión.
    CREATE OR REPLACE FUNCTION fn_auditoria_owner_statement_linea() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_tenant := owner_statement_tenant_id(COALESCE(NEW.statement_id, OLD.statement_id));
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, v_actor, v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_regla_comision_canal
      AFTER INSERT OR UPDATE OR DELETE ON regla_comision_canal
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_directa();

    CREATE TRIGGER auditoria_reserva_financiero
      AFTER INSERT OR UPDATE OR DELETE ON reserva_financiero
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_reserva_financiero();

    CREATE TRIGGER auditoria_linea_gasto
      AFTER INSERT OR UPDATE OR DELETE ON linea_gasto
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_linea_financiera();

    CREATE TRIGGER auditoria_linea_impuesto
      AFTER INSERT OR UPDATE OR DELETE ON linea_impuesto
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_linea_financiera();

    CREATE TRIGGER auditoria_payout_canal
      AFTER INSERT OR UPDATE OR DELETE ON payout_canal
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_directa();

    CREATE TRIGGER auditoria_payout_linea
      AFTER INSERT OR UPDATE OR DELETE ON payout_linea
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_payout_linea();

    CREATE TRIGGER auditoria_owner_statement
      AFTER INSERT OR UPDATE OR DELETE ON owner_statement
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_directa();

    CREATE TRIGGER auditoria_owner_statement_linea
      AFTER INSERT OR UPDATE OR DELETE ON owner_statement_linea
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_owner_statement_linea();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_owner_statement_linea ON owner_statement_linea;
    DROP TRIGGER IF EXISTS auditoria_owner_statement ON owner_statement;
    DROP TRIGGER IF EXISTS auditoria_payout_linea ON payout_linea;
    DROP TRIGGER IF EXISTS auditoria_payout_canal ON payout_canal;
    DROP TRIGGER IF EXISTS auditoria_linea_impuesto ON linea_impuesto;
    DROP TRIGGER IF EXISTS auditoria_linea_gasto ON linea_gasto;
    DROP TRIGGER IF EXISTS auditoria_reserva_financiero ON reserva_financiero;
    DROP TRIGGER IF EXISTS auditoria_regla_comision_canal ON regla_comision_canal;

    DROP FUNCTION IF EXISTS fn_auditoria_owner_statement_linea();
    DROP FUNCTION IF EXISTS fn_auditoria_payout_linea();
    DROP FUNCTION IF EXISTS fn_auditoria_linea_financiera();
    DROP FUNCTION IF EXISTS fn_auditoria_reserva_financiero();
  `,
};
