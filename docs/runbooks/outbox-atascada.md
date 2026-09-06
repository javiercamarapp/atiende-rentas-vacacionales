# Runbook — Alerta `outbox_atascada`

**Regla:** `apps/api/src/workers/observabilidad/alertas.ts` (`evaluarOutboxAtascada`).
**Umbral:** `UMBRALES_POR_DEFECTO.outboxAtascadaMs` (30 minutos) sobre la
antigüedad del evento pendiente más viejo (`edadPendienteMasViejoMs`,
`outboxWorker.ts`).
**Referencias:** H-035, H-036, H-037, REQ-038, §Operación-1/§Operación-2.

## Qué significa

El worker de replay del outbox (`procesarPendientesOutbox`) no está
drenando la cola al ritmo esperado — hay al menos un `outbox_evento` sin
su fila correspondiente en `outbox_evento_consumido_observabilidad` desde
hace más del umbral. Causas típicas: el proceso del worker no está
corriendo, un evento con un efecto que falla repetidamente (nunca se
marca consumido si `aplicarEfecto` lanza — ver `outboxWorker.ts`), o un
pico de volumen que supera la capacidad de procesamiento configurada.

## Efecto automático de esta alerta

**Ninguno.** Solo notifica. El worker de outbox ya es, por diseño,
resiliente a crashes (replay idempotente sin duplicar efectos — ver
`test/observabilidad/outboxWorker.test.ts`), así que la respuesta correcta
casi siempre es "reiniciar/verificar el proceso del worker", no una acción
sobre los datos.

## Qué NO hace nunca

- No descarta ni marca como consumido ningún evento por sí sola.
- No cancela reservas ni contacta huéspedes (el outbox son eventos de
  cierre/liberación de disponibilidad interna, no mensajería directa).

## Pasos de investigación (humano)

1. `GET /health/detallado` → `outbox.tamanoCola` y
   `outbox.edadPendienteMasViejoMs` para confirmar magnitud.
2. Verificar que el proceso del worker esté vivo (logs de arranque,
   proceso en el orquestador de la infraestructura).
3. Si el worker está vivo pero no avanza: revisar si `aplicarEfecto` está
   lanzando repetidamente para el mismo evento (buscar el `outbox_evento.id`
   más viejo en los logs de error del worker) — un evento con payload
   corrupto puede bloquear el procesamiento FIFO de los que le siguen SOLO
   si el worker se implementó estrictamente secuencial sin saltar
   fallidos; documentar y corregir el dato/código de ese efecto específico.
4. Reiniciar el proceso del worker si estaba caído — el replay es seguro
   (idempotente), no hay riesgo de duplicar efectos ya aplicados.

## Reconocimiento (ack)

`POST /alertas/:id/ack`. Resolver solo cuando `outbox.tamanoCola` vuelva a
un nivel normal y `edadPendienteMasViejoMs` esté bajo el umbral.
