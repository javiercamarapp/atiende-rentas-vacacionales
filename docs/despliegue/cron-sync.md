# Cron de sincronización iCal

`GET /internal/cron/sync-ical` (montada bajo `/api` en Vercel — la URL
real es `/api/internal/cron/sync-ical`, registrada en `vercel.json` →
`crons` con `"schedule": "*/15 * * * *"`) dispara
`ejecutarCicloSyncInstrumentado` (el motor de sync iCal de Lote 2,
instrumentado en Lote 10) para cada canal iCal activo de **todos los
tenants**.

Código: `apps/api/src/rutas/internas/cronSync.ts` (lógica + ruta),
montada desde `apps/api/src/workers/observabilidad/rutas.ts` sin tocar
`app.ts` (reutiliza el mismo punto de fusión que ya usa
`rutasObservabilidad`).

## Por qué hacía falta

Antes de este cron, el motor de sync solo corría bajo
`POST /canales/:id/sync` — y ese endpoint ni siquiera lo invoca
directamente: solo encola un evento `sync_manual_solicitado` en
`outbox_evento`, que ningún worker corriendo en Vercel Functions consume
(Vercel Functions no tiene procesos de fondo persistentes). En
producción, los calendarios importados por iCal nunca se refrescaban
solos.

## Requisito de plan de Vercel (⚠️ revisar antes de confiar en el cron)

Vercel Cron Jobs existe en el plan Hobby, pero con una limitación que
rompe este diseño: en Hobby, un cron **no se dispara en el horario
exacto configurado** — Vercel lo agrupa dentro de una ventana y lo limita
efectivamente a **como máximo una invocación por día**, sin importar el
`schedule` declarado. `"*/15 * * * *"` (cada 15 minutos) **requiere plan
Pro o superior** para ejecutarse con esa frecuencia de verdad.

Con Hobby, este cron se registraría sin error visible en el deploy, pero
se ejecutaría ~1 vez al día en vez de cada 15 minutos — otra forma
silenciosa de "parece que sincroniza" sin hacerlo con la frecuencia
esperada. **Antes de depender de este cron en producción, confirmar en
el dashboard de Vercel (Project Settings → Cron Jobs, o la pestaña
"Crons" del último deploy) que el proyecto está en un plan que soporta
la frecuencia configurada** — ver la documentación oficial de Vercel Cron
Jobs para los límites vigentes por plan, que Vercel puede cambiar sin
que este documento se entere.

## Variables de entorno

- **`CRON_SECRET`** — secreto compartido que Vercel Cron envía como
  `Authorization: Bearer <CRON_SECRET>` (Vercel lo agrega automáticamente
  a la petición si la variable de entorno existe en el proyecto — ver la
  documentación de Vercel Cron Jobs). Generar con `openssl rand -hex 32`.
  **Sin esta variable, el endpoint responde SIEMPRE 503** (fail-closed) —
  nunca ejecuta el ciclo de sync sin secreto configurado. Con la variable
  configurada, un token ausente o distinto responde 401.

- **`CRON_SYNC_SUPERADMIN_ID`** — UUID de un usuario ya existente con
  `usuario.rol = 'superadmin'` y `activo = true`. Ver la sección
  siguiente para el porqué. Sin esta variable (o si el id no resuelve a
  un superadmin activo, o no tiene delegación de servicio activa), el
  endpoint responde **500 explícito** — nunca un 200 fingido con
  `{procesados: 0}` silencioso.

Ambas están documentadas en `apps/api/.env.example`.

## Cómo lee canales de todos los tenants

`apps/api` se conecta a Postgres como el rol `app_rv`
(`packages/db/src/migrations/0012_rol_aplicacion.ts`): `NOSUPERUSER
NOBYPASSRLS`, con Row-Level Security `FORCE`ado en toda tabla de negocio.
Desde la migración `0061_acceso_romper_cristal.ts` (H-075/H-076), un
`superadmin` **dejó de ser miembro honorario** de cualquier tenant que no
sea el suyo — `is_tenant_member(...)` exige, para tenants de negocio,
o bien una concesión humana vigente en `acceso_romper_cristal`, o bien
(desde `0128_delegacion_servicio_sistema.ts`, A3-DESP-01) una delegación
de servicio activa en `delegacion_servicio_sistema`. Sin ninguna de las
dos, `unidad_canal_feed`/`cuenta_canal`/`unidad`/`propiedad` devuelven
**0 filas** para cualquier identidad — superadmin incluido.

### A3-DESP-01: por qué ya NO usa `acceso_romper_cristal`

Versión original de este cron: cada corrida se AUTO-OTORGABA, con la
identidad `CRON_SYNC_SUPERADMIN_ID`, una concesión `acceso_romper_cristal`
a **todos los tenants a la vez**, la usaba, y la revocaba explícitamente
al terminar. `acceso_romper_cristal` fue diseñado para accesos
**humanos, raros, justificados y con ventana corta** — el panel de back
office lo usa así (un superadmin explica por qué necesita ver un tenant
concreto, por cuánto tiempo, y queda auditado). Usarlo para un cron que
corre **cada 15 minutos, para siempre** convertía un control de
excepción en ruido rutinario: un humano auditando el panel de "romper
cristal" tenía que aprender a filtrar filas del cron para no perder de
vista una excepción real — exactamente el tipo de banalización de una
señal de auditoría de emergencia que este diseño debía evitar.

`0128_delegacion_servicio_sistema.ts` separa los dos casos:

