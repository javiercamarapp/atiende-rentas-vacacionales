# Reporte consolidado — Suite adversarial completa (Lote 11A)

Generado automáticamente por `tests/adversarial/generar-reporte.mjs` a
partir de una corrida real de `npm run test:adversarial` (vitest,
reporter JSON) — nunca a mano. Catálogo completo de
`docs/ACEPTACION.md` §Calendario-2 (20 casos), identificado por nombre
y número.

**Resumen vitest:** 40/41 tests en
verde (`success`=false — el único test en rojo es el defecto
documentado a propósito de D-ADV-01, ver notas abajo; no afecta el
veredicto 20/20 del catálogo).

**Resumen por caso:** 20/20 verde, 0/20 rojo, 0/20 sin cobertura.

| # | Caso | Estado | Tests | Archivo(s) |
|---|---|---|---|---|
| 1 | Doble evento (mismo UID+SEQUENCE, contenido distinto) | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 2 | Reserva simultánea en dos canales para las mismas noches | 🟢 verde | 1/1 | tests/adversarial/calendario/casos.test.ts |
| 3 | Eventos desordenados (CANCEL antes que CREATE) | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 4 | Modificación de fechas (mismo UID, rango distinto) | 🟢 verde | 1/1 | tests/adversarial/calendario/casos.test.ts |
| 5 | Cancelación que no reabre noches ocupadas por otra causa | 🟢 verde | 1/1 | tests/adversarial/calendario/casos.test.ts |
| 6 | Timeout tras éxito remoto | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 7 | Reintento de import ya procesado | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 8 | ACK perdido | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 9 | Feed malformado | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 10 | Feed vacío | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 11 | Feed inaccesible | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 12 | Bloqueo manual superpuesto con import | 🟢 verde | 1/1 | tests/adversarial/calendario/casos.test.ts |
| 13 | UID reciclado | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 14 | DST en cálculo de noches/duración | 🟢 verde | 3/3 | tests/adversarial/calendario/casos.test.ts |
| 15 | Estancias contiguas (checkout=check-in mismo día) | 🟢 verde | 1/1 | tests/adversarial/calendario/casos.test.ts |
| 16 | Crash/replay a mitad de batch | 🟢 verde | 3/3 | tests/adversarial/outbox/casos.test.ts, tests/adversarial/sync/casos.test.ts |
| 17 | Límites de API / HTTP 429 | 🟢 verde | 1/1 | tests/adversarial/sync/casos.test.ts |
| 18 | Aislamiento multitenant (cross-tenant) | 🟢 verde (defecto documentado: 1 sub-test en rojo a propósito, ver docs/auditoria-2/defectos-adversarial.md) | 4/5 | tests/adversarial/multitenant/casos.test.ts |
| 19 | Escalada de privilegios | 🟢 verde | 3/3 | tests/adversarial/multitenant/casos.test.ts |
| 20 | SSRF (URL de feed apuntando a rango privado/metadata) | 🟢 verde | 8/8 | tests/adversarial/ssrf/casos.test.ts, tests/adversarial/sync/casos.test.ts |

## Notas

- Los casos 1, 3, 6, 7, 8, 9, 10, 11, 13, 16, 17, 20 tienen su cobertura
  base en `tests/adversarial/sync/` (Lote 2, subset previo a este
  lote). Este reporte los incluye porque `npm run test:adversarial`
  (sin `--filter`) corre TODA la carpeta `tests/adversarial/`.
- Los casos 2, 4, 5, 12, 14, 15 se añadieron en
  `tests/adversarial/calendario/` (Lote 11A).
- El caso 16 tiene cobertura adicional a nivel de WORKER real de outbox
  (`apps/api/src/workers/observabilidad/outboxWorker.ts`) en
  `tests/adversarial/outbox/`, complementando la cobertura a nivel de
  motor de sincronización de `tests/adversarial/sync/`.
- Los casos 18 y 19 se verifican en `tests/adversarial/multitenant/`
  vía HTTP real (`apps/api`) — además de la verificación con SQL
  directo contra el rol `app_rv` en
  `packages/db/test/integration/rls.test.ts` (Lote 3), que corre en
  `npm run test:integration`, no en `test:adversarial`, pero forma
  parte del mismo caso del catálogo.
- El caso 20 tiene vectores adicionales (RFC1918, loopback, esquema
  `file:`, redirección HTTP real hacia un destino interno) en
  `tests/adversarial/ssrf/`, más una suite extra de H-094 (límites de
  tamaño/eventos ICS — "ICS bomba") que NO es uno de los 20 casos
  numerados pero es parte explícita del alcance de BACKLOG E16.
- **Defecto real documentado, dejado en rojo a propósito** (nunca
  maquillado): `tests/adversarial/multitenant/casos.test.ts`, caso 18,
  el sub-test `"[DEFECTO] POST /bloqueos cross-tenant debería responder
  con un error de autorización clasificado (403/404), no 500 genérico"`.
  El caso 18 en su conjunto se reporta VERDE porque su invariante de
  seguridad real (aislamiento de datos: cero fugas, cero escrituras
  cross-tenant exitosas) se cumple en todos los caminos probados —
  D-ADV-01 es un defecto de clasificación de error HTTP, no una falla de
  aislamiento. Ver `docs/auditoria-2/defectos-adversarial.md`.
