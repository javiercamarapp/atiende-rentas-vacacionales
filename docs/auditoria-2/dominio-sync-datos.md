# Auditoría adversarial independiente — Dominio, Sincronización y Datos (Fase 2)

**Auditor:** Sonnet, auditor adversarial independiente de dominio/sincronización/datos.
**Alcance:** `packages/domain`, `packages/db`, `packages/adapters`, `packages/sim`,
`tests/adversarial`, `tests/load`, contra los invariantes de
`docs/BLUEPRINT.md` §3, `docs/DECISIONES.md` D-001–D-005/D-011/D-012, y
`docs/investigacion/RV04/RV06/RV07`.
**Método:** por cada invariante se escribió una prueba ejecutable (vitest)
contra `embedded-postgres` real (Postgres 18, D-009/D-022) o contra las
funciones puras del dominio, siguiendo el patrón ya establecido en
`packages/db/test/integration/concurrencia.test.ts` y
`tests/adversarial/sync/`. Todas las pruebas de reproducción quedan en
`tests/auditoria-2/dominio/` **en rojo a propósito** cuando reproducen un
defecto real (mismo criterio que `docs/auditoria-2/defectos-adversarial.md`):
el `expect(...)` codifica el comportamiento prometido por
BLUEPRINT/DECISIONES, y si el código real lo viola, el test falla y esa
falla ES la evidencia.

No se modificó ningún archivo de producto. Solo se añadieron pruebas en
`tests/auditoria-2/dominio/` y este documento.

---

## Resumen ejecutivo

15 hallazgos confirmados (D-DSD-01 a D-DSD-15), todos con reproducción
ejecutable en verde/rojo verificada por el coordinador (directamente o de
forma independiente sobre el trabajo de las tres subauditorías paralelas
que cubrieron: (A) cuarentena/reconciliación/idempotencia de outbox, (B)
fechas/DST/multi-unidad, (C) finanzas/migraciones/estado de conexión
honesto).

| Severidad | Cantidad | IDs |
|---|---|---|
| Crítico | 3 | D-DSD-02, D-DSD-04, D-DSD-14 |
| Alto | 8 | D-DSD-01, D-DSD-03, D-DSD-06, D-DSD-07, D-DSD-09, D-DSD-11, D-DSD-12, D-DSD-15 |
| Medio | 3 | D-DSD-08, D-DSD-10, D-DSD-13 |
| Bajo | 1 | D-DSD-05 |

Los cinco hallazgos más graves:

1. **D-DSD-02 (crítico)** — `crearReservaConfirmada` nunca verifica
   solapamiento contra capas de menor precedencia (`capa='bloqueo'`): una
   reserva de canal que aterriza sobre un bloqueo de propietario o
   mantenimiento ya existente se inserta sin excepción de BD y **sin ninguna
   fila en `conflicto_calendario`, sin alerta**. Es la dirección inversa,
   no cubierta, del ejemplo motivador de D-002/RV07 §7 — y es la dirección
   que ocurre en el flujo real más frecuente (sync de canal). Afecta
   también a `modificarFechasReserva` (ampliación de fechas).
2. **D-DSD-04 (crítico)** — El anti-eco (D-004) no detecta el eco
   **cruzado entre canales** que la propia decisión dice cubrir
   ("...o de otro canal a través de él"): un bloqueo exportado a Airbnb que
   vuelve reflejado por el feed de Vrbo se aplica como una reserva nueva
   (`eventosAplicados=1`), duplicando la ocupación bajo un canal distinto —
   y, por D-DSD-02, sin ninguna alerta de capa cruzada tampoco.
3. **D-DSD-14 (crítico)** — El runner de migraciones rastrea aplicación
   solo por `id`, sin hash de contenido: si una migración ya aplicada se
   reescribe (mismo `id`, SQL distinto — rebase, merge, error humano), el
   nuevo contenido **nunca se aplica y nunca se reporta**, dejando el
   esquema real divergido del código fuente en silencio, sin ninguna
   advertencia. Puede enmascarar la ausencia de cualquier otra protección
   de este mismo documento.
4. **D-DSD-09/D-DSD-11 (alto)** — La reconciliación completa (detección de
   "drift": UIDs que el sistema cree activos pero que el canal dejó de
   listar sin `CANCEL` explícito) existe como función pura correctamente
   implementada, pero **nunca se invoca desde ningún camino de ejecución
   real** fuera de pruebas — ni en el ciclo normal de sync, ni siquiera
   (verificado) desde `apps/api` en el flujo de recuperación de backup que
   un comentario del propio código afirma incorrectamente que sí la usa.
5. **D-DSD-12 (alto)** — Si se pierde el bookkeeping de versión de sync
   entre aplicar el efecto de dominio y registrar `evento_canal_importado`
   (dos escrituras separadas, no una transacción), el reproceso del mismo
   evento genera una **alerta de overbooking falsa** (dato falso al
   usuario) sobre una reserva que nunca estuvo en riesgo real.

**Invariantes que resistieron** (intentos fallidos, ver detalle en cada
sección): el `EXCLUDE USING gist` central bajo advisory lock (§3.2/D-012),
la centralización de toda escritura a `ocupacion_unidad` en
`packages/domain/src/aplicacion/reservas.ts` (sin rutas alternas de
limpieza/mantenimiento que la esquiven), la lectura de disponibilidad por
OR/precedencia (`capas.ts`, reutilizada tal cual por
`apps/api/src/routes/unidades.ts`, nunca reimplementada en SQL), la
identidad `(canal, unidad, UID)` con `UNIQUE` real en `evento_canal_importado`,
y el esquema de `ocupacion_unidad` (CHECK de rango semiabierto/no vacío,
coherencia capa/razón).

---

## D-DSD-01 — `resolverFechaLocal` ignora la zona horaria de la propiedad en `DATE-TIME;TZID` y calcula mal la fecha incluso con TZID == propiedad

**Severidad:** alto.

**Dónde:** `packages/adapters/src/ical/resolverFecha.ts:22-23`

```ts
case "DATE-TIME-TZID":
  return fechaLocalDesdeInstante(`${valor.fechaHoraLocal}Z`, valor.tzid);
```

`fechaHoraLocal` es la hora de pared local del evento tal cual viene en el
`.ics` (`packages/adapters/src/ical/parser.ts:138`, "sin offset"). El código
la etiqueta como si fuera un instante UTC (le concatena `Z`) y luego la
reconvierte usando **`valor.tzid` (la zona del propio evento), nunca
`zonaHorariaPropiedad`** — el parámetro de la función queda sin usar en esta
rama. Esto es matemáticamente incorrecto incluso cuando `TZID` del evento
coincide con la zona de la propiedad: cualquier hora local anterior al
offset UTC de esa zona (p. ej. antes de las 4am en `America/New_York`, EDT
UTC-4) se recalcula al día anterior.

**Reproducción:** `tests/auditoria-2/dominio/resolverFechaTzid.test.ts`
(prueba pura, sin BD).

**Salida real:**

```
× con TZID == zona de la propiedad, una hora local temprana (madrugada) se corre al día anterior
  expected '2026-09-06' to be '2026-09-07'
× con TZID distinto de la propiedad, la fecha calculada ignora la zona de la propiedad y puede quedar mal
  expected '2026-09-08' to be '2026-09-07'
```

