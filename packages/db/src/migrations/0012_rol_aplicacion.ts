import type { Migracion } from "../runner/tipos.js";

// Rol de base de datos de la aplicación (H-041, D-020): `app_rv` es el rol
// con el que se conecta apps/api en runtime y en pruebas de integración.
// Deliberadamente SIN el atributo BYPASSRLS y SIN ser dueño de ninguna
// tabla — ambas condiciones son necesarias para que `FORCE ROW LEVEL
// SECURITY` (migración 0014) tenga efecto real: un superusuario (como
// `postgres`, con el que corren las migraciones) siempre ignora RLS sin
// importar FORCE; un rol normal sin BYPASSRLS, no.
//
// La contraseña de este rol NUNCA es un secreto de producción: en
// despliegues reales se rota inmediatamente después de migrar con
// `ALTER ROLE app_rv WITH PASSWORD '<secreto real, fuera de git>'` desde el
// pipeline de despliegue (nunca commiteado); el valor de abajo solo
// necesita existir para que el cluster acepte la conexión de pruebas de
// integración/desarrollo local contra `embedded-postgres` (§RV19/21-13: no
// es una credencial de canal ni de huésped, es un rol de infraestructura
// interno, documentado explícitamente aquí en vez de ocultarlo).
const CONTRASENA_DESARROLLO_APP_RV = "app_rv_dev_change_in_prod";

export const migracion0012RolAplicacion: Migracion = {
  id: "0012_rol_aplicacion",
  descripcion: "rol app_rv sin BYPASSRLS + privilegios mínimos sobre el esquema",
  up: `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rv') THEN
        EXECUTE format(
          'CREATE ROLE app_rv LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L',
          '${CONTRASENA_DESARROLLO_APP_RV}'
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
  `,
  down: `
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_rv;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM app_rv;
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM app_rv;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_rv;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE ON SEQUENCES FROM app_rv;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM app_rv;
    REVOKE USAGE ON SCHEMA public FROM app_rv;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rv') THEN
        EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM app_rv', current_database());
      END IF;
    END
    $$;
    DROP ROLE IF EXISTS app_rv;
  `,
};
