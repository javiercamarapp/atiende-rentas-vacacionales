import type { Migracion } from "../runner/tipos.js";

// H-049: el consumidor de outbox de Lote 5 (`procesarEventosCheckoutPendientes`,
// invocado vía `POST /operacion/tareas/procesar-eventos`) corre bajo la
// sesión RLS del usuario autenticado que lo dispara (admin_gestora/operador
// con permiso de calendario) — NUNCA como superusuario. La política
// original de `outbox_evento` (packages/db, migración 0015, Lote 3) es
// intencionalmente `SELECT` solo para `superadmin` ("cola interna", sin
// necesidad de exponerla vía ningún GET de Lote 1-3). Este lote SÍ necesita
// leerla para detectar checkouts pendientes de procesar, así que esta
// migración AÑADE una segunda política `PERMISSIVE` de `SELECT` sobre esa
// misma tabla (Postgres combina varias políticas permisivas del mismo
// comando con OR) — nunca reemplaza ni edita la política de 0015. Alcance:
// solo filas de `outbox_evento` ligadas a una reserva (`ocupacion_unidad_id`
// no nulo) del MISMO tenant del usuario, y solo para roles que ya pueden
// escribir calendario (mismo criterio que `outbox_evento_insercion` de
// 0015) — nunca amplía el acceso a superadmin-only más allá de ese caso de
// uso operativo concreto.
export const migracion0038RlsOutboxLecturaOperacion: Migracion = {
  id: "0038_rls_outbox_lectura_operacion",
  descripcion: "RLS: segunda política SELECT (permisiva) sobre outbox_evento para el consumidor de checkout de Lote 5",
  up: `
    CREATE POLICY outbox_evento_select_operacion ON outbox_evento FOR SELECT
      USING (
        ocupacion_unidad_id IS NOT NULL
        AND is_tenant_member(usuario_actual_id(), unidad_tenant_id(ocupacion_unidad_de(ocupacion_unidad_id)))
        AND (
          rol_actual() IN ('superadmin', 'admin_gestora')
          OR (rol_actual() = 'operador' AND colaborador_nivel_actual() <> 'solo_calendario')
        )
      );
  `,
  down: `
    DROP POLICY IF EXISTS outbox_evento_select_operacion ON outbox_evento;
  `,
};
