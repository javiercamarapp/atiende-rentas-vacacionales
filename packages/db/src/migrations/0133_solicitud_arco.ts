import type { Migracion } from "../runner/tipos.js";

// REQ-151 (docs/REQUISITOS.md, MUST, área Legal/Privacidad): bandeja de
// gestión de solicitudes ARCO/derechos del interesado (RGPD) con plazos
// legales POR JURISDICCIÓN, estado y responsable asignado. Explícitamente
// una herramienta de FLUJO, no de decisión sustantiva (RV19-R-11) — nunca
// decide si una solicitud procede o no, solo registra el ticket, calcula
// el plazo estatutario y da seguimiento a quién la atiende. REQ-151 es
// independiente de REQ-150 (aviso de privacidad, "bloqueado por laguna
// legal (revisión humana pendiente)" en docs/REQUISITOS.md): esta tabla y
// sus rutas no generan ningún texto legal, así que no dependen de esa
// revisión pendiente.
//
// `plazo_limite` es una columna GENERATED (nunca editable a mano, ni
// siquiera por superadmin): el plazo estatutario no es una decisión de
// producto, así que la tabla no ofrece forma de "extenderlo" — eso
// reforzaría justo lo que RV19-R-11 pide evitar (que la herramienta tome
// una decisión sustantiva, en este caso "cuánto tiempo hay realmente").
// Ver `fn_calcular_plazo_arco` para las dos fuentes citadas en
// docs/REQUISITOS.md:
//   - LFPDPPP Art. 32 (México): 20 días HÁBILES para comunicar la
//     determinación.
//   - RGPD Art. 12(3) (UE): 1 mes desde la recepción (la ampliación de 2
//     meses adicionales para casos complejos SÍ es una decisión sustantiva
//     del responsable — deliberadamente no modelada aquí).
// Limitación documentada (ver también ACEPTACION.md ítem 9): el cálculo de
// días hábiles de México cuenta lunes-viernes pero NO excluye días
// festivos oficiales (sin calendario de festivos todavía) — el plazo
// calculado es un piso conservador razonable, nunca el que decide la
// fecha real de vencimiento sin revisión humana.
export const migracion0133SolicitudArco: Migracion = {
  id: "0133_solicitud_arco",
  descripcion: "solicitud_arco: bandeja de solicitudes ARCO/RGPD con plazo por jurisdicción, estado y responsable (REQ-151)",
  up: `
    -- IMMUTABLE a propósito (nunca llama now()/current_setting): depende
    -- solo de sus dos argumentos, condición para poder usarla en una
    -- columna GENERATED ALWAYS AS más abajo.
    CREATE OR REPLACE FUNCTION fn_calcular_plazo_arco(_jurisdiccion text, _recibida_en timestamptz) RETURNS timestamptz
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE
      v_dia date;
      v_dias_habiles_restantes integer;
    BEGIN
      IF _jurisdiccion = 'ue_rgpd' THEN
        RETURN _recibida_en + interval '1 month';
      ELSIF _jurisdiccion = 'mx_lfpdppp' THEN
        v_dia := _recibida_en::date;
        v_dias_habiles_restantes := 20;
        WHILE v_dias_habiles_restantes > 0 LOOP
          v_dia := v_dia + 1;
          -- ISODOW: 1=lunes .. 7=domingo; cuenta solo lunes-viernes.
          IF extract(isodow FROM v_dia) < 6 THEN
            v_dias_habiles_restantes := v_dias_habiles_restantes - 1;
          END IF;
        END LOOP;
        RETURN v_dia::timestamptz + (_recibida_en - _recibida_en::date::timestamptz);
      ELSE
        RAISE EXCEPTION 'jurisdicción ARCO desconocida: %', _jurisdiccion;
      END IF;
    END;
    $$;

    CREATE TABLE solicitud_arco (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      -- ARCO: Acceso, Rectificación, Cancelación, Oposición (LFPDPPP
      -- Art. 21-34); el mismo conjunto cubre los derechos equivalentes de
      -- RGPD Art. 15-22 (acceso/rectificación/supresión/oposición) para no
      -- duplicar un segundo enum paralelo por jurisdicción.
      tipo_derecho        text NOT NULL CHECK (tipo_derecho IN ('acceso', 'rectificacion', 'cancelacion', 'oposicion')),
      jurisdiccion        text NOT NULL CHECK (jurisdiccion IN ('mx_lfpdppp', 'ue_rgpd')),
      solicitante_nombre  text NOT NULL CHECK (btrim(solicitante_nombre) <> ''),
      solicitante_email   text NOT NULL CHECK (btrim(solicitante_email) <> ''),
      descripcion         text,
      estado              text NOT NULL DEFAULT 'recibida' CHECK (estado IN ('recibida', 'en_proceso', 'resuelta', 'rechazada')),
      -- Responsable asignado (H-legal/privacidad): un usuario del propio
      -- tenant, nunca obligatorio en la creación (una solicitud puede
      -- entrar sin asignar todavía). ON DELETE SET NULL: si el usuario se
      -- da de baja, el ticket permanece intacto, solo pierde su
      -- responsable — nunca se borra un ticket ARCO por eso.
      responsable_id      uuid REFERENCES usuario(id) ON DELETE SET NULL,
      recibida_en         timestamptz NOT NULL DEFAULT now(),
      plazo_limite        timestamptz GENERATED ALWAYS AS (fn_calcular_plazo_arco(jurisdiccion, recibida_en)) STORED,
      resuelta_en         timestamptz,
      resolucion_notas    text,
      creado_en           timestamptz NOT NULL DEFAULT now(),
      actualizado_en      timestamptz NOT NULL DEFAULT now(),
      -- Nunca queda "resuelta"/"rechazada" sin una nota que documente qué
      -- se decidió (la decisión sustantiva la toma un humano fuera de esta
      -- herramienta; esta tabla exige que quede POR ESCRITO, no que la
      -- tome ella).
      CHECK (estado NOT IN ('resuelta', 'rechazada') OR resolucion_notas IS NOT NULL),
      CHECK ((estado IN ('resuelta', 'rechazada')) = (resuelta_en IS NOT NULL))
    );

    -- La bandeja lista/filtra por tenant+estado ordenando por urgencia
    -- (plazo_limite ascendente) — índice compuesto en ese orden exacto.
    CREATE INDEX solicitud_arco_tenant_estado_plazo_idx
      ON solicitud_arco (tenant_id, estado, plazo_limite);

    ALTER TABLE solicitud_arco ENABLE ROW LEVEL SECURITY;
    ALTER TABLE solicitud_arco FORCE ROW LEVEL SECURITY;

    -- Mismo criterio de rol que el resto de configuración legal/de
    -- cumplimiento del tenant (facturación, webhook de notificaciones):
    -- ROLES_ADMIN (superadmin, admin_gestora) — un operador nunca ve ni
    -- gestiona esta bandeja por esta política (aunque sea quien reciba el
    -- correo original, el alta la hace un admin).
    CREATE POLICY solicitud_arco_select ON solicitud_arco FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'));
    CREATE POLICY solicitud_arco_insert ON solicitud_arco FOR INSERT
      WITH CHECK (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'));
    CREATE POLICY solicitud_arco_update ON solicitud_arco FOR UPDATE
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'))
      WITH CHECK (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'));
    -- Sin política de DELETE a propósito: un ticket ARCO nunca se borra
    -- (es el propio registro de cumplimiento) — solo transiciona de
    -- estado. Sin política == ningún DELETE pasa, ni siquiera de
    -- superadmin/admin_gestora.

    -- Auditoría dedicada (no fn_auditoria_directa, 0013): esa función
    -- genérica solo excluye las columnas 'email'/'password_hash' por
    -- nombre exacto — aquí la columna de PII del interesado se llama
    -- 'solicitante_email' (no 'email'), así que un trigger genérico la
    -- habría dejado en texto plano dentro de 'auditoria_mutacion'. Se
    -- excluyen también nombre/descripción/notas de resolución por el
    -- mismo criterio de minimización (§Privacidad-1): la fila de auditoría
    -- conserva el ciclo de vida del ticket (estado, responsable, plazo)
    -- sin duplicar los datos personales del interesado en una segunda
    -- tabla.
    CREATE OR REPLACE FUNCTION fn_auditoria_solicitud_arco() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_previos jsonb;
      v_nuevos jsonb;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_previos := to_jsonb(OLD) - 'solicitante_nombre' - 'solicitante_email' - 'descripcion' - 'resolucion_notas';
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_nuevos := to_jsonb(NEW) - 'solicitante_nombre' - 'solicitante_email' - 'descripcion' - 'resolucion_notas';
      END IF;
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES ('solicitud_arco', COALESCE(NEW.id, OLD.id), TG_OP, v_actor, COALESCE(NEW.tenant_id, OLD.tenant_id), v_previos, v_nuevos);
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_solicitud_arco
      AFTER INSERT OR UPDATE OR DELETE ON solicitud_arco
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_solicitud_arco();
  `,
  down: `
    DROP TRIGGER IF EXISTS auditoria_solicitud_arco ON solicitud_arco;
    DROP FUNCTION IF EXISTS fn_auditoria_solicitud_arco();
    DROP TABLE IF EXISTS solicitud_arco;
    DROP FUNCTION IF EXISTS fn_calcular_plazo_arco(text, timestamptz);
  `,
};
