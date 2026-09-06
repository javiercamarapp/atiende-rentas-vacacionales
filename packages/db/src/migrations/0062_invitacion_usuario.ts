import type { Migracion } from "../runner/tipos.js";

// H-011/H-012 parte de formulario CRUD + BLUEPRINT §2.13: invitaciones de
// colaborador (RV12 §1, los 3 niveles de `colaborador_nivel` ya definidos
// en Lote 3). Nunca se persiste el token en claro: `token_hash` es un
// SHA-256 del token que sí viaja en el link de invitación (mismo patrón
// que `refresh_token.token_hash`, Lote 3).
export const migracion0062InvitacionUsuario: Migracion = {
  id: "0062_invitacion_usuario",
  descripcion: "invitacion_usuario (alta de colaboradores por invitación, con expiración)",
  up: `
    CREATE TABLE invitacion_usuario (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      email               text NOT NULL,
      rol                 text NOT NULL,
      colaborador_nivel   text,
      owner_id            uuid REFERENCES owner(id) ON DELETE SET NULL,
      token_hash          text NOT NULL UNIQUE,
      creado_por          uuid REFERENCES usuario(id) ON DELETE SET NULL,
      creado_en           timestamptz NOT NULL DEFAULT now(),
      expira_en           timestamptz NOT NULL,
      aceptada_en         timestamptz,
      revocada_en         timestamptz
    );
    CREATE INDEX invitacion_usuario_tenant_id_idx ON invitacion_usuario (tenant_id);
    -- Una sola invitación pendiente por email dentro de un mismo tenant.
    CREATE UNIQUE INDEX invitacion_usuario_pendiente_unica_idx
      ON invitacion_usuario (tenant_id, lower(email))
      WHERE aceptada_en IS NULL AND revocada_en IS NULL;

    ALTER TABLE invitacion_usuario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invitacion_usuario FORCE ROW LEVEL SECURITY;

    CREATE POLICY invitacion_usuario_select ON invitacion_usuario FOR SELECT
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));
    CREATE POLICY invitacion_usuario_escritura ON invitacion_usuario FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- Trigger de auditoría propio (no fn_auditoria_directa, 0013):
    -- excluye token_hash además de las columnas ya excluidas ahí — un
    -- hash de token es igual de sensible que una credencial cifrada de
    -- canal a efectos de qué NUNCA debe aparecer en auditoria_mutacion.
    CREATE OR REPLACE FUNCTION fn_auditoria_invitacion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_previos jsonb;
      v_nuevos jsonb;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      IF TG_OP = 'DELETE' THEN
        v_tenant := OLD.tenant_id;
      ELSE
        v_tenant := NEW.tenant_id;
      END IF;
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_previos := to_jsonb(OLD) - 'token_hash';
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_nuevos := to_jsonb(NEW) - 'token_hash';
      END IF;
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, v_actor, v_tenant, v_previos, v_nuevos);
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_invitacion_usuario
      AFTER INSERT OR UPDATE OR DELETE ON invitacion_usuario
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_invitacion();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_invitacion_usuario ON invitacion_usuario;
    DROP FUNCTION IF EXISTS fn_auditoria_invitacion();
    DROP POLICY IF EXISTS invitacion_usuario_escritura ON invitacion_usuario;
    DROP POLICY IF EXISTS invitacion_usuario_select ON invitacion_usuario;
    DROP TABLE IF EXISTS invitacion_usuario;
  `,
};
