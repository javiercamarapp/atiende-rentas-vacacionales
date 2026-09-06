# Runbook — Restauración de backup y reconciliación (§Operación-3)

**Código:** `packages/db/backup/` (`exportarBackupLogico`,
`restaurarBackupLogico`, `verificarIntegridad`, `recuperarDesdeBackup`,
`confirmarReconciliacionYReactivarPush`).
**Pruebas:** `packages/db/test/backup/exportarRestaurar.test.ts` (11,
PGlite), `packages/db/test/integration/backup.test.ts` (3, dos clusters
`embedded-postgres` aislados reales).
**Referencias:** H-086, H-087, REQ-159, REQ-160, §Operación-3.

## RPO/RTO — supuestos declarados (no medidos en producción, Fase 2)

Sin datos reales de producción todavía (piloto pendiente, §Plan-1 de
ACEPTACION.md: "ningún SLO publicado antes del piloto"), estos son
**supuestos de diseño**, no compromisos contractuales:

- **RPO objetivo: ≤ 24 horas.** El backup lógico (`exportarBackupLogico`)
  está pensado para correr como job diario contra el primario. Un WAL
  continuo (recuperación punto-en-el-tiempo, RPO cercano a cero) es
  responsabilidad de la infraestructura de Postgres gestionado del
  proveedor final, no de este código — `embedded-postgres` (desarrollo/
  pruebas) no expone WAL shipping. **Documentado como brecha de Fase 2:**
  H-086 pide "WAL continuo" explícitamente; esta implementación cubre el
  backup lógico diario y la restauración+verificación, NO el streaming
  continuo — eso depende de la elección final de proveedor de Postgres
  administrado en producción.
- **RTO objetivo: ≤ 2 horas** desde que se decide restaurar hasta que el
  sistema vuelve a operar en modo lectura/escritura normal — incluye
  restaurar en una instancia aislada, verificar integridad, y completar la
  reconciliación de drift antes de reactivar `sync.push_automatico`. No
  incluye el tiempo de decisión humana de CUÁNDO restaurar.
- Ambos números son **supuestos de arquitectura para dimensionar el
  diseño** (por qué el backup es lógico y no depende de un solo binario
  externo, por qué la reconciliación es obligatoria y no opcional), no
  SLAs publicables — ver §Plan-1.

## Procedimiento de restauración

1. **Nunca restaurar sobre el primario.** Siempre en una instancia
   aislada nueva (`crearMotorEmbeddedPostgres` en pruebas; en producción,
   una instancia de Postgres administrada nueva, sin tráfico).
2. Aplicar el catálogo de migraciones actual (`aplicarMigraciones`) en la
   instancia aislada — el backup lógico NUNCA crea esquema, solo datos.
3. `exportarBackupLogico(origen)` → `restaurarBackupLogico(destino, backup)`
   (usa `session_replication_role = replica` internamente: los triggers
   de auditoría no se re-disparan durante la carga, así que los conteos
   post-restore coinciden EXACTAMENTE con el backup, sin filas fantasma).
4. `verificarIntegridad(destino, backup, { idsOcupacionAVerificar: [...] })`
   — verifica: (a) conteo de filas por tabla igual al backup, (b) el
   EXCLUDE de `ocupacion_unidad` sigue presente (`pg_constraint`, `contype='x'`),
   (c) al menos una reserva de prueba conocida es recuperable por id.
   **Si esto falla, el flujo se detiene ahí — `sync.push_automatico`
   NUNCA se toca sobre una restauración que no pasó integridad.**
5. Solo si integridad pasa: `sync.push_automatico` se apaga
   automáticamente (`recuperarDesdeBackup`), con auditoría (actor
   `"sistema-restore"`, motivo `restauracion_backup`).
6. Reconciliación de drift por cada feed activo (`reconciliarFeed`,
   inyectado por el llamador — en producción, envuelve
   `reconciliarCompleto` de `@atiende-rv/adapters`).
7. `confirmarReconciliacionYReactivarPush` reactiva el flag **solo si
   TODOS los feeds reconciliados reportan `sinDrift: true`** — con
   evidencia vacía o con cualquier drift pendiente, lanza
   `ReconciliacionIncompletaError` y el flag permanece apagado.

## Qué NO hace nunca

- No reactiva `sync.push_automatico` automáticamente sin confirmación
  explícita de reconciliación sin drift.
- No decide sola qué UID/reserva es "la correcta" ante un conflicto de
  reconciliación — eso requeriría revisión humana (mismo principio que la
  alerta `drift`, ver `docs/runbooks/drift.md`).

## Evidencia de la prueba de restauración (entregable verificable de Lote 10)

`docs/logs/lote10-restauracion.log` — corrida real contra dos clusters
`embedded-postgres` aislados: exporta el origen, restaura en el destino,
confirma EXCLUDE real (`contype='x'`) e inserta un segundo rango
solapado para probar que sigue rechazando con `23P01` tras la
restauración, y ejercita el ciclo completo de reconciliación + reactivación
del flag.
