import type { Migracion } from "../runner/tipos.js";

// H-056 (REQ-099, REQ-101): plantillas por evento/idioma/canal con
// variables `{{nombre}}` (packages/domain/src/mensajeria/plantillas.ts) +
// programación de mensajes automáticos. `aprobada_por_tenant` es el
// invariante central de H-056: la programación (`mensaje_programado`)
// SOLO puede referenciar una plantilla con esta columna en `true` —
// verificado en la capa de aplicación
// (`exigirPlantillaAprobadaParaProgramar`) y reforzado aquí con un CHECK
// que impide crear una fila de `mensaje_programado` apuntando a una
// plantilla que no lo esté, vía el trigger `fn_exigir_plantilla_aprobada`
// (un CHECK simple no puede referenciar otra tabla).
export const migracion0041MensajeriaPlantillas: Migracion = {
  id: "0041_mensajeria_plantillas",
  descripcion: "mensajeria: plantilla_mensaje + mensaje_programado (solo plantillas aprobadas)",
  up: `
    CREATE TABLE plantilla_mensaje (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id             uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      evento                text NOT NULL CHECK (evento IN ('confirmacion', 'pre_llegada', 'check_in', 'check_out', 'resena')),
      idioma                text NOT NULL CHECK (idioma IN ('es', 'en')),
      canal_codigo          text CHECK (canal_codigo IN ('airbnb', 'vrbo', 'booking')),
      cuerpo                text NOT NULL,
      variables_requeridas  text[] NOT NULL DEFAULT '{}'::text[],
      activa                boolean NOT NULL DEFAULT true,
      aprobada_por_tenant   boolean NOT NULL DEFAULT false,
      aprobada_por          uuid REFERENCES usuario(id) ON DELETE SET NULL,
      aprobada_en           timestamptz,
      creado_en             timestamptz NOT NULL DEFAULT now(),
      actualizado_en        timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT plantilla_mensaje_aprobacion_coherente CHECK (
        (aprobada_por_tenant AND aprobada_por IS NOT NULL AND aprobada_en IS NOT NULL)
        OR (NOT aprobada_por_tenant)
      )
    );
    CREATE INDEX plantilla_mensaje_tenant_id_idx ON plantilla_mensaje (tenant_id);
    CREATE INDEX plantilla_mensaje_evento_idx ON plantilla_mensaje (tenant_id, evento, idioma);

    CREATE TABLE mensaje_programado (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversacion_id   uuid NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
      plantilla_id      uuid NOT NULL REFERENCES plantilla_mensaje(id),
      programado_para   timestamptz NOT NULL,
      estado            text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'generado', 'cancelado', 'omitido')),
      creado_en         timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX mensaje_programado_conversacion_id_idx ON mensaje_programado (conversacion_id);
    CREATE INDEX mensaje_programado_programado_para_idx ON mensaje_programado (programado_para) WHERE estado = 'pendiente';

    -- Refuerzo a nivel BD (defensa en profundidad sobre la verificación de
    -- aplicación, H-056): ninguna fila de mensaje_programado puede
    -- referenciar una plantilla que no esté aprobada por el tenant. Un
    -- trigger BEFORE INSERT/UPDATE, no un CHECK (que no puede consultar
    -- otra tabla).
    CREATE OR REPLACE FUNCTION fn_exigir_plantilla_aprobada() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_aprobada boolean;
      v_activa boolean;
    BEGIN
      SELECT aprobada_por_tenant, activa INTO v_aprobada, v_activa
      FROM plantilla_mensaje WHERE id = NEW.plantilla_id;
      IF v_aprobada IS NOT TRUE OR v_activa IS NOT TRUE THEN
        RAISE EXCEPTION 'plantilla_no_aprobada: solo plantillas aprobadas y activas pueden programarse (H-056)'
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER exigir_plantilla_aprobada_antes_de_programar
      BEFORE INSERT OR UPDATE ON mensaje_programado
      FOR EACH ROW EXECUTE FUNCTION fn_exigir_plantilla_aprobada();
  `,
  down: `
    DROP TRIGGER IF EXISTS exigir_plantilla_aprobada_antes_de_programar ON mensaje_programado;
    DROP FUNCTION IF EXISTS fn_exigir_plantilla_aprobada();
    DROP TABLE IF EXISTS mensaje_programado;
    DROP TABLE IF EXISTS plantilla_mensaje;
  `,
};
