import type { Migracion } from "../runner/tipos.js";

// H-049/H-053: la UI de operación (`apps/web/src/pages/limpieza/`) necesita
// mostrar el NOMBRE de la unidad de cada tarea, incluso para el rol
// `limpieza` — que, a propósito, NO tiene acceso de lectura a la tabla
// `unidad` en absoluto (migración 0015: `unidad_select` excluye
// explícitamente `rol_actual() NOT IN ('contador', 'limpieza')`). Esa
// exclusión es a nivel de FILA de la tabla `unidad`, así que ni siquiera un
// JOIN dentro de una consulta sobre `tarea_operativa` (donde `limpieza` SÍ
// tiene acceso a sus propias filas, migración 0036) puede leerla — RLS se
// evalúa sobre la tabla `unidad` en sí, sin importar desde qué consulta se
// referencia.
//
// Función `SECURITY DEFINER` (mismo patrón que `unidad_tenant_id`/
// `unidad_owner_id` de la migración 0014): expone ÚNICAMENTE el nombre
// (nunca otras columnas) de una unidad dado su id — nunca una fuga general
// de la tabla, solo el campo mínimo necesario para que la UI de una tarea
// ya autorizada (por la RLS de `tarea_operativa`) pueda mostrar dónde es.
export const migracion0039HelperUnidadNombreOperacion: Migracion = {
  id: "0039_helper_unidad_nombre_operacion",
  descripcion: "función security definer: nombre de unidad para la UI de operación (limpieza sin acceso a `unidad`)",
  up: `
    CREATE OR REPLACE FUNCTION unidad_nombre_operacion(_unidad uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT nombre FROM unidad WHERE id = _unidad
    $$;

    GRANT EXECUTE ON FUNCTION unidad_nombre_operacion(uuid) TO app_rv;
  `,
  down: `
    DROP FUNCTION IF EXISTS unidad_nombre_operacion(uuid);
  `,
};
