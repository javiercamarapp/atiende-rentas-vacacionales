import type { Migracion } from "../runner/tipos.js";

// Corrección de auditoría independiente S-05 (docs/auditoria-2/seguridad.md):
// `huesped_minimo` (PII: nombre/contacto de huésped, migración
// 0005_ocupacion_unidad.ts) se creó SIN `tenant_id` propio y SIN RLS —
// quedó fuera del perímetro multitenant que 0015/0043 sí aplicaron a todas
// las demás tablas de negocio. Combinado con que
// `POST /mensajeria/conversaciones` (apps/api/src/routes/mensajeria/
// conversaciones.ts) aceptaba cualquier `huespedMinimoId` sin validar
// pertenencia, esto era un IDOR cross-tenant real: un admin del tenant A
// podía adjuntar el huésped de OTRO tenant a una conversación propia y el
// nombre/contacto de ese huésped terminaba expuesto en un borrador
// generado para el tenant A (H-AUD2-02,
// tests/auditoria-2/seguridad/rls-auth.adversarial.test.ts).
//
// Nota importante (documentada para quien revise este archivo): Postgres
// hace bypass de RLS en la verificación de las FOREIGN KEY — RLS por sí
// sola NO habría bastado para rechazar el INSERT cruzado. El cierre real
// del IDOR es el chequeo explícito en la capa de aplicación (ver el commit
// que modifica conversaciones.ts); esta migración es la mitad de defensa
// en profundidad: aísla `huesped_minimo` como cualquier otra tabla de
// tenant para lectura directa/futuros endpoints, y dota a la tabla del
// `tenant_id` que ese chequeo de aplicación necesita para comparar.
//
// Backfill: el tenant real de un `huesped_minimo` se deriva de la ÚNICA
// relación que existe hoy — su uso desde `ocupacion_unidad` (creado por
// POST /reservas) o desde `conversacion` (adjuntado por
// POST /mensajeria/conversaciones) — nunca de un campo nuevo puesto a
// mano. Toda fila de `huesped_minimo` nace ligada a una de esas dos por
// invariante de aplicación (nunca existe un huésped mínimo sin ningún
// uso); una fila que sobreviva el backfill sin ninguna relación es un
// huérfano sin ningún uso legítimo posible bajo RLS (jamás sería
// alcanzable por ningún usuario final) y se elimina en vez de dejarla en
// un estado sin tenant que ninguna política podría clasificar.
export const migracion0093HuespedMinimoTenantRls: Migracion = {
  id: "0093_huesped_minimo_tenant_rls",
  descripcion: "huesped_minimo: tenant_id + backfill + ENABLE/FORCE ROW LEVEL SECURITY (S-05)",
  up: `
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
  `,
  down: `
    DROP POLICY IF EXISTS huesped_minimo_escritura ON huesped_minimo;
    DROP POLICY IF EXISTS huesped_minimo_select ON huesped_minimo;
    ALTER TABLE huesped_minimo NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE huesped_minimo DISABLE ROW LEVEL SECURITY;
    DROP INDEX IF EXISTS huesped_minimo_tenant_id_idx;
    ALTER TABLE huesped_minimo DROP COLUMN IF EXISTS tenant_id;
  `,
};
