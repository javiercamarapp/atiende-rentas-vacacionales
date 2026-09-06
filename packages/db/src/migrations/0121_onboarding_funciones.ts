import type { Migracion } from "../runner/tipos.js";

// Lote 3.3 (Fase 3, RV16): onboarding self-serve. `POST /onboarding/registro`
// (apps/api/src/routes/onboarding.ts) es la PRIMERA ruta pública (sin
// sesión) que necesita crear un `tenant` nuevo desde cero — hasta este
// lote, `POST /tenants` (apps/api/src/routes/tenants.ts) exigía una
// sesión de Superadmin ya autenticada (bootstrapping manual). Mismo
// patrón que `autenticar_registrar_usuario` (0106): una función
// `SECURITY DEFINER` es la única forma de insertar en `tenant`/
// `empresa_gestora` SIN una sesión RLS previa — la ruta llama a
// `limpiarSesion()` primero (igual que `/auth/registro`), así que ninguna
// fila es visible "de más" durante el propio registro.
export const migracion0121OnboardingFunciones: Migracion = {
  id: "0121_onboarding_funciones",
  descripcion: "onboarding_registrar_empresa() — alta de tenant + empresa_gestora sin sesión previa",
  up: `
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
  `,
  down: `
    DROP FUNCTION IF EXISTS onboarding_registrar_empresa(text, text);
  `,
};