**Impacto:** un DTSTART/DTEND con `DATE-TIME;TZID=...` (común en exports de
calendarios genéricos tipo Google Calendar que un propietario podría
conectar, o cualquier feed que no use `VALUE=DATE`) puede desplazar una
noche de check-in o check-out un día en cualquier dirección. Puede tanto
**crear una noche fantasma bloqueada** (pérdida de disponibilidad real, sin
overbooking pero con ingreso perdido) como **liberar una noche que en
realidad estaba ocupada** (riesgo directo de overbooking si otro canal
vende esa noche mientras tanto). Contradice directamente `docs/LAGUNAS.md`
línea 164, que marca "TZID/DST" como **"EVIDENCIA — resuelto"** citando el
diseño de RV17 — el diseño es correcto, la implementación no lo sigue.

**Corrección propuesta:** en la rama `DATE-TIME-TZID`, construir el instante
real con `Temporal.ZonedDateTime.from({ ...fechaHoraLocal, timeZone:
valor.tzid })` (o equivalente), obtener su `Instant`, y **entonces sí**
convertir ese instante a `zonaHorariaPropiedad` (el parámetro de la
función) — nunca reusar `valor.tzid` como zona destino.

**Estado:** confirmado, sin corregir (auditoría de solo lectura).

---

## D-DSD-02 — Ninguna verificación de solapamiento cuando una RESERVA aterriza sobre un BLOQUEO ya existente: cero alerta, cero fila en `conflicto_calendario`

**Severidad:** crítico.

**Dónde:** `packages/domain/src/aplicacion/reservas.ts:59-184`
(`crearReservaConfirmada`).

