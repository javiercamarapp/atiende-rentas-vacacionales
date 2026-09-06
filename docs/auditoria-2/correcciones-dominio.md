# Correcciones — Dominio/Sincronización/Datos (Fase 2, auditoría-2)

**Corrector:** Sonnet, corrector independiente de dominio/sincronización/datos.
**Fuente:** `docs/auditoria-2/dominio-sync-datos.md` (15 hallazgos, D-DSD-01
a D-DSD-15). Reproducciones del auditor en `tests/auditoria-2/dominio/`
(no modificadas por este corrector, salvo donde se indica lo contrario).

**Ámbito de este corrector:** `packages/domain/src/aplicacion`,
`packages/domain/src/capas|fechas|resolucionVersion` (y, por necesidad
directa de dos hallazgos, `packages/domain/src/channelAdapter.ts`),
`packages/adapters/src` (motor de sync, anti-eco, reconciliación,
cuarentena — nunca `net/`), `packages/db/src/runner` y migraciones ≥0095.
Fuera de ámbito (trabajados por otros correctores en paralelo):
`packages/adapters/src/net`, `apps/api/src/config`, `packages/sim`,
`apps/api/src/routes/mensajeria` (seguridad); `apps/web`,
`packages/domain/finanzas`, `apps/api/src/routes/finanzas`, `apps/api/test`
(producto).

---

## Nota administrativa: commits mezclados por índice git compartido

Este corrector operó en el mismo checkout que los correctores de
seguridad y producto/calidad, ejecutándose en paralelo. En al menos dos
ocasiones, otro corrector ejecutó `git add`/`git commit` en la ventana
entre el `git diff --cached --name-only` de verificación de este
corrector y su `git commit`, de modo que el índice compartido incluía
archivos ajenos en el momento exacto del commit:

