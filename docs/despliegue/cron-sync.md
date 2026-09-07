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
  un superadmin activo), el endpoint responde **500 explícito** — nunca
  un 200 fingido con `{procesados: 0}` silencioso.

Ambas están documentadas en `apps/api/.env.example`.

## Cómo lee canales de todos los tenants (⚠️ requiere revisión humana)

`apps/api` se conecta a Postgres como el rol `app_rv`
(`packages/db/src/migrations/0012_rol_aplicacion.ts`): `NOSUPERUSER
NOBYPASSRLS`, con Row-Level Security `FORCE`ado en toda tabla de negocio.
Desde la migración `0061_acceso_romper_cristal.ts` (H-075/H-076), un
`superadmin` **dejó de ser miembro honorario** de cualquier tenant que no
sea el suyo — `is_tenant_member(...)` exige una fila vigente en
`acceso_romper_cristal` (motivo + ventana temporal, auditada) por cada
tenant al que quiera acceder. Sin una concesión así, `unidad_canal_feed`/
`cuenta_canal`/`unidad`/`propiedad` devuelven **0 filas** para cualquier
identidad — superadmin incluido.

No existe en el esquema actual ninguna función `SECURITY DEFINER` que
haga este fan-out cross-tenant sin pasar por RLS (la forma "correcta" a
largo plazo sería añadir una vía una migración nueva — fuera del alcance
del paquete que construyó este endpoint, que no toca
`packages/db/migrations/**`). Así que `crearProveedorSesionPostgres`
(`cronSync.ts`) usa el único mecanismo que el esquema ya expone:

1. Fija la sesión RLS con la identidad `CRON_SYNC_SUPERADMIN_ID`.
2. Verifica con `rol_actual()` (función `SECURITY DEFINER` ya otorgada a
   `app_rv`) que esa identidad de verdad resuelve a un superadmin activo
   — si no, lanza antes de tocar cualquier tabla de negocio.
3. **Se auto-otorga** una concesión "romper cristal" a **todos los
   tenants a la vez** (una sola sentencia `INSERT ... SELECT FROM
   tenant`), con:
   - `motivo` fijo y distinguible como generado por el sistema
     (`MOTIVO_ROMPER_CRISTAL_CRON` en el código — nunca se confunde con
     un "romper cristal" humano real en el panel de back office).
   - `alcance = 'cron_sync_ical'`.
   - Vigencia de 5 minutos (`MINUTOS_VIGENCIA_GRANT_CRON`) — bastante más
     holgada que el presupuesto de 22s del propio lote, solo como
     respaldo si el paso 5 no llega a ejecutarse (crash del proceso).
4. Lee y procesa los canales activos usando esa misma sesión/conexión.
5. **Revoca explícitamente** la concesión al terminar (`cerrar()`), tanto
   en éxito como en fallo.

### El tradeoff

Este mecanismo (`acceso_romper_cristal`) fue diseñado para accesos
**humanos, raros, justificados y con ventana corta** — el panel de back
office lo usa así (un superadmin explica por qué necesita ver un tenant
concreto, por cuánto tiempo, y queda auditado). Usarlo para un cron que
corre **cada 15 minutos, para siempre, sobre todos los tenants** cambia
su naturaleza: convierte un control de excepción en parte de la
operación rutinaria del sistema, y genera una fila nueva en
`acceso_romper_cristal`/`auditoria_mutacion` por tenant en cada corrida.

Mitigaciones ya aplicadas en el código:
- El motivo es literal y grepeable (`[sistema] cron automático...`),
  así que un humano auditando el log distingue de inmediato una fila del
  cron de una intervención real.
- La ventana de vigencia es corta (5 min) y se revoca explícitamente al
  terminar — nunca queda una concesión "abierta" más tiempo del
  necesario.
- El endpoint solo se activa con `CRON_SECRET` configurado — no hay
  forma de disparar este flujo desde fuera de Vercel Cron sin el secreto.

**Antes de activar `CRON_SYNC_SUPERADMIN_ID` en producción**, alguien con
autoridad sobre el diseño de seguridad debe decidir explícitamente si
este tradeoff es aceptable, o si prefiere invertir en la alternativa
correcta a largo plazo: una migración nueva (`packages/db/migrations/`)
con una función `SECURITY DEFINER` dedicada (mismo patrón que
`backoffice_metricas_tenants`, `packages/db/src/migrations/0063_backoffice_metricas_tenant.ts`)
que haga el fan-out cross-tenant sin tocar `acceso_romper_cristal` en
absoluto.

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
