# Runbook — Alerta `token_canal_revocado`

**Regla:** `apps/api/src/workers/observabilidad/alertas.ts` (`evaluarTokenCanalRevocado`).
**Umbral:** `UMBRALES_POR_DEFECTO.intentosTokenRevocado` (3 intentos
fallidos consecutivos con `error_class` de `token_invalido` o
`credenciales_revocadas`).
**Referencias:** H-090, H-037, REQ-165, §Operación-1.

## Qué significa

Las credenciales/token de esa cuenta de canal dejaron de funcionar
(revocadas, expiradas, o rotadas del lado del canal sin actualizar la
nuestra). Es la ÚNICA regla del catálogo cuya evaluación produce
`accionReversible` distinto de `null`.

## Efecto automático de esta alerta — LA ÚNICA ACCIÓN AUTOMÁTICA REAL DEL MOTOR DE ALERTAS

Activa el feature flag `sync.canal_pausado_por_alerta = true`
(`packages/domain/src/flags`, con auditoría completa: actor
`"motor-alertas"`, motivo = tipo + mensaje de la alerta). Esto **pausa el
push automático hacia el canal afectado** — es 100% reversible: basta con
`registroFlags.establecer({ flagId: FLAG_SYNC_CANAL_PAUSADO_POR_ALERTA,
valor: false, ... })` una vez renovadas las credenciales.

## Qué NO hace nunca

- No cancela ninguna reserva existente.
- No contacta al huésped.
- No borra ni revoca nada del lado del canal — solo deja de intentar
  empujar disponibilidad hacia él hasta que un humano intervenga.
- No pausa el IMPORT (seguir leyendo el feed del canal, si el token de
  lectura sigue vivo, no se ve afectado por este flag — solo el push).

## Pasos de investigación (humano)

1. Confirmar en el panel de desarrolladores del canal si el token/API key
   fue efectivamente revocado o expiró.
2. Regenerar credenciales y actualizarlas vía `POST /canales/cuentas`
   (cifradas en reposo, H-046, Lote 3) — nunca en texto plano en ningún
   log ni ticket.
3. Confirmar que el siguiente ciclo de sync autentica correctamente.
4. Reactivar el push explícitamente:
   `registroFlags.establecer({ flagId: 'sync.canal_pausado_por_alerta',
   valor: false, actor: '<usuario>', motivo: 'credenciales renovadas' })`
   — un cambio de flag auditado, nunca automático.

## Reconocimiento (ack)

`POST /alertas/:id/ack` inmediatamente al recibirla (severidad alta).
Resolver solo después de confirmar el paso 3 Y reactivar el flag — el
runbook nunca se da por cerrado con el push todavía pausado.
