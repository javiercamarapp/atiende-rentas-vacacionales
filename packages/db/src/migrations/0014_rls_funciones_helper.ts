import type { Migracion } from "../runner/tipos.js";

// H-041/D-020: funciones `SECURITY DEFINER` que evalúan identidad/rol a
// partir de los settings de sesión que apps/api fija con `SET LOCAL` dentro
// de la transacción de cada request (`app.user_id`, `app.tenant_id`,
// `app.rol` — este último documentado en el encargo, aunque las políticas
// de esta migración derivan el rol siempre de la tabla `usuario` en vivo,
// nunca del claim `app.rol` sin verificar, para que revocar/cambiar un rol
// surta efecto inmediato sin esperar a que expire un JWT ya emitido).
//
// Todas son `SECURITY DEFINER`, propiedad del rol que corre las
// migraciones (superusuario, p. ej. `postgres`): un superusuario SIEMPRE
// ignora RLS sin importar `FORCE` (documentado en D-020/RV17-F-05), así que
// estas funciones pueden consultar `usuario`/`propiedad`/`unidad` (tablas
// que también tendrán RLS `FORCE`ado, migración 0015) sin caer en
// recursión ni ser bloqueadas por sus propias políticas.
export const migracion0014RlsFuncionesHelper: Migracion = {
  id: "0014_rls_funciones_helper",
  descripcion: "funciones security definer: identidad de sesión + is_tenant_member",
  up: `
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
  `,
  down: `
    DROP FUNCTION IF EXISTS ocupacion_unidad_de(uuid);
    DROP FUNCTION IF EXISTS owner_tenant_id(uuid);
    DROP FUNCTION IF EXISTS unidad_owner_id(uuid);
    DROP FUNCTION IF EXISTS unidad_tenant_id(uuid);
    DROP FUNCTION IF EXISTS propiedad_tenant_id(uuid);
    DROP FUNCTION IF EXISTS is_tenant_member(uuid, uuid);
    DROP FUNCTION IF EXISTS owner_actual();
    DROP FUNCTION IF EXISTS colaborador_nivel_actual();
    DROP FUNCTION IF EXISTS rol_actual();
    DROP FUNCTION IF EXISTS usuario_actual_id();
  `,
};