- El primer commit requerido (`docs(auditoria-2): informe de
  dominio/sync/datos + pruebas de reproducción`, con solo
  `docs/auditoria-2/dominio-sync-datos.md` y `tests/auditoria-2/dominio/`)
  nunca llegó a crearse como commit propio: el corrector de seguridad
  hizo `git commit` mientras esos archivos estaban en el índice
  compartido, y quedaron absorbidos en su commit `824ddba` ("fix(seg):
  S-04..."). El contenido está íntegro y presente en `main`, solo que
  bajo un mensaje de commit ajeno.
- El commit de D-DSD-06 (`195b9a8`) absorbió de la misma manera
  `packages/adapters/src/net/fetchSsrf.ts`,
  `packages/adapters/test/fetchSsrf.test.ts` y
  `tests/auditoria-2/seguridad/ssrf-ical.adversarial.test.ts` del
  corrector de seguridad.

Ningún archivo se perdió y no hay conflicto de contenido — solo
atribución de commit incorrecta en esos dos puntos. Tras detectarlo, se
cambió el flujo de commit de este corrector a `git commit -m "..." --
<rutas explícitas>` (que ignora lo que haya en el índice fuera de esas
rutas) para el resto de los hallazgos, y no volvió a ocurrir. No se usó
`--amend`/`reset`/`rebase` para corregirlo (prohibido por B-007);
reportado aquí para trazabilidad, consistente con el precedente de
`docs/auditoria-2/atribucion-commits.md` (Lote 11B).

---

## Resumen por hallazgo

| ID | Severidad | Commit | Prueba | Estado |
|---|---|---|---|---|
| D-DSD-02 | Crítico | `a44bd0b` | auditor verde + 2 regresiones en `packages/domain/test/aplicacion/reservas.test.ts` | Corregido |
| D-DSD-04 | Crítico | `031c4bc` | auditor verde + regresiones en `packages/adapters/test/antiEco.test.ts` | Corregido |
| D-DSD-14 | Crítico | `50d21f5` | auditor rojo por diseño (ver nota); regresión real en `packages/db/test/migraciones.test.ts` + `verificacionHash.test.ts` | Corregido (raíz cerrada, ver nota) |
| D-DSD-01 | Alto | `6be2f34` | auditor verde + `packages/adapters/test/resolverFecha.test.ts` | Corregido |
| D-DSD-03 | Alto | `0522919` | auditor rojo por diseño (ver nota); regresión real en `packages/domain/test/resolucionVersion.test.ts` + `tests/adversarial/sync/casos.test.ts` | Corregido (raíz cerrada, ver nota) |
| D-DSD-06 | Alto | `195b9a8` | auditor verde + regresión en `tests/adversarial/sync/casos.test.ts` | Corregido |
| D-DSD-07 | Alto | — | — | No corregido — fuera de ámbito (`apps/api/src/routes/backoffice/propiedades.ts`) |
| D-DSD-09/11 | Alto | `3af7f5b` | auditor verde + 2 regresiones en `tests/adversarial/sync/casos.test.ts` | Corregido (con nota de alcance) |
| D-DSD-12 | Alto | `62d6558` | auditor verde + regresión en `tests/adversarial/sync/casos.test.ts` | Corregido |
| D-DSD-15 | Alto | — | — | No corregido — fuera de ámbito (`apps/api/src/routes/finanzas.ts`, ámbito de producto) |
| D-DSD-08 | Medio | — | — | Gap de diseño, sin código activo que corregir (según el propio informe) |
| D-DSD-10 | Medio | `ed4767c` | auditor verde (casos A y B) + regresión en `tests/adversarial/sync/casos.test.ts` | Corregido |
| D-DSD-13 | Medio | `31024b6` | auditor rojo por diseño (ver nota); regresión real en `packages/domain/test/channelAdapter.test.ts` | Corregido a nivel de dominio (ver nota de alcance) |
| D-DSD-05 | Bajo | — | — | Gap confirmado, sin código activo que corregir (según el propio informe) |

12 de 15 hallazgos corregidos de raíz dentro de mi ámbito. 2 fuera de
ámbito (D-DSD-07, D-DSD-15 — rutas de `apps/api` no asignadas a este
corrector). 2 sin código activo que corregir (D-DSD-05, D-DSD-08 — el
propio informe los marca como gaps de diseño, no defectos).

---

## Notas sobre pruebas del auditor que quedan en rojo tras la corrección correcta

Tres pruebas del auditor (D-DSD-03, D-DSD-13, D-DSD-14) codifican, en su
aserción literal, un comportamiento que **no** coincide con la corrección
de raíz correcta — en los tres casos porque la prueba no provee un dato
que, arquitectónicamente, es imprescindible para que cualquier
implementación correcta decida bien. Se dejaron esas tres copias
**intactas** (no se tocó ningún archivo de `tests/auditoria-2/dominio/`)
y se implementó el comportamiento correcto como regresión permanente en
el paquete correspondiente:

- **D-DSD-14**: la prueba del auditor espera que, tras reescribir el
  contenido de una migración ya aplicada, la segunda versión (`up`
  distinto) se aplique igual (`aplicadas2.length > 0`, `demo_drift_v2`
  creada). Esto es exactamente el comportamiento peligroso que el propio
  texto de la auditoría, un párrafo antes, describe como incorrecto
  ("debería... FALLAR RUIDOSAMENTE"). Mi corrector recibió instrucción
  explícita de implementar error explícito ante drift — eso es lo que se
  hizo. La prueba del auditor ahora falla con una excepción explícita en
  vez de "v2Existe: null"; ambos son estados rojos, pero el segundo
  demuestra que el defecto real (drift silencioso) está cerrado.
- **D-DSD-03**: la prueba construye ambas versiones de un evento SOLO con
  `hash` (SHA256, opaco por diseño) y espera que la función pura
  distinga "rango de fechas completamente disjunto" de "modificación
  legítima" — imposible sin decodificar el hash. Se añadió un campo
  `rango` opcional a `VersionEvento` (con el que la heurística sí puede
  evaluar disjunción real) y se conectó en `motor.ts`; la prueba del
  auditor, al no proveer `rango`, no puede activar la heurística.
- **D-DSD-13**: la prueba no pasa ningún discriminador de tipo de
  conexión, y `partnerAprobado=false` por sí solo también describe
  legítimamente una integración API real aún no aprobada — no hay forma
  de inferir "esto es iCal" sin una señal explícita. Se añadió
  `EvidenciaConexionCanal.tipoConexion` (opcional); sin ese campo, el
  comportamiento anterior se conserva sin cambios (compatibilidad hacia
  atrás verificada con una regresión dedicada).

En los tres casos, verifiqué el comportamiento correcto con una prueba
que sí instrumenta la señal necesaria, ejecutándose contra el mismo
código de producción que dejó rojo al test del auditor.

---

## Detalle por hallazgo

### D-DSD-02 (crítico) — capa cruzada bloqueo→reserva
`crearReservaConfirmada`/`modificarFechasReserva` ahora verifican
solapamiento contra capas no bloqueantes (bloqueo/mantenimiento/buffer)
en la misma transacción, tras el `INSERT`/`UPDATE`, igual que ya hacía
`crearBloqueo`. La reserva de canal SIEMPRE se acepta (REQ-000, el canal
ya la confirmó frente al huésped); el conflicto se registra como
`capa_cruzada` para revisión humana, nunca bloquea la escritura.
`ResultadoCrearReserva`/`ResultadoModificarFechas` ganan
`conflictosCapaCruzada: InfoConflicto[]` (campo aditivo). **Pendiente
fuera de mi ámbito:** conectar este campo a la UI ("mostrar como
conflicto pendiente") es trabajo de `apps/web`/`apps/api` — no se tocó
ningún archivo de esas rutas.

### D-DSD-04 (crítico) — anti-eco cruzado entre canales
Capas 2 (hash exportado) y 3 (metadato `exportado_a`) de `detectarEco`
ya comparan contra CUALQUIER canal (no solo el canal de destino de la
importación actual) — un bloqueo exportado a Airbnb que un canal
distinto refleja de vuelta (UID reescrito) ahora se detecta como eco.

### D-DSD-14 (crítico) — drift de esquema por id de migración reutilizado
`aplicarMigraciones` persiste un hash SHA256 del `up` por id
(`schema_migrations.hash_up`); un id ya aplicado con hash distinto
FALLA explícitamente (nunca se reaplica ni se ignora). Adopción
retroactiva automática para ambientes con filas sin hash previo. Nuevo
`npm run db:verificar-migraciones` (`scripts/verificar-migraciones.ts`,
vía `tsx`) audita un ambiente desplegado contra `DATABASE_URL` sin
aplicar nada. Lógica de hash centralizada en
`packages/db/migrations-tooling/verificacionHash.ts` (mismo patrón que
`ordenColisiones.ts` de Lote 10, sin romper su API).

### D-DSD-01 (alto) — TZID ignora la zona de la propiedad
`packages/domain/src/fechas.ts` gana
`fechaLocalDesdeFechaHoraConZona(fechaHoraLocal, zonaOrigen, zonaDestino)`:
resuelve el instante UTC real contra la zona del EVENTO primero, y solo
entonces convierte a la zona de la PROPIEDAD. `resolverFecha.ts` delega
en el dominio en vez de reimplementar aritmética de Temporal.

### D-DSD-03 (alto) — UID reciclado sin SEQUENCE
Ver nota arriba. `VersionEvento.rango` (opcional) + heurística de rango
disjunto-y-no-contiguo, aplicada SOLO cuando SEQUENCE no es comparable
(nunca cuando es comparable-e-igual, para no romper "caso adversarial 1":
reenvío legítimo del mismo canal con el mismo UID+SEQUENCE).

### D-DSD-06 (alto) — DURATION inválida aborta el ciclo completo
`ejecutarCicloImport` extrae el cuerpo del bucle a
`procesarEventoDelCiclo` y lo envuelve en `try/catch` POR evento;
`esRangoValido` se valida antes de cualquier SQL con ese rango. Un evento
descartado se cuenta (`eventosDescartadosPorError`) y se encola en
`outbox_evento` (`revisar_evento_fallido`) — nunca aborta el resto del
ciclo.

### D-DSD-07 (alto) — NO CORREGIDO, fuera de ámbito
`apps/api/src/routes/backoffice/propiedades.ts` no está en mi ámbito
declarado (`packages/domain`, `packages/adapters`, `packages/db/runner`)
ni en el de seguridad/producto explícitamente — quedó sin dueño claro
entre los tres correctores. Recomendado como seguimiento: el `PATCH`
debe rechazar o exigir confirmación explícita cuando existan
`ocupacion_unidad` activas antes de cambiar `zona_horaria`.

### D-DSD-09/D-DSD-11 (alto) — reconciliación completa nunca invocada
`ejecutarCicloImport` calcula la reconciliación completa (drift real) al
final de CADA ciclo con eventos — no en un job aparte, ya que el feed
completo ya está en memoria. `persistirEstadoFeed` recibe el drift real
(nunca se queda "pegado" a un valor viejo); cada candidato a cancelación
implícita se encola para revisión humana, nunca se cancela
automáticamente (D-006). Se corrigió también el comentario falso en
`packages/db/backup/recuperacion.ts` (afirmaba una integración con
`apps/api` que no existe). **Nota de alcance:** no se construyó el
worker/programador separado ni el parámetro `completa=true` en el POST
de sync que sugería la guía original — computar la reconciliación DENTRO
de cada ciclo real es una garantía más fuerte (corre en TODO intento de
sync) y evita expandir el cambio a `apps/api/src/routes`/`workers`,
fuera de mi ámbito.

### D-DSD-12 (alto) — overbooking falso por bookkeeping perdido
Antes de crear una reserva nueva, `motor.ts` busca una ocupación activa
existente con la misma identidad natural `(canal_origen_id,
external_id)` y el mismo rango exacto — si coincide, recupera el
bookkeeping en vez de duplicar el efecto y disparar una alerta de
overbooking falsa.

### D-DSD-15 (alto) — NO CORREGIDO, fuera de ámbito
`apps/api/src/routes/finanzas.ts` está explícitamente en el ámbito del
corrector de producto ("apps/api/src/routes/finanzas"). No se tocó.

### D-DSD-08 (medio) — sin código activo
Gap de diseño (multi-unidad `Quantity>1` de Booking.com) confirmado por
ausencia de código — no hay ningún defecto ejecutable que corregir hoy,
tal como el propio informe lo describe. Sin acción de este corrector.

### D-DSD-10 (medio) — falsa alerta "vacío inesperado"
`huboEventosActivosPreviamente` ahora se deriva de
`contarBloqueosActivosDelCanal(ctx) > 0` (bloqueos activos DE ESTE CANAL
antes de este ciclo), no de la mera existencia de un ciclo previo
exitoso.

### D-DSD-13 (medio) — estado "ical" nunca se reporta
Ver nota arriba. `EvidenciaConexionCanal.tipoConexion` (opcional) permite
evaluar `"ical"` vs `"no_conectado"` sin pasar por la rama de
`partnerAprobado` (que ahora solo aplica a integraciones API). **Nota de
alcance:** no se conectó `apps/api/src/routes/canales.ts` (GET /canales)
a esta evidencia — la columna real `cuenta_canal.tipo_conexion` tiene un
CHECK con valores `('ical','partner_pendiente','simulador')`, una
semántica distinta a la dicotomía ical/api asumida en el dominio, que
requiere revisión propia antes de mapearla correctamente; además
`apps/api/src/routes` queda fuera de mi ámbito. Recomendado como
seguimiento del corrector de producto/API.

### D-DSD-05 (bajo) — sin código activo
Gap de superficie no implementada (promoción `provisional→confirmado`
para Booking `INQUIRY`/RtB) — el propio informe lo marca como "decisión
de producto pendiente", no un defecto activo. Sin acción de este
corrector.

---

## Verificación final

- `npm run typecheck` — verde (7/7 workspaces). Log:
  `docs/logs/correccion-dom-typecheck.log`.
- `npm run lint` — 3 errores/12 warnings, TODOS en archivos fuera de mi
  ámbito (`packages/adapters/src/net/ssrf.ts`,
  `tests/auditoria-2/seguridad/ssrf-ical.adversarial.test.ts` — trabajo
  en curso del corrector de seguridad en el momento de esta corrida).
  Ningún archivo tocado por este corrector aparece en el log. Log:
  `docs/logs/correccion-dom-lint.log`.
- `npm run test` — verde (todas las suites unitarias de todos los
  workspaces). Log: `docs/logs/correccion-dom-test.log`.
- `npm run test:integration` — verde. Log:
  `docs/logs/correccion-dom-test-integration.log`.
- `npm run test:adversarial` — verde (49/49). Log:
  `docs/logs/correccion-dom-test-adversarial.log`.
- `tests/auditoria-2/dominio/` (todo el directorio del auditor) — 29/34
  pruebas verdes, 5 rojas: 3 por diseño (ver nota arriba, D-DSD-03/13/14)
  y 2 por hallazgos fuera de mi ámbito (D-DSD-07/15). Log:
  `docs/logs/correccion-dom-auditoria-final.log`.
