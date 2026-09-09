import type { Migracion } from "../runner/tipos.js";

// A3-DESP-01 (MEDIO, docs/auditoria-3/despliegue.md): el cron de sync
// iCal (`apps/api/src/rutas/internas/cronSync.ts`, ver
// `docs/despliegue/cron-sync.md`) reutilizaba `acceso_romper_cristal`
// (`0061_acceso_romper_cristal.ts`, H-075/H-076) — un mecanismo diseñado
// para accesos HUMANOS, raros y justificados — para su propio acceso
// cross-tenant RUTINARIO: cada corrida (cada 15 minutos, para siempre)
// se AUTO-OTORGABA una concesión a TODOS los tenants, la usaba, y la
// AUTO-REVOCABA. El código y `acceso_romper_cristal` no distinguen "un
// superadmin investigó un ticket de soporte" de "el cron corrió otra
// vez" salvo por un `motivo`/`alcance` de texto — un humano auditando el
// panel de back office (H-074, "romper cristal" como señal de excepción)
// tenía que aprender a IGNORAR filas del cron para no banalizar la señal
// real. Peor: el AUTO-otorgamiento era código de aplicación decidiendo
// unilateralmente su propio privilegio elevado — nada lo distinguía de
// una futura ruta que decidiera auto-otorgarse acceso "porque sí".
//
// Esta migración separa los dos casos:
//
// 1. `delegacion_servicio_sistema` — el acceso cross-tenant del cron NO
//    es una excepción: es una delegación ESTABLE y ya conocida de
//    antemano ("el cron de sync usa la identidad X para leer/escribir la
//    configuración de canal de todos los tenants, siempre, mientras el
//    despliegue exista"). Se modela como una fila PERSISTENTE (no una
//    concesión con `expira_en` que se recrea cada corrida) que solo un
//    humano con acceso directo a Postgres puede crear/revocar —
//    deliberadamente SIN política INSERT/UPDATE/DELETE para `app_rv`
//    (ver más abajo): ni el cron ni ninguna otra ruta de `apps/api` puede
//    auto-otorgarse esta fila. Activarla es una acción operativa
//    explícita y documentada (`docs/despliegue/cron-sync.md`), igual de
//    deliberada que configurar `CRON_SYNC_SUPERADMIN_ID` en sí.
//
// 2. `auditoria_ejecucion_servicio_sistema` — el mecanismo de auditoría
//    DEDICADO para el uso real de esa delegación: cada corrida del cron
//    inserta UNA fila con el resumen del lote (tenants alcanzados, feeds
//    procesados/con error/pendientes). Vive separado de
//    `acceso_romper_cristal`/`auditoria_mutacion` a propósito — un
//    auditor humano que revisa "romper cristal" ve SOLO excepciones
//    humanas reales; un operador que quiere saber "¿el cron corrió, y
//    qué tocó?" consulta esta tabla en vez de tener que filtrar el ruido
//    del cron fuera de la señal de emergencia.
//
// `is_tenant_member` (0014, redefinida en 0061) gana una tercera rama:
// además de "es miembro directo del tenant" y "es superadmin con
// concesión romper-cristal vigente PARA ESE tenant", ahora también "es
// superadmin con una delegación de servicio activa" (sin `tenant_id` —
// aplica a todos, que es exactamente lo que el cron necesita para su
// fan-out en una sola sesión/conexión, ver cabecera de `cronSync.ts`).
// `acceso_romper_cristal` en sí NO se modifica: sigue siendo, sin
// excepción, el canal reservado para acceso humano de emergencia.
export const migracion0128DelegacionServicioSistema: Migracion = {
  id: "0128_delegacion_servicio_sistema",
  descripcion:
    "delegacion_servicio_sistema + auditoria_ejecucion_servicio_sistema (A3-DESP-01: separa el acceso rutinario del cron de sync de romper-cristal humano) + is_tenant_member reconoce delegación de servicio",
  up: `
    -- Delegación ESTABLE (no expira, no se recrea por corrida): una fila
    -- por servicio activo. Solo se desactiva marcando revocado_en — nunca
    -- se borra, para conservar el historial de qué identidad tuvo esta
    -- delegación y cuándo se le retiró.
    CREATE TABLE delegacion_servicio_sistema (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      servicio       text NOT NULL CHECK (btrim(servicio) <> ''),
      superadmin_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      motivo         text NOT NULL CHECK (btrim(motivo) <> ''),
      creado_en      timestamptz NOT NULL DEFAULT now(),
      revocado_en    timestamptz,
      CHECK (revocado_en IS NULL OR revocado_en >= creado_en)
    );
    -- A lo sumo una delegación ACTIVA por nombre de servicio a la vez
    -- (rotar la identidad detrás de un servicio es: revocar la vieja,
    -- crear una nueva — nunca dos activas simultáneas para el mismo
    -- nombre, que volvería ambiguo "quién es, hoy, el cron").
    CREATE UNIQUE INDEX delegacion_servicio_sistema_activa_idx
      ON delegacion_servicio_sistema (servicio)
      WHERE revocado_en IS NULL;
    CREATE INDEX delegacion_servicio_sistema_superadmin_idx
      ON delegacion_servicio_sistema (superadmin_id);

    ALTER TABLE delegacion_servicio_sistema ENABLE ROW LEVEL SECURITY;
    ALTER TABLE delegacion_servicio_sistema FORCE ROW LEVEL SECURITY;

    -- Solo lectura para app_rv (visibilidad administrativa: qué
    -- identidades tienen delegación activa, mismo criterio que el
    -- directorio de tenants de 0061 — es metadata de configuración de
    -- plataforma, no contenido de negocio de ningún tenant). A propósito
    -- NO hay política INSERT/UPDATE/DELETE: app_rv (con el que corre
    -- TODO apps/api, incluido este mismo cron) no puede crear, revocar
    -- ni modificar una fila aquí bajo ninguna circunstancia — activar o
    -- retirar una delegación exige conectarse a Postgres con un rol que
    -- SÍ tenga privilegio (el mismo que corre migraciones), nunca una
    -- ruta HTTP ni código de aplicación. Este es precisamente el
    -- comportamiento que faltaba: el mecanismo viejo dejaba que el propio
    -- cron decidiera su propio privilegio elevado en cada corrida.
    CREATE POLICY delegacion_servicio_sistema_select ON delegacion_servicio_sistema FOR SELECT
      USING (rol_actual() = 'superadmin');

    -- Auditoría DEDICADA del uso de una delegación de servicio — nunca
    -- mezclada con acceso_romper_cristal (humano) ni con auditoria_mutacion
    -- (que audita fila-por-fila mutaciones con trigger, no resúmenes de
    -- lote). Append-only: sin política UPDATE/DELETE para app_rv.
    CREATE TABLE auditoria_ejecucion_servicio_sistema (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      servicio            text NOT NULL CHECK (btrim(servicio) <> ''),
      superadmin_id       uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      iniciado_en         timestamptz NOT NULL,
      finalizado_en       timestamptz NOT NULL DEFAULT now(),
      tenants_alcanzados  integer NOT NULL DEFAULT 0 CHECK (tenants_alcanzados >= 0),
      feeds_procesados    integer NOT NULL DEFAULT 0 CHECK (feeds_procesados >= 0),
      feeds_error         integer NOT NULL DEFAULT 0 CHECK (feeds_error >= 0),
      feeds_pendientes    integer NOT NULL DEFAULT 0 CHECK (feeds_pendientes >= 0),
      CHECK (finalizado_en >= iniciado_en)
    );
    CREATE INDEX auditoria_ejecucion_servicio_sistema_servicio_idx
      ON auditoria_ejecucion_servicio_sistema (servicio, iniciado_en DESC);

    ALTER TABLE auditoria_ejecucion_servicio_sistema ENABLE ROW LEVEL SECURITY;
    ALTER TABLE auditoria_ejecucion_servicio_sistema FORCE ROW LEVEL SECURITY;

    CREATE POLICY auditoria_ejecucion_servicio_sistema_select ON auditoria_ejecucion_servicio_sistema FOR SELECT
      USING (rol_actual() = 'superadmin');

    -- INSERT exige, en la MISMA fila, que quien inserta sea de verdad la
    -- identidad delegada activa para ESE servicio — no basta con ser
    -- cualquier superadmin: evita que una identidad sin delegación activa
    -- se auto-adjudique una fila de auditoría falsa de "ejecución de
    -- servicio". Sin política UPDATE/DELETE: una vez insertada, una fila
    -- de auditoría no se toca.
    CREATE POLICY auditoria_ejecucion_servicio_sistema_insert ON auditoria_ejecucion_servicio_sistema FOR INSERT
      WITH CHECK (
        rol_actual() = 'superadmin'
        AND superadmin_id = usuario_actual_id()
        AND EXISTS (
          SELECT 1 FROM delegacion_servicio_sistema d
          WHERE d.superadmin_id = usuario_actual_id()
            AND d.servicio = auditoria_ejecucion_servicio_sistema.servicio
            AND d.revocado_en IS NULL
        )
      );

    -- is_tenant_member (0014, redefinida en 0061): tercera rama — una
    -- delegación de servicio activa hace a ese superadmin miembro de
    -- CUALQUIER tenant, sin pasar por acceso_romper_cristal. Sin
    -- tenant_id en delegacion_servicio_sistema a propósito: la delegación
    -- es "todos los tenants, siempre", que es justo lo que el fan-out del
    -- cron necesita (docs/despliegue/cron-sync.md).
    CREATE OR REPLACE FUNCTION is_tenant_member(_usuario uuid, _tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM usuario u
        WHERE u.id = _usuario AND u.activo
          AND (
            u.tenant_id = _tenant
            OR (
              u.rol = 'superadmin'
              AND (
                EXISTS (
                  SELECT 1 FROM acceso_romper_cristal g
                  WHERE g.superadmin_id = _usuario
                    AND g.tenant_id = _tenant
                    AND g.revocado_en IS NULL
                    AND g.expira_en > now()
                )
                OR EXISTS (
                  SELECT 1 FROM delegacion_servicio_sistema d
                  WHERE d.superadmin_id = _usuario
                    AND d.revocado_en IS NULL
                )
              )
            )
          )
      )
    $$;

    GRANT EXECUTE ON FUNCTION is_tenant_member(uuid, uuid) TO app_rv;
  `,
  down: `
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

    DROP POLICY IF EXISTS auditoria_ejecucion_servicio_sistema_insert ON auditoria_ejecucion_servicio_sistema;
    DROP POLICY IF EXISTS auditoria_ejecucion_servicio_sistema_select ON auditoria_ejecucion_servicio_sistema;
    DROP TABLE IF EXISTS auditoria_ejecucion_servicio_sistema;

    DROP POLICY IF EXISTS delegacion_servicio_sistema_select ON delegacion_servicio_sistema;
    DROP TABLE IF EXISTS delegacion_servicio_sistema;
  `,
};
