-- Schema consolidado para el proyecto Supabase unificado — vertical: rentas
CREATE SCHEMA IF NOT EXISTS rentas;
SET search_path TO rentas, public;

-- Generado automáticamente concatenando packages/db/src/migrations/*.ts (rentas)
-- No editar a mano; regenerar desde el repo si cambian las migraciones.

-- ==== 0001_extensiones — Extensión btree_gist requerida por el EXCLUDE de ocupacion_unidad ====
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ==== 0002_tenant_empresa_owner — tenant, empresa_gestora, owner (esqueleto) ====
CREATE TABLE tenant (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre      text NOT NULL,
      tipo        text NOT NULL DEFAULT 'anfitrion'
                    CHECK (tipo IN ('anfitrion', 'empresa_gestora')),
      creado_en   timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE empresa_gestora (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      razon_social  text NOT NULL,
      creado_en     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id)
    );

    -- H-048 (multi-empresa-gestora, COULD) no se resuelve en Lote 1: un
    -- owner referencia una sola empresa_gestora por ahora. Ampliar a N:M
    -- requiere una decisión de producto explícita (documentado, no bug).
    CREATE TABLE owner (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_gestora_id  uuid REFERENCES empresa_gestora(id) ON DELETE SET NULL,
      nombre              text NOT NULL,
      email               text,
      creado_en           timestamptz NOT NULL DEFAULT now()
    );

-- ==== 0003_usuario — usuario (esqueleto mínimo para FKs de auditoría/conflictos) ====
CREATE TABLE usuario (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  uuid REFERENCES tenant(id) ON DELETE CASCADE,
      email      text NOT NULL,
      creado_en  timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX usuario_email_key ON usuario (lower(email));

-- ==== 0004_canal_propiedad_unidad — canal (catálogo), propiedad, unidad ====
CREATE TABLE canal (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo     text NOT NULL UNIQUE,
      nombre     text NOT NULL,
      creado_en  timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO canal (codigo, nombre) VALUES
      ('airbnb', 'Airbnb'),
      ('vrbo', 'Vrbo'),
      ('booking', 'Booking.com'),
      ('manual', 'Bloqueo manual interno');

    CREATE TABLE propiedad (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      nombre         text NOT NULL,
      zona_horaria   text NOT NULL CHECK (zona_horaria <> ''),
      creado_en      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX propiedad_tenant_id_idx ON propiedad (tenant_id);

    -- REQ-071/REQ-136: multi-unidad — varias unidades bajo una misma
    -- propiedad, cada una con su propio invariante de exclusión (RV17 §14).
    CREATE TABLE unidad (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      propiedad_id              uuid NOT NULL REFERENCES propiedad(id) ON DELETE CASCADE,
      owner_id                  uuid REFERENCES owner(id) ON DELETE SET NULL,
      nombre                    text NOT NULL,
      duracion_minima_noches    integer NOT NULL DEFAULT 1
                                  CHECK (duracion_minima_noches >= 1),
      creado_en                 timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX unidad_propiedad_id_idx ON unidad (propiedad_id);

-- ==== 0005_ocupacion_unidad — huesped_minimo, ocupacion_unidad + EXCLUDE USING gist ====
CREATE TABLE huesped_minimo (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre     text,
      contacto   text,
      creado_en  timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ocupacion_unidad (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id          uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      rango              daterange NOT NULL,
      capa               text NOT NULL CHECK (capa IN ('reserva', 'bloqueo')),
      razon              text NOT NULL CHECK (
                           razon IN (
                             'RESERVA_CANAL',
                             'BLOQUEO_PROPIETARIO',
                             'MANTENIMIENTO',
                             'BUFFER_LIMPIEZA'
                           )
                         ),
      canal_origen_id    uuid REFERENCES canal(id),
      external_id        text,
      estado             text NOT NULL DEFAULT 'confirmado' CHECK (
                           estado IN ('confirmado', 'provisional', 'cancelado', 'conflicto_pendiente')
                         ),
      bloqueante         boolean NOT NULL DEFAULT true,
      huesped_minimo_id  uuid REFERENCES huesped_minimo(id) ON DELETE SET NULL,
      version            integer NOT NULL DEFAULT 1,
      creado_en          timestamptz NOT NULL DEFAULT now(),
      actualizado_en     timestamptz NOT NULL DEFAULT now(),

      -- H-002: rango semiabierto [check_in, check_out) forzado, nunca vacío.
      -- daterange normaliza automáticamente a la forma canónica '[)', pero
      -- el CHECK lo hace explícito y defensivo (documenta el invariante en
      -- el propio esquema, no solo en el tipo de columna).
      CONSTRAINT ocupacion_unidad_rango_no_vacio CHECK (NOT isempty(rango)),
      CONSTRAINT ocupacion_unidad_rango_semiabierto CHECK (
        lower_inc(rango) AND NOT upper_inc(rango)
      ),
      -- capa y razon deben ser consistentes: RESERVA_CANAL es la única razón
      -- de capa='reserva'; las otras tres son exclusivas de capa='bloqueo'.
      CONSTRAINT ocupacion_unidad_capa_razon_coherente CHECK (
        (capa = 'reserva' AND razon = 'RESERVA_CANAL')
        OR (capa = 'bloqueo' AND razon IN ('BLOQUEO_PROPIETARIO', 'MANTENIMIENTO', 'BUFFER_LIMPIEZA'))
      )
    );

    CREATE INDEX ocupacion_unidad_unidad_id_idx ON ocupacion_unidad (unidad_id);
    CREATE INDEX ocupacion_unidad_rango_idx ON ocupacion_unidad USING gist (rango);

    ALTER TABLE ocupacion_unidad
      ADD CONSTRAINT ocupacion_unidad_sin_solape
      EXCLUDE USING gist (
        unidad_id WITH =,
        rango WITH &&
      ) WHERE (capa = 'reserva' AND estado <> 'cancelado' AND bloqueante);

-- ==== 0006_conflicto_calendario — conflicto_calendario ====
CREATE TABLE conflicto_calendario (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id       uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      ocupacion_a_id  uuid NOT NULL REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      ocupacion_b_id  uuid REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      tipo            text NOT NULL CHECK (tipo IN ('capa_cruzada', 'overbooking_confirmado')),
      detectado_en    timestamptz NOT NULL DEFAULT now(),
      resuelto_en     timestamptz,
      resuelto_por    uuid REFERENCES usuario(id)
    );
    CREATE INDEX conflicto_calendario_unidad_id_idx ON conflicto_calendario (unidad_id);
    CREATE INDEX conflicto_calendario_sin_resolver_idx
      ON conflicto_calendario (detectado_en)
      WHERE resuelto_en IS NULL;

-- ==== 0007_outbox_evento — outbox_evento (esqueleto transaccional) ====
CREATE TABLE outbox_evento (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ocupacion_unidad_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      tipo_evento           text NOT NULL,
      payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
      creado_en             timestamptz NOT NULL DEFAULT now(),
      procesado_en          timestamptz
    );
    CREATE INDEX outbox_evento_pendientes_idx
      ON outbox_evento (creado_en)
      WHERE procesado_en IS NULL;

-- ==== 0008_auditoria_mutacion — auditoria_mutacion (esqueleto, sin triggers todavía) ====
CREATE TABLE auditoria_mutacion (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tabla            text NOT NULL,
      fila_id          uuid NOT NULL,
      operacion        text NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
      actor_id         uuid REFERENCES usuario(id),
      tenant_id        uuid REFERENCES tenant(id),
      valores_previos  jsonb,
      valores_nuevos   jsonb,
      creado_en        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX auditoria_mutacion_tabla_fila_idx ON auditoria_mutacion (tabla, fila_id);

-- ==== 0010_usuario_roles_credenciales — usuario: rol, colaborador_nivel, owner_id, password_hash, activo + refresh_token ====
ALTER TABLE usuario
      ADD COLUMN rol text NOT NULL DEFAULT 'operador' CHECK (
        rol IN ('superadmin', 'admin_gestora', 'operador', 'limpieza', 'propietario', 'contador')
      ),
      ADD COLUMN colaborador_nivel text CHECK (
        colaborador_nivel IN ('acceso_total', 'calendario_mensajeria', 'solo_calendario')
      ),
      ADD COLUMN owner_id uuid REFERENCES owner(id) ON DELETE SET NULL,
      ADD COLUMN password_hash text NOT NULL DEFAULT '',
      ADD COLUMN activo boolean NOT NULL DEFAULT true;

    ALTER TABLE usuario ALTER COLUMN password_hash DROP DEFAULT;

    -- Coherencia de rol: superadmin nunca tiene tenant_id (opera sobre toda
    -- la plataforma); todos los demás roles SIEMPRE tienen tenant_id
    -- (D-020: RLS es fail-closed, un usuario sin tenant no puede pertenecer
    -- a ningún tenant por accidente). propietario/owner_id: solo el rol
    -- 'propietario' referencia una fila de owner.
    ALTER TABLE usuario ADD CONSTRAINT usuario_superadmin_sin_tenant CHECK (
      (rol = 'superadmin' AND tenant_id IS NULL) OR (rol <> 'superadmin' AND tenant_id IS NOT NULL)
    );
    ALTER TABLE usuario ADD CONSTRAINT usuario_owner_solo_propietario CHECK (
      (rol = 'propietario') OR (owner_id IS NULL)
    );
    ALTER TABLE usuario ADD CONSTRAINT usuario_colaborador_nivel_solo_operador CHECK (
      (rol = 'operador') OR (colaborador_nivel IS NULL)
    );

    CREATE INDEX usuario_tenant_id_idx ON usuario (tenant_id);
    CREATE INDEX usuario_owner_id_idx ON usuario (owner_id);

    -- Tokens de refresco (H-040): se guarda el HASH del token, nunca el
    -- token en claro (REQ-142/§RV19/21-7 — ni siquiera en la propia base de
    -- datos de la aplicación). Rotación: cada uso exitoso revoca el token
    -- anterior e inserta uno nuevo (ver apps/api/src/seguridad/jwt.ts).
    CREATE TABLE refresh_token (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      token_hash    text NOT NULL,
      expira_en     timestamptz NOT NULL,
      revocado_en   timestamptz,
      creado_en     timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX refresh_token_hash_idx ON refresh_token (token_hash);
    CREATE INDEX refresh_token_usuario_id_idx ON refresh_token (usuario_id);

-- ==== 0012_rol_aplicacion — rol app_rv sin BYPASSRLS + privilegios mínimos sobre el esquema ====
DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rv') THEN
        EXECUTE format(
          'CREATE ROLE app_rv LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L',
          'app_rv_dev_change_in_prod'
        );
      END IF;
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_rv', current_database());
    END
    $$;

    GRANT USAGE ON SCHEMA public TO app_rv;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rv;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_rv;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_rv;

    -- Migraciones posteriores (0013+, incluidas las de Lote 2 ≥0020) crean
    -- tablas/funciones nuevas con el mismo rol que ejecuta las migraciones
    -- (normalmente el superusuario que corre "npm run migrar"/el runner de
    -- pruebas) — estos privilegios por defecto aseguran que app_rv nunca se
    -- quede sin acceso a una tabla nueva por olvido de un GRANT explícito.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rv;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO app_rv;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_rv;

-- ==== 0013_auditoria_triggers — triggers de auditoría en ocupacion_unidad/usuario + acceso romper cristal ====
ALTER TABLE auditoria_mutacion DROP CONSTRAINT IF EXISTS auditoria_mutacion_operacion_check;
    ALTER TABLE auditoria_mutacion ADD CONSTRAINT auditoria_mutacion_operacion_check CHECK (
      operacion IN ('INSERT', 'UPDATE', 'DELETE', 'ACCESO_ROMPER_CRISTAL')
    );

    -- Trigger genérico para tablas con columna tenant_id directa.
    CREATE OR REPLACE FUNCTION fn_auditoria_directa() RETURNS trigger
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
        v_previos := to_jsonb(OLD) - 'password_hash' - 'email'
          - 'credenciales_cifradas' - 'credenciales_iv' - 'credenciales_tag';
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_nuevos := to_jsonb(NEW) - 'password_hash' - 'email'
          - 'credenciales_cifradas' - 'credenciales_iv' - 'credenciales_tag';
      END IF;

      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        v_actor,
        v_tenant,
        v_previos,
        v_nuevos
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    -- "ocupacion_unidad" no tiene tenant_id directo: se deriva vía
    -- unidad → propiedad. Sin PII de huésped (huesped_minimo_id es solo un
    -- identificador, no el nombre/contacto en sí).
    CREATE OR REPLACE FUNCTION fn_auditoria_ocupacion_unidad() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_unidad uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_unidad := COALESCE(NEW.unidad_id, OLD.unidad_id);
      SELECT p.tenant_id INTO v_tenant
      FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id
      WHERE u.id = v_unidad;

      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        v_actor,
        v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_usuario
      AFTER INSERT OR UPDATE OR DELETE ON usuario
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_directa();

    CREATE TRIGGER auditoria_ocupacion_unidad
      AFTER INSERT OR UPDATE OR DELETE ON ocupacion_unidad
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_ocupacion_unidad();

-- ==== 0014_rls_funciones_helper — funciones security definer: identidad de sesión + is_tenant_member ====
CREATE OR REPLACE FUNCTION usuario_actual_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
    $$;

    CREATE OR REPLACE FUNCTION rol_actual() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT rol FROM usuario WHERE id = usuario_actual_id() AND activo
    $$;

    CREATE OR REPLACE FUNCTION colaborador_nivel_actual() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT colaborador_nivel FROM usuario WHERE id = usuario_actual_id() AND activo
    $$;

    CREATE OR REPLACE FUNCTION owner_actual() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT owner_id FROM usuario WHERE id = usuario_actual_id() AND activo
    $$;

    -- Patrón verificado en código real de atiende-restaurantes
    -- (is_restaurant_staff(auth.uid(), tenant_id), migración
    -- 20260904050000_enterprise_tenant_isolation.sql), adaptado a JWT propio
    -- + settings de sesión en vez de Supabase auth.uid() (D-009/D-020).
    -- superadmin es miembro honorario de CUALQUIER tenant (acceso
    -- "romper cristal" auditado en la capa de aplicación, H-045).
    CREATE OR REPLACE FUNCTION is_tenant_member(_usuario uuid, _tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM usuario u
        WHERE u.id = _usuario AND u.activo
          AND (u.tenant_id = _tenant OR u.rol = 'superadmin')
      )
    $$;

    CREATE OR REPLACE FUNCTION propiedad_tenant_id(_propiedad uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT tenant_id FROM propiedad WHERE id = _propiedad
    $$;

    CREATE OR REPLACE FUNCTION unidad_tenant_id(_unidad uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT p.tenant_id FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE u.id = _unidad
    $$;

    CREATE OR REPLACE FUNCTION unidad_owner_id(_unidad uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT owner_id FROM unidad WHERE id = _unidad
    $$;

    CREATE OR REPLACE FUNCTION owner_tenant_id(_owner uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT eg.tenant_id FROM owner o JOIN empresa_gestora eg ON eg.id = o.empresa_gestora_id WHERE o.id = _owner
    $$;

    CREATE OR REPLACE FUNCTION ocupacion_unidad_de(_ocupacion uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT unidad_id FROM ocupacion_unidad WHERE id = _ocupacion
    $$;

    GRANT EXECUTE ON FUNCTION usuario_actual_id() TO app_rv;
    GRANT EXECUTE ON FUNCTION rol_actual() TO app_rv;
    GRANT EXECUTE ON FUNCTION colaborador_nivel_actual() TO app_rv;
    GRANT EXECUTE ON FUNCTION owner_actual() TO app_rv;
    GRANT EXECUTE ON FUNCTION is_tenant_member(uuid, uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION propiedad_tenant_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION unidad_tenant_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION unidad_owner_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION owner_tenant_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION ocupacion_unidad_de(uuid) TO app_rv;

-- ==== 0015_rls_politicas — ENABLE/FORCE ROW LEVEL SECURITY + políticas por rol en tablas de tenant ====
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE empresa_gestora ENABLE ROW LEVEL SECURITY;
    ALTER TABLE empresa_gestora FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE owner ENABLE ROW LEVEL SECURITY;
    ALTER TABLE owner FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE usuario FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE propiedad ENABLE ROW LEVEL SECURITY;
    ALTER TABLE propiedad FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE unidad ENABLE ROW LEVEL SECURITY;
    ALTER TABLE unidad FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE ocupacion_unidad ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ocupacion_unidad FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE conflicto_calendario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conflicto_calendario FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE outbox_evento ENABLE ROW LEVEL SECURITY;
    ALTER TABLE outbox_evento FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE auditoria_mutacion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE auditoria_mutacion FORCE ROW LEVEL SECURITY;
  

    ALTER TABLE refresh_token ENABLE ROW LEVEL SECURITY;
    ALTER TABLE refresh_token FORCE ROW LEVEL SECURITY;
  

    -- tenant: cada usuario ve solo su propio tenant (superadmin ve todos
    -- vía is_tenant_member, que trata a superadmin como miembro honorario).
    CREATE POLICY tenant_select ON tenant FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), id));
    CREATE POLICY tenant_escritura ON tenant FOR ALL
      USING (rol_actual() = 'superadmin')
      WITH CHECK (rol_actual() = 'superadmin');

    -- empresa_gestora
    CREATE POLICY empresa_gestora_select ON empresa_gestora FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() <> 'limpieza');
    CREATE POLICY empresa_gestora_escritura ON empresa_gestora FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- owner: un propietario solo ve su propia fila; contador/limpieza sin acceso
    -- (§Roles-4: multi-empresa-gestora nunca fuga la fila de owner de otro tenant).
    CREATE POLICY owner_select ON owner FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), owner_tenant_id(id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR id = owner_actual())
      );
    CREATE POLICY owner_escritura ON owner FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), owner_tenant_id(id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora'));

    -- usuario: cada quien ve su propia fila; superadmin/admin_gestora ven
    -- el resto de usuarios de su tenant (gestión de equipo/roles).
    CREATE POLICY usuario_select ON usuario FOR SELECT
      USING (
        id = usuario_actual_id()
        OR (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      );
    CREATE POLICY usuario_escritura ON usuario FOR INSERT
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));
    CREATE POLICY usuario_actualizacion ON usuario FOR UPDATE
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- propiedad
    CREATE POLICY propiedad_select ON propiedad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (
          rol_actual() <> 'propietario'
          OR EXISTS (SELECT 1 FROM unidad u WHERE u.propiedad_id = propiedad.id AND u.owner_id = owner_actual())
        )
      );
    CREATE POLICY propiedad_escritura ON propiedad FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- unidad
    CREATE POLICY unidad_select ON unidad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR owner_id = owner_actual())
      );
    CREATE POLICY unidad_escritura ON unidad FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)));

    -- ocupacion_unidad (reservas y bloqueos): caso adversarial 18/19 core.
    CREATE POLICY ocupacion_unidad_select ON ocupacion_unidad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR unidad_owner_id(unidad_id) = owner_actual())
      );
    CREATE POLICY ocupacion_unidad_escritura ON ocupacion_unidad FOR ALL
      USING ((
  rol_actual() IN ('superadmin', 'admin_gestora')
  OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
) AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK ((
  rol_actual() IN ('superadmin', 'admin_gestora')
  OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
) AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- conflicto_calendario
    CREATE POLICY conflicto_calendario_select ON conflicto_calendario FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );
    CREATE POLICY conflicto_calendario_escritura ON conflicto_calendario FOR ALL
      USING ((
  rol_actual() IN ('superadmin', 'admin_gestora')
  OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
) AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK ((
  rol_actual() IN ('superadmin', 'admin_gestora')
  OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
) AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- outbox_evento: cola interna (workers de Lote 2/10), no expuesta por
    -- ningún GET de este lote — SELECT restringido a superadmin; INSERT
    -- permitido a quien ya puede escribir calendario (la propia capa de
    -- aplicación de packages/domain encola el evento en la misma
    -- transacción que la mutación de ocupacion_unidad).
    CREATE POLICY outbox_evento_select ON outbox_evento FOR SELECT
      USING (rol_actual() = 'superadmin');
    CREATE POLICY outbox_evento_insercion ON outbox_evento FOR INSERT
      WITH CHECK ((
  rol_actual() IN ('superadmin', 'admin_gestora')
  OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
));

    -- auditoria_mutacion: solo superadmin/admin_gestora de ese tenant
    -- (§Auditoría-1). El INSERT manual (fuera de los triggers, que corren
    -- SECURITY DEFINER y por tanto ignoran esta política) es exclusivo del
    -- registro de acceso "romper cristal" (H-045).
    CREATE POLICY auditoria_mutacion_select ON auditoria_mutacion FOR SELECT
      USING (
        rol_actual() IN ('superadmin', 'admin_gestora')
        AND (tenant_id IS NULL OR is_tenant_member(usuario_actual_id(), tenant_id))
      );
    CREATE POLICY auditoria_mutacion_romper_cristal ON auditoria_mutacion FOR INSERT
      WITH CHECK (rol_actual() = 'superadmin' AND operacion = 'ACCESO_ROMPER_CRISTAL');

    -- refresh_token: cada usuario solo administra sus propios tokens.
    CREATE POLICY refresh_token_propio ON refresh_token FOR ALL
      USING (usuario_id = usuario_actual_id() OR rol_actual() = 'superadmin')
      WITH CHECK (usuario_id = usuario_actual_id() OR rol_actual() = 'superadmin');

-- ==== 0016_rls_funciones_autenticacion — funciones de autenticación (security definer) para login/refresh sin sesión previa ====
CREATE OR REPLACE FUNCTION autenticar_buscar_usuario(_email text)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      password_hash text,
      activo boolean
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.password_hash, u.activo
      FROM usuario u
      WHERE lower(u.email) = lower(_email)
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario(text) TO app_rv;

    CREATE OR REPLACE FUNCTION autenticar_buscar_refresh_token(_hash text)
    RETURNS TABLE (
      id uuid,
      usuario_id uuid,
      expira_en timestamptz,
      revocado_en timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.usuario_id, r.expira_en, r.revocado_en
      FROM refresh_token r
      WHERE r.token_hash = _hash
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_refresh_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_refresh_token(text) TO app_rv;

    -- Usada por el flujo de refresh (H-040): tras validar el hash del
    -- refresh token se re-consulta el usuario POR ID (nunca se confía en
    -- claims viejos del propio token) para emitir el nuevo access token
    -- con el rol/tenant/nivel ACTUALES — si un admin cambió el rol de
    -- alguien entre medias, el siguiente refresh ya refleja ese cambio.
    CREATE OR REPLACE FUNCTION autenticar_buscar_usuario_por_id(_id uuid)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      activo boolean
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.activo
      FROM usuario u
      WHERE u.id = _id
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario_por_id(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario_por_id(uuid) TO app_rv;

-- ==== 0020_cuenta_canal — cuenta_canal, unidad_canal_feed (config de sincronización iCal por unidad/canal) ====
CREATE TABLE cuenta_canal (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      canal_id           uuid NOT NULL REFERENCES canal(id),
      nombre             text NOT NULL,
      credenciales_ref   text,
      es_simulador       boolean NOT NULL DEFAULT false,
      es_sandbox         boolean NOT NULL DEFAULT false,
      partner_aprobado   boolean NOT NULL DEFAULT false,
      creado_en          timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX cuenta_canal_tenant_id_idx ON cuenta_canal (tenant_id);

    CREATE TABLE unidad_canal_feed (
      id                                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      canal_id                              uuid NOT NULL REFERENCES canal(id),
      cuenta_canal_id                       uuid REFERENCES cuenta_canal(id) ON DELETE SET NULL,
      -- Import: nunca almacena credenciales en la URL (H-024); si el
      -- canal exige token, va en credenciales_ref de cuenta_canal.
      url_import                            text,
      etag_import                           text,
      ultima_modificacion_http_import       text,
      ultima_sincronizacion_exitosa_en      timestamptz,
      en_cuarentena_desde                   timestamptz,
      intentos_fallidos_consecutivos        integer NOT NULL DEFAULT 0,
      motivo_cuarentena                     text,
      drift_ultima_reconciliacion_completa  integer NOT NULL DEFAULT 0,
      -- Export: SEQUENCE incremental propio por unidad/canal (H-026).
      export_sequence                       integer NOT NULL DEFAULT 0,
      creado_en                             timestamptz NOT NULL DEFAULT now(),
      actualizado_en                        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, canal_id)
    );
    CREATE INDEX unidad_canal_feed_unidad_id_idx ON unidad_canal_feed (unidad_id);

-- ==== 0021_sincronizacion_canal — evento_canal_importado (idempotencia), bloqueo_exportado (anti-eco capas 2/3) ====
CREATE TABLE evento_canal_importado (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id              uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      uid_evento             text NOT NULL,
      sequence               integer,
      dtstamp                timestamptz NOT NULL,
      hash_contenido         text NOT NULL,
      ocupacion_unidad_id    uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      ultima_accion          text NOT NULL CHECK (
                               ultima_accion IN (
                                 'aplicar', 'descartar', 'sin_cambio',
                                 'revisar_uid_reciclado', 'eco'
                               )
                             ),
      creado_en              timestamptz NOT NULL DEFAULT now(),
      actualizado_en         timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, canal_id, uid_evento)
    );
    CREATE INDEX evento_canal_importado_unidad_canal_idx
      ON evento_canal_importado (unidad_id, canal_id);

    CREATE TABLE bloqueo_exportado (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ocupacion_unidad_id    uuid NOT NULL REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      uid_exportado          text NOT NULL,
      hash_contenido         text NOT NULL,
      -- SEQUENCE iCal incremental propio de este bloqueo hacia este canal
      -- (H-026): se incrementa solo cuando el hash de contenido cambia
      -- respecto al último export (el bloqueo se movió/modificó).
      sequence               integer NOT NULL DEFAULT 0,
      exportado_en           timestamptz NOT NULL DEFAULT now(),
      UNIQUE (ocupacion_unidad_id, canal_id)
    );
    CREATE INDEX bloqueo_exportado_canal_idx ON bloqueo_exportado (canal_id);

-- ==== 0030_tarea_operativa — tarea_operativa: limpieza/mantenimiento/inspección con SLA y asignación ====
CREATE TABLE tarea_operativa (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      ocupacion_unidad_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      buffer_ocupacion_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      tipo                  text NOT NULL CHECK (tipo IN ('limpieza', 'mantenimiento', 'inspeccion')),
      estado                text NOT NULL DEFAULT 'pendiente' CHECK (
                              estado IN ('pendiente', 'asignada', 'en_progreso', 'completada', 'bloqueada', 'cancelada')
                            ),
      prioridad             text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente')),
      asignado_a            uuid REFERENCES usuario(id) ON DELETE SET NULL,
      es_proveedor_externo  boolean NOT NULL DEFAULT false,
      programada_para       date NOT NULL,
      sla_vence_en          timestamptz,
      completada_en         timestamptz,
      notas                 text,
      creado_en             timestamptz NOT NULL DEFAULT now(),
      actualizado_en        timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX tarea_operativa_unidad_id_idx ON tarea_operativa (unidad_id);
    CREATE INDEX tarea_operativa_asignado_a_idx ON tarea_operativa (asignado_a);
    CREATE INDEX tarea_operativa_programada_para_idx ON tarea_operativa (programada_para);
    CREATE INDEX tarea_operativa_ocupacion_unidad_id_idx ON tarea_operativa (ocupacion_unidad_id);

    -- H-054: notificaciones multicanal configurables por evento de tarea
    -- (asignada/actualizada/cancelada/completada). Fase 2 registra el
    -- intento de notificación (canal(es) resueltos desde la configuración de
    -- la propiedad) para trazabilidad — el envío real por canal concreto
    -- (email/SMS/WhatsApp) es un adaptador fuera del alcance de este lote,
    -- nunca simulado como "enviado" sin dejarlo explícito.
    CREATE TABLE notificacion_tarea (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tarea_id    uuid NOT NULL REFERENCES tarea_operativa(id) ON DELETE CASCADE,
      evento      text NOT NULL CHECK (evento IN ('asignada', 'actualizada', 'cancelada', 'completada')),
      canales     text[] NOT NULL DEFAULT '{}'::text[],
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX notificacion_tarea_tarea_id_idx ON notificacion_tarea (tarea_id);

-- ==== 0031_checklist_tarea — checklist_item_tarea + foto_checklist_item ====
CREATE TABLE checklist_item_tarea (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tarea_id        uuid NOT NULL REFERENCES tarea_operativa(id) ON DELETE CASCADE,
      descripcion     text NOT NULL,
      orden           integer NOT NULL DEFAULT 0,
      completado      boolean NOT NULL DEFAULT false,
      completado_en   timestamptz,
      completado_por  uuid REFERENCES usuario(id) ON DELETE SET NULL,
      creado_en       timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX checklist_item_tarea_tarea_id_idx ON checklist_item_tarea (tarea_id);

    CREATE TABLE foto_checklist_item (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      checklist_item_id     uuid NOT NULL REFERENCES checklist_item_tarea(id) ON DELETE CASCADE,
      ruta_almacenamiento   text NOT NULL,
      etiqueta              text NOT NULL DEFAULT 'dev-local' CHECK (etiqueta = 'dev-local'),
      tomada_en             timestamptz NOT NULL DEFAULT now(),
      subida_por            uuid REFERENCES usuario(id) ON DELETE SET NULL
    );
    CREATE INDEX foto_checklist_item_checklist_item_id_idx ON foto_checklist_item (checklist_item_id);

-- ==== 0032_incidencia_mantenimiento — incidencia_mantenimiento + foto_incidencia ====
CREATE TABLE incidencia_mantenimiento (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                 uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      tarea_origen_id           uuid REFERENCES tarea_operativa(id) ON DELETE SET NULL,
      severidad                 text NOT NULL CHECK (severidad IN ('leve', 'moderada', 'grave')),
      titulo                    text NOT NULL,
      descripcion               text,
      reportado_por             uuid REFERENCES usuario(id) ON DELETE SET NULL,
      estado                    text NOT NULL DEFAULT 'abierta' CHECK (
                                  estado IN (
                                    'abierta', 'en_revision', 'bloqueo_propuesto',
                                    'bloqueo_confirmado', 'resuelta', 'descartada'
                                  )
                                ),
      propuesta_bloqueo_rango   daterange,
      bloqueo_ocupacion_id      uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      confirmado_por            uuid REFERENCES usuario(id) ON DELETE SET NULL,
      confirmado_en             timestamptz,
      creado_en                 timestamptz NOT NULL DEFAULT now(),
      actualizado_en            timestamptz NOT NULL DEFAULT now(),
      -- El bloqueo confirmado exige rastro explícito de quién/cuándo lo
      -- confirmó (H-055: "requiere confirmación humana", nunca automática).
      CONSTRAINT incidencia_confirmacion_requiere_actor CHECK (
        estado <> 'bloqueo_confirmado' OR (confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL)
      )
    );
    CREATE INDEX incidencia_mantenimiento_unidad_id_idx ON incidencia_mantenimiento (unidad_id);
    CREATE INDEX incidencia_mantenimiento_estado_idx ON incidencia_mantenimiento (estado);

    CREATE TABLE foto_incidencia (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      incidencia_id         uuid NOT NULL REFERENCES incidencia_mantenimiento(id) ON DELETE CASCADE,
      ruta_almacenamiento   text NOT NULL,
      etiqueta              text NOT NULL DEFAULT 'dev-local' CHECK (etiqueta = 'dev-local'),
      tomada_en             timestamptz NOT NULL DEFAULT now(),
      subida_por            uuid REFERENCES usuario(id) ON DELETE SET NULL
    );
    CREATE INDEX foto_incidencia_incidencia_id_idx ON foto_incidencia (incidencia_id);

-- ==== 0033_inventario_unidad — item_inventario + movimiento_inventario (ropa blanca/consumibles por unidad) ====
CREATE TABLE item_inventario (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id        uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      nombre           text NOT NULL,
      categoria        text NOT NULL DEFAULT 'consumible' CHECK (categoria IN ('ropa_blanca', 'consumible', 'otro')),
      cantidad_actual  numeric NOT NULL DEFAULT 0 CHECK (cantidad_actual >= 0),
      umbral_minimo    numeric NOT NULL DEFAULT 0 CHECK (umbral_minimo >= 0),
      unidad_medida    text NOT NULL DEFAULT 'pza',
      creado_en        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX item_inventario_unidad_id_idx ON item_inventario (unidad_id);

    CREATE TABLE movimiento_inventario (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      item_inventario_id    uuid NOT NULL REFERENCES item_inventario(id) ON DELETE CASCADE,
      tarea_id              uuid REFERENCES tarea_operativa(id) ON DELETE SET NULL,
      cantidad              numeric NOT NULL,
      motivo                text,
      creado_en             timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX movimiento_inventario_item_inventario_id_idx ON movimiento_inventario (item_inventario_id);
    CREATE INDEX movimiento_inventario_tarea_id_idx ON movimiento_inventario (tarea_id);

-- ==== 0034_configuracion_operativa — configuracion_operativa_propiedad: buffer de limpieza + SLA por tipo ====
CREATE TABLE configuracion_operativa_propiedad (
      propiedad_id             uuid PRIMARY KEY REFERENCES propiedad(id) ON DELETE CASCADE,
      buffer_limpieza_noches   integer NOT NULL DEFAULT 1 CHECK (buffer_limpieza_noches >= 0),
      sla_limpieza_horas       integer NOT NULL DEFAULT 4 CHECK (sla_limpieza_horas > 0),
      sla_mantenimiento_horas  integer NOT NULL DEFAULT 24 CHECK (sla_mantenimiento_horas > 0),
      notificaciones_canales   text[] NOT NULL DEFAULT '{}'::text[],
      actualizado_en           timestamptz NOT NULL DEFAULT now()
    );

-- ==== 0035_outbox_consumido_limpieza — outbox_evento_consumido_limpieza: seguimiento propio del consumidor de checkout→limpieza ====
CREATE TABLE outbox_evento_consumido_limpieza (
      outbox_evento_id   uuid PRIMARY KEY REFERENCES outbox_evento(id) ON DELETE CASCADE,
      procesado_en       timestamptz NOT NULL DEFAULT now()
    );

-- ==== 0036_rls_operacion — RLS: tarea_operativa/checklist/incidencia/inventario/configuración operativa ====
CREATE OR REPLACE FUNCTION tarea_operativa_unidad_id(_tarea uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT unidad_id FROM tarea_operativa WHERE id = _tarea
    $$;

    CREATE OR REPLACE FUNCTION tarea_operativa_asignado_a(_tarea uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT asignado_a FROM tarea_operativa WHERE id = _tarea
    $$;

    CREATE OR REPLACE FUNCTION incidencia_mantenimiento_unidad_id(_incidencia uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT unidad_id FROM incidencia_mantenimiento WHERE id = _incidencia
    $$;

    CREATE OR REPLACE FUNCTION incidencia_mantenimiento_reportado_por(_incidencia uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT reportado_por FROM incidencia_mantenimiento WHERE id = _incidencia
    $$;

    GRANT EXECUTE ON FUNCTION tarea_operativa_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION tarea_operativa_asignado_a(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION incidencia_mantenimiento_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION incidencia_mantenimiento_reportado_por(uuid) TO app_rv;

    ALTER TABLE tarea_operativa ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tarea_operativa FORCE ROW LEVEL SECURITY;
    ALTER TABLE checklist_item_tarea ENABLE ROW LEVEL SECURITY;
    ALTER TABLE checklist_item_tarea FORCE ROW LEVEL SECURITY;
    ALTER TABLE foto_checklist_item ENABLE ROW LEVEL SECURITY;
    ALTER TABLE foto_checklist_item FORCE ROW LEVEL SECURITY;
    ALTER TABLE incidencia_mantenimiento ENABLE ROW LEVEL SECURITY;
    ALTER TABLE incidencia_mantenimiento FORCE ROW LEVEL SECURITY;
    ALTER TABLE foto_incidencia ENABLE ROW LEVEL SECURITY;
    ALTER TABLE foto_incidencia FORCE ROW LEVEL SECURITY;
    ALTER TABLE item_inventario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE item_inventario FORCE ROW LEVEL SECURITY;
    ALTER TABLE movimiento_inventario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE movimiento_inventario FORCE ROW LEVEL SECURITY;
    ALTER TABLE configuracion_operativa_propiedad ENABLE ROW LEVEL SECURITY;
    ALTER TABLE configuracion_operativa_propiedad FORCE ROW LEVEL SECURITY;
    ALTER TABLE notificacion_tarea ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notificacion_tarea FORCE ROW LEVEL SECURITY;
    ALTER TABLE outbox_evento_consumido_limpieza ENABLE ROW LEVEL SECURITY;
    ALTER TABLE outbox_evento_consumido_limpieza FORCE ROW LEVEL SECURITY;

    -- tarea_operativa
    CREATE POLICY tarea_operativa_select ON tarea_operativa FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND asignado_a = usuario_actual_id())
          OR (rol_actual() = 'propietario' AND unidad_owner_id(unidad_id) = owner_actual())
        )
      );
    CREATE POLICY tarea_operativa_insert ON tarea_operativa FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (rol_actual() IN ('superadmin', 'admin_gestora')
             OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario'))
      );
    CREATE POLICY tarea_operativa_update ON tarea_operativa FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND asignado_a = usuario_actual_id())
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND asignado_a = usuario_actual_id())
        )
      );
    CREATE POLICY tarea_operativa_delete ON tarea_operativa FOR DELETE
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- checklist_item_tarea (misma visibilidad/escritura que su tarea)
    CREATE POLICY checklist_item_tarea_select ON checklist_item_tarea FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(tarea_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(tarea_id) = usuario_actual_id())
          OR (rol_actual() = 'propietario' AND unidad_owner_id(tarea_operativa_unidad_id(tarea_id)) = owner_actual())
        )
      );
    CREATE POLICY checklist_item_tarea_escritura ON checklist_item_tarea FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(tarea_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(tarea_id) = usuario_actual_id())
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(tarea_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(tarea_id) = usuario_actual_id())
        )
      );

    -- foto_checklist_item (a través de checklist_item_tarea.tarea_id)
    CREATE POLICY foto_checklist_item_select ON foto_checklist_item FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM checklist_item_tarea c WHERE c.id = foto_checklist_item.checklist_item_id
        )
      );
    CREATE POLICY foto_checklist_item_escritura ON foto_checklist_item FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM checklist_item_tarea c
          WHERE c.id = foto_checklist_item.checklist_item_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(c.tarea_id)))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(c.tarea_id) = usuario_actual_id())
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM checklist_item_tarea c
          WHERE c.id = foto_checklist_item.checklist_item_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(tarea_operativa_unidad_id(c.tarea_id)))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND tarea_operativa_asignado_a(c.tarea_id) = usuario_actual_id())
            )
        )
      );

    -- incidencia_mantenimiento: limpieza solo ve/reporta LAS SUYAS.
    CREATE POLICY incidencia_mantenimiento_select ON incidencia_mantenimiento FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND reportado_por = usuario_actual_id())
          OR (rol_actual() = 'propietario' AND unidad_owner_id(unidad_id) = owner_actual())
        )
      );
    CREATE POLICY incidencia_mantenimiento_insert ON incidencia_mantenimiento FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND reportado_por = usuario_actual_id())
        )
      );
    -- La confirmación de bloqueo (H-055) exige rol con permiso de escritura
    -- de calendario — nunca 'limpieza' (solo puede reportar, no confirmar).
    CREATE POLICY incidencia_mantenimiento_update ON incidencia_mantenimiento FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (rol_actual() IN ('superadmin', 'admin_gestora')
             OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario'))
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (rol_actual() IN ('superadmin', 'admin_gestora')
             OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario'))
      );
    CREATE POLICY incidencia_mantenimiento_delete ON incidencia_mantenimiento FOR DELETE
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    -- foto_incidencia
    CREATE POLICY foto_incidencia_select ON foto_incidencia FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM incidencia_mantenimiento i
          WHERE i.id = foto_incidencia.incidencia_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(i.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND i.reportado_por = usuario_actual_id())
              OR (rol_actual() = 'propietario' AND unidad_owner_id(i.unidad_id) = owner_actual())
            )
        )
      );
    CREATE POLICY foto_incidencia_insert ON foto_incidencia FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM incidencia_mantenimiento i
          WHERE i.id = foto_incidencia.incidencia_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(i.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND i.reportado_por = usuario_actual_id())
            )
        )
      );

    -- item_inventario / movimiento_inventario: limpieza solo si tiene una
    -- tarea activa asignada en esa unidad (necesario para el descuento
    -- automático al completar checklist, H-052).
    CREATE POLICY item_inventario_select ON item_inventario FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
          OR (rol_actual() = 'propietario' AND unidad_owner_id(unidad_id) = owner_actual())
          OR (rol_actual() = 'limpieza' AND EXISTS (
                SELECT 1 FROM tarea_operativa t
                WHERE t.unidad_id = item_inventario.unidad_id
                  AND t.asignado_a = usuario_actual_id()
                  AND t.estado NOT IN ('completada', 'cancelada')
              ))
        )
      );
    CREATE POLICY item_inventario_escritura ON item_inventario FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND EXISTS (
                SELECT 1 FROM tarea_operativa t
                WHERE t.unidad_id = item_inventario.unidad_id
                  AND t.asignado_a = usuario_actual_id()
                  AND t.estado NOT IN ('completada', 'cancelada')
              ))
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
          OR (rol_actual() = 'limpieza' AND EXISTS (
                SELECT 1 FROM tarea_operativa t
                WHERE t.unidad_id = item_inventario.unidad_id
                  AND t.asignado_a = usuario_actual_id()
                  AND t.estado NOT IN ('completada', 'cancelada')
              ))
        )
      );

    CREATE POLICY movimiento_inventario_select ON movimiento_inventario FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM item_inventario it
          WHERE it.id = movimiento_inventario.item_inventario_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(it.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
              OR (rol_actual() = 'propietario' AND unidad_owner_id(it.unidad_id) = owner_actual())
              OR (rol_actual() = 'limpieza' AND EXISTS (
                    SELECT 1 FROM tarea_operativa t
                    WHERE t.unidad_id = it.unidad_id AND t.asignado_a = usuario_actual_id()
                      AND t.estado NOT IN ('completada', 'cancelada')
                  ))
            )
        )
      );
    CREATE POLICY movimiento_inventario_insert ON movimiento_inventario FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM item_inventario it
          WHERE it.id = movimiento_inventario.item_inventario_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(it.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND EXISTS (
                    SELECT 1 FROM tarea_operativa t
                    WHERE t.unidad_id = it.unidad_id AND t.asignado_a = usuario_actual_id()
                      AND t.estado NOT IN ('completada', 'cancelada')
                  ))
            )
        )
      );

    -- configuracion_operativa_propiedad
    CREATE POLICY configuracion_operativa_propiedad_select ON configuracion_operativa_propiedad FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id))
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador', 'propietario')
      );
    CREATE POLICY configuracion_operativa_propiedad_escritura ON configuracion_operativa_propiedad FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), propiedad_tenant_id(propiedad_id)));

    -- notificacion_tarea (misma visibilidad que la tarea; escritura = quien puede escribir tareas)
    CREATE POLICY notificacion_tarea_select ON notificacion_tarea FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM tarea_operativa t
          WHERE t.id = notificacion_tarea.tarea_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(t.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              OR (rol_actual() = 'limpieza' AND t.asignado_a = usuario_actual_id())
            )
        )
      );
    CREATE POLICY notificacion_tarea_insert ON notificacion_tarea FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM tarea_operativa t
          WHERE t.id = notificacion_tarea.tarea_id
            AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(t.unidad_id))
            AND (
              rol_actual() IN ('superadmin', 'admin_gestora')
              OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
              -- El propio personal de limpieza dispara el evento
              -- 'completada' al completar su tarea (aplicacion/tareas.ts);
              -- solo puede notificar sobre su PROPIA tarea asignada.
              OR (rol_actual() = 'limpieza' AND t.asignado_a = usuario_actual_id())
            )
        )
      );

    -- outbox_evento_consumido_limpieza: cola interna del consumidor de este
    -- lote. SELECT visible a superadmin y a quien puede escribir calendario
    -- (el mismo rol que dispara el procesamiento manual del checkout) —
    -- necesario para que el propio INSERT ... ON CONFLICT (outbox_evento_id)
    -- DO NOTHING del consumidor pueda evaluar el conflicto sin ser
    -- rechazado por RLS al no tener ninguna política de lectura aplicable.
    CREATE POLICY outbox_evento_consumido_limpieza_select ON outbox_evento_consumido_limpieza FOR SELECT
      USING (
        rol_actual() = 'superadmin'
        OR rol_actual() = 'admin_gestora'
        OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
      );
    CREATE POLICY outbox_evento_consumido_limpieza_insert ON outbox_evento_consumido_limpieza FOR INSERT
      WITH CHECK (
        rol_actual() IN ('superadmin', 'admin_gestora')
        OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
      );

-- ==== 0037_auditoria_triggers_operacion — triggers de auditoría: tarea_operativa + incidencia_mantenimiento ====
CREATE OR REPLACE FUNCTION fn_auditoria_tarea_operativa() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_unidad uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_unidad := COALESCE(NEW.unidad_id, OLD.unidad_id);
      SELECT p.tenant_id INTO v_tenant
      FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id
      WHERE u.id = v_unidad;

      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        v_actor,
        v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_tarea_operativa
      AFTER INSERT OR UPDATE OR DELETE ON tarea_operativa
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_tarea_operativa();

    CREATE TRIGGER auditoria_incidencia_mantenimiento
      AFTER INSERT OR UPDATE OR DELETE ON incidencia_mantenimiento
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_tarea_operativa();

-- ==== 0038_rls_outbox_lectura_operacion — RLS: segunda política SELECT (permisiva) sobre outbox_evento para el consumidor de checkout de Lote 5 ====
CREATE POLICY outbox_evento_select_operacion ON outbox_evento FOR SELECT
      USING (
        ocupacion_unidad_id IS NOT NULL
        AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

-- ==== 0039_helper_unidad_nombre_operacion — función security definer: nombre de unidad para la UI de operación (limpieza sin acceso a `unidad`) ====
CREATE OR REPLACE FUNCTION unidad_nombre_operacion(_unidad uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT nombre FROM unidad WHERE id = _unidad
    $$;

    GRANT EXECUTE ON FUNCTION unidad_nombre_operacion(uuid) TO app_rv;

-- ==== 0040_mensajeria_esquema — mensajeria: conversacion + mensaje (entrante/saliente) ====
CREATE TABLE conversacion (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      ocupacion_unidad_id   uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      canal_id              uuid NOT NULL REFERENCES canal(id),
      huesped_minimo_id     uuid REFERENCES huesped_minimo(id) ON DELETE SET NULL,
      idioma                text NOT NULL DEFAULT 'es' CHECK (idioma IN ('es', 'en')),
      creado_en             timestamptz NOT NULL DEFAULT now(),
      actualizado_en        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX conversacion_unidad_id_idx ON conversacion (unidad_id);
    CREATE INDEX conversacion_ocupacion_unidad_id_idx ON conversacion (ocupacion_unidad_id);

    CREATE TABLE mensaje (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversacion_id   uuid NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
      direccion         text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
      origen            text NOT NULL CHECK (origen IN ('canal', 'simulador', 'manual')),
      texto             text NOT NULL,
      redactado         boolean NOT NULL DEFAULT false,
      creado_en         timestamptz NOT NULL DEFAULT now(),

      -- Un mensaje saliente real siempre proviene de un borrador aprobado
      -- (migración 0042 añade la FK inversa desde borrador_mensaje); un
      -- mensaje saliente jamás se inserta directamente por un proceso
      -- automático (D-006) — apps/api solo inserta aquí dentro de la misma
      -- transacción que marca el borrador como 'enviado'.
      CONSTRAINT mensaje_saliente_no_vacio CHECK (direccion <> 'saliente' OR length(texto) > 0)
    );
    CREATE INDEX mensaje_conversacion_id_idx ON mensaje (conversacion_id);
    CREATE INDEX mensaje_conversacion_creado_en_idx ON mensaje (conversacion_id, creado_en);

-- ==== 0041_mensajeria_plantillas — mensajeria: plantilla_mensaje + mensaje_programado (solo plantillas aprobadas) ====
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

-- ==== 0042_mensajeria_borrador_aprobacion — mensajeria: borrador_mensaje (cola de aprobación humana) + senal_escalamiento ====
CREATE TABLE borrador_mensaje (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversacion_id     uuid NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
      mensaje_entrante_id uuid REFERENCES mensaje(id) ON DELETE SET NULL,
      plantilla_id        uuid REFERENCES plantilla_mensaje(id) ON DELETE SET NULL,
      canal_codigo        text NOT NULL CHECK (canal_codigo IN ('airbnb', 'vrbo', 'booking')),
      texto               text NOT NULL,
      generado_por        text NOT NULL CHECK (generado_por IN ('motor_borrador', 'plantilla', 'manual')),
      redactado           boolean NOT NULL DEFAULT false,
      estado              text NOT NULL DEFAULT 'pendiente_aprobacion'
                            CHECK (estado IN ('pendiente_aprobacion', 'aprobado', 'rechazado', 'enviado')),
      creado_por          uuid REFERENCES usuario(id) ON DELETE SET NULL,
      aprobado_por        uuid REFERENCES usuario(id) ON DELETE SET NULL,
      aprobado_en         timestamptz,
      rechazado_por       uuid REFERENCES usuario(id) ON DELETE SET NULL,
      rechazado_en        timestamptz,
      motivo_rechazo      text,
      mensaje_enviado_id  uuid REFERENCES mensaje(id) ON DELETE SET NULL,
      creado_en           timestamptz NOT NULL DEFAULT now(),
      actualizado_en      timestamptz NOT NULL DEFAULT now(),

      -- D-006/RV18-R-03: 'enviado' exige aprobado_por poblado (nunca un
      -- envío sin rastro de quién aprobó); 'aprobado'/'rechazado' exigen su
      -- respectivo actor. Nunca ambos aprobado_por Y rechazado_por a la vez.
      CONSTRAINT borrador_mensaje_estado_coherente CHECK (
        (estado = 'pendiente_aprobacion' AND aprobado_por IS NULL AND rechazado_por IS NULL AND mensaje_enviado_id IS NULL)
        OR (estado = 'aprobado' AND aprobado_por IS NOT NULL AND rechazado_por IS NULL)
        OR (estado = 'rechazado' AND rechazado_por IS NOT NULL AND aprobado_por IS NULL AND mensaje_enviado_id IS NULL)
        OR (estado = 'enviado' AND aprobado_por IS NOT NULL AND mensaje_enviado_id IS NOT NULL)
      )
    );
    CREATE INDEX borrador_mensaje_conversacion_id_idx ON borrador_mensaje (conversacion_id);
    CREATE INDEX borrador_mensaje_estado_idx ON borrador_mensaje (estado);

    CREATE TABLE senal_escalamiento (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mensaje_id  uuid NOT NULL REFERENCES mensaje(id) ON DELETE CASCADE,
      tipo        text NOT NULL CHECK (tipo IN ('queja', 'emergencia', 'reembolso', 'vip')),
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX senal_escalamiento_mensaje_id_idx ON senal_escalamiento (mensaje_id);

-- ==== 0043_mensajeria_rls — RLS: conversacion/mensaje/plantilla/borrador/programado/señal de escalamiento ====
CREATE OR REPLACE FUNCTION conversacion_unidad_id(_conversacion uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT unidad_id FROM conversacion WHERE id = _conversacion
    $$;

    CREATE OR REPLACE FUNCTION mensaje_unidad_id(_mensaje uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT c.unidad_id FROM mensaje m JOIN conversacion c ON c.id = m.conversacion_id WHERE m.id = _mensaje
    $$;

    CREATE OR REPLACE FUNCTION borrador_mensaje_unidad_id(_borrador uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT c.unidad_id FROM borrador_mensaje b JOIN conversacion c ON c.id = b.conversacion_id WHERE b.id = _borrador
    $$;

    CREATE OR REPLACE FUNCTION mensaje_programado_unidad_id(_programado uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT c.unidad_id FROM mensaje_programado mp JOIN conversacion c ON c.id = mp.conversacion_id WHERE mp.id = _programado
    $$;

    GRANT EXECUTE ON FUNCTION conversacion_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION mensaje_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION borrador_mensaje_unidad_id(uuid) TO app_rv;
    GRANT EXECUTE ON FUNCTION mensaje_programado_unidad_id(uuid) TO app_rv;

    ALTER TABLE conversacion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE conversacion FORCE ROW LEVEL SECURITY;
    ALTER TABLE mensaje ENABLE ROW LEVEL SECURITY;
    ALTER TABLE mensaje FORCE ROW LEVEL SECURITY;
    ALTER TABLE plantilla_mensaje ENABLE ROW LEVEL SECURITY;
    ALTER TABLE plantilla_mensaje FORCE ROW LEVEL SECURITY;
    ALTER TABLE mensaje_programado ENABLE ROW LEVEL SECURITY;
    ALTER TABLE mensaje_programado FORCE ROW LEVEL SECURITY;
    ALTER TABLE borrador_mensaje ENABLE ROW LEVEL SECURITY;
    ALTER TABLE borrador_mensaje FORCE ROW LEVEL SECURITY;
    ALTER TABLE senal_escalamiento ENABLE ROW LEVEL SECURITY;
    ALTER TABLE senal_escalamiento FORCE ROW LEVEL SECURITY;

    -- conversacion: solo operador(no solo_calendario)/admin_gestora/superadmin.
    CREATE POLICY conversacion_select ON conversacion FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY conversacion_escritura ON conversacion FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- mensaje
    CREATE POLICY mensaje_select ON mensaje FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY mensaje_insert ON mensaje FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- plantilla_mensaje (tenant_id directo)
    CREATE POLICY plantilla_mensaje_select ON plantilla_mensaje FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    -- Solo admin/superadmin pueden crear/editar/aprobar plantillas (H-056:
    -- "aprobadas por el tenant" implica un rol de gestión, no cualquier
    -- operador de mensajería del día a día).
    CREATE POLICY plantilla_mensaje_escritura ON plantilla_mensaje FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    -- mensaje_programado
    CREATE POLICY mensaje_programado_select ON mensaje_programado FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(mensaje_programado_unidad_id(id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY mensaje_programado_escritura ON mensaje_programado FOR ALL
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- borrador_mensaje: la cola de aprobación humana en sí. El UPDATE que
    -- aprueba/rechaza pasa por esta misma política (no hay un rol
    -- "aprobador" distinto de admin/operador con mensajería — la
    -- restricción de QUIÉN puede aprobar más allá del tenant es de
    -- aplicación, no de RLS, igual que en otras colas de este producto).
    CREATE POLICY borrador_mensaje_select ON borrador_mensaje FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY borrador_mensaje_insert ON borrador_mensaje FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY borrador_mensaje_update ON borrador_mensaje FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(conversacion_unidad_id(conversacion_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

    -- senal_escalamiento (a través de mensaje → conversacion)
    CREATE POLICY senal_escalamiento_select ON senal_escalamiento FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(mensaje_unidad_id(mensaje_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
    CREATE POLICY senal_escalamiento_insert ON senal_escalamiento FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), unidad_tenant_id(mensaje_unidad_id(mensaje_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );

-- ==== 0044_mensajeria_auditoria — triggers de auditoría: mensaje + borrador_mensaje ====
CREATE OR REPLACE FUNCTION fn_auditoria_mensaje() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_conversacion uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_conversacion := COALESCE(NEW.conversacion_id, OLD.conversacion_id);
      SELECT unidad_tenant_id(c.unidad_id) INTO v_tenant FROM conversacion c WHERE c.id = v_conversacion;

      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        v_actor,
        v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );

      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_mensaje
      AFTER INSERT OR UPDATE OR DELETE ON mensaje
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_mensaje();

    CREATE TRIGGER auditoria_borrador_mensaje
      AFTER INSERT OR UPDATE OR DELETE ON borrador_mensaje
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_mensaje();

-- ==== 0050_finanzas_esquema — propiedad.moneda, unidad.rfc_propietario, regla_comision_canal, reserva_financiero, linea_gasto, linea_impuesto ====
ALTER TABLE propiedad ADD COLUMN moneda text NOT NULL DEFAULT 'MXN' CHECK (moneda ~ '^[A-Z]{3}$');

    -- H-067 (RV12 §5, B-005): captura de RFC, SIN calcular ningún impuesto.
    ALTER TABLE unidad ADD COLUMN rfc_propietario text;

    -- H-063/H-065 (RV12-R-01/R-05): configuración de comisión de canal por
    -- tenant/canal, opcionalmente acotada a una propiedad — NUNCA
    -- hardcodeada en código. ya_neto_de_comision=true es el caso Airbnb
    -- confirmado (L-RV12-02); Booking.com/Vrbo quedan en false con
    -- porcentaje editable hasta tener fuente oficial (R1 de RV12).
    CREATE TABLE regla_comision_canal (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id               uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      canal_id                uuid NOT NULL REFERENCES canal(id),
      propiedad_id            uuid REFERENCES propiedad(id) ON DELETE CASCADE,
      ya_neto_de_comision     boolean NOT NULL DEFAULT false,
      comision_basis_points   integer NOT NULL DEFAULT 0 CHECK (comision_basis_points BETWEEN 0 AND 10000),
      fuente                  text NOT NULL,
      vigente_desde           date NOT NULL DEFAULT CURRENT_DATE,
      creado_en               timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, canal_id, propiedad_id, vigente_desde)
    );
    CREATE INDEX regla_comision_canal_tenant_idx ON regla_comision_canal (tenant_id, canal_id);

    CREATE TABLE reserva_financiero (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ocupacion_unidad_id           uuid NOT NULL UNIQUE REFERENCES ocupacion_unidad(id) ON DELETE CASCADE,
      moneda                        text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      monto_bruto_centavos          bigint NOT NULL CHECK (monto_bruto_centavos >= 0),
      ya_neto_de_comision           boolean NOT NULL DEFAULT false,
      comision_canal_basis_points   integer NOT NULL DEFAULT 0,
      comision_canal_fuente         text NOT NULL DEFAULT '',
      comision_canal_centavos       bigint NOT NULL DEFAULT 0 CHECK (comision_canal_centavos >= 0),
      comision_gestor_basis_points  integer NOT NULL DEFAULT 0,
      comision_gestor_base          text NOT NULL DEFAULT 'neto_de_canal' CHECK (comision_gestor_base IN ('bruto', 'neto_de_canal')),
      comision_gestor_centavos      bigint NOT NULL DEFAULT 0 CHECK (comision_gestor_centavos >= 0),
      monto_recibido_centavos       bigint NOT NULL DEFAULT 0,
      neto_centavos                 bigint NOT NULL DEFAULT 0,
      creado_por                    uuid REFERENCES usuario(id),
      creado_en                     timestamptz NOT NULL DEFAULT now(),
      actualizado_en                timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX reserva_financiero_ocupacion_idx ON reserva_financiero (ocupacion_unidad_id);

    CREATE TABLE linea_gasto (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reserva_financiero_id    uuid NOT NULL REFERENCES reserva_financiero(id) ON DELETE CASCADE,
      tipo                     text NOT NULL,
      descripcion              text,
      monto_centavos           bigint NOT NULL CHECK (monto_centavos >= 0),
      moneda                   text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      creado_por               uuid REFERENCES usuario(id),
      creado_en                timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX linea_gasto_reserva_financiero_idx ON linea_gasto (reserva_financiero_id);

    -- H-067/D-023/B-005: SIEMPRE marcada para revisión legal/fiscal — el
    -- CHECK hace explícito en el propio esquema que esta tabla nunca
    -- presenta una cifra fiscal como definitiva sin ese flag en true.
    CREATE TABLE linea_impuesto (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reserva_financiero_id    uuid NOT NULL REFERENCES reserva_financiero(id) ON DELETE CASCADE,
      tipo                     text NOT NULL,
      monto_centavos           bigint NOT NULL CHECK (monto_centavos >= 0),
      moneda                   text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      revision_fiscal          boolean NOT NULL DEFAULT true CHECK (revision_fiscal = true),
      nota                     text NOT NULL DEFAULT 'Revisión legal/fiscal pendiente (B-005) — cifra no verificada con fuente oficial del SAT',
      creado_por               uuid REFERENCES usuario(id),
      creado_en                timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX linea_impuesto_reserva_financiero_idx ON linea_impuesto (reserva_financiero_id);

-- ==== 0051_payout_conciliacion — payout_canal, payout_linea (conciliación por canal) ====
CREATE TABLE payout_canal (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id              uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      cuenta_canal_id        uuid REFERENCES cuenta_canal(id) ON DELETE SET NULL,
      referencia_externa     text,
      moneda                 text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      monto_total_centavos   bigint NOT NULL,
      fecha_payout           date NOT NULL,
      origen_importacion     text NOT NULL DEFAULT 'manual' CHECK (origen_importacion IN ('manual', 'csv_vrbo', 'csv_generico')),
      creado_por             uuid REFERENCES usuario(id),
      creado_en              timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX payout_canal_tenant_idx ON payout_canal (tenant_id);

    CREATE TABLE payout_linea (
      id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payout_id                      uuid NOT NULL REFERENCES payout_canal(id) ON DELETE CASCADE,
      ocupacion_unidad_id            uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      referencia_externa_reserva     text,
      monto_centavos                 bigint NOT NULL,
      monto_esperado_centavos        bigint,
      estado_conciliacion            text NOT NULL DEFAULT 'pendiente' CHECK (
                                        estado_conciliacion IN ('conciliado', 'pendiente', 'discrepancia')
                                      ),
      nota                           text,
      creado_en                      timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX payout_linea_payout_idx ON payout_linea (payout_id);
    CREATE INDEX payout_linea_ocupacion_idx ON payout_linea (ocupacion_unidad_id);

-- ==== 0052_owner_statement — owner_statement (versionado, idempotente por hash), owner_statement_linea ====
CREATE TABLE owner_statement (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id                    uuid NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
      tenant_id                   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      periodo_inicio               date NOT NULL,
      periodo_fin                  date NOT NULL,
      version                     integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      moneda                      text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      ingresos_brutos_centavos    bigint NOT NULL,
      comision_canal_centavos     bigint NOT NULL,
      comision_gestor_centavos    bigint NOT NULL,
      gastos_centavos             bigint NOT NULL,
      impuestos_centavos          bigint NOT NULL,
      neto_centavos               bigint NOT NULL,
      hash_contenido              text NOT NULL,
      motivo_version              text,
      generado_por                uuid REFERENCES usuario(id),
      generado_en                 timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT owner_statement_periodo_valido CHECK (periodo_inicio < periodo_fin),
      UNIQUE (owner_id, periodo_inicio, periodo_fin, version)
    );
    CREATE INDEX owner_statement_owner_periodo_idx ON owner_statement (owner_id, periodo_inicio, periodo_fin);
    CREATE INDEX owner_statement_tenant_idx ON owner_statement (tenant_id);

    CREATE TABLE owner_statement_linea (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      statement_id           uuid NOT NULL REFERENCES owner_statement(id) ON DELETE CASCADE,
      ocupacion_unidad_id    uuid REFERENCES ocupacion_unidad(id) ON DELETE SET NULL,
      tipo                   text NOT NULL CHECK (tipo IN ('ingreso', 'comision_canal', 'comision_gestor', 'gasto', 'impuesto')),
      descripcion            text NOT NULL,
      monto_centavos         bigint NOT NULL,
      moneda                 text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      creado_en              timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX owner_statement_linea_statement_idx ON owner_statement_linea (statement_id);

-- ==== 0053_pricing_esquema — tarifa_base, tarifa_temporada, tarifa_descuento_duracion, tarifa_min_stay, tarifa_regla_canal ====
CREATE TABLE tarifa_base (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                 uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      precio_noche_centavos     bigint NOT NULL CHECK (precio_noche_centavos >= 0),
      moneda                    text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      vigente_desde             date NOT NULL DEFAULT CURRENT_DATE,
      creado_por                uuid REFERENCES usuario(id),
      creado_en                 timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, vigente_desde)
    );
    CREATE INDEX tarifa_base_unidad_idx ON tarifa_base (unidad_id);

    CREATE TABLE tarifa_temporada (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      nombre                   text NOT NULL,
      fecha_inicio             date NOT NULL,
      fecha_fin                date NOT NULL,
      precio_noche_centavos    bigint NOT NULL CHECK (precio_noche_centavos >= 0),
      moneda                   text NOT NULL CHECK (moneda ~ '^[A-Z]{3}$'),
      creado_por               uuid REFERENCES usuario(id),
      creado_en                timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT tarifa_temporada_rango_valido CHECK (fecha_inicio < fecha_fin)
    );
    CREATE INDEX tarifa_temporada_unidad_idx ON tarifa_temporada (unidad_id);

    CREATE TABLE tarifa_descuento_duracion (
      id                                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      noches_minimas                        integer NOT NULL CHECK (noches_minimas > 0),
      porcentaje_descuento_basis_points     integer NOT NULL CHECK (porcentaje_descuento_basis_points BETWEEN 0 AND 10000),
      fuente                                text NOT NULL,
      creado_en                             timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, noches_minimas)
    );
    CREATE INDEX tarifa_descuento_duracion_unidad_idx ON tarifa_descuento_duracion (unidad_id);

    CREATE TABLE tarifa_min_stay (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id           uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      fecha_inicio        date NOT NULL,
      fecha_fin           date NOT NULL,
      dia_semana_checkin  integer CHECK (dia_semana_checkin BETWEEN 0 AND 6),
      noches_minimas      integer NOT NULL CHECK (noches_minimas > 0),
      creado_en           timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT tarifa_min_stay_rango_valido CHECK (fecha_inicio < fecha_fin)
    );
    CREATE INDEX tarifa_min_stay_unidad_idx ON tarifa_min_stay (unidad_id);

    -- RV13-R-04/R-06: markup por canal, INACTIVO por defecto — activarlo es
    -- una decisión explícita del tenant, nunca implícita al crear la fila.
    CREATE TABLE tarifa_regla_canal (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id              uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      canal_id               uuid NOT NULL REFERENCES canal(id),
      markup_basis_points    integer NOT NULL DEFAULT 0 CHECK (markup_basis_points >= 0),
      activo                 boolean NOT NULL DEFAULT false,
      creado_en              timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, canal_id)
    );
    CREATE INDEX tarifa_regla_canal_unidad_idx ON tarifa_regla_canal (unidad_id);

-- ==== 0054_finanzas_pricing_rls — helpers + ENABLE/FORCE RLS en tablas de finanzas y pricing (Lote 7) ====
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

-- ==== 0055_finanzas_auditoria — triggers de auditoría en tablas de mutación financiera (Lote 7) ====
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

-- ==== 0060_backoffice_columnas — tenant: estado/suspensión; propiedad: dirección mínima (columnas nuevas, nulables) ====
ALTER TABLE tenant
      ADD COLUMN estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido')),
      ADD COLUMN suspendido_motivo text,
      ADD COLUMN suspendido_en timestamptz,
      ADD COLUMN suspendido_por uuid REFERENCES usuario(id) ON DELETE SET NULL;

    ALTER TABLE propiedad
      ADD COLUMN direccion_linea1 text,
      ADD COLUMN direccion_ciudad text,
      ADD COLUMN direccion_pais text;

-- ==== 0061_acceso_romper_cristal — acceso_romper_cristal (concesión auditada y acotada) + is_tenant_member exige concesión vigente para superadmin ====
CREATE TABLE acceso_romper_cristal (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      superadmin_id   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      motivo          text NOT NULL CHECK (btrim(motivo) <> ''),
      alcance         text NOT NULL DEFAULT 'general',
      creado_en       timestamptz NOT NULL DEFAULT now(),
      expira_en       timestamptz NOT NULL,
      revocado_en     timestamptz,
      CHECK (expira_en > creado_en)
    );
    CREATE INDEX acceso_romper_cristal_vigencia_idx
      ON acceso_romper_cristal (superadmin_id, tenant_id, expira_en)
      WHERE revocado_en IS NULL;

    ALTER TABLE acceso_romper_cristal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE acceso_romper_cristal FORCE ROW LEVEL SECURITY;

    -- Solo el propio superadmin ve/crea/revoca sus concesiones (el banner
    -- persistente de la UI y el listado "accesos activos" del back office
    -- se sirven de este SELECT). SECURITY DEFINER de is_tenant_member
    -- (más abajo) lee esta tabla igual sin depender de esta política.
    CREATE POLICY acceso_romper_cristal_select ON acceso_romper_cristal FOR SELECT
      USING (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id());
    CREATE POLICY acceso_romper_cristal_insercion ON acceso_romper_cristal FOR INSERT
      WITH CHECK (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id());
    CREATE POLICY acceso_romper_cristal_revocacion ON acceso_romper_cristal FOR UPDATE
      USING (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id())
      WITH CHECK (rol_actual() = 'superadmin' AND superadmin_id = usuario_actual_id());

    -- Redefine is_tenant_member (0014): un superadmin ya NO es miembro
    -- honorario incondicional — solo lo es del tenant sobre el que tiene
    -- una concesión vigente (no revocada, no expirada).
    CREATE OR REPLACE FUNCTION is_tenant_member(_usuario uuid, _tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM usuario u
        WHERE u.id = _usuario AND u.activo
          AND (
            u.tenant_id = _tenant
            OR (
              u.rol = 'superadmin'
              AND EXISTS (
                SELECT 1 FROM acceso_romper_cristal g
                WHERE g.superadmin_id = _usuario
                  AND g.tenant_id = _tenant
                  AND g.revocado_en IS NULL
                  AND g.expira_en > now()
              )
            )
          )
      )
    $$;

    -- Directorio de tenants: política PERMISSIVE adicional (se combina con
    -- OR junto a tenant_select de 0015) — nunca requiere concesión.
    CREATE POLICY tenant_select_superadmin_directorio ON tenant FOR SELECT
      USING (rol_actual() = 'superadmin');

-- ==== 0062_invitacion_usuario — invitacion_usuario (alta de colaboradores por invitación, con expiración) ====
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

-- ==== 0063_backoffice_metricas_tenant — backoffice_metricas_tenants(): conteos agregados por tenant para el panel de superadmin ====
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

-- ==== 0064_cuenta_canal_conexion_honesta — cuenta_canal: tipo_conexion + motivo_partner_pendiente (columnas nuevas, nulables) ====
ALTER TABLE cuenta_canal
      ADD COLUMN tipo_conexion text CHECK (tipo_conexion IS NULL OR tipo_conexion IN ('ical', 'partner_pendiente', 'simulador')),
      ADD COLUMN motivo_partner_pendiente text;

    ALTER TABLE cuenta_canal ADD CONSTRAINT cuenta_canal_partner_pendiente_motivo CHECK (
      tipo_conexion IS DISTINCT FROM 'partner_pendiente' OR btrim(COALESCE(motivo_partner_pendiente, '')) <> ''
    );

-- ==== 0070_agentes_esquema — agente_cuota_tenant + agente_tool_call_log (H-079, H-080) ====
CREATE TABLE agente_cuota_tenant (
      tenant_id                     uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
      techo_tokens_periodo          bigint NOT NULL CHECK (techo_tokens_periodo >= 0),
      techo_llamadas_periodo        integer NOT NULL CHECK (techo_llamadas_periodo >= 0),
      tokens_reservados_periodo     bigint NOT NULL DEFAULT 0 CHECK (tokens_reservados_periodo >= 0),
      tokens_liquidados_periodo     bigint NOT NULL DEFAULT 0 CHECK (tokens_liquidados_periodo >= 0),
      llamadas_reservadas_periodo   integer NOT NULL DEFAULT 0 CHECK (llamadas_reservadas_periodo >= 0),
      llamadas_liquidadas_periodo   integer NOT NULL DEFAULT 0 CHECK (llamadas_liquidadas_periodo >= 0),
      periodo_inicia_en             date NOT NULL DEFAULT date_trunc('month', now()),
      creado_en                     timestamptz NOT NULL DEFAULT now(),
      actualizado_en                timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE agente_tool_call_log (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                 uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      actor_id                  uuid NOT NULL REFERENCES usuario(id),
      rol_actor                 text NOT NULL,
      conversation_id           text NOT NULL,
      canal                     text NOT NULL CHECK (canal IN ('airbnb', 'vrbo', 'booking', 'panel')),
      tool_nombre               text NOT NULL,
      argumentos_no_sensibles   jsonb NOT NULL DEFAULT '{}'::jsonb,
      resultado                 text NOT NULL CHECK (resultado IN ('exito', 'error', 'presupuesto_agotado', 'escalado', 'no_autorizado')),
      duracion_ms               integer NOT NULL CHECK (duracion_ms >= 0),
      modelo_real               text,
      costo_usd_real            numeric(12, 6) NOT NULL DEFAULT 0 CHECK (costo_usd_real >= 0),
      inicio_en                 timestamptz NOT NULL,
      fin_en                    timestamptz NOT NULL,
      creado_en                 timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX agente_tool_call_log_tenant_creado_idx ON agente_tool_call_log (tenant_id, creado_en DESC);
    CREATE INDEX agente_tool_call_log_conversation_idx ON agente_tool_call_log (conversation_id);

-- ==== 0071_agentes_rls — RLS: agente_cuota_tenant / agente_tool_call_log ====
ALTER TABLE agente_cuota_tenant ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agente_cuota_tenant FORCE ROW LEVEL SECURITY;
    ALTER TABLE agente_tool_call_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agente_tool_call_log FORCE ROW LEVEL SECURITY;

    CREATE POLICY agente_cuota_tenant_select ON agente_cuota_tenant FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );
    CREATE POLICY agente_cuota_tenant_insert ON agente_cuota_tenant FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora')
      );
    CREATE POLICY agente_cuota_tenant_update ON agente_cuota_tenant FOR UPDATE
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      )
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );

    CREATE POLICY agente_tool_call_log_select ON agente_tool_call_log FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
      );
    CREATE POLICY agente_tool_call_log_insert ON agente_tool_call_log FOR INSERT
      WITH CHECK (
        is_tenant_member(usuario_actual_id(), tenant_id)
        AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador')
        AND actor_id = usuario_actual_id()
      );
    -- Append-only: ninguna política de UPDATE/DELETE — la trazabilidad
    -- nunca se modifica ni se borra desde la capa de aplicación (mismo
    -- principio que auditoria_mutacion, migración 0008/0013).

-- ==== 0072_agentes_auditoria — trigger de auditoría en agente_cuota_tenant ====
CREATE OR REPLACE FUNCTION fn_auditoria_agente_cuota_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES (
        TG_TABLE_NAME, v_tenant, TG_OP, v_actor, v_tenant,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER auditoria_agente_cuota_tenant
      AFTER INSERT OR UPDATE OR DELETE ON agente_cuota_tenant
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_agente_cuota_tenant();

-- ==== 0080_outbox_consumido_observabilidad — outbox_evento_consumido_observabilidad: ledger de idempotencia del worker de observabilidad (replay tras crash) ====
CREATE TABLE outbox_evento_consumido_observabilidad (
      outbox_evento_id      uuid PRIMARY KEY REFERENCES outbox_evento(id) ON DELETE CASCADE,
      procesado_en          timestamptz NOT NULL DEFAULT now(),
      -- Latencia interna medida (H-039/§RV19/21-8): evento encolado
      -- (outbox_evento.creado_en) → efecto aplicado por este worker, EN
      -- MILISEGUNDOS. Separada por diseño de la latencia externa/declarada
      -- por canal (esa vive como constante en packages/adapters, p. ej.
      -- LATENCIA_AIRBNB_ICAL) — nunca se combinan en una sola métrica.
      latencia_interna_ms   bigint NOT NULL CHECK (latencia_interna_ms >= 0)
    );
    CREATE INDEX outbox_evento_consumido_observabilidad_procesado_en_idx
      ON outbox_evento_consumido_observabilidad (procesado_en);

-- ==== 0081_alerta — alerta: tabla de alertas de observabilidad con ack (nunca ejecuta acciones irreversibles) ====
CREATE TABLE alerta (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo               text NOT NULL CHECK (
                           tipo IN (
                             'sync_sin_exito',
                             'feed_en_cuarentena',
                             'conflicto_pendiente',
                             'outbox_atascada',
                             'drift',
                             'token_canal_revocado'
                           )
                         ),
      severidad          text NOT NULL DEFAULT 'alta' CHECK (severidad IN ('baja', 'media', 'alta')),
      canal_id           uuid REFERENCES canal(id),
      unidad_id          uuid REFERENCES unidad(id),
      mensaje            text NOT NULL,
      -- Metadatos operativos sin PII (H-047 aplica también aquí): solo
      -- ids/umbrales/conteos, nunca email/teléfono/nombre de huésped.
      metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
      -- Acción reversible efectivamente tomada por el motor de alertas al
      -- dispararse (nunca una cancelación/contacto — §Operación-1). NULL
      -- si la regla solo notifica, sin pausar nada.
      accion_reversible  text,
      estado             text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'reconocida', 'resuelta')),
      creado_en          timestamptz NOT NULL DEFAULT now(),
      reconocida_por     uuid REFERENCES usuario(id),
      reconocida_en      timestamptz,
      resuelta_en        timestamptz
    );
    CREATE INDEX alerta_estado_idx ON alerta (estado);
    CREATE INDEX alerta_tipo_idx ON alerta (tipo);

-- ==== 0090_cuenta_canal_cifrado — cuenta_canal: columnas de cifrado AES-256-GCM + alcance por propiedad ====
ALTER TABLE cuenta_canal
      ADD COLUMN propiedad_id uuid REFERENCES propiedad(id) ON DELETE CASCADE,
      ADD COLUMN credenciales_cifradas bytea,
      ADD COLUMN credenciales_iv bytea,
      ADD COLUMN credenciales_tag bytea,
      ADD COLUMN credenciales_clave_version text,
      ADD COLUMN ultima_sincronizacion_exitosa_en timestamptz,
      ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now();

    ALTER TABLE cuenta_canal ADD CONSTRAINT cuenta_canal_cifrado_completo CHECK (
      (credenciales_cifradas IS NULL AND credenciales_iv IS NULL AND credenciales_tag IS NULL AND credenciales_clave_version IS NULL)
      OR (credenciales_cifradas IS NOT NULL AND credenciales_iv IS NOT NULL AND credenciales_tag IS NOT NULL AND credenciales_clave_version IS NOT NULL)
    );

-- ==== 0091_auditoria_trigger_cuenta_canal — trigger de auditoría sobre cuenta_canal ====
CREATE TRIGGER auditoria_cuenta_canal
      AFTER INSERT OR UPDATE OR DELETE ON cuenta_canal
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_directa();

-- ==== 0092_rls_tablas_canal_lote2 — ENABLE/FORCE ROW LEVEL SECURITY en cuenta_canal/unidad_canal_feed/evento_canal_importado/bloqueo_exportado ====
ALTER TABLE cuenta_canal ENABLE ROW LEVEL SECURITY;
    ALTER TABLE cuenta_canal FORCE ROW LEVEL SECURITY;
    ALTER TABLE unidad_canal_feed ENABLE ROW LEVEL SECURITY;
    ALTER TABLE unidad_canal_feed FORCE ROW LEVEL SECURITY;
    ALTER TABLE evento_canal_importado ENABLE ROW LEVEL SECURITY;
    ALTER TABLE evento_canal_importado FORCE ROW LEVEL SECURITY;
    ALTER TABLE bloqueo_exportado ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bloqueo_exportado FORCE ROW LEVEL SECURITY;

    -- cuenta_canal: credenciales/estado de conexión — nunca visibles para
    -- propietario/contador/limpieza (minimización, RV19).
    CREATE POLICY cuenta_canal_select ON cuenta_canal FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY cuenta_canal_escritura ON cuenta_canal FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), tenant_id));

    CREATE POLICY unidad_canal_feed_select ON unidad_canal_feed FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY unidad_canal_feed_escritura ON unidad_canal_feed FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY evento_canal_importado_select ON evento_canal_importado FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY evento_canal_importado_escritura ON evento_canal_importado FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(unidad_id)));

    CREATE POLICY bloqueo_exportado_select ON bloqueo_exportado FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))) AND rol_actual() IN ('superadmin', 'admin_gestora', 'operador'));
    CREATE POLICY bloqueo_exportado_escritura ON bloqueo_exportado FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id))));

-- ==== 0093_huesped_minimo_tenant_rls — huesped_minimo: tenant_id + backfill + ENABLE/FORCE ROW LEVEL SECURITY (S-05) ====
ALTER TABLE huesped_minimo ADD COLUMN tenant_id uuid REFERENCES tenant(id) ON DELETE CASCADE;

    UPDATE huesped_minimo h
    SET tenant_id = rel.tenant_id
    FROM (
      SELECT o.huesped_minimo_id AS huesped_id, p.tenant_id
      FROM ocupacion_unidad o
      JOIN unidad u ON u.id = o.unidad_id
      JOIN propiedad p ON p.id = u.propiedad_id
      WHERE o.huesped_minimo_id IS NOT NULL

      UNION

      SELECT c.huesped_minimo_id AS huesped_id, p.tenant_id
      FROM conversacion c
      JOIN unidad u ON u.id = c.unidad_id
      JOIN propiedad p ON p.id = u.propiedad_id
      WHERE c.huesped_minimo_id IS NOT NULL
    ) rel
    WHERE rel.huesped_id = h.id;

    DELETE FROM huesped_minimo WHERE tenant_id IS NULL;

    ALTER TABLE huesped_minimo ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX huesped_minimo_tenant_id_idx ON huesped_minimo (tenant_id);

    ALTER TABLE huesped_minimo ENABLE ROW LEVEL SECURITY;
    ALTER TABLE huesped_minimo FORCE ROW LEVEL SECURITY;

    -- Mismo criterio de lectura que propiedad/unidad/ocupacion_unidad
    -- (0015): cualquier miembro del tenant salvo contador/limpieza (PII de
    -- huésped, minimización RV19). Propietario incluido: ya ve el nombre
    -- del huésped de sus propias reservas hoy vía otros endpoints.
    CREATE POLICY huesped_minimo_select ON huesped_minimo FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() NOT IN ('contador', 'limpieza'));

    -- Mismo criterio de escritura que ocupacion_unidad (0015): superadmin/
    -- admin_gestora siempre; operador solo si su nivel no es
    -- 'solo_calendario' — huesped_minimo solo se escribe hoy desde
    -- POST /reservas (mismo guard de rol que ocupacion_unidad).
    CREATE POLICY huesped_minimo_escritura ON huesped_minimo FOR ALL
      USING (
        (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
        )
        AND is_tenant_member(usuario_actual_id(), tenant_id)
      )
      WITH CHECK (
        (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() IN ('acceso_total', 'calendario_mensajeria'))
        )
        AND is_tenant_member(usuario_actual_id(), tenant_id)
      );

-- ==== 0100_feed_ical_token — token_export en unidad_canal_feed + funciones security definer para el feed .ics público ====
ALTER TABLE unidad_canal_feed
      ADD COLUMN token_export text UNIQUE,
      ADD COLUMN token_export_rotado_en timestamptz;

    CREATE FUNCTION feed_ical_unidad_por_token(_token text)
    RETURNS TABLE (unidad_id uuid, canal_id uuid, nombre_calendario text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, ucf.canal_id,
             COALESCE(p.nombre || ' — ' || u.nombre, u.nombre)
      FROM unidad_canal_feed ucf
      JOIN unidad u ON u.id = ucf.unidad_id
      LEFT JOIN propiedad p ON p.id = u.propiedad_id
      WHERE ucf.token_export = _token
    $$;
    REVOKE ALL ON FUNCTION feed_ical_unidad_por_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION feed_ical_unidad_por_token(text) TO app_rv;

    -- Solo reservas/bloqueos confirmados: nunca exportar un
    -- 'conflicto_pendiente' (podría filtrar una noche que en realidad no
    -- está resuelta) ni un 'cancelado'/'provisional' (RV07 §3).
    CREATE FUNCTION feed_ical_ocupaciones_unidad(_unidad_id uuid)
    RETURNS TABLE (
      ocupacion_unidad_id uuid,
      inicio text,
      fin text,
      razon text,
      version integer
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT o.id, lower(o.rango)::text, upper(o.rango)::text, o.razon, o.version
      FROM ocupacion_unidad o
      WHERE o.unidad_id = _unidad_id AND o.estado = 'confirmado'
      ORDER BY lower(o.rango)
    $$;
    REVOKE ALL ON FUNCTION feed_ical_ocupaciones_unidad(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION feed_ical_ocupaciones_unidad(uuid) TO app_rv;

-- ==== 0101_usuario_auth_extendida — usuario: verificación de correo, MFA TOTP, bloqueo temporal; tenant: política de alta; refresh_token: familia/aud ====
ALTER TABLE usuario
      ADD COLUMN email_verificado_en timestamptz,
      ADD COLUMN mfa_totp_habilitado boolean NOT NULL DEFAULT false,
      ADD COLUMN mfa_totp_secret_cifrado bytea,
      ADD COLUMN mfa_totp_secret_iv bytea,
      ADD COLUMN mfa_totp_secret_tag bytea,
      ADD COLUMN mfa_totp_secret_clave_version text,
      ADD COLUMN mfa_recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN intentos_fallidos integer NOT NULL DEFAULT 0,
      ADD COLUMN bloqueado_hasta timestamptz;

    ALTER TABLE usuario ADD CONSTRAINT usuario_mfa_secreto_completo CHECK (
      (mfa_totp_secret_cifrado IS NULL AND mfa_totp_secret_iv IS NULL AND mfa_totp_secret_tag IS NULL AND mfa_totp_secret_clave_version IS NULL)
      OR (mfa_totp_secret_cifrado IS NOT NULL AND mfa_totp_secret_iv IS NOT NULL AND mfa_totp_secret_tag IS NOT NULL AND mfa_totp_secret_clave_version IS NOT NULL)
    );

    ALTER TABLE tenant
      ADD COLUMN permite_registro boolean NOT NULL DEFAULT false,
      ADD COLUMN politica_vinculacion_google text NOT NULL DEFAULT 'invitado_solo' CHECK (
        politica_vinculacion_google IN ('invitado_solo', 'dominio_permitido', 'abierto')
      ),
      ADD COLUMN dominios_google_permitidos text[] NOT NULL DEFAULT '{}';

    ALTER TABLE refresh_token
      ADD COLUMN familia_id uuid NOT NULL DEFAULT gen_random_uuid(),
      ADD COLUMN reemplazado_por uuid REFERENCES refresh_token(id) ON DELETE SET NULL,
      ADD COLUMN revocado_motivo text,
      ADD COLUMN aud text NOT NULL DEFAULT 'api' CHECK (aud IN ('api', 'web')),
      ADD COLUMN dispositivo_etiqueta text,
      ADD COLUMN creado_ip_hash text;

    CREATE INDEX refresh_token_familia_id_idx ON refresh_token (familia_id);

-- ==== 0102_identidad_oidc — identidad_oidc (vinculación de cuenta local con Google/OIDC simulado) ====
CREATE TABLE identidad_oidc (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      proveedor   text NOT NULL,
      sub         text NOT NULL,
      email       text NOT NULL,
      hd          text,
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX identidad_oidc_proveedor_sub_idx ON identidad_oidc (proveedor, sub);
    CREATE INDEX identidad_oidc_usuario_id_idx ON identidad_oidc (usuario_id);

-- ==== 0103_token_un_uso — token_un_uso (verificación de correo + restablecimiento de contraseña) ====
CREATE TABLE token_un_uso (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      tipo        text NOT NULL CHECK (tipo IN ('verificacion_email', 'restablecer_password')),
      token_hash  text NOT NULL,
      expira_en   timestamptz NOT NULL,
      usado_en    timestamptz,
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX token_un_uso_hash_idx ON token_un_uso (token_hash);
    CREATE INDEX token_un_uso_usuario_tipo_idx ON token_un_uso (usuario_id, tipo);

-- ==== 0104_auditoria_auth_evento — auditoria_auth_evento (eventos de auth sin PII, para investigar incidentes) ====
CREATE TABLE auditoria_auth_evento (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  uuid REFERENCES usuario(id) ON DELETE SET NULL,
      tenant_id   uuid REFERENCES tenant(id) ON DELETE SET NULL,
      tipo        text NOT NULL,
      ip_hash     text,
      metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX auditoria_auth_evento_usuario_id_idx ON auditoria_auth_evento (usuario_id);
    CREATE INDEX auditoria_auth_evento_tenant_id_idx ON auditoria_auth_evento (tenant_id);
    CREATE INDEX auditoria_auth_evento_tipo_creado_en_idx ON auditoria_auth_evento (tipo, creado_en);

-- ==== 0105_oidc_flow — oidc_flow (estado efímero de PKCE/state/nonce para Google/OIDC simulado) ====
CREATE TABLE oidc_flow (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      proveedor              text NOT NULL,
      state_hash             text NOT NULL,
      code_verifier          text NOT NULL,
      nonce                  text NOT NULL,
      redirect_uri           text NOT NULL,
      cliente                text NOT NULL DEFAULT 'web' CHECK (cliente IN ('web', 'api')),
      invitacion_token_hash  text,
      creado_en              timestamptz NOT NULL DEFAULT now(),
      expira_en              timestamptz NOT NULL,
      consumido_en           timestamptz
    );
    CREATE UNIQUE INDEX oidc_flow_state_hash_idx ON oidc_flow (state_hash);

-- ==== 0106_auth_funciones_extendidas — funciones security definer: registro, verificación de correo, reset de password, MFA, bloqueo temporal ====
DROP FUNCTION IF EXISTS autenticar_buscar_usuario(text);
    CREATE FUNCTION autenticar_buscar_usuario(_email text)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      password_hash text,
      activo boolean,
      email text,
      email_verificado_en timestamptz,
      mfa_totp_habilitado boolean,
      intentos_fallidos integer,
      bloqueado_hasta timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.password_hash, u.activo,
             u.email, u.email_verificado_en, u.mfa_totp_habilitado, u.intentos_fallidos, u.bloqueado_hasta
      FROM usuario u
      WHERE lower(u.email) = lower(_email)
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario(text) TO app_rv;

    DROP FUNCTION IF EXISTS autenticar_buscar_usuario_por_id(uuid);
    CREATE FUNCTION autenticar_buscar_usuario_por_id(_id uuid)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      activo boolean,
      email text,
      email_verificado_en timestamptz,
      mfa_totp_habilitado boolean,
      mfa_totp_secret_cifrado bytea,
      mfa_totp_secret_iv bytea,
      mfa_totp_secret_tag bytea,
      mfa_totp_secret_clave_version text,
      mfa_recovery_codes jsonb,
      intentos_fallidos integer,
      bloqueado_hasta timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT u.id, u.tenant_id, u.rol, u.colaborador_nivel, u.owner_id, u.activo,
             u.email, u.email_verificado_en, u.mfa_totp_habilitado,
             u.mfa_totp_secret_cifrado, u.mfa_totp_secret_iv, u.mfa_totp_secret_tag, u.mfa_totp_secret_clave_version,
             u.mfa_recovery_codes, u.intentos_fallidos, u.bloqueado_hasta
      FROM usuario u
      WHERE u.id = _id
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_usuario_por_id(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_usuario_por_id(uuid) TO app_rv;

    -- Registro/alta pre-sesión (auto-registro abierto, aceptar invitación,
    -- o alta automática al vincular Google por primera vez). El parámetro
    -- _password_hash para una cuenta creada solo por Google es un
    -- centinela fijo que NUNCA coincide con el formato
    -- "scrypt-N-r-p-sal-derivada" que exige verificarContrasena
    -- (apps/api/src/seguridad/contrasenas.ts) -- ese login por password
    -- queda bloqueado de forma segura (no hay contraseña que probar)
    -- hasta que la propia cuenta configure una.
    CREATE FUNCTION autenticar_registrar_usuario(
      _tenant_id uuid,
      _email text,
      _password_hash text,
      _rol text,
      _colaborador_nivel text,
      _owner_id uuid,
      _email_verificado boolean
    ) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_id uuid;
    BEGIN
      INSERT INTO usuario (tenant_id, email, password_hash, rol, colaborador_nivel, owner_id, email_verificado_en)
      VALUES (_tenant_id, _email, _password_hash, _rol, _colaborador_nivel, _owner_id,
              CASE WHEN _email_verificado THEN now() ELSE NULL END)
      RETURNING id INTO v_id;
      RETURN v_id;
    END;
    $$;
    REVOKE ALL ON FUNCTION autenticar_registrar_usuario(uuid, text, text, text, text, uuid, boolean) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_registrar_usuario(uuid, text, text, text, text, uuid, boolean) TO app_rv;

    CREATE FUNCTION autenticar_marcar_email_verificado(_usuario_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET email_verificado_en = now() WHERE id = _usuario_id AND email_verificado_en IS NULL
    $$;
    REVOKE ALL ON FUNCTION autenticar_marcar_email_verificado(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_marcar_email_verificado(uuid) TO app_rv;

    -- Bloqueo temporal (además del rate limit por IP+email, S-06): al
    -- llegar a _max_intentos consecutivos, bloqueado_hasta se fija
    -- _bloqueo_ms en el futuro; cualquier intento exitoso resetea el
    -- contador vía autenticar_resetear_intentos.
    CREATE FUNCTION autenticar_registrar_intento_fallido(_usuario_id uuid, _max_intentos integer, _bloqueo_ms bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_intentos integer;
    BEGIN
      UPDATE usuario SET intentos_fallidos = intentos_fallidos + 1
      WHERE id = _usuario_id
      RETURNING intentos_fallidos INTO v_intentos;
      IF v_intentos IS NOT NULL AND v_intentos >= _max_intentos THEN
        UPDATE usuario SET bloqueado_hasta = now() + (_bloqueo_ms || ' milliseconds')::interval
        WHERE id = _usuario_id;
      END IF;
    END;
    $$;
    REVOKE ALL ON FUNCTION autenticar_registrar_intento_fallido(uuid, integer, bigint) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_registrar_intento_fallido(uuid, integer, bigint) TO app_rv;

    CREATE FUNCTION autenticar_resetear_intentos(_usuario_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_resetear_intentos(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_resetear_intentos(uuid) TO app_rv;

    CREATE FUNCTION autenticar_actualizar_password(_usuario_id uuid, _hash text) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET password_hash = _hash, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_actualizar_password(uuid, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_actualizar_password(uuid, text) TO app_rv;

    CREATE FUNCTION autenticar_actualizar_mfa(
      _usuario_id uuid,
      _habilitado boolean,
      _secret_cifrado bytea,
      _iv bytea,
      _tag bytea,
      _clave_version text,
      _recovery_codes jsonb
    ) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET
        mfa_totp_habilitado = _habilitado,
        mfa_totp_secret_cifrado = _secret_cifrado,
        mfa_totp_secret_iv = _iv,
        mfa_totp_secret_tag = _tag,
        mfa_totp_secret_clave_version = _clave_version,
        mfa_recovery_codes = _recovery_codes
      WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_actualizar_mfa(uuid, boolean, bytea, bytea, bytea, text, jsonb) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_actualizar_mfa(uuid, boolean, bytea, bytea, bytea, text, jsonb) TO app_rv;

    CREATE FUNCTION autenticar_deshabilitar_mfa(_usuario_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET
        mfa_totp_habilitado = false,
        mfa_totp_secret_cifrado = NULL,
        mfa_totp_secret_iv = NULL,
        mfa_totp_secret_tag = NULL,
        mfa_totp_secret_clave_version = NULL,
        mfa_recovery_codes = '[]'::jsonb
      WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_deshabilitar_mfa(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_deshabilitar_mfa(uuid) TO app_rv;

    CREATE FUNCTION autenticar_marcar_recovery_codes(_usuario_id uuid, _recovery_codes jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE usuario SET mfa_recovery_codes = _recovery_codes WHERE id = _usuario_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_marcar_recovery_codes(uuid, jsonb) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_marcar_recovery_codes(uuid, jsonb) TO app_rv;

-- ==== 0107_auth_invitacion_y_politica_tenant — funciones security definer: aceptar invitación + política de tenant; oidc_flow.tenant_id_registro ====
ALTER TABLE oidc_flow ADD COLUMN tenant_id_registro uuid REFERENCES tenant(id) ON DELETE SET NULL;

    CREATE FUNCTION autenticar_buscar_invitacion(_token_hash text)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      email text,
      rol text,
      colaborador_nivel text,
      owner_id uuid,
      expira_en timestamptz,
      aceptada_en timestamptz,
      revocada_en timestamptz
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT i.id, i.tenant_id, i.email, i.rol, i.colaborador_nivel, i.owner_id, i.expira_en, i.aceptada_en, i.revocada_en
      FROM invitacion_usuario i
      WHERE i.token_hash = _token_hash
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_invitacion(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_invitacion(text) TO app_rv;

    CREATE FUNCTION autenticar_aceptar_invitacion(_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      UPDATE invitacion_usuario SET aceptada_en = now()
      WHERE id = _id AND aceptada_en IS NULL AND revocada_en IS NULL
    $$;
    REVOKE ALL ON FUNCTION autenticar_aceptar_invitacion(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_aceptar_invitacion(uuid) TO app_rv;

    CREATE FUNCTION autenticar_buscar_politica_tenant(_tenant_id uuid)
    RETURNS TABLE (
      permite_registro boolean,
      politica_vinculacion_google text,
      dominios_google_permitidos text[]
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT t.permite_registro, t.politica_vinculacion_google, t.dominios_google_permitidos
      FROM tenant t
      WHERE t.id = _tenant_id
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_politica_tenant(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_politica_tenant(uuid) TO app_rv;

    CREATE FUNCTION autenticar_existe_tenant_con_registro_abierto() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM tenant WHERE permite_registro)
    $$;
    REVOKE ALL ON FUNCTION autenticar_existe_tenant_con_registro_abierto() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_existe_tenant_con_registro_abierto() TO app_rv;

-- ==== 0108_refresh_token_familia_funcion — autenticar_buscar_refresh_token: añade familia_id/aud (rotación con detección de reutilización) ====
DROP FUNCTION IF EXISTS autenticar_buscar_refresh_token(text);
    CREATE FUNCTION autenticar_buscar_refresh_token(_hash text)
    RETURNS TABLE (
      id uuid,
      usuario_id uuid,
      expira_en timestamptz,
      revocado_en timestamptz,
      familia_id uuid,
      aud text
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT r.id, r.usuario_id, r.expira_en, r.revocado_en, r.familia_id, r.aud
      FROM refresh_token r
      WHERE r.token_hash = _hash
    $$;
    REVOKE ALL ON FUNCTION autenticar_buscar_refresh_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION autenticar_buscar_refresh_token(text) TO app_rv;

-- ==== 0110_catalogo_canales_mexico — canal_catalogo: niveles A/B/C, estado honesto, capacidades, latencia, requisitos (RV22) ====
CREATE TABLE canal_catalogo (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      canal_codigo              text NOT NULL,
      nombre                    text NOT NULL,
      nivel                     text NOT NULL CHECK (nivel IN ('A', 'B', 'C')),
      via_tecnica               text NOT NULL CHECK (via_tecnica IN (
                                  'ical_import_export', 'ical_export_equivalente', 'api_partner',
                                  'channel_manager_puente', 'feed_ari', 'catalogo_manual', 'ninguna'
                                )),
      -- Vocabulario de catálogo (RV22-R-06), NUNCA los valores de tiempo de
      -- ejecución de EstadoConexionCanal (@atiende-rv/domain): este campo
      -- describe la vía en abstracto, no una cuenta concreta ya conectada.
      estado_honesto            text NOT NULL CHECK (estado_honesto IN ('ical', 'partner_pendiente', 'manual', 'no_aplica')),
      capacidades               jsonb NOT NULL DEFAULT '{}'::jsonb,
      latencia                  jsonb,
      url_proceso_oficial       text,
      requisitos_credenciales   jsonb NOT NULL DEFAULT '[]'::jsonb,
      motivo                    text,
      fuente                    text NOT NULL,
      -- Para canales "vía puente" (Despegar/PriceTravel vía SiteMinder):
      -- código del canal_catalogo que actúa de intermediario.
      puente_canal_codigo       text,
      orden                     integer NOT NULL DEFAULT 0,
      creado_en                 timestamptz NOT NULL DEFAULT now(),
      UNIQUE (canal_codigo, via_tecnica)
    );
    CREATE INDEX canal_catalogo_nivel_idx ON canal_catalogo (nivel);

    -- Restricción de coherencia (RV22-R-06/R-09): un estado_honesto
    -- 'partner_pendiente' o 'no_aplica' siempre exige un motivo citado —
    -- nunca un bloqueo sin explicación visible en la UI.
    ALTER TABLE canal_catalogo ADD CONSTRAINT canal_catalogo_motivo_requerido CHECK (
      estado_honesto NOT IN ('partner_pendiente', 'no_aplica') OR btrim(COALESCE(motivo, '')) <> ''
    );

    -- ==========================================================
    -- NIVEL A — iCal / vía pública sin aprobación de partner
    -- ==========================================================
    INSERT INTO canal_catalogo
      (canal_codigo, nombre, nivel, via_tecnica, estado_honesto, capacidades, latencia,
       url_proceso_oficial, requisitos_credenciales, motivo, fuente, orden)
    VALUES
      ('airbnb', 'Airbnb — iCal', 'A', 'ical_import_export', 'ical',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": false, "icalImportExport": true, "messaging": false}'::jsonb,
       '{"texto": "~3 horas; ventana de importación de hasta 2 años", "confianza": "baja-media", "minutosEstimados": 180, "ventanaImportacionAnios": 2}'::jsonb,
       'https://www.airbnb.mx/help/article/99',
       '["URL del calendario iCal de la unidad en Airbnb (Configuración > Disponibilidad > Sincronizar calendarios)"]'::jsonb,
       NULL, 'RV22 F01-F02, D-003', 1),

      ('vrbo', 'Vrbo — iCal', 'A', 'ical_import_export', 'ical',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": false, "icalImportExport": true, "messaging": false}'::jsonb,
       '{"texto": "~30 min + hasta 20 min de propagación", "confianza": "media-alta", "minutosEstimados": 50}'::jsonb,
       'https://www.vrbo.com/help',
       '["URL del calendario iCal de la unidad en el Owner Dashboard de Vrbo"]'::jsonb,
       NULL, 'RV22 F14, D-003', 2),

      ('agoda', 'Agoda — calendar link', 'A', 'ical_export_equivalente', 'ical',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": false, "icalImportExport": true, "messaging": false}'::jsonb,
       '{"texto": "\"varias veces al día\" (no oficial exacto)", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://ycs.agoda.com',
       '["URL del \"calendar link\" del extranet/YCS de Agoda para la propiedad"]'::jsonb,
       NULL, 'RV22 §2.8/§4 Nivel A #3, RV05 [R]', 3),

      ('mercadolibre', 'Mercado Libre — Renta Vacacional (sin calendario)', 'A', 'catalogo_manual', 'manual',
       '{"availabilityPush": false, "ratesPush": false, "reservationsPull": false, "icalImportExport": false, "messaging": false}'::jsonb,
       NULL, 'https://vendedores.mercadolibre.com.mx',
       '["Cuenta de Mercado Libre para publicar el anuncio (API pública de ítems, sin credenciales de partner)"]'::jsonb,
       'Categoría "MLM-APARTMENTS_FOR_VACATION_RENTAL" con "reservation_allowed":"not_allowed" — solo anuncio clasificado estático, sin motor de reservas ni calendario (RV22-R-07): nunca se promete cierre de disponibilidad en este canal.',
       'RV22 F43-F45', 4)
    ;

    -- ==========================================================
    -- NIVEL B — spec pública, bloqueado por partner/credenciales
    -- ==========================================================
    INSERT INTO canal_catalogo
      (canal_codigo, nombre, nivel, via_tecnica, estado_honesto, capacidades, latencia,
       url_proceso_oficial, requisitos_credenciales, motivo, fuente, puente_canal_codigo, orden)
    VALUES
      ('booking', 'Booking.com — API Connectivity (OTA/B.XML)', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "pull de reservas cada ~20s con ack; sin cifra de latencia de push publicada", "confianza": "media", "minutosEstimados": null}'::jsonb,
       'https://connect.booking.com',
       '["Machine account de Booking.com (usuario/clave del Connectivity Partner Program)", "Certificación PCI/PII diferenciada por API"]'::jsonb,
       'Booking pausa nuevos connectivity providers (connect.booking.com, 2026-09-06) — "pausing integrations with new connectivity providers until further notice"',
       'RV22 F03, D-011 (evidencia B-002)', NULL, 10),

      ('expedia', 'Expedia Group — Lodging Connectivity API', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "sin SLA publicado para Availability & Rates; Booking Notification push único al crear la reserva", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://connectivityportal.expediagroup.com',
       '["Cuenta de partner con licencia comercial (Expedia Partner Solutions)", "Attestation of Compliance PCI anual", "TLS 1.2+", "Credenciales OAuth2 client_credentials del sandbox api.sandbox.expediagroup.com"]'::jsonb,
       'Requiere PCI/TLS/license agreement y aprobación de partner; formulario comercial no público (sin autoservicio)',
       'RV22 F04-F13', NULL, 11),

      ('vrbo', 'Vrbo — API propia (stack HomeAway)', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "sin SLA propio confirmado", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://connectivityportal.expediagroup.com/documentation/vrbo',
       '["Integration Engagement Manager de Vrbo (onboarding artesanal, no autoservicio)", "Whitelisting de IP, hasta ~3 semanas"]'::jsonb,
       'Onboarding vía Integration Engagement Manager con whitelisting de hasta 3 semanas; NO comparte superficie técnica con Expedia (RV22-R-02/R-05)',
       'RV22 F13', NULL, 12),

      ('airbnb', 'Airbnb — API partner (Homes/Activities)', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": false, "reservationsPull": true, "icalImportExport": false, "messaging": true}'::jsonb,
       '{"texto": "sin SLA documentado", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://developer.withairbnb.com/join-airbnb-api-program',
       '["NDA firmado con Airbnb", "Revisión de seguridad de datos", "Certificación de partner", "6 meses post-aprobación para features obligatorias"]'::jsonb,
       'NDA + revisión de seguridad + certificación de partner (RV03); sin fecha estimada de aprobación',
       'RV22 §2.1, RV03', NULL, 13),

      ('google_vr', 'Google Vacation Rentals — feed ARI', 'B', 'feed_ari', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": false, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "sin SLA publicado", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://developers.google.com/hotels/vacation-rentals/dev-guide/onboarding',
       '["Invitación de un Technical Account Manager de Google (sin autoservicio)", "Feeds XML: Property Listings + Pricing + Landing Pages"]'::jsonb,
       'Programa exclusivamente por invitación (Technical Account Manager); sin autoservicio (RV22-R-08)',
       'RV22 F29-F30', NULL, 14),

      ('siteminder', 'SiteMinder pmsXchange (puente)', 'B', 'channel_manager_puente', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "push \"real-time\" declarado, sin cifra numérica", "confianza": "media", "minutosEstimados": null}'::jsonb,
       'https://developer.siteminder.com',
       '["Contrato comercial con SiteMinder (no autoservicio)", "Credenciales de pmsXchange (API pública documentada)"]'::jsonb,
       'Requiere contrato comercial con SiteMinder; cubre Booking.com/Expedia/Vrbo/Despegar/PriceTravel como intermediario ya certificado (Best Day no confirmado)',
       'RV22 F24-F25', NULL, 15),

      ('despegar', 'Despegar/Decolar (vía puente)', 'B', 'channel_manager_puente', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "onboarding 3-5 días declarado por el channel manager (vía tercero)", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://www.rentalsunited.com/connected-listings/despegar',
       '["Sin API/spec pública propia — requiere alta con un channel manager certificado (SiteMinder/Rentals United)"]'::jsonb,
       'Sin API/spec técnica pública propia (developers.despegar.com no resuelve); solo vía channel manager certificado',
       'RV22 F16-F19', 'siteminder', 16),

      ('pricetravel', 'PriceTravel (vía puente)', 'B', 'channel_manager_puente', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       '{"texto": "onboarding 2-3 semanas declarado por el channel manager (vía tercero)", "confianza": "baja", "minutosEstimados": null}'::jsonb,
       'https://autoenrollment.pricetravel.com',
       '["Sin API/spec pública propia confirmada para vacation rentals — requiere alta con un channel manager certificado (SiteMinder/Rentals United)"]'::jsonb,
       'Portal de auto-registro sin contenido funcional verificado; conectividad de vacation rentals solo confirmada por un channel manager tercero',
       'RV22 F22-F23', 'siteminder', 17),

      ('holidu', 'Holidu', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": true, "ratesPush": true, "reservationsPull": true, "icalImportExport": false, "messaging": false}'::jsonb,
       NULL, 'https://www.holidu.com/host/partners',
       '["Confirmar cobertura LatAm directamente con Holidu antes de cualquier integración"]'::jsonb,
       'Cobertura LatAm/México no confirmada (enfoque predominantemente europeo); requiere verificación de geografía antes de invertir',
       'RV08 LAGUNAS §4.1', NULL, 18),

      ('hotels_com', 'Hotels.com', 'B', 'api_partner', 'partner_pendiente',
       '{"availabilityPush": false, "ratesPush": false, "reservationsPull": false, "icalImportExport": false, "messaging": false}'::jsonb,
       NULL, 'https://connectivityportal.expediagroup.com',
       '["Sin árbol de documentación propio confirmado — probablemente requiere el mismo stack de Expedia"]'::jsonb,
       'Sin confirmación de token/onboarding separado del de Expedia Group (laguna); no construido como adaptador propio',
       'RV22 §2.3 (laguna)', NULL, 19)
    ;

    -- ==========================================================
    -- NIVEL C — sin vía técnica implementable (manual/no_aplica)
    -- ==========================================================
    INSERT INTO canal_catalogo
      (canal_codigo, nombre, nivel, via_tecnica, estado_honesto, capacidades, url_proceso_oficial,
       requisitos_credenciales, motivo, fuente, orden)
    VALUES
      ('bestday', 'Best Day', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Sin evidencia verificable de ningún tipo (bloqueo total 403/ENOTFOUND en todos los intentos); requiere verificación humana directa antes de reclasificar (RV22-R-09)',
       'RV22 F20-F21', 30),

      ('tripadvisor_rentals', 'TripAdvisor Rentals', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Estado operativo indeterminado (403 persistente en 2 sesiones, sin herramientas de archivo disponibles); reverificar cada 4-6 semanas (RV22-R-10)',
       'RV22 F33', 31),

      ('flipkey', 'FlipKey', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Canal cerrado, confirmado en vivo ("Flipkey has closed down, please visit Tripadvisor")',
       'RV22 F32', 32),

      ('hometogo', 'HomeToGo', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, 'https://www.hometogo.com/list-your-property', '[]'::jsonb,
       'Solo acepta Smoobu como channel manager certificado; sin API abierta para PMS de terceros',
       'RV22 F35-F37', 33),

      ('marriott_hv', 'Marriott Homes & Villas', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, 'https://homes-and-villas.marriott.com', '[]'::jsonb,
       'Solo vía 32 channel managers ya certificados (7 Elite + 25 Standard); sin autoservicio ni ruta de aplicación directa',
       'RV22 F39-F40', 34),

      ('plumguide', 'Plum Guide', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, 'https://plumguide.com/become-a-host', '[]'::jsonb,
       'Sin presencia confirmada en México; modelo de curación (solo 3% aceptado) incompatible con integración masiva',
       'RV22 F41', 35),

      ('hopper', 'Hopper Homes', 'C', 'ninguna', 'no_aplica', '{}'::jsonb, NULL, '[]'::jsonb,
       'Sin programa de partner/API identificable; estado del producto en 2026 no verificable (SPA sin renderizar, cero capturas de archivo)',
       'RV22 F42', 36),

      ('facebook_marketplace', 'Facebook Marketplace', 'C', 'catalogo_manual', 'manual', '{}'::jsonb, NULL,
       '["Cuenta de Facebook para publicar el anuncio manualmente"]'::jsonb,
       'Sin evidencia de API estructurada para renta de corto plazo ni de uso significativo verificado; solo publicación manual, nunca sincronización de disponibilidad (RV22-R-07)',
       'RV22 F46', 37)
    ;

-- ==== 0111_alerta_paridad_precio — alerta: agrega el tipo 'paridad_precio' (H-071) al CHECK existente de la columna tipo ====
ALTER TABLE alerta DROP CONSTRAINT alerta_tipo_check;
    ALTER TABLE alerta ADD CONSTRAINT alerta_tipo_check CHECK (
      tipo IN (
        'sync_sin_exito',
        'feed_en_cuarentena',
        'conflicto_pendiente',
        'outbox_atascada',
        'drift',
        'token_canal_revocado',
        'paridad_precio'
      )
    );

-- ==== 0112_canal_expedia_agoda_siteminder — canal: agrega agoda/expedia/siteminder (RV22, canales México con adaptador de código) ====
INSERT INTO canal (codigo, nombre) VALUES
      ('agoda', 'Agoda'),
      ('expedia', 'Expedia'),
      ('siteminder', 'SiteMinder pmsXchange (puente)');

-- ==== 0120_notificaciones_multicanal — preferencia_notificacion_usuario + webhook_tenant (H-054) ====
CREATE TABLE preferencia_notificacion_usuario (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      tipo_evento  text NOT NULL CHECK (tipo_evento IN ('alerta_observabilidad', 'paridad_precio', 'tarea_limpieza')),
      canal        text NOT NULL CHECK (canal IN ('correo', 'webhook')),
      activo       boolean NOT NULL DEFAULT true,
      creado_en    timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      UNIQUE (usuario_id, tipo_evento, canal)
    );
    CREATE INDEX preferencia_notificacion_usuario_usuario_id_idx ON preferencia_notificacion_usuario (usuario_id);

    CREATE TABLE webhook_tenant (
      tenant_id         uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
      url               text NOT NULL,
      -- AES-256-GCM del secreto HMAC (nunca en claro) — mismo patrón de
      -- 3 columnas que cuenta_canal.credenciales_cifradas (migración 0090).
      secreto_cifrado   bytea NOT NULL,
      secreto_iv        bytea NOT NULL,
      secreto_tag       bytea NOT NULL,
      activo            boolean NOT NULL DEFAULT false,
      creado_en         timestamptz NOT NULL DEFAULT now(),
      actualizado_en    timestamptz NOT NULL DEFAULT now()
    );

-- ==== 0121_onboarding_funciones — onboarding_registrar_empresa() — alta de tenant + empresa_gestora sin sesión previa ====
CREATE FUNCTION onboarding_registrar_empresa(_nombre text, _razon_social text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_tenant_id uuid;
    BEGIN
      IF btrim(_nombre) = '' THEN
        RAISE EXCEPTION 'nombre de empresa vacío' USING ERRCODE = 'check_violation';
      END IF;
      IF btrim(_razon_social) = '' THEN
        RAISE EXCEPTION 'razón social vacía' USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO tenant (nombre, tipo) VALUES (_nombre, 'empresa_gestora') RETURNING id INTO v_tenant_id;
      INSERT INTO empresa_gestora (tenant_id, razon_social) VALUES (v_tenant_id, _razon_social);
      RETURN v_tenant_id;
    END;
    $$;
    REVOKE ALL ON FUNCTION onboarding_registrar_empresa(text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION onboarding_registrar_empresa(text, text) TO app_rv;

-- ==== 0122_facturacion_esquema — plan_facturacion, suscripcion_tenant, medicion_uso_mensaje_ia + seed borrador comercial ====
CREATE TABLE plan_facturacion (
      codigo                      text PRIMARY KEY,
      nombre                      text NOT NULL,
      descripcion                 text NOT NULL DEFAULT '',
      escalones                   jsonb NOT NULL,
      add_ons                     jsonb NOT NULL DEFAULT '[]'::jsonb,
      limite_unidades_activas     integer,
      limite_mensajes_ia_mes      integer,
      limite_cuentas_canal        integer,
      dias_prueba                 integer NOT NULL DEFAULT 14 CHECK (dias_prueba >= 0),
      moneda                      text NOT NULL DEFAULT 'USD' CHECK (moneda ~ '^[A-Z]{3}$'),
      -- Único valor permitido hoy (RV16): ningún plan puede marcarse como
      -- precio definitivo hasta que el equipo de pricing cierre RV16.
      etiqueta_precio             text NOT NULL DEFAULT 'borrador_comercial'
                                    CHECK (etiqueta_precio = 'borrador_comercial'),
      activo                      boolean NOT NULL DEFAULT true,
      creado_en                   timestamptz NOT NULL DEFAULT now(),
      actualizado_en              timestamptz NOT NULL DEFAULT now(),
      actualizado_por             uuid REFERENCES usuario(id)
    );

    CREATE TABLE suscripcion_tenant (
      tenant_id                   uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
      plan_codigo                 text NOT NULL REFERENCES plan_facturacion(codigo),
      add_ons_activos             jsonb NOT NULL DEFAULT '[]'::jsonb,
      estado                      text NOT NULL DEFAULT 'prueba'
                                    CHECK (estado IN ('prueba', 'activa', 'pago_pendiente', 'cancelada', 'vencida')),
      inicio_periodo_prueba_en    timestamptz,
      fin_periodo_prueba_en       timestamptz,
      proxima_renovacion_en       timestamptz,
      -- 'simulado' | 'stripe' | NULL (todavía sin ningún checkout completado).
      proveedor_pago              text CHECK (proveedor_pago IS NULL OR proveedor_pago IN ('simulado', 'stripe')),
      cliente_externo_id          text,
      suscripcion_externa_id      text,
      creado_en                   timestamptz NOT NULL DEFAULT now(),
      actualizado_en              timestamptz NOT NULL DEFAULT now()
    );

    -- Contador mensual de mensajes de IA por tenant (RV16: "medición de
    -- uso"). unidades_activas/cuentas_canal NO se duplican aquí -- se
    -- cuentan en vivo desde unidad/cuenta_canal (fuente única de
    -- verdad, cero riesgo de que un contador quede desincronizado de la
    -- tabla real) vía medicion_uso_actual() abajo.
    CREATE TABLE medicion_uso_mensaje_ia (
      tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      periodo     text NOT NULL CHECK (periodo ~ '^\d{4}-\d{2}$'),
      contador    integer NOT NULL DEFAULT 0 CHECK (contador >= 0),
      PRIMARY KEY (tenant_id, periodo)
    );

    CREATE OR REPLACE FUNCTION medicion_uso_actual(_tenant uuid, _periodo text)
    RETURNS TABLE(unidades_activas integer, mensajes_ia_mes integer, cuentas_canal integer)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT
        (SELECT count(*)::int FROM unidad u JOIN propiedad p ON p.id = u.propiedad_id WHERE p.tenant_id = _tenant),
        (SELECT COALESCE(contador, 0) FROM medicion_uso_mensaje_ia WHERE tenant_id = _tenant AND periodo = _periodo),
        (SELECT count(*)::int FROM cuenta_canal WHERE tenant_id = _tenant)
    $$;
    GRANT EXECUTE ON FUNCTION medicion_uso_actual(uuid, text) TO app_rv;

    CREATE OR REPLACE FUNCTION medicion_incrementar_mensaje_ia(_tenant uuid, _periodo text, _cantidad integer DEFAULT 1)
    RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      INSERT INTO medicion_uso_mensaje_ia (tenant_id, periodo, contador)
      VALUES (_tenant, _periodo, _cantidad)
      ON CONFLICT (tenant_id, periodo) DO UPDATE SET contador = medicion_uso_mensaje_ia.contador + EXCLUDED.contador
    $$;
    GRANT EXECUTE ON FUNCTION medicion_incrementar_mensaje_ia(uuid, text, integer) TO app_rv;

    -- Alta de la suscripción de PRUEBA de un tenant recién creado, en la
    -- MISMA transacción sin sesión que onboarding_registrar_empresa
    -- (0121) -- mismo motivo: no existe todavía ninguna sesión RLS válida
    -- para ese tenant en el momento del registro self-serve.
    CREATE FUNCTION onboarding_crear_suscripcion_prueba(_tenant uuid, _plan_codigo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_dias_prueba integer;
    BEGIN
      SELECT dias_prueba INTO v_dias_prueba FROM plan_facturacion WHERE codigo = _plan_codigo AND activo = true;
      IF v_dias_prueba IS NULL THEN
        RAISE EXCEPTION 'plan de facturación "%" no existe o no está activo', _plan_codigo USING ERRCODE = 'check_violation';
      END IF;
      INSERT INTO suscripcion_tenant (tenant_id, plan_codigo, estado, inicio_periodo_prueba_en, fin_periodo_prueba_en)
      VALUES (_tenant, _plan_codigo, 'prueba', now(), now() + (v_dias_prueba || ' days')::interval);
    END;
    $$;
    REVOKE ALL ON FUNCTION onboarding_crear_suscripcion_prueba(uuid, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION onboarding_crear_suscripcion_prueba(uuid, text) TO app_rv;

    -- Seed — BORRADOR COMERCIAL (ver comentario de cabecera de este
    -- archivo y de packages/domain/src/facturacion/planes.ts).
    INSERT INTO plan_facturacion (codigo, nombre, descripcion, escalones, add_ons, limite_unidades_activas, limite_mensajes_ia_mes, limite_cuentas_canal, dias_prueba)
    VALUES
      ('esencial', 'Esencial', 'Para gestoras con un portafolio pequeño empezando en Atiende.',
       '[{"hastaUnidades":5,"precioCentavosPorUnidad":3500},{"hastaUnidades":null,"precioCentavosPorUnidad":3000}]'::jsonb,
       '[{"codigo":"ia_conversacional_500","nombre":"IA conversacional — 500 mensajes/mes","precioCentavosMes":1500,"mensajesIncluidos":500}]'::jsonb,
       15, NULL, 3, 14),
      ('profesional', 'Profesional', 'Para gestoras en crecimiento con varios canales activos.',
       '[{"hastaUnidades":10,"precioCentavosPorUnidad":2800},{"hastaUnidades":30,"precioCentavosPorUnidad":2200},{"hastaUnidades":null,"precioCentavosPorUnidad":1800}]'::jsonb,
       '[{"codigo":"ia_conversacional_500","nombre":"IA conversacional — 500 mensajes/mes","precioCentavosMes":1500,"mensajesIncluidos":500},{"codigo":"ia_conversacional_2000","nombre":"IA conversacional — 2,000 mensajes/mes","precioCentavosMes":4500,"mensajesIncluidos":2000}]'::jsonb,
       75, NULL, 10, 14),
      ('portafolio', 'Portafolio', 'Para operadores establecidos con portafolios grandes — precio a la baja por volumen.',
       '[{"hastaUnidades":30,"precioCentavosPorUnidad":2000},{"hastaUnidades":100,"precioCentavosPorUnidad":1500},{"hastaUnidades":null,"precioCentavosPorUnidad":1000}]'::jsonb,
       '[{"codigo":"ia_conversacional_2000","nombre":"IA conversacional — 2,000 mensajes/mes","precioCentavosMes":4500,"mensajesIncluidos":2000},{"codigo":"ia_conversacional_ilimitada","nombre":"IA conversacional — ilimitada","precioCentavosMes":12000,"mensajesIncluidos":null}]'::jsonb,
       NULL, NULL, NULL, 14);

-- ==== 0123_facturacion_rls — RLS de plan_facturacion/suscripcion_tenant/medicion_uso_mensaje_ia + auditoría ====
ALTER TABLE plan_facturacion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE plan_facturacion FORCE ROW LEVEL SECURITY;
    ALTER TABLE suscripcion_tenant ENABLE ROW LEVEL SECURITY;
    ALTER TABLE suscripcion_tenant FORCE ROW LEVEL SECURITY;
    ALTER TABLE medicion_uso_mensaje_ia ENABLE ROW LEVEL SECURITY;
    ALTER TABLE medicion_uso_mensaje_ia FORCE ROW LEVEL SECURITY;

    -- Catálogo público de solo lectura — sin excepción de rol/tenant.
    CREATE POLICY plan_facturacion_select ON plan_facturacion FOR SELECT USING (true);
    -- Ninguna política de escritura para app_rv a propósito: toda
    -- mutación pasa por facturacion_actualizar_plan() (SECURITY
    -- DEFINER), nunca un UPDATE/INSERT directo desde la ruta HTTP.

    CREATE POLICY suscripcion_tenant_select ON suscripcion_tenant FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'));
    -- admin_gestora puede cambiar el plan/add-ons de SU PROPIO tenant
    -- (autoservicio, RV16); superadmin puede ajustar cualquier tenant
    -- desde backoffice. El webhook de Stripe (0124) actualiza estado/
    -- proveedor de pago vía una función SECURITY DEFINER aparte, no a
    -- través de esta política (un webhook no trae sesión de usuario).
    CREATE POLICY suscripcion_tenant_update ON suscripcion_tenant FOR UPDATE
      USING (rol_actual() = 'superadmin' OR (rol_actual() = 'admin_gestora' AND is_tenant_member(usuario_actual_id(), tenant_id)))
      WITH CHECK (rol_actual() = 'superadmin' OR (rol_actual() = 'admin_gestora' AND is_tenant_member(usuario_actual_id(), tenant_id)));

    CREATE POLICY medicion_uso_mensaje_ia_select ON medicion_uso_mensaje_ia FOR SELECT
      USING (is_tenant_member(usuario_actual_id(), tenant_id) AND rol_actual() IN ('superadmin', 'admin_gestora'));

    -- Auditoría (H-045) — solo en suscripcion_tenant: es la única de las
    -- tres tablas de este lote con impacto de negocio/financiero por
    -- fila (cambios de plan/estado). plan_facturacion (catálogo global,
    -- sin tenant_id) y medicion_uso_mensaje_ia (contador de alto
    -- volumen, sin valor de auditoría por incremento individual) quedan
    -- fuera a propósito.
    --
    -- NO reusa fn_auditoria_directa() (0013): esa función genérica hace
    -- COALESCE(NEW.id, OLD.id) para fila_id, y suscripcion_tenant NO
    -- tiene columna "id" — su PK es tenant_id (relación 1:1 real con
    -- tenant, sin necesidad de un uuid propio). Verificado con una
    -- prueba de integración real: usar el trigger genérico sin cambios
    -- fallaba en cada INSERT/UPDATE con
    -- 'record "new" has no field "id"'. Este trigger dedicado usa
    -- tenant_id como fila_id — identifica la fila igual de bien.
    CREATE OR REPLACE FUNCTION fn_auditoria_suscripcion_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_actor uuid;
      v_tenant uuid;
      v_previos jsonb;
      v_nuevos jsonb;
    BEGIN
      v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_previos := to_jsonb(OLD);
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_nuevos := to_jsonb(NEW);
      END IF;
      INSERT INTO auditoria_mutacion (tabla, fila_id, operacion, actor_id, tenant_id, valores_previos, valores_nuevos)
      VALUES ('suscripcion_tenant', v_tenant, TG_OP, v_actor, v_tenant, v_previos, v_nuevos);
      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    CREATE TRIGGER suscripcion_tenant_auditoria
      AFTER INSERT OR UPDATE OR DELETE ON suscripcion_tenant
      FOR EACH ROW EXECUTE FUNCTION fn_auditoria_suscripcion_tenant();

    -- Edición del catálogo — Superadmin únicamente, revalidado dentro de
    -- la función (defensa en profundidad respecto al chequeo de rol de la
    -- ruta HTTP). Reemplaza escalones/add_ons/límites completos (nunca un
    -- PATCH parcial silencioso de JSONB — la ruta HTTP envía el objeto
    -- completo ya validado por zod).
    CREATE FUNCTION facturacion_actualizar_plan(
      _codigo text,
      _nombre text,
      _descripcion text,
      _escalones jsonb,
      _add_ons jsonb,
      _limite_unidades_activas integer,
      _limite_mensajes_ia_mes integer,
      _limite_cuentas_canal integer,
      _dias_prueba integer,
      _activo boolean,
      _actualizado_por uuid
    ) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      -- IS DISTINCT FROM (no <>): verificado con una prueba de
      -- integración real que rol_actual() es NULL para cualquier sesión
      -- sin un usuario_id que exista/esté activo en usuario (incluida
      -- una sesión completamente anónima) — NULL <> 'superadmin'
      -- evalúa a NULL, e IF NULL THEN es SIEMPRE falso en PL/pgSQL, así
      -- que ese guard con <> fallaba ABIERTO (nunca lanzaba) para
      -- cualquier sesión sin identidad resuelta. IS DISTINCT FROM
      -- trata NULL como un valor real y comparable — fail-closed.
      IF rol_actual() IS DISTINCT FROM 'superadmin' THEN
        RAISE EXCEPTION 'solo Superadmin puede editar el catálogo de planes' USING ERRCODE = 'insufficient_privilege';
      END IF;
      UPDATE plan_facturacion SET
        nombre = _nombre,
        descripcion = _descripcion,
        escalones = _escalones,
        add_ons = _add_ons,
        limite_unidades_activas = _limite_unidades_activas,
        limite_mensajes_ia_mes = _limite_mensajes_ia_mes,
        limite_cuentas_canal = _limite_cuentas_canal,
        dias_prueba = _dias_prueba,
        activo = _activo,
        actualizado_en = now(),
        actualizado_por = _actualizado_por
      WHERE codigo = _codigo;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'plan "%" no existe' , _codigo USING ERRCODE = 'no_data_found';
      END IF;
    END;
    $$;
    REVOKE ALL ON FUNCTION facturacion_actualizar_plan(text, text, text, jsonb, jsonb, integer, integer, integer, integer, boolean, uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_actualizar_plan(text, text, text, jsonb, jsonb, integer, integer, integer, integer, boolean, uuid) TO app_rv;

-- ==== 0124_facturacion_webhook — facturacion_registrar_pago() + evento_pago_procesado (idempotencia de webhook) ====
CREATE TABLE evento_pago_procesado (
      proveedor    text NOT NULL CHECK (proveedor IN ('simulado', 'stripe')),
      evento_id    text NOT NULL,
      procesado_en timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (proveedor, evento_id)
    );
    -- Sin RLS de por medio a propósito: esta tabla nunca se consulta con
    -- una sesión de usuario, solo desde facturacion_registrar_pago()
    -- (SECURITY DEFINER) — no expone ninguna fila vía la API HTTP normal.

    CREATE FUNCTION facturacion_registrar_pago(
      _tenant uuid,
      _proveedor text,
      _evento_id text,
      _cliente_externo_id text,
      _suscripcion_externa_id text,
      _estado text
    ) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_filas_insertadas integer;
    BEGIN
      IF _estado NOT IN ('prueba', 'activa', 'pago_pendiente', 'cancelada', 'vencida') THEN
        RAISE EXCEPTION 'estado de suscripción inválido: %', _estado USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO evento_pago_procesado (proveedor, evento_id)
      VALUES (_proveedor, _evento_id)
      ON CONFLICT (proveedor, evento_id) DO NOTHING;
      GET DIAGNOSTICS v_filas_insertadas = ROW_COUNT;
      -- ROW_COUNT = 0 significa que el INSERT no insertó nada (ya existía)
      -- -> este evento YA se procesó antes; se devuelve false sin tocar
      -- suscripcion_tenant, para que la ruta HTTP responda 200 igual
      -- (Stripe espera 2xx también en un reintento ya conocido) sin
      -- reaplicar el efecto de negocio.
      IF v_filas_insertadas = 0 THEN
        RETURN false;
      END IF;

      UPDATE suscripcion_tenant SET
        estado = _estado,
        proveedor_pago = _proveedor,
        cliente_externo_id = COALESCE(_cliente_externo_id, cliente_externo_id),
        suscripcion_externa_id = COALESCE(_suscripcion_externa_id, suscripcion_externa_id),
        proxima_renovacion_en = CASE WHEN _estado = 'activa' THEN now() + interval '30 days' ELSE proxima_renovacion_en END,
        actualizado_en = now()
      WHERE tenant_id = _tenant;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'suscripcion_tenant no existe para tenant %', _tenant USING ERRCODE = 'no_data_found';
      END IF;
      RETURN true;
    END;
    $$;
    REVOKE ALL ON FUNCTION facturacion_registrar_pago(uuid, text, text, text, text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_registrar_pago(uuid, text, text, text, text, text) TO app_rv;

-- ==== 0125_facturacion_webhook_lookup — facturacion_tenant_por_cliente_externo() — lookup sin sesión para el webhook de pagos ====
CREATE FUNCTION facturacion_tenant_por_cliente_externo(_cliente_externo_id text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT tenant_id FROM suscripcion_tenant WHERE cliente_externo_id = _cliente_externo_id
    $$;
    REVOKE ALL ON FUNCTION facturacion_tenant_por_cliente_externo(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION facturacion_tenant_por_cliente_externo(text) TO app_rv;

-- ==== 0126_facturacion_mrr — facturacion_listar_activas_para_mrr() — agregado de plataforma para Superadmin, sin romper cristal ====
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

