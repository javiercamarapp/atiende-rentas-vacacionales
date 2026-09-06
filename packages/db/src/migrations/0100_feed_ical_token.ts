import type { Migracion } from "../runner/tipos.js";

// Rango 0100+ para Lote 11B (corrección cruzada #3: "URL de exportación
// iCal propia" — H-026/D-004 de Lote 2 dejó el generador de feed
// (`packages/adapters/src/ical/exportador.ts`) sin ninguna ruta HTTP que
// lo sirva). Numerado lejos de 0001-0092 (rangos ya asignados a Lotes
// 0-10, ver cabeceras de esas migraciones) para no colisionar con
// trabajo concurrente de otros lotes sobre el mismo archivo `index.ts`.
//
// `token_export`: token opaco (32 bytes aleatorios en base64url, generado
// en `apps/api`, nunca en SQL) por fila de `unidad_canal_feed` — es decir,
// por unidad+canal, para poder revocar/rotar la URL entregada a UN canal
// sin afectar la de los demás. `token_export_rotado_en` es solo
// informativo (para mostrar "rotado hace X" en la UI).
//
// Las dos funciones `SECURITY DEFINER` siguen el mismo patrón ya usado en
// `0016_rls_funciones_autenticacion.ts` para login/refresh: la ruta
// pública del feed .ics no tiene sesión de aplicación (nadie ha iniciado
// sesión, el token ES la credencial), así que las políticas RLS normales
// de `unidad_canal_feed`/`ocupacion_unidad` (fail-closed sin `app.rol`)
// devolverían siempre 0 filas. `feed_ical_unidad_por_token` resuelve el
// token a una unidad sin exponer más columnas que las necesarias;
// `feed_ical_ocupaciones_unidad` NUNCA se expone a un parámetro que venga
// directo del cliente — la ruta HTTP solo la llama con el `unidad_id` ya
// resuelto (de confianza) por la función anterior, nunca con un id que el
// llamador pudiera inventar.
export const migracion0100FeedIcalToken: Migracion = {
  id: "0100_feed_ical_token",
  descripcion: "token_export en unidad_canal_feed + funciones security definer para el feed .ics público",
  up: `
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
  `,
  down: `
    DROP FUNCTION IF EXISTS feed_ical_ocupaciones_unidad(uuid);
    DROP FUNCTION IF EXISTS feed_ical_unidad_por_token(text);
    ALTER TABLE unidad_canal_feed
      DROP COLUMN IF EXISTS token_export_rotado_en,
      DROP COLUMN IF EXISTS token_export;
  `,
};