D-002/BLUEPRINT §3.2 prometen, con el ejemplo motivador explícito de RV07
§7 ("una reserva confirmada y un bloqueo de mantenimiento superpuesto
creado por error... se alerta el solapamiento"), que **todo** solapamiento
entre capas —en cualquier orden de inserción— se detecta y se registra en
`conflicto_calendario` (`tipo='capa_cruzada'`).

`crearBloqueo` (mismas líneas 205-256 del archivo) sí lo implementa: tras
insertar, consulta explícitamente **todas** las filas activas solapadas de
cualquier capa (línea 222-227) y crea un `conflicto_calendario` por cada
una.

`crearReservaConfirmada` **no tiene el equivalente**. Su único mecanismo de
detección de conflicto es capturar `23P01` del `EXCLUDE` (que solo dispara
entre dos filas `capa='reserva', bloqueante=true` — nunca contra
`capa='bloqueo'`, por diseño). Si una reserva de canal llega **después** de
que ya existe un bloqueo de propietario/mantenimiento sobre las mismas
fechas, el `INSERT` tiene éxito sin ninguna excepción y sin ninguna
verificación de solapamiento cruzado adicional.

Esta es precisamente la dirección más común en producción real: casi todas
las reservas entran vía `ejecutarCicloImport` (sync de canal, continuo),
mientras que los bloqueos de propietario/mantenimiento se crean
manualmente y con mucha menor frecuencia — por lo que "bloqueo ya existe,
reserva llega después" es el caso típico, no el marginal.

**Reproducción:** `tests/auditoria-2/dominio/capaCruzadaAsimetrica.test.ts`
(embedded-postgres real).

**Salida real:**

```
D-nn — asimetría de detección de conflicto capa cruzada (bloqueo antes, reserva después)
× bloqueo de mantenimiento existente + reserva de canal que lo solapa después: NO genera conflicto ni alerta
  expected +0 to be 1
```

(La reserva se insertó con éxito, `resultado.conflicto === null`, y
`conflicto_calendario` quedó en 0 filas para esa unidad.)

**Impacto:** la noche sigue leyéndose como "ocupada" (por `capas.ts`,
OR/precedencia — el propietario o mantenimiento sigue ganando en lectura),
así que esto **no** abre disponibilidad falsa hacia otros canales por sí
solo. Pero viola directamente D-002 ("un conflicto entre capas se reporta a
un humano, nunca se resuelve... sin alertar") de la forma más peligrosa
posible: un huésped real puede tener una reserva confirmada y pagada sobre
fechas que la propiedad tiene bloqueadas por el propietario (viaje
personal) o por mantenimiento, **sin que ningún humano se entere nunca**,
hasta que el huésped llega a la puerta. Es el escenario de "dato falso al
usuario"/"pérdida operativa" central que el producto existe para prevenir,
sin que el mecanismo de alerta diseñado para eso (`conflicto_calendario`)
llegue siquiera a activarse.

**Corrección propuesta:** replicar en `crearReservaConfirmada` la misma
verificación post-INSERT de `crearBloqueo` (consulta de filas activas
solapadas de cualquier capa, excluyendo la propia fila, e inserción de
`conflicto_calendario` tipo `capa_cruzada` por cada una) — no solo en la
rama de éxito, sino también evaluar si debería ejecutarse incluso cuando la
reserva termina en `conflicto_pendiente` por `23P01` contra otra reserva
(hoy ese camino sí crea `overbooking_confirmado`, pero no revisa además
bloqueos de capa cruzada sobre el mismo rango).

**Nota adicional (mismo defecto, segunda ruta):**
`modificarFechasReserva` (mismo archivo, líneas 323-426) tiene exactamente
el mismo patrón: su único mecanismo de detección de conflicto es también
capturar `23P01` (línea 372-373) tras el `UPDATE`; no hay ninguna
verificación de capa cruzada equivalente a la de `crearBloqueo`. Una
reserva que se **amplía** (BLUEPRINT §4.4, punto 2: "verifica que las
noches añadidas no estén ya ocupadas por otro bloqueo de razón distinta")
hacia fechas cubiertas por un bloqueo de propietario/mantenimiento tiene
éxito sin excepción y sin registrar conflicto — la verificación que
BLUEPRINT §4.4 dice que debería existir ahí no está implementada. No se
escribió una prueba separada para esta ruta por ser el mismo mecanismo
subyacente que D-DSD-02 (misma corrección aplica a ambas funciones).

**Estado:** confirmado, sin corregir.

---

## D-DSD-03 — La heurística de "UID reciclado" nunca se activa si el canal no expone `SEQUENCE`: fusión silenciosa de dos reservas no relacionadas

**Severidad:** alto.

**Dónde:** `packages/domain/src/resolucionVersion.ts:75-98` (`resolverVersion`).

El propio comentario del archivo (líneas 9-12) reconoce que "NO hay
evidencia primaria de que los canales incrementen `SEQUENCE` de forma
fiable en feeds `PUBLISH`" — es decir, el diseño anticipa que muchos feeds
reales llegan con `sequence: null` en ambos lados. La detección de "UID
reciclado" (línea 82-94) solo se evalúa dentro de la rama
`secuenciaComparable` (`actual.sequence !== null && entrante.sequence !==
null`, línea 75). Cuando `SEQUENCE` no es comparable, el código cae
directo a comparar `DTSTAMP` (líneas 103-108): si el `DTSTAMP` entrante es
más reciente, la acción es `aplicar` sin ninguna sospecha, sin importar
cuán distinto sea el contenido (`hash`).

El único catch-all que sí marca `revisar_uid_reciclado` por defecto
requiere `DTSTAMP` **idéntico** con hash distinto (línea 110-118) — un caso
mucho más estrecho que "UID reciclado para una reserva nueva, con un
`DTSTAMP` normalmente posterior porque se exportó después en el tiempo".

**Reproducción:** `tests/auditoria-2/dominio/uidRecicladoSinSequence.test.ts`
(prueba pura).

**Salida real:**

```
× DTSTAMP más reciente + hash totalmente distinto, SEQUENCE ausente en ambos: se aplica en silencio, no se marca para revisión
  expected 'aplicar' to be 'revisar_uid_reciclado'
```

**Impacto:** si un canal recicla un `UID` (caso adversarial 13, ya
documentado como riesgo real en RV07) para una reserva completamente no
relacionada, y ese canal no manda `SEQUENCE` de forma fiable (plausible,
reconocido por el propio código), `ejecutarCicloImport`
(`packages/adapters/src/sync/motor.ts:359-362`) llama
`modificarFechasReserva` sobre la fila **existente**, cambiando sus fechas
a las de la reserva no relacionada sin ninguna alerta ni revisión humana —
efectivamente fusionando dos reservas de huéspedes distintos bajo un mismo
registro interno. Esto puede liberar las fechas originales (si la
modificación las excluye del nuevo rango) mostrando disponibilidad falsa
para esas fechas, o corromper qué huésped/fechas corresponden a qué
reserva de cara a limpieza/mensajería/finanzas.

**Corrección propuesta:** usar el hash de contenido como señal
independiente de sospecha: si `DTSTAMP` es más reciente pero el hash nuevo
no comparte ninguna relación razonable con el anterior (p. ej. rango de
fechas completamente disjunto y no contiguo), marcar
`revisar_uid_reciclado` también en ausencia de `SEQUENCE` comparable, en
vez de aplicar en silencio.

**Estado:** confirmado, sin corregir.

---

## D-DSD-04 — El anti-eco no detecta el eco cruzado entre canales que D-004 dice cubrir explícitamente

**Severidad:** crítico.

**Dónde:** `packages/adapters/src/sync/motor.ts:182-203`
(`hashesExportadosRecientes`, `canalesExportadosDeRango`) y
`packages/adapters/src/sync/antiEco.ts:35-54` (`detectarEco`).

D-004 dice textualmente: "puede reexponer en su propio feed de export un
bloqueo que en realidad proviene de nuestro propio export hacia él (**o de
otro canal a través de él**)". Las tres capas de `detectarEco`, sin
embargo, dependen todas de una coincidencia con el **canal de destino
original**:

- Capa 2: `hashesExportadosRecientes(ctx)` filtra
  `WHERE ou.unidad_id = $1 AND be.canal_id = $2` — `$2` es el canal que se
  está importando **ahora**, no todos los canales a los que se exportó el
  contenido.
- Capa 3: `canalesExportadosDeRango(ctx, rango)` sí trae todos los canales a
  los que se exportó ese rango, pero `detectarEco` (antiEco.ts:46) solo
  comprueba si el canal **actual** está en esa lista.

Si exportamos un bloqueo a Airbnb, y por fuera de nuestro sistema Vrbo lo
importó del calendario de Airbnb (sincronización cruzada manual del
propietario, escenario explícito de D-004) y lo reexpone en su propio feed
con un `UID` nuevo (no hay evidencia de que Vrbo preserve `UID`s ajenos, el
propio D-004 lo dice), ninguna de las tres capas lo detecta cuando lo
importamos de vuelta desde Vrbo.

**Reproducción:** `tests/auditoria-2/dominio/antiEcoCruzadoEntreCanales.test.ts`
(embedded-postgres real, dos simuladores de canal reales — Airbnb y Vrbo).

**Salida real:**

```
[ECO-CRUZADO] antes=0 despues=1 ecos_descartados=0 eventos_aplicados=1 conflictos=0
× bloqueo exportado a Airbnb, rebotado de vuelta vía el feed de Vrbo con UID propio de Vrbo: se cuela como reserva nueva
  expected +0 to be 1
```

El evento rebotado se aplicó como una `RESERVA_CANAL` nueva
(`eventosAplicados=1`), duplicando la ocupación original. Y por D-DSD-02,
`conflictos=0`: como la fila nueva es `capa='reserva'` y la original era
`capa='bloqueo'` (`BLOQUEO_PROPIETARIO`), tampoco se genera ninguna alerta
de capa cruzada — los dos defectos se componen exactamente en este
escenario.

**Impacto:** duplica la ocupación real bajo un `canal_origen`/`external_id`
distinto, sin alerta. No libera disponibilidad (la noche sigue ocupada por
ambas filas), pero corrompe el conteo de "reservas" reales de la unidad —
con efecto en cadena sobre cualquier reporte, estadística de ocupación, o
(si esta reserva fantasma llegara a facturarse) finanzas/statements del
owner, que contarían una reserva que nunca existió.

**Corrección propuesta:** la capa 2 (hash exportado) debería comparar
contra **todos** los hashes que el sistema exportó a **cualquier** canal
para esa unidad, no solo al canal de origen del evento entrante — un
contenido idéntico `(unidad, dtstart, dtend, razón)` que nosotros mismos
generamos es una señal de eco válida sin importar por qué canal regresa.
Análogamente, la capa 3 debería marcar como eco cualquier evento entrante
cuyo rango coincida exactamente con un bloqueo interno que **ya fue
exportado a algún canal**, no solo al canal actual.

**Estado:** confirmado, sin corregir.

---

## D-DSD-05 — No existe ninguna función de dominio para promover `provisional/bloqueante=false` a `confirmado/bloqueante=true` (Booking `INQUIRY`/RtB)

**Severidad:** bajo (gap de superficie no implementada, ya reconocido como
"decisión de producto pendiente" en BLUEPRINT §3.2/RV04-R-01 — se registra
aquí solo para que la ausencia quede verificada por código, no asumida).

**Dónde:** `puedeTransicionar` (`packages/domain/src/estados.ts:11`) permite
la transición `provisional → confirmado`, pero no existe ninguna función en
`packages/domain/src/aplicacion/` ni ninguna ruta en `apps/api/src/routes/`
que la implemente. Se verificó con `grep` que la única aparición de
`estado = 'confirmado'` en escrituras es la de `crearBloqueo` (que no
aplica a este caso, es un valor fijo en el INSERT), y ninguna ruta de
`apps/api/src/routes/` hace un `UPDATE ocupacion_unidad SET estado =
'confirmado'`.

**Impacto:** si/cuando se implemente la aceptación de un Booking.com
`INQUIRY` (RV04-R-01), el punto exacto donde el riesgo de doble venta se
materializa es la promoción a `bloqueante=true` — ese es el momento en que
la fila debe empezar a participar del `EXCLUDE`. Si esa promoción se
implementa como un `UPDATE` directo sin pasar por
`bloquearUnidadEnTransaccion` (advisory lock) ni volver a intentar el
`INSERT`/`UPDATE` protegido por el `EXCLUDE` (hoy la fila ya existe con
`bloqueante=false`, así que un simple `UPDATE ... SET bloqueante=true` no
dispararía el `EXCLUDE` salvo que Postgres re-evalúe la condición del
índice parcial en el `UPDATE` — que sí lo hace, pero solo si se prueba
explícitamente), dos `INQUIRY` provisionales solapadas podrían confirmarse
ambas sin que ninguna fuera detectada como conflicto real.

**Corrección propuesta:** cuando se implemente, la función de promoción
debe ser un caso más de `packages/domain/src/aplicacion/reservas.ts`, reusar
`bloquearUnidadEnTransaccion` y verificarse con una prueba de concurrencia
real (mismo patrón de `concurrencia.test.ts`) antes de habilitarse en
producción.

**Estado:** gap confirmado (ausencia de código verificada), no es un
defecto activo porque la superficie no existe todavía.

---

## D-DSD-06 — Un evento con `DURATION` negativa/cero en un feed aborta el ciclo de import COMPLETO (los demás eventos válidos del mismo ciclo no se aplican)

**Severidad:** alto.

**Dónde:** `packages/adapters/src/ical/parser.ts:154-186`
(`calcularDtendDesdeDuration`, acepta sintácticamente `DURATION:-P1D`/`PT0S`
sin validar signo/magnitud) → `packages/adapters/src/sync/motor.ts:196`
(`canalesExportadosDeRango` construye `daterange($2,$3,'[)')` en SQL crudo
con el rango ya invertido, **antes** de que `esRangoValido`/
`requireRangoValido` (`packages/domain/src/aplicacion/reservas.ts:24-28`)
tenga oportunidad de rechazarlo) → el bucle principal de
`ejecutarCicloImport` (`motor.ts:283-377`) no tiene `try/catch` por evento.

**Reproducción:**
`tests/auditoria-2/dominio/duracionInvalidaRompeCicloImport.test.ts`
(embedded-postgres real, verificado independientemente por el auditor).

**Salida real:**

```
× los dos eventos válidos del feed deberían aplicarse aunque el evento intermedio tenga un rango invertido
  promise rejected "error: range lower bound must be less tha…" instead of resolving
Caused by: error: range lower bound must be less than or equal to range upper bound
  at canalesExportadosDeRango (packages/adapters/src/sync/motor.ts:196:16)
  at ejecutarCicloImport (packages/adapters/src/sync/motor.ts:292:31)
```

(SQLSTATE `22000`, `range_serialize` — Postgres rechaza construir el
`daterange` invertido antes de que el dominio pueda degradar solo ese
evento.)

**Impacto:** un feed externo con un solo `VEVENT` sintácticamente válido
según RFC 5545 pero con `DURATION` negativa (o cualquier otro dato que
produzca `dtend < dtstart`) tira una excepción no capturada que aborta
`ejecutarCicloImport` para **todo el ciclo**, incluyendo eventos
legítimos que venían antes o después en el mismo feed. Es una degradación
de disponibilidad disparable trivialmente por cualquier canal (o por un
feed comprometido/con bug), sin relación con el fallo de red/parseo que sí
maneja la cuarentena (D-005) — aquí el fetch y el parseo tuvieron éxito, el
fallo ocurre evento por evento y no está contenido.

**Corrección propuesta:** envolver el procesamiento de cada `VEVENT` del
bucle en `ejecutarCicloImport` en su propio `try/catch`; un evento
individual con rango inválido se descarta y se reporta (outbox de revisión,
igual que `revisar_uid_reciclado`), nunca aborta el resto del ciclo.
Adicionalmente, validar `esRangoValido` inmediatamente después de
`extraerRango`, antes de cualquier consulta SQL con ese rango.

**Estado:** confirmado (subauditoría paralela + verificación independiente
del coordinador), sin corregir.

---

## D-DSD-07 — `PATCH /backoffice/propiedades/:id` permite cambiar `zona_horaria` con reservas activas existentes, sin bloqueo ni advertencia

**Severidad:** alto.

**Dónde:** `apps/api/src/routes/backoffice/propiedades.ts:110-150` — el
`UPDATE ... SET zona_horaria = COALESCE($3, zona_horaria) ... WHERE id =
$1` (línea ~126) es incondicional: no verifica si existen
`ocupacion_unidad` activas en ninguna unidad de la propiedad antes de
aceptar el cambio.

**Reproducción:**
`tests/auditoria-2/dominio/zonaHorariaPropiedadCambioSinRecalculo.test.ts`
(prueba de integración HTTP contra la API real, verificado
independientemente por el auditor).

**Salida real:**

```
× debería rechazar (o advertir) el cambio de zona horaria cuando ya hay ocupacion_unidad activas
  expected 200 to be greater than or equal to 400
```

El `PATCH` respondió `200` con una reserva confirmada activa
(2027-03-10..2027-03-15) ya persistida. El propio test cuantifica el
impacto real: el mismo instante UTC `2027-03-12T04:30:00Z` resuelve a
`2027-03-11` bajo `America/New_York` (zona original de la propiedad) y a
`2027-03-12` bajo `Pacific/Auckland` (zona nueva) vía
`fechaLocalDesdeInstante` — un desplazamiento de una noche completa para
cualquier evento de canal que se resuelva después del cambio, aplicado
sobre una propiedad cuyas reservas ya existentes siguen fechadas según la
zona horaria anterior sin ninguna marca de "posiblemente obsoleta".

**Impacto:** D-013 exige `propiedad.zona_horaria` como IANA fija por
propiedad precisamente para evitar ambigüedad; este endpoint permite
invalidar esa premisa en caliente. Riesgo de dato falso al usuario
(fechas de check-in/check-out mostradas de forma inconsistente
antes/después del cambio) y de overbooking/pérdida de noche en la próxima
sincronización de cualquier canal cuyo feed use `DATE-TIME` (no `DATE`)
para esa unidad.

**Corrección propuesta:** el endpoint debe rechazar (o exigir confirmación
explícita + advertencia) el cambio de `zona_horaria` cuando existan
`ocupacion_unidad` con `estado <> 'cancelado'` en cualquier unidad de la
propiedad, o al menos requerir un flag explícito de "confirmo que entiendo
el impacto" y registrar el evento en auditoría con las reservas afectadas
listadas.

**Estado:** confirmado (subauditoría paralela + verificación independiente
del coordinador), sin corregir.

---

## D-DSD-08 — Multi-unidad: `Quantity`/`roomstosell` de Booking.com sin ningún mapeo en el modelo de datos (gap de diseño documentado, no oculto)

**Severidad:** medio (riesgo de diseño futuro, no defecto activo).

**Dónde:** verificado por ausencia — `grep` de `quantity|roomstosell|
room_type` sobre `packages/adapters/src/booking/`, `packages/domain/src/`,
`packages/db/`, y `apps/api/src/` no arroja ninguna coincidencia.
`packages/adapters/src/booking/adapter.ts` implementa solo un stub
(`CAPACIDADES_BOOKING_DIRECTO` con `availabilityPush:false`) por la pausa
del Connectivity Partner Program (D-011), ya documentada honestamente en
`docs/investigacion/RV04-booking-connectivity.md:44-46,84,105,119`.

**Impacto:** no hay ningún defecto ejecutable que reproducir hoy (el
adaptador no procesa disponibilidad real de Booking en absoluto). Pero el
modelo de datos (`unidad`/`propiedad`) tampoco tiene ningún concepto de
"N unidades físicas idénticas bajo un mismo room type" — si en el futuro
se conecta un channel manager certificado con `Quantity>1` (RV04-R-04),
no hay dónde mapearlo sin trabajo de esquema adicional. Vale la pena
dejarlo anotado ahora para que el diseño de esa fase lo contemple desde el
inicio, en vez de descubrirlo como sorpresa al conectar el primer channel
manager real.

**Estado:** gap de diseño confirmado (ausencia de código verificada), no
es un defecto activo porque la superficie no existe todavía.

---

## D-DSD-09 — `reconciliarCompleto` (detección de drift) nunca se invoca desde ningún camino de ejecución real fuera de recuperación de backup, y el comentario que dice lo contrario es falso

**Severidad:** alto.

**Dónde:** `packages/adapters/src/sync/reconciliacion.ts:56-67`
(`reconciliarCompleto`, función pura: compara UIDs activos internos contra
los presentes en el feed actual y devuelve `candidatosACancelarPorAusencia`
+ `drift`). `packages/db/backup/recuperacion.ts:18-20` documenta: "el
llamador real, `apps/api`, sí importa ambos y pasa `reconciliarCompleto`".

**Verificación (no requiere test nuevo, es un hecho negativo verificado por
búsqueda exhaustiva en todo el repo):**

```
$ grep -rn "reconciliarCompleto\|candidatosACancelarPorAusencia" packages/ apps/ --include="*.ts" | grep -v "\.test\.ts"
packages/adapters/src/index.ts:58:  reconciliarCompleto,          # solo el re-export del barrel
packages/adapters/src/sync/reconciliacion.ts:...                  # la propia definición
packages/db/backup/recuperacion.ts:20: * ... pasa `reconciliarCompleto`).   # solo un COMENTARIO

$ grep -rln "recuperarDesdeBackup\|reconciliarCompleto\|reconciliarFeed" apps/api/src --include="*.ts"
(sin resultados)

$ grep -rln "recuperarDesdeBackup\|reconciliarCompleto" scripts/ packages/db/test apps/ --include="*.ts" --include="*.mjs"
packages/db/test/integration/backup.test.ts
packages/db/test/backup/exportarRestaurar.test.ts
```

`reconciliarCompleto` (y la función que la orquesta,
`recuperarDesdeBackup`) **solo se ejercitan en pruebas**. No hay ninguna
ruta de `apps/api/src/routes/`, ningún worker de
`apps/api/src/workers/observabilidad/`, ni ningún script en `scripts/` que
la invoque con datos reales. El comentario de `recuperacion.ts:18-20` que
afirma "el llamador real, `apps/api`, sí importa ambos" es, verificado
contra el código actual, **falso** — no existe tal importación en
`apps/api/src` en absoluto.

**Impacto:** el mecanismo de detección de "drift" (RV07 §15, H-032) —
UIDs que el sistema cree activos pero que ya no aparecen en el feed más
reciente del canal, el escenario de "el canal eliminó silenciosamente una
reserva sin mandar CANCEL" que el propio diseño anticipa como riesgo real —
**no existe en el sistema en ejecución normal**. Ni siquiera en el único
lugar donde el código dice que sí está conectado (recuperación de backup)
hay evidencia de que `apps/api` realmente lo invoque. `ejecutarCicloImport`
(`packages/adapters/src/sync/motor.ts`) hace reconciliación puramente
incremental (evento por evento vía `resolverVersion`) y nunca compara el
conjunto completo de UIDs activos contra el feed — así que un drift
silencioso (reserva cancelada en el canal sin CANCEL explícito en el feed,
o de plano un UID que deja de aparecer) nunca se detecta ni se alerta en
ningún ciclo normal de sincronización.

**Corrección propuesta:** (1) corregir o eliminar el comentario falso en
`recuperacion.ts`; (2) implementar y conectar un job periódico real de
reconciliación completa (comparar el conjunto de `evento_canal_importado`
activos por canal/unidad contra el conjunto de UIDs del feed más reciente,
usando `reconciliarCompleto`, que ya existe y ya calcula correctamente los
candidatos) como parte del ciclo normal de sync, no solo del flujo de
recuperación de desastre; (3) los `candidatosACancelarPorAusencia` deben
alimentar una cola de revisión humana (nunca cancelación automática,
consistente con D-006), no perderse.

**Nota operativa adicional:** la ausencia no se limita a
`reconciliarCompleto` — `recuperarDesdeBackup` (el orquestador completo de
`packages/db/backup/recuperacion.ts`) tampoco tiene ningún invocador real:
`grep -rln "recuperarDesdeBackup\|restaurarBackupLogico\|exportarBackupLogico"
scripts/` no arroja resultados, y tampoco en `apps/api/src`. La lógica está
correctamente probada a nivel de librería
(`packages/db/test/backup/exportarRestaurar.test.ts`,
`packages/db/test/integration/backup.test.ts` — incluyendo que el `EXCLUDE`
sigue activo post-restore y que el gating de `sync.push_automatico` por
drift funciona), pero **no existe hoy ningún runbook ejecutable ni endpoint
de administración que dispare una recuperación real**: si ocurriera un
desastre que requiriera restaurar desde backup, un operador humano no
tiene ningún comando de este repo para ejecutar; tendría que escribir un
script ad-hoc bajo presión invocando directamente las funciones de
`packages/db/backup`.

**Estado:** confirmado por verificación de código (ausencia exhaustiva de
invocación en producción), sin corregir.

---

## D-DSD-10 — Falsa alerta "vacío inesperado" en canales que nunca tuvieron reservas (fatiga de alertas)

**Severidad:** medio.

**Dónde:** `packages/adapters/src/sync/motor.ts:263` —
`huboEventosActivosPreviamente: estadoPrevio.ultimaSincronizacionExitosaEn
!== null`. Este flag debería reflejar "hubo eventos ACTIVOS previamente"
(la condición que documenta `OpcionesCuarentena.huboEventosActivosPreviamente`
en `cuarentena.ts:45-49`), pero en realidad refleja "hubo ALGÚN ciclo
exitoso previo" — y un ciclo `exito_vacio` también fija
`ultimaSincronizacionExitosaEn` (`cuarentena.ts:103-108`).

**Reproducción:**
`tests/auditoria-2/dominio/cuarentenaVacioTrasPobladoYFalsoPositivo.test.ts`
(caso B; el caso A de control — poblado real → vacío real — pasó
correctamente, confirmando que el mecanismo SÍ funciona cuando corresponde).

**Salida real:**

```
× (caso B) un canal que NUNCA tuvo eventos y sigue vacío en un segundo ciclo no debería generar alerta
  expected { tipo: 'vacio_inesperado', motivo: '...' } to be null
```

**Impacto:** una unidad/canal que legítimamente nunca ha tenido reservas
(o que las tuvo, se vació, y sigue legítimamente vacía) genera una alerta
de "vacío inesperado" en cada ciclo subsecuente sin eventos — degrada la
señal real que D-005 quiere proteger (el caso que sí importa: un canal que
SÍ tenía reservas activas y se vació). Es fatiga de alertas, no pérdida de
datos ni overbooking.

**Corrección propuesta:** el flag debe derivarse de si hubo `bloqueosActivos
> 0` en el ciclo anterior (o de un contador explícito de eventos aplicados
acumulado), no de la mera existencia de `ultimaSincronizacionExitosaEn`.

**Estado:** confirmado (subauditoría paralela, verificado
independientemente por el coordinador), sin corregir.

---

## D-DSD-11 — Drift de reconciliación completa nunca se computa en el pipeline real (confirma y cuantifica D-DSD-09)

**Severidad:** alto.

**Dónde:** `packages/adapters/src/sync/motor.ts` — `persistirEstadoFeed`
se llama sin el 5º argumento `drift` (queda `undefined`, y la columna
`drift_ultima_reconciliacion_completa` conserva su valor anterior vía
`COALESCE` en el `UPSERT`, migración 0021/0064). Complementa D-DSD-09 (que
documenta la ausencia total de invocación de `reconciliarCompleto` en
código de producción) con una prueba de extremo a extremo contra el
pipeline real.

**Reproducción:**
`tests/auditoria-2/dominio/reconciliacionCompletaNuncaSeInvocaEnElPipelineReal.test.ts`
(embedded-postgres real; verificado independientemente por el coordinador).

**Salida real:**

```
× un UID que el canal deja de listar (sin CANCEL) permanece activo para siempre y el drift jamás se computa automáticamente
  expected +0 to be 1
```

Tras un ciclo donde un UID desaparece del feed sin `CANCEL` explícito,
`drift_ultima_reconciliacion_completa` permanece en `0`, aunque
`reconciliarCompleto` calculado de forma independiente con los mismos datos
sí detecta `drift=1`.

**Impacto:** viola RV07-R-06 ("DEBE exponer... drift detectado"). Un canal
que retira silenciosamente una reserva deja el calendario con una noche
bloqueada indefinidamente **sin que nadie se entere** — no es overbooking
(el efecto por defecto es seguro: la reserva no se cancela unilateralmente,
D-006 se respeta), pero sí es pérdida operativa/de ingreso invisible
(una unidad que podría estar disponible de nuevo sigue mostrándose ocupada
para siempre, sin ninguna señal que invite a un humano a revisarla).

**Estado:** confirmado, sin corregir. Ver D-DSD-09 para la corrección
propuesta (compartida).

---

## D-DSD-12 — Alerta de overbooking FALSA cuando se pierde el bookkeeping de versión entre el efecto de dominio y el registro en `evento_canal_importado`

**Severidad:** alto.

**Dónde:** `packages/adapters/src/sync/motor.ts` (rama "aplicar" → crear
reserva nueva): `crearReservaConfirmada` hace su propio `COMMIT` interno
(`packages/domain/src/aplicacion/reservas.ts`), y `upsertEventoImportado`
(el bookkeeping de `evento_canal_importado` que sostiene la idempotencia de
`resolverVersion`) es una escritura **separada y posterior**. Si el proceso
se interrumpe entre esas dos escrituras (o si por cualquier razón la fila
de bookkeeping se pierde/no se persiste), `resolverVersion(null, entrante)`
(`packages/domain/src/resolucionVersion.ts:59-61`) siempre devuelve
`"aplicar"` para ese UID en el siguiente ciclo, tratándolo como si nunca se
hubiera visto.

**Reproducción:**
`tests/auditoria-2/dominio/idempotenciaCrashEntreEfectoYBookkeepingSync.test.ts`
(embedded-postgres real; verificado independientemente por el coordinador).

**Salida real:**

```
× reintentar el mismo ciclo tras perder el bookkeeping de un UID ya aplicado NO debe duplicar el efecto ni generar una alerta de overbooking falsa
  expected 1 to be +0   // conflictosDetectados
```

Reprocesar el mismo UID tras perder el bookkeeping genera una segunda fila
`ocupacion_unidad` (`estado='conflicto_pendiente'`), una fila
`conflicto_calendario` (`tipo='overbooking_confirmado'`) y un evento
`alerta_overbooking` en `outbox_evento` — todo contra la misma reserva real,
que nunca estuvo en riesgo.

**Impacto:** dato falso al usuario — una alerta de "overbooking confirmado"
que no corresponde a ningún overbooking real, contaminando el panel de
conflictos y pudiendo disparar una acción operativa innecesaria (p. ej.
contactar al huésped por un "doble booking" inexistente). El `EXCLUDE` de
rango sí sigue protegiendo la noche en sí (no se pierde ni se duplica la
disponibilidad real) — el defecto es de señal/confianza en el sistema de
alertas, no de disponibilidad.

**Corrección propuesta:** escribir el efecto de dominio (`crearReservaConfirmada`/
`modificarFechasReserva`/`cancelarOcupacion`) y el `upsertEventoImportado`
correspondiente en la **misma transacción** (pasando el mismo `ejecutor` y
extendiendo las funciones de `aplicacion/reservas.ts` para aceptar el
bookkeeping de versión como parte de su propio `COMMIT`, o encapsulando
ambas llamadas bajo una transacción externa que englobe todo el ciclo por
evento).

**Estado:** confirmado, sin corregir.

---

## D-DSD-13 — `evaluarEstadoConexion` nunca reporta `"ical"`: toda conexión iCal sana se muestra como `"partner_pendiente"` (estado honesto invertido)

**Severidad:** medio.

**Dónde:** `packages/domain/src/channelAdapter.ts:19-26` declara
`EstadoConexionCanal` con `"ical"` como estado propio, explícitamente
documentado como "distinto de una integración API en
`sandbox`/`producción`". Pero `evaluarEstadoConexion` (líneas 67-81) nunca
lo devuelve: la primera rama que corta la evaluación es
`if (!evidencia.partnerAprobado) return "partner_pendiente"` — antes de
considerar si el tipo de conexión es iCal. Y `partner_aprobado` tiene
`DEFAULT false` (`packages/db/src/migrations/0020_cuenta_canal.ts:28`) y
nunca se establece explícitamente al crear una cuenta
`tipo_conexion='ical'` (`apps/api/src/routes/backoffice/cuentasCanal.ts`,
el `INSERT` no incluye esa columna).

**Reproducción:**
`tests/auditoria-2/dominio/estadoConexionIcalNuncaSeReporta.test.ts`
(prueba pura sobre la función de dominio).

**Salida real:**

```
× credenciales presentes, sync exitoso y reciente, tipo_conexion='ical' ...: se reporta como partner_pendiente, no como 'ical' ni 'produccion'
  expected 'partner_pendiente' to be 'ical'
```

**Impacto:** dirección opuesta al riesgo típico de "estado honesto" (nunca
mostrar `producción` sin evidencia) — aquí una integración iCal que
funciona exactamente como D-011 la diseñó ("iCal primero", latencia
documentada aceptada) se muestra en `GET /canales` como
`"partner_pendiente"`, que en la UI se lee como "bloqueado, a la espera de
aprobación externa". Confunde al operador (¿por qué mi integración sigue
'pendiente' si ya está sincronizando hace semanas?) y puede llevar a
gestionar innecesariamente una "aprobación de partner" que ni siquiera
aplica a esa vía de conectividad. No es un riesgo de overbooking, es un
defecto de honestidad del estado mostrado (D-017), en la dirección
conservadora.

**Corrección propuesta:** en `evaluarEstadoConexion`, cuando el tipo de
conexión sea iCal (habría que añadir esa evidencia a
`EvidenciaConexionCanal`, hoy no distingue tipo de conexión en absoluto),
evaluar `"ical"` vs. `"no_conectado"` según haya o no sincronización
exitosa reciente, sin pasar nunca por la rama de `partnerAprobado` (que
solo aplica a integraciones de API con partner).

**Estado:** confirmado, sin corregir.

---

## D-DSD-14 — Migración con `id` reutilizado y contenido distinto se salta en silencio: drift de esquema invisible

**Severidad:** crítico.

**Dónde:** `packages/db/src/runner/migrar.ts:30-59` (`aplicarMigraciones`).
El runner rastrea qué migraciones ya se aplicaron **solo por el string
`id`** en la tabla `schema_migrations`, sin ningún hash de contenido. El
linter estático `migrations-tooling` (`ordenColisiones.ts`, ya cubierto por
`ordenColisiones.test.ts`) detecta colisiones de `id` **como herramienta
separada de análisis del catálogo en memoria** — no se invoca desde
`aplicarMigraciones` en tiempo de ejecución.

**Reproducción:**
`tests/auditoria-2/dominio/migracionesIdReutilizadoContenidoDrift.test.ts`
(embedded-postgres real; verificado independientemente por el coordinador).

**Salida real:**

```
× aplica el primer `up` de un id, y SILENCIOSAMENTE nunca aplica el segundo `up` distinto para el mismo id en una corrida posterior
  expected null to be 'demo_drift_v2'
```

Se corrió `aplicarMigraciones` con un catálogo que incluía una migración
`id="demo_drift"` (crea `demo_drift_v1`), luego, en una corrida SEPARADA
posterior contra la MISMA base de datos, con un catálogo donde ese mismo
`id="demo_drift"` tiene un `up` **distinto** (crea `demo_drift_v2`) — el
runner no vuelve a ejecutar nada para ese `id` (ya está en
`schema_migrations`) y no reporta ninguna advertencia ni error;
`demo_drift_v2` nunca llega a existir.

**Impacto:** un `id` de migración reescrito por accidente (rebase/merge que
reescribe el contenido de una migración ya desplegada en algún ambiente,
copy-paste de un número de lote ya usado, resolución de conflicto de git
que preserva el `id` pero cambia el SQL) deja ese ambiente con un esquema
**permanentemente distinto** del código fuente actual, sin ninguna señal
de alerta — el próximo `npm run` de migraciones "tiene éxito" limpiamente.
Esto puede significar que un `EXCLUDE`, una política RLS, o una columna
CHECK que el código fuente actual asume que existe, en realidad nunca se
creó (o se creó con una definición vieja) en ese ambiente — cualquier
invariante de este mismo documento podría estar "arreglado en el código"
pero seguir roto en producción sin que nada lo detecte.

**Corrección propuesta:** `aplicarMigraciones` debe calcular y persistir un
hash del contenido SQL (`up`) de cada migración en `schema_migrations`
junto al `id`; al reaplicar el catálogo, si un `id` ya aplicado tiene un
hash distinto al persistido, debe **fallar fuerte** (nunca aplicar
silenciosamente ni ignorar), forzando intervención humana explícita.

**Estado:** confirmado, sin corregir. Es, junto con D-DSD-02/D-DSD-04, uno
de los hallazgos más graves de esta auditoría por su alcance: puede
enmascarar la ausencia silenciosa de CUALQUIER otra protección de este
documento en un ambiente real.

---

## D-DSD-15 — Race de idempotencia en `POST /statements/generar`: dos solicitudes concurrentes del mismo owner statement, una recibe un error de Postgres sin manejar

**Severidad:** alto.

**Dónde:** `apps/api/src/routes/finanzas.ts:291-401`
(`POST /statements/generar`). La transacción (`enTransaccion`, `BEGIN`
simple, sin `SELECT ... FOR UPDATE`, sin advisory lock, sin
`SERIALIZABLE`) lee la última versión (`SELECT version, hash_contenido ...
ORDER BY version DESC LIMIT 1`), decide `nuevaVersion = (anterior?.version
?? 0) + 1`, e inserta. La única protección real es el `UNIQUE(owner_id,
periodo_inicio, periodo_fin, version)` de
`packages/db/src/migrations/0052_owner_statement.ts:34`.

**Reproducción:**
`tests/auditoria-2/dominio/statementConcurrenciaMismoOwnerPeriodo.test.ts`
(embedded-postgres real, dos conexiones reales en paralelo con
`Promise.allSettled`; verificado independientemente por el coordinador).

**Salida real:**

```
EVIDENCIA rechazo concurrente (code/message): 23505 duplicate key value violates unique constraint "owner_statement_owner_id_periodo_inicio_periodo_fin_version_key"
× nunca corrompe los datos: como máximo una fila persiste para (owner, periodo, version=1)
  expected [ { status: 'rejected', ... } ] to have a length of +0 but got 1
```

**Impacto:** el dato nunca se corrompe (el `UNIQUE` garantiza como máximo
una fila por versión — el invariante de integridad de datos resiste), pero
una de las dos solicitudes concurrentes recibe una excepción `23505` sin
traducir, que se propagaría como un `500` genérico al cliente en vez del
comportamiento "gracioso" que el propio comentario de
`packages/domain/src/finanzas/statement.ts:17-23` promete ("el llamador...
decide... si debe crear una versión nueva o devolver la existente sin
duplicar"). Un doble clic en "generar statement" o un reintento de red
produce un error visible al usuario en vez de simplemente devolver el
statement ya generado.

**Corrección propuesta:** envolver el `INSERT` en un `ON CONFLICT
(owner_id, periodo_inicio, periodo_fin, version) DO NOTHING RETURNING id`
(o `SELECT` de recuperación tras capturar `23505`) para que la segunda
solicitud concurrente devuelva la fila ya creada por la primera en vez de
propagar el error; alternativamente, usar `pg_advisory_xact_lock` por
`(owner_id, periodo)` antes de leer la versión anterior, mismo patrón que
`bloquearUnidadEnTransaccion` en el dominio de calendario.

**Estado:** confirmado, sin corregir.

---

## Invariantes que resistieron (intentos fallidos)

- **`EXCLUDE USING gist` + advisory lock bajo concurrencia real**: se
  revisó `packages/db/test/integration/concurrencia.test.ts` (ya cubre dos
  `INSERT` concurrentes con dos conexiones reales) y se confirmó por
  lectura de código que **todas** las escrituras a `ocupacion_unidad` en
  todo el repo pasan por `packages/domain/src/aplicacion/reservas.ts`
  (verificado con `grep -rn "INSERT INTO ocupacion_unidad\|UPDATE
  ocupacion_unidad"` sobre `packages/` completo, excluyendo tests: solo 5
  ocurrencias, todas en ese único archivo). No se encontró ninguna ruta de
  limpieza (`packages/domain/src/limpieza/buffer.ts` solo calcula el rango,
  nunca toca BD directamente), mantenimiento, import de sync
  (`packages/adapters/src/sync/motor.ts` reusa `crearReservaConfirmada`/
  `modificarFechasReserva`/`cancelarOcupacion`), ni restauración de backup
  (que hace `TRUNCATE`+`INSERT` directo, pero solo contra una instancia
  aislada recién migrada, nunca contra el primario en caliente) que escriba
  `ocupacion_unidad` esquivando el advisory lock.
- **Cancelación no reabre indebidamente**: confirmado por lectura de
  `packages/domain/src/capas.ts` (`estaOcupada`/`razonDominante` calculan
  siempre por OR/precedencia sobre las filas activas restantes, nunca hay
  un paso explícito de "liberar" que se pueda olvidar) y por
  `apps/api/src/routes/unidades.ts:79-135` (el endpoint de calendario
  **reutiliza literalmente** esas mismas funciones de dominio en vez de
  reimplementar la lógica en SQL — comentario explícito en el código:
  "nunca una reimplementación paralela en SQL"). Ya cubierto además por
  `tests/adversarial/calendario/casos.test.ts` caso 5.
- **Idempotencia `(canal, unidad, UID)`**: `evento_canal_importado` tiene
  `UNIQUE (unidad_id, canal_id, uid_evento)` real a nivel de base de datos
  (`packages/db/src/migrations/0021_sincronizacion_canal.ts:34`), no solo
  disciplina de aplicación.
- **Esquema de `ocupacion_unidad`**: `CHECK` de rango no vacío,
  semiabierto `[)`, y coherencia `capa`/`razon` verificados en
  `packages/db/src/migrations/0005_ocupacion_unidad.ts` — coincide
  exactamente con BLUEPRINT §3.2.
- **Anti-eco de mismo canal (capa 1, UID propio)**: ya cubierto y en verde
  por `tests/adversarial/sync/casos.test.ts` ("ENTREGABLE VERIFICABLE").
- **DST no rompe el conteo de noches**:
  `tests/auditoria-2/dominio/dstCruceResistente.test.ts` (5/5 en verde,
  verificado independientemente por el coordinador) — `calcularNoches`/
  `nochesDelRango` cuentan correctamente 10 noches cruzando el
  spring-forward de `America/New_York` (2027-03-14) y 5 noches cruzando el
  fall-back de `Europe/Madrid` (2027-10-31, día de 25h), con offsets reales
  verificados vía `Temporal.ZonedDateTime`. `Temporal.PlainDate` cumple su
  diseño (D-013/RV17 §4): resta de fechas de calendario da siempre días
  enteros, sin ambigüedad de DST. `sonRangosContiguos` tampoco se confunde
  con solapamiento alrededor del cambio de hora.
- **Feed HTML disfrazado de iCal y feed truncado a mitad de un `VEVENT`**:
  `tests/auditoria-2/dominio/feedHtmlDisfrazadoYTruncadoAMitadDeVevent.test.ts`
  (2/2 en verde, verificado independientemente por el coordinador) — un
  `200 OK` con cuerpo HTML se clasifica correctamente como `fallo_parseo`
  (nunca como `exito_vacio`), preservando la reserva previa; un feed
  cortado a mitad del segundo `VEVENT` (un `CANCEL` truncado) se rechaza
  atómicamente (el parser valida balance `BEGIN`/`END`), sin aplicación
  parcial de ningún evento.
- **Atomicidad del worker de outbox multi-consumidor**: se investigó la
  hipótesis de que `outbox_evento.procesado_en` fuera una columna "muerta"
  engañosa junto a los ledgers por consumidor
  (`outbox_evento_consumido_observabilidad`/`_limpieza`); resultó ser un
  patrón intencional documentado en las migraciones 0035/0080 ("registro de
  progreso por consumidor"), y el efecto + registro de consumo sí ocurren
  en la misma transacción (`outboxWorker.ts`) — resiste el ataque de crash
  simulado entre efecto y ack **para este worker en particular** (nota: el
  bookkeeping de versión de sync, un mecanismo distinto, SÍ falla — ver
  D-DSD-12).
- **Umbral "3× el ciclo esperado del canal" (D-005)**: implementado como
  conteo fijo de 3 intentos en `motor.ts`, no como múltiplo del intervalo
  real de polling por canal — pero esto es una decisión de producto
  documentada explícitamente como pendiente de calibración
  (`cuarentena.ts`, `DECISIONES.md`), no una promesa incumplida.
- **`down` reversible, verificado por COMPORTAMIENTO (no solo por SQL)**:
  `tests/auditoria-2/dominio/migracionesDownReversibleComportamiento.test.ts`
  (3/3 en verde, verificado independientemente por el coordinador) — tras
  el `down` de `0013_auditoria_triggers`, un `INSERT` nuevo genuinamente ya
  no dispara auditoría (no solo se borró el trigger del catálogo); tras el
  `down` de `0015_rls_politicas`, el mismo rol `app_rv` real (sin
  `BYPASSRLS`) que antes no veía otro tenant ahora sí lo ve (RLS realmente
  desactivada, no solo las políticas); el `down` de `0005_ocupacion_unidad`
  no deja `EXCLUDE`/índice huérfano.
- **Backup/restore con capas cruzadas solapadas + RLS post-restore**:
  `tests/auditoria-2/dominio/backupRestoreCapaCruzadaYRlsPostRestore.test.ts`
  (3/3 en verde, verificado independientemente por el coordinador) — una
  reserva confirmada + un bloqueo de mantenimiento solapados (capa cruzada
  válida) exportan y restauran sin error; el `EXCLUDE` sigue rechazando un
  solape real post-restore (`23P01`); RLS con un rol real (`app_rv`, sin
  `BYPASSRLS`) sigue ocultando datos de otro tenant tras el restore.
- **Redondeo monetario y modelo de comisión Airbnb host-only vs. split**:
  `tests/auditoria-2/dominio/finanzasRedondeoYComisionCanal.test.ts` (7/7
  en verde, verificado independientemente por el coordinador) —
  `redondeo.ts` opera en centavos enteros + `BigInt`, sin drift de float
  (`0.1+0.2`, splits en basis points que suman exacto incluso en casos no
  triviales como 3333/3333/3334 bp); `calcularMovimientoReserva` distingue
  correctamente Airbnb host-only (`yaNetoDeComision:true`, sin restar la
  comisión dos veces) de un modelo split genérico para Booking/Vrbo.

---

## Calificación por rubro (0–10)

| Rubro | Nota | Justificación |
|---|---|---|
| Dominio (modelo, capas, EXCLUDE, estados) | 5/10 | El núcleo transaccional (`EXCLUDE` + advisory lock + centralización estricta de toda escritura a `ocupacion_unidad` en un único archivo) es genuinamente sólido y resistió todos los ataques de concurrencia/bypass intentados. Pero la promesa central de D-002 ("todo conflicto entre capas se alerta a un humano") está rota en la dirección más común de producción real (D-DSD-02, y la misma laguna en `modificarFechasReserva`) — un defecto en el corazón del producto, no en un borde. Nota positiva: en ningún caso se encontró una forma de perder o duplicar una noche a nivel de disponibilidad real (el `EXCLUDE` de rango siempre protegió eso); lo que falla es la capa de *alerta/visibilidad* sobre conflictos que sí ocurren. |
| Sincronización (anti-eco, cuarentena, reconciliación, versión, idempotencia) | 4/10 | El anti-eco de un solo canal (capa 1, UID propio) funciona y está probado; el caso cruzado entre canales que D-004 promete explícitamente no funciona (D-DSD-04) y se compone con D-DSD-02 en el peor caso. La resolución de versión tiene un hueco real y plausible sin `SEQUENCE` (D-DSD-03). La cuarentena en sí resiste bien (HTML disfrazado, feed truncado, feed vacío tras poblado real) pero genera falsos positivos de alerta (D-DSD-10) y, más grave, la reconciliación completa/detección de drift **no está conectada a ningún camino real de ejecución** (D-DSD-09/D-DSD-11) — una promesa de producto entera (RV07-R-06) que simplemente no corre nunca. La idempotencia del outbox de observabilidad es sólida, pero el bookkeeping de versión de sync no es atómico con el efecto de dominio (D-DSD-12), generando alertas de overbooking falsas. |
| Datos (fechas/TZ, multi-unidad, migraciones, backup, finanzas, estado honesto) | 5/10 | Los invariantes de datos con más superficie de prueba (redondeo monetario, comisión host-only vs. split, DST, backup/restore preservando `EXCLUDE`+RLS, `down` reversible por comportamiento real) resistieron limpiamente — es la parte mejor construida de este rubro. Pero se encontraron dos defectos serios y de alcance amplio: el resolutor de fecha con TZID (D-DSD-01) y, sobre todo, que el runner de migraciones puede dejar un ambiente con esquema divergido del código fuente **en silencio, sin ninguna señal** si un `id` se reutiliza con contenido distinto (D-DSD-14) — este último es sistémico: puede enmascarar la corrección de cualquier otro hallazgo de este documento en un ambiente donde ya se haya desplegado. Además, un evento operativo de alto impacto (cambio de zona horaria de una propiedad con reservas activas) se acepta sin ninguna advertencia (D-DSD-07), y el estado de conexión honesto tiene un hueco real aunque de bajo riesgo (D-DSD-13, `"ical"` nunca se reporta). |

**Nota metodológica sobre las notas anteriores:** son evaluaciones
cualitativas del auditor, no un promedio aritmético de hallazgos — pesan
más los defectos que rompen una promesa central del producto (D-002, D-004,
integridad de esquema) que los defectos de borde o de fatiga de alertas.
