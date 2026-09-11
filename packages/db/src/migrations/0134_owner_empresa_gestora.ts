import type { Migracion } from "../runner/tipos.js";

// REQ-023/H-048 (COULD, ACEPTACION.md §Roles-4): `0002_tenant_empresa_owner.ts`
// dejó documentado que "un owner referencia una sola empresa_gestora por
// ahora. Ampliar a N:M requiere una decisión de producto explícita" — esta
// migración es esa ampliación. No se reescribe 0002/0014/0015 (ya
// desplegadas, protegidas por hash — `packages/db/src/runner/migrar.ts`):
// se sigue el mismo patrón que `0061_acceso_romper_cristal.ts` (redefinir
// `is_tenant_member` con `CREATE OR REPLACE FUNCTION` en una migración
// posterior) para sustituir las políticas RLS de `owner` sin tocar el
// archivo original.
//
// Diseño:
//  1. `owner_empresa_gestora` es la tabla puente N:M real. `owner.
//     empresa_gestora_id` (columna original) se CONSERVA sin cambios de
//     esquema — sigue siendo la "empresa gestora de alta" (con quién se
//     dio de alta el propietario originalmente; el dato que ya usan
//     `apps/api/src/routes/finanzas.ts` y las fixtures de prueba
//     existentes) y un trigger la mantiene sincronizada hacia la tabla
//     puente en cada INSERT/UPDATE, así que todo el código y todas las
//     pruebas que insertan un owner con esa sola columna (patrón `INSERT
//     INTO owner (empresa_gestora_id, nombre) VALUES (...)`) siguen
//     funcionando sin ningún cambio y automáticamente quedan también
//     representados en la tabla puente — la fuente de verdad para
//     autorización pasa a ser SIEMPRE `owner_empresa_gestora`, la columna
//     vieja es ahora solo metadato de alta.
//  2. La migración de datos existentes (`INSERT ... SELECT ... WHERE
//     empresa_gestora_id IS NOT NULL`) preserva exactamente la relación
//     1:N ya vigente antes de esta migración: cada owner ya vinculado a
//     una empresa_gestora aparece en la tabla puente vinculado a esa MISMA
//     empresa_gestora, ni una fila más ni una menos.
//  3. `owner_pertenece_a_tenant(_owner, _tenant)` sustituye a `owner_
//     tenant_id(_owner) = _tenant` (0014) como el predicado de
//     autorización: en vez de "el owner tiene un único tenant, compáralo",
//     ahora es "¿existe una empresa_gestora de ese tenant vinculada a este
//     owner?" — cierto para CUALQUIER empresa_gestora vinculada, no solo
//     la de alta. `owner_tenant_id` (0014) se conserva sin borrar (firma
//     estable, nada más la usa ya) para no romper compatibilidad binaria
//     de quien la hubiera llamado directamente.
//  4. Las políticas `owner_select`/`owner_escritura` (0015) se DROPean y
//     recrean usando `owner_pertenece_a_tenant` en vez de `owner_tenant_id
//     (id) = ...` — mismo criterio de rol (superadmin/admin_gestora para
//     escritura; propietario limitado a `id = owner_actual()`; contador/
//     limpieza sin acceso), la única diferencia real es que ahora CUALQUIER
//     tenant miembro de alguna empresa_gestora vinculada ve la fila,
//     nunca el de una empresa_gestora NO vinculada (§Roles-4: "cada
//     empresa gestora solo ve las propiedades que administra de ese
//     propietario, nunca las de la otra" — `propiedad`/`unidad` ya
//     estaban aisladas por su propio `tenant_id`, esta migración cierra el
//     único hueco real: la fila `owner` en sí misma era invisible para
//     cualquier tenant que no fuera el de alta).
//  5. `owner_empresa_gestora` recibe su propio `ENABLE`/`FORCE ROW LEVEL
//     SECURITY` + políticas (mismo criterio de rol que `owner`), para que
//     la tabla puente en sí misma no sea un canal de fuga que revele a un
//     tenant ajeno con qué OTRAS empresas_gestoras está vinculado un
//     propietario que sí comparte.
export const migracion0134OwnerEmpresaGestora: Migracion = {
  id: "0134_owner_empresa_gestora",
  descripcion: "owner_empresa_gestora: tabla puente N:M owner↔empresa_gestora + RLS actualizada",
  up: `
    CREATE TABLE owner_empresa_gestora (
      owner_id            uuid NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
      empresa_gestora_id  uuid NOT NULL REFERENCES empresa_gestora(id) ON DELETE CASCADE,
      creado_en           timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, empresa_gestora_id)
    );
    CREATE INDEX owner_empresa_gestora_empresa_gestora_id_idx
      ON owner_empresa_gestora (empresa_gestora_id);

    -- Migración de datos existentes: preserva la relación 1:N ya vigente,
    -- una fila puente por cada owner ya vinculado a una empresa_gestora.
    INSERT INTO owner_empresa_gestora (owner_id, empresa_gestora_id)
    SELECT id, empresa_gestora_id FROM owner WHERE empresa_gestora_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- Mantiene owner.empresa_gestora_id (la empresa de alta) sincronizada
    -- hacia la tabla puente: todo insert/actualización por la columna
    -- vieja sigue vinculando también por la vía N:M nueva, sin exigir que
    -- ningún llamador existente cambie una sola línea.
    CREATE OR REPLACE FUNCTION owner_empresa_gestora_sync_alta() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.empresa_gestora_id IS NOT NULL THEN
        INSERT INTO owner_empresa_gestora (owner_id, empresa_gestora_id)
        VALUES (NEW.id, NEW.empresa_gestora_id)
        ON CONFLICT DO NOTHING;
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER owner_empresa_gestora_sync_alta_trigger
      AFTER INSERT OR UPDATE OF empresa_gestora_id ON owner
      FOR EACH ROW EXECUTE FUNCTION owner_empresa_gestora_sync_alta();

    -- Sustituye a owner_tenant_id(_owner) = _tenant (0014) como predicado
    -- de autorización: cierto si existe CUALQUIER empresa_gestora de ese
    -- tenant vinculada al owner (no solo la de alta).
    CREATE OR REPLACE FUNCTION owner_pertenece_a_tenant(_owner uuid, _tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1
        FROM owner_empresa_gestora oeg
        JOIN empresa_gestora eg ON eg.id = oeg.empresa_gestora_id
        WHERE oeg.owner_id = _owner AND eg.tenant_id = _tenant
      )
    $$;
    GRANT EXECUTE ON FUNCTION owner_pertenece_a_tenant(uuid, uuid) TO app_rv;

    COMMENT ON FUNCTION owner_tenant_id(uuid) IS
      'Deprecado por H-048/REQ-023: un owner puede pertenecer a varias empresa_gestora (tabla owner_empresa_gestora). Ya no se usa en políticas RLS — usar owner_pertenece_a_tenant(owner_id, tenant_id). Se conserva sin borrar por compatibilidad de firma.';

    -- Redefine owner_select/owner_escritura (0015) con el nuevo predicado
    -- N:M — mismo criterio de rol que antes, solo cambia CÓMO se decide si
    -- el usuario pertenece a "el" tenant del owner (ahora puede haber
    -- varios).
    DROP POLICY IF EXISTS owner_select ON owner;
    CREATE POLICY owner_select ON owner FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM owner_empresa_gestora oeg
          JOIN empresa_gestora eg ON eg.id = oeg.empresa_gestora_id
          WHERE oeg.owner_id = owner.id AND is_tenant_member(usuario_actual_id(), eg.tenant_id)
        )
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR id = owner_actual())
      );
    DROP POLICY IF EXISTS owner_escritura ON owner;
    CREATE POLICY owner_escritura ON owner FOR ALL
      USING (
        rol_actual() IN ('superadmin', 'admin_gestora')
        AND EXISTS (
          SELECT 1 FROM owner_empresa_gestora oeg
          JOIN empresa_gestora eg ON eg.id = oeg.empresa_gestora_id
          WHERE oeg.owner_id = owner.id AND is_tenant_member(usuario_actual_id(), eg.tenant_id)
        )
      )
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora'));

    -- owner_empresa_gestora: mismo criterio de rol que owner_select — la
    -- tabla puente en sí no debe filtrar a un tenant ajeno con qué OTRAS
    -- empresas_gestoras comparte un propietario que sí tiene en común.
    ALTER TABLE owner_empresa_gestora ENABLE ROW LEVEL SECURITY;
    ALTER TABLE owner_empresa_gestora FORCE ROW LEVEL SECURITY;

    CREATE POLICY owner_empresa_gestora_select ON owner_empresa_gestora FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), (SELECT eg.tenant_id FROM empresa_gestora eg WHERE eg.id = owner_empresa_gestora.empresa_gestora_id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR owner_id = owner_actual())
      );
    CREATE POLICY owner_empresa_gestora_escritura ON owner_empresa_gestora FOR ALL
      USING (
        rol_actual() IN ('superadmin', 'admin_gestora')
        AND is_tenant_member(usuario_actual_id(), (SELECT eg.tenant_id FROM empresa_gestora eg WHERE eg.id = owner_empresa_gestora.empresa_gestora_id))
      )
      WITH CHECK (
        -- Más estricto que owner_escritura (0015, sin este chequeo de
        -- tenant en su WITH CHECK): tabla nueva, sin código existente que
        -- dependa del comportamiento laxo previo, así que se cierra aquí
        -- desde el inicio en vez de heredar el hueco. Solo la propia
        -- empresa_gestora receptora (o superadmin) puede vincularse a un
        -- owner — un admin_gestora del tenant A nunca puede escribir una
        -- fila (owner, egC) de un tenant C ajeno.
        rol_actual() IN ('superadmin', 'admin_gestora')
        AND is_tenant_member(usuario_actual_id(), (SELECT eg.tenant_id FROM empresa_gestora eg WHERE eg.id = owner_empresa_gestora.empresa_gestora_id))
      );
  `,
  down: `
    DROP POLICY IF EXISTS owner_empresa_gestora_escritura ON owner_empresa_gestora;
    DROP POLICY IF EXISTS owner_empresa_gestora_select ON owner_empresa_gestora;

    DROP POLICY IF EXISTS owner_escritura ON owner;
    DROP POLICY IF EXISTS owner_select ON owner;

    -- Restaura las políticas exactamente como las dejó 0015_rls_politicas.ts.
    CREATE POLICY owner_select ON owner FOR SELECT
      USING (
        is_tenant_member(usuario_actual_id(), owner_tenant_id(id))
        AND rol_actual() NOT IN ('contador', 'limpieza')
        AND (rol_actual() <> 'propietario' OR id = owner_actual())
      );
    CREATE POLICY owner_escritura ON owner FOR ALL
      USING (rol_actual() IN ('superadmin', 'admin_gestora') AND is_tenant_member(usuario_actual_id(), owner_tenant_id(id)))
      WITH CHECK (rol_actual() IN ('superadmin', 'admin_gestora'));

    COMMENT ON FUNCTION owner_tenant_id(uuid) IS NULL;
    DROP FUNCTION IF EXISTS owner_pertenece_a_tenant(uuid, uuid);

    DROP TRIGGER IF EXISTS owner_empresa_gestora_sync_alta_trigger ON owner;
    DROP FUNCTION IF EXISTS owner_empresa_gestora_sync_alta();

    DROP TABLE IF EXISTS owner_empresa_gestora;
  `,
};