1. **`delegacion_servicio_sistema`** — el acceso cross-tenant del cron no
   es una excepción caso-por-caso: es una delegación **estable**,
   conocida de antemano ("la identidad X sincroniza calendarios de todos
   los tenants, siempre, mientras este despliegue exista"). Es una fila
   persistente (sin `expira_en` que se recree por corrida) que **solo un
   operador con acceso directo a Postgres puede crear o revocar** — la
   tabla NO tiene política INSERT/UPDATE/DELETE para `app_rv`, así que ni
   este endpoint ni ninguna otra ruta de `apps/api` puede auto-otorgarse
   la delegación. `is_tenant_member` la reconoce como membresía de
   cualquier tenant mientras siga activa (`revocado_en IS NULL`).
2. **`auditoria_ejecucion_servicio_sistema`** — el mecanismo de auditoría
   DEDICADO para el uso real de esa delegación: cada corrida inserta una
   fila con el resumen del lote (tenants alcanzados, feeds procesados/
   con error/pendientes). Vive separado de `acceso_romper_cristal` y de
   `auditoria_mutacion` a propósito, para que revisar "romper cristal"
   siga mostrando solo excepciones humanas reales, y revisar "¿qué tocó
   el cron?" tenga su propio lugar sin mezclar ambas señales.

`crearProveedorSesionPostgres` (`cronSync.ts`) hoy:

1. Fija la sesión RLS con la identidad `CRON_SYNC_SUPERADMIN_ID`.
2. Verifica con `rol_actual()` que esa identidad de verdad resuelve a un
   superadmin activo — si no, lanza antes de tocar cualquier tabla de
   negocio.
3. Verifica que exista una fila activa en `delegacion_servicio_sistema`
   para esa identidad y el servicio `cron_sync_ical` — si no, lanza
   (fail-closed) con instrucciones de cómo crearla (ver más abajo). Esta
   verificación NUNCA crea ni modifica esa fila.
4. Lee y procesa los canales activos usando esa misma sesión/conexión.
5. Al terminar (`cerrar()`), inserta la fila de resumen en
   `auditoria_ejecucion_servicio_sistema` — nunca toca
   `acceso_romper_cristal`.

### Delegación de servicio del cron (acción operativa única)

Antes de activar `CRON_SYNC_SUPERADMIN_ID` en un despliegue nuevo, un
operador con acceso directo a Postgres (el mismo rol con el que corren
las migraciones, no `app_rv`) debe crear la delegación una sola vez:

```sql
INSERT INTO delegacion_servicio_sistema (servicio, superadmin_id, motivo)
VALUES (
  'cron_sync_ical',
  '<CRON_SYNC_SUPERADMIN_ID>',
  'Delegación estable para GET /internal/cron/sync-ical — sincroniza ' ||
  'configuración de canal iCal de todos los tenants cada 15 minutos.'
);
```

Para retirarla (rotar de identidad, desactivar el cron permanentemente):

```sql
UPDATE delegacion_servicio_sistema
SET revocado_en = now()
WHERE servicio = 'cron_sync_ical' AND revocado_en IS NULL;
```

Consultar el historial de uso real (auditoría dedicada, no mezclada con
`acceso_romper_cristal`):

```sql
SELECT iniciado_en, finalizado_en, tenants_alcanzados, feeds_procesados,
       feeds_error, feeds_pendientes
FROM auditoria_ejecucion_servicio_sistema
WHERE servicio = 'cron_sync_ical'
ORDER BY iniciado_en DESC
LIMIT 20;
```

## Comportamiento del lote

- Tope de tiempo total: ~22s (`PRESUPUESTO_MS_DEFECTO`, con margen sobre
  el `maxDuration: 30` de `vercel.json`). Se revisa **antes** de empezar
  cada canal — nunca se aborta un fetch a mitad de camino.
- Orden estable: los canales se procesan del más desactualizado al más
  reciente (`ORDER BY ultima_sincronizacion_exitosa_en ASC`). Si el lote
  se corta por tiempo, los que sí se sincronizaron ahora tienen timestamp
  fresco y bajan al final de la cola — la siguiente corrida (15 min
  después) recoge naturalmente los que quedaron pendientes, sin
  necesidad de un cursor persistido aparte.
- Un canal que falla (red, parseo, excepción inesperada) **nunca** aborta
  el resto del lote — se registra en `detalles[].error` (mensaje saneado
  con `redactarPiiEnTexto`, nunca el stack crudo) y se sigue con el
  siguiente.
- Respuesta: `{ procesados, errores, pendientes, detalles }`.

## Probarlo con curl

```bash
# Sin CRON_SECRET configurado en el entorno → 503
curl -i https://<tu-dominio>/api/internal/cron/sync-ical

# Con CRON_SECRET configurado pero token incorrecto → 401
curl -i https://<tu-dominio>/api/internal/cron/sync-ical \
  -H "Authorization: Bearer token-incorrecto"

# Token correcto → 200 con el resumen del lote
curl -i https://<tu-dominio>/api/internal/cron/sync-ical \
  -H "Authorization: Bearer $CRON_SECRET"
```

En local (`npm run dev -w @atiende-rv/api`, puerto 8787 por defecto):

```bash
curl -i http://localhost:8787/internal/cron/sync-ical \
  -H "Authorization: Bearer $CRON_SECRET"
```

(en local, sin el prefijo `/api` — ese prefijo solo lo agrega la
reescritura de Vercel, ver `apps/api/api/index.ts:montarBajoApi`).
