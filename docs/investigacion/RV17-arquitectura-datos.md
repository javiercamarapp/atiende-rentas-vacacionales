# RV17 — Arquitectura y modelo de datos (Atiende Rentas Vacacionales)

Módulo de investigación de arquitectura para el calendario unificado multicanal.
Todas las afirmaciones externas están respaldadas en el ledger
`docs/fuentes/rv17-18-20.md` (sección "## RV17", referencias RV17-F-01 a
RV17-F-12), citadas inline entre corchetes. Fecha de consulta de todas las
fuentes: 2026-09-05.

**Nota metodológica breve:** este módulo usa como jerarquía de fuentes nivel 1
(según 00-PLAN.md §2.1 punto 1: "documentación oficial de API/partner
program... repositorios oficiales de SDK") la documentación oficial del motor
de persistencia elegido (PostgreSQL) y los patrones de arquitectura de
referencia con autoría identificable (Chris Richardson / microservices.io para
Transactional Outbox) — no las APIs de canal OTA (Airbnb/Booking/Vrbo), que son
objeto de RV03/RV04/RV05 y están explícitamente fuera del alcance de un módulo
de arquitectura/modelo de datos interno. Dos URLs de `debezium.io` se
reintentaron sin éxito (HTTP 403, ver §13.1); no se sustituyó ese contenido con
información de memoria.

**Principio rector del producto (no negociable, heredado del plan general):** el
calendario unificado **CIERRA disponibilidad entre canales** cuando hay una
reserva en cualquiera de ellos. El sistema **NUNCA cancela reservas ni contacta
huéspedes sin autorización humana explícita**. Ninguna decisión de este módulo
propone, ni siquiera como alternativa descartada sin marcar, una ruta que rompa
esta regla.

---

## 0. Resumen ejecutivo

El invariante central del producto —ninguna unidad puede tener dos reservas o
bloqueos que se solapen— se implementa mejor como una restricción de base de
datos, no como lógica de aplicación: un `EXCLUDE USING gist` sobre
`(unit_id WITH =, during WITH &&)`, posible gracias a la extensión `btree_gist`,
que permite combinar igualdad sobre `unit_id` con solapamiento de rango sobre
`during` en un único constraint verificado por PostgreSQL en cada `INSERT`/
`UPDATE` [RV17-F-01][RV17-F-02]. Modelar `during` como `daterange` (o
`tstzrange` si se necesita hora exacta de check-in/checkout) con bounds
semiabiertos `[in, out)` resuelve, por construcción, el caso de estancias
contiguas: un checkout el mismo día que un check-in en la misma unidad no es
solapamiento, porque `daterange` ya normaliza a esa forma canónica `[)`
[RV17-F-04]. Sobre esa base dura de integridad se apoyan: zonas horarias por
propiedad (no por servidor ni por anfitrión), un registro de eventos append-only
con un patrón outbox transaccional para no perder eventos de sincronización
entre el commit de BD y el envío al canal [RV17-F-06], adaptadores por canal con
capacidades declaradas honestamente (nunca simular sincronización que no existe),
colas con idempotencia y deduplicación de webhooks, RLS multi-tenant con
políticas verificadas contra código real ya en producción del proyecto hermano
[RV17-F-05][RV17-F-09], y auditoría de mutaciones. La decisión de stack se apoya
en un hallazgo medido en esta misma máquina: PGlite serializa concurrencia real
(1344ms vs 302ms) y no sirve para probar contención real del exclusion
constraint; `embedded-postgres` sí da Postgres real pero corre bajo Rosetta 2
aquí [RV17-F-07]. Se recomienda un backend Node/TS propio con RLS heredado del
patrón ya verificado en `atiende-restaurantes`, usando `embedded-postgres` para
pruebas de concurrencia real y PGlite para pruebas unitarias rápidas.

---

## 1. Modelo de dominio

### 1.1 Entidades y campos clave

| Entidad | Campos clave | Notas |
|---|---|---|
| `tenant` | `id`, `nombre`, `creado_en` | Unidad de aislamiento RLS de nivel superior. Puede representar un anfitrión individual o una empresa gestora. |
| `empresa_gestora` (PMC) | `id`, `tenant_id`, `nombre`, `rfc_o_id_fiscal` | Opcional: solo existe si el tenant es una empresa que administra propiedades de terceros (owners). Un tenant puede no tener empresa gestora (anfitrión que administra sus propias unidades). |
| `owner` | `id`, `tenant_id`, `empresa_gestora_id`, `nombre`, `contacto`, `porcentaje_o_esquema_comision` | Dueño de una o más unidades administradas por la empresa gestora. Ver §1.4 sobre datos mínimos. |
| `propiedad` | `id`, `tenant_id`, `nombre`, `direccion`, `pais`, `zona_horaria` (IANA, p. ej. `America/Mexico_City`) | La zona horaria vive AQUÍ, no en el servidor ni en el usuario — ver §4. |
| `unidad` (unit) | `id`, `propiedad_id`, `nombre_o_numero`, `owner_id` (nullable si no aplica), `capacidad`, `activa` | Es la entidad sobre la que corre el invariante de no solapamiento (§2). Una propiedad puede tener 1..N unidades (p. ej. un edificio con varios departamentos, o una sola casa = 1 unidad). |
| `canal` | `id`, `codigo` (`airbnb`, `booking`, `vrbo`, `directo`, ...), `nombre` | Catálogo estático de canales soportados. |
| `cuenta_canal` | `id`, `tenant_id`, `canal_id`, `credenciales_ref` (referencia a bóveda de secretos, nunca el secreto en claro), `estado_conexion` (ver §6) | Una cuenta de canal agrupa credenciales de un canal para un tenant (p. ej. una cuenta de partner de Airbnb). |
| `listing_canal` | `id`, `unidad_id`, `cuenta_canal_id`, `external_listing_id`, `activo` | Vincula una unidad interna con su representación externa en un canal específico. Una unidad puede tener 0..N listings (uno por canal). |
| `calendario` | (no es una tabla física separada, es la vista lógica compuesta por `noche_disponibilidad` + `reserva` + `bloqueo_manual` para una unidad) | Se documenta como concepto porque el producto lo expone como "el calendario", aunque a nivel de datos es una proyección, no una tabla independiente. |
| `noche_disponibilidad` (opcional, ver nota) | `unidad_id`, `fecha`, `estado_derivado` (`libre`/`ocupada`/`bloqueada`), `origen` | Tabla de PROYECCIÓN/caché por noche, útil para UI y consultas rápidas de "qué está libre". El estado real de verdad NUNCA vive aquí: vive en `reserva` y `bloqueo_manual`; esta tabla se reconstruye/materializa a partir de esas dos. Ver §2 sobre por qué el invariante no se aplica sobre esta tabla. |
| `reserva` | `id`, `unidad_id`, `during` (`daterange`/`tstzrange`, ver §2-§3), `canal_origen_id`, `external_reservation_id`, `estado` (`confirmada`, `cancelada_por_canal`, `modificada`), `huesped_id`, `creado_en`, `actualizado_en`, `version` | Entidad central del invariante. `estado` refleja lo que el canal reporta; el sistema NUNCA transiciona `estado` a `cancelada_por_canal` por decisión propia — solo refleja lo que el canal ya hizo. |
| `bloqueo_manual` | `id`, `unidad_id`, `during`, `razon` (texto libre), `capa` (`limpieza`, `mantenimiento`, `manual_anfitrion`, `regla_automatica`), `creado_por` (usuario o `sistema`), `creado_en` | Comparte el mismo invariante de no solapamiento que `reserva` sobre la misma unidad (ver §2: el `EXCLUDE` debe correr sobre una vista/tabla combinada, o sobre ambas tablas mediante un mecanismo unificado — se detalla la opción recomendada en §2.4). La `capa` permite distinguir un bloqueo de limpieza (generado por una tarea) de un bloqueo manual del anfitrión (decisión humana), sin mezclarlos semánticamente aunque ambos "cierren" el calendario. |
| `huesped_minimo` | `id`, `nombre`, `contacto_ofuscado_o_referencia`, `canal_origen_id` | Deliberadamente mínimo: NO es un CRM. Solo lo necesario para operar (identificar a quién corresponde una reserva, no historial de marketing, no perfil enriquecido). Ver §1.4. |
| `tarea_limpieza` | `id`, `unidad_id`, `reserva_id` (nullable), `bloqueo_manual_id` (nullable, si la tarea generó su propio bloqueo de capa `limpieza`), `estado` (`pendiente`, `en_progreso`, `completada`, `verificada`), `asignado_a`, `fecha_programada` | Vincula limpieza con la reserva que la origina (turnover) y opcionalmente con el bloqueo de calendario que la protege. |
| `statement` (liquidación al owner) | `id`, `owner_id`, `periodo_inicio`, `periodo_fin`, `total_bruto`, `comision_gestora`, `total_neto`, `estado` (`borrador`, `emitido`, `pagado`), `generado_en` | Solo aplica si existe `empresa_gestora`/`owner`. Se calcula a partir de `reserva` en el periodo, nunca al revés. |

### 1.2 Relaciones (resumen textual, ya que no se dispone de motor de diagramas gráficos en este documento)

```
tenant 1---0..1 empresa_gestora
tenant 1---N propiedad
empresa_gestora 1---N owner
propiedad 1---N unidad
owner 0..1---N unidad            (unidad.owner_id nullable: anfitrión directo no tiene owner)
tenant 1---N cuenta_canal
cuenta_canal 1---N listing_canal
unidad 1---N listing_canal        (0..1 por canal activo, ver invariante de unicidad en §6)
unidad 1---N reserva
unidad 1---N bloqueo_manual
reserva 1---1 huesped_minimo      (una reserva referencia un huésped mínimo; el mismo huésped puede repetirse en reservas distintas si el canal lo permite identificar)
reserva 1---0..N tarea_limpieza   (normalmente 1, pero se permite N por si se reprograma)
owner 1---N statement
statement N---1 periodo           (agregación calculada sobre reserva.during dentro del periodo)
```

### 1.3 Por qué `noche_disponibilidad` es una proyección, no la fuente de verdad

Si el invariante de no solapamiento se aplicara sobre una tabla de "una fila por
noche", el `EXCLUDE` tendría que prevenir una fila duplicada por `(unidad_id,
fecha)`, lo cual es un `UNIQUE` normal, no un exclusion constraint — y perdería
la ventaja de que el rango captura naturalmente la duración completa de una
estancia en una sola fila (mejor para volumen de escritura e índices; una
reserva de 10 noches es 1 fila en `reserva`, no 10 filas). La tabla
`noche_disponibilidad` puede seguir existiendo como caché de lectura para la UI
de calendario (pintar cada celda), regenerada por trigger o job desde `reserva`
+ `bloqueo_manual`, pero la fuente de verdad y el invariante duro viven en las
tablas de rango.

### 1.4 Huésped mínimo: qué NO se guarda

Siguiendo la regla de producto (nunca contactar huéspedes de forma autónoma) y
el principio de minimización de datos, `huesped_minimo` guarda solo lo que un
canal expone y lo que la operación necesita para identificar la reserva
(nombre, y una referencia de contacto si el canal la expone — sin asumir qué
campos expone cada canal, dado que RV03/RV04 son quienes documentan esas
capacidades reales, pendientes). Explícitamente NO se diseña: historial de
conversación completo, segmentación de marketing, ni perfil unificado
cross-reserva de "todas las estancias de esta persona" — eso sería un CRM, fuera
del alcance declarado por el producto.

---

## 2. Invariante central: no solapamiento por unidad, vía `EXCLUDE` + `btree_gist`

### 2.1 Qué garantiza un exclusion constraint

Según la documentación oficial: *"The EXCLUDE clause defines an exclusion
constraint, which guarantees that if any two rows are compared on the specified
column(s) or expression(s) using the specified operator(s), not all of these
comparisons will return TRUE... The operator(s) are required to be
commutative."* [RV17-F-01] [DATO]. Es decir, PostgreSQL evalúa el constraint
comparando CADA PAR de filas existentes/nuevas con los operadores declarados; si
alguna comparación da `TRUE` para todos los operadores simultáneamente, la
operación se rechaza. Esto es exactamente lo que se necesita: "no dos filas con
el mismo `unit_id` (`=`) Y rangos que se solapan (`&&`)".

### 2.2 Por qué se necesita `btree_gist`

El método de acceso soportado para `EXCLUDE` es GiST o SP-GiST (`"So in
practice the access method will always be GiST or SP-GiST"` [RV17-F-01] [DATO]); GIN
queda excluido porque el constraint requiere `amgettuple`. Pero GiST, de forma
nativa, no sabe indexar tipos "normales" como `uuid`/`integer`/`date` para el
operador de igualdad — para eso existe la extensión `btree_gist`, que
*"provides GiST index operator classes that implement B-tree equivalent
behavior"* para un conjunto amplio de tipos (incluye `date` y los tipos de
timestamp explícitamente) [RV17-F-02] [DATO]. La propia documentación de `btree_gist`
muestra el patrón de combinar dos operadores distintos en la misma cláusula
`EXCLUDE USING GIST`, con el ejemplo del zoológico: `EXCLUDE USING GIST (cage
WITH =, animal WITH <>)` [RV17-F-02] [DATO] — el mecanismo sintáctico (varios
`exclude_element WITH operator` separados por coma dentro de un mismo `EXCLUDE
USING gist(...)`) es el mismo que exige la sintaxis general documentada en
`CREATE TABLE` [RV17-F-01]. RV17 compone, a partir de ambos hechos verificados,
el constraint objetivo con `=` sobre `unit_id` y `&&` sobre el rango — esta
composición se declara explícitamente como tal (no como cita literal de un
ejemplo idéntico preexistente) en el ledger [RV17-F-02, ver nota de laguna].

### 2.3 SQL propuesto (a validar en una base de prueba antes de producción)

```sql
-- Requiere la extensión una sola vez por base de datos:
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reserva (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    unidad_id       uuid NOT NULL REFERENCES unidad(id),
    during          tstzrange NOT NULL,   -- o daterange, ver §3
    canal_origen_id uuid NOT NULL REFERENCES canal(id),
    external_reservation_id text,
    estado          text NOT NULL DEFAULT 'confirmada',
    huesped_id      uuid REFERENCES huesped_minimo(id),
    creado_en       timestamptz NOT NULL DEFAULT now(),
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    version         integer NOT NULL DEFAULT 1,

    -- Invariante central: ninguna unidad puede tener dos reservas
    -- cuyo rango se solape, sin importar el canal de origen.
    EXCLUDE USING gist (
        unidad_id WITH =,
        during    WITH &&
    ) WHERE (estado <> 'cancelada_por_canal')
);
```

La cláusula `WHERE (estado <> 'cancelada_por_canal')` es un `predicate` opcional
del `EXCLUDE` (soportado por la sintaxis general `EXCLUDE ... [ WHERE (
predicate ) ]` [RV17-F-01]) para que una reserva que el canal ya marcó como
cancelada no siga bloqueando el rango — pero esto NUNCA debe usarse para que el
propio sistema cancele una reserva; `estado` solo se actualiza reflejando lo que
el canal ya reportó (regla de producto, §0).

Para el caso de `bloqueo_manual` compartiendo el mismo invariante sobre la misma
unidad (una reserva y un bloqueo de limpieza no pueden solaparse tampoco), la
opción más simple y más fácil de razonar es una tabla única `ocupacion_unidad`
(con un `tipo` discriminador: `reserva` o `bloqueo`) que lleve el `EXCLUDE`, con
`reserva` y `bloqueo_manual` como tablas de detalle relacionadas 1 a 1 — evita
tener que sincronizar DOS exclusion constraints independientes (uno por tabla)
que no se "ven" entre sí (un `EXCLUDE` en `reserva` no impide que `bloqueo_manual`
tenga un rango solapado con una fila de `reserva`, porque son constraints
separados sobre tablas separadas). Esta decisión de "tabla única de ocupación
con discriminador" vs. "dos tablas + un tercer mecanismo de verificación
cruzada" se deja marcada como **RV17-R** más abajo por requerir una decisión de
producto sobre cómo se quiere modelar la capa (§1.1) de forma consultable.

**Nota de vocabulario (no bloqueante, añadida 2026-09-05 — ver `docs/auditoria-investigacion-1/contradicciones.md` #9).** El `tipo` discriminador de este párrafo (`reserva`/`bloqueo`, adoptado también por BLUEPRINT §3.2 y DECISIONES D-002 para el campo top-level de `ocupacion_unidad`) es un concepto distinto del campo `capa` de §1.1 (subtipo de `bloqueo_manual`: `limpieza`/`mantenimiento`/`manual_anfitrion`/`regla_automatica`) y también distinto de la "precedencia por capas" de `docs/investigacion/RV07-sincronizacion-overbooking.md` §7 (`RESERVA_CANAL > BLOQUEO_PROPIETARIO > MANTENIMIENTO > BUFFER_LIMPIEZA`). Las tres nociones son coherentes entre sí en comportamiento (ninguna contradice a otra), pero usan la palabra "capa" con significados distintos según el documento — un implementador debe leer las tres definiciones antes de asumir que "capa" significa lo mismo en todas partes.

### 2.4 Refuerzo con `SERIALIZABLE` para flujos de "leer disponibilidad, luego reservar"

El `EXCLUDE` es la garantía de integridad de datos definitiva: incluso si dos
requests concurrentes intentan insertar reservas solapadas, PostgreSQL rechaza
una de las dos con un error de constraint, sin importar el nivel de aislamiento.
Sin embargo, cualquier flujo aplicativo que primero consulte disponibilidad (p.
ej. "¿está libre del 10 al 15?") y luego, en un paso separado, decida insertar
la reserva, debe entender que entre la lectura y la escritura otra transacción
pudo haber cambiado el estado. La documentación de aislamiento `SERIALIZABLE`
dice explícitamente: *"applications using this level must be prepared to retry
transactions due to serialization failures"* y devuelve el error
`could not serialize access due to read/write dependencies among transactions`
(SQLSTATE `40001`) [RV17-F-03] [DATO]. RV17 recomienda que el flujo de creación de
reserva corra dentro de una transacción `SERIALIZABLE` y que el código de
aplicación implemente reintento automático ante `40001` — no como sustituto del
`EXCLUDE`, sino como capa adicional para que la lógica de negocio que depende de
lecturas previas (p. ej. "solo permite reservar si además cumple regla de
estancia mínima") no quede expuesta a condiciones de carrera que el constraint
por sí solo no cubre (el constraint protege el rango, no reglas de negocio
adicionales).

---

## 3. Estancias contiguas y semántica de bounds `[in, out)`

### 3.1 El problema

Una reserva A con checkout el 15 de septiembre y una reserva B con check-in el
mismo 15 de septiembre, en la misma unidad, deben coexistir sin error — es el
caso normal de "turnover el mismo día". Si el rango se modelara con bounds
inclusivos en ambos extremos (`[in, out]`), el 15 de septiembre pertenecería a
ambos rangos simultáneamente y el `EXCLUDE` lo rechazaría incorrectamente como
solapamiento.

### 3.2 Por qué `[in, out)` (semiabierto) resuelve esto por construcción

La documentación de range types es explícita sobre la notación de bounds:
*"an inclusive lower bound is represented by '[' while an exclusive lower bound
is represented by '('. Likewise, an inclusive upper bound is represented by ']',
while an exclusive upper bound is represented by ')'"* [RV17-F-04] [DATO]. Con
`during = [check_in, check_out)`, el 15 de septiembre PERTENECE al rango de la
reserva B (frontera inclusiva de entrada) pero NO pertenece al rango de la
reserva A (frontera exclusiva de salida) — los dos rangos son adyacentes, no
solapados, y el operador `&&` evalúa `FALSE` entre ellos.

### 3.3 `daterange` ya lo hace por defecto; `tstzrange` requiere especificarlo

Para los tipos discretos (`daterange`, `int4range`, `int8range`), PostgreSQL
normaliza automáticamente a la forma canónica: *"The built-in range types
int4range, int8range, and daterange all use a canonical form that includes the
lower bound and excludes the upper bound; that is, '[)'"* [RV17-F-04] [DATO]. Esto
significa que si el sistema solo necesita granularidad de día completo (sin
hora exacta de check-in/checkout), `daterange` es la opción más segura: incluso
si alguien construyera el rango con bounds distintos por error, PostgreSQL lo
normaliza a `[)` automáticamente.

Para `tstzrange` (necesario si el negocio quiere modelar la hora exacta de
check-in/checkout, p. ej. "check-in no antes de las 15:00 hora de la
propiedad"), `tstzrange` es un tipo CONTINUO, no discreto, y la documentación no
describe la misma normalización automática de bounds que para los tipos
discretos — el comportamiento por defecto del constructor de dos argumentos SÍ
es `[)` (*"The two-argument form constructs a range in standard form (lower
bound inclusive, upper bound exclusive)"* [RV17-F-04] [DATO]), y el constructor de tres
argumentos asume `'[)'` si se omite el tercero (*"If the third argument is
omitted, '[)' is assumed"* [RV17-F-04] [DATO]), pero NO hay garantía de canonicalización
forzada si alguien construye el literal manualmente con otros bounds (p. ej.
escribiendo el rango como texto con `(` en vez de `[`). **Implicación de
requisito:** si se usa `tstzrange`, la aplicación (o un `CHECK` adicional) debe
forzar siempre `tstzrange(check_in, check_out, '[)')` explícitamente en cada
inserción, en vez de confiar en un default implícito — ver RV17-R-03.

---

## 4. Zonas horarias por propiedad

### 4.1 El problema

"Check-in hoy a las 3pm" depende de dónde está la propiedad, no de dónde está
el servidor (que puede correr en cualquier región de nube) ni de dónde está el
anfitrión o el huésped (que pueden estar en zonas horarias distintas a la de la
unidad). Una propiedad en Cancún y una en Madrid gestionadas por el mismo tenant
tienen "las 3pm de hoy" en instantes UTC completamente distintos.

### 4.2 Diseño: `propiedad.zona_horaria` + `timestamptz`

`propiedad` almacena una zona horaria IANA (`America/Cancun`,
`Europe/Madrid`, etc.), NUNCA un offset fijo (los offsets cambian con horario de
verano en muchos países; la zona IANA captura las reglas de transición
correctamente, mientras que un offset fijo se desincroniza dos veces al año en
países con horario de verano). Cuando se necesita hora exacta (`tstzrange`),
`check_in`/`check_out` se guardan como `timestamptz` (instante absoluto en UTC
internamente), y la conversión a "hora local de la propiedad" ocurre siempre EN
LECTURA, aplicando `propiedad.zona_horaria` — nunca se guarda ya convertido a
hora local en la base de datos.

### 4.3 Qué falla si se usa `timestamp` (sin zona) en vez de `timestamptz`

Un `timestamp without time zone` no lleva consigo la información de en qué zona
se originó ese valor — es simplemente una fecha-hora "de pared" ambigua. Si el
servidor de aplicación corre en una región distinta a la de la propiedad (o
simplemente cambia de proveedor de nube), la interpretación de ese valor
almacenado puede volverse incorrecta silenciosamente: un valor `2026-09-15
15:00:00` guardado sin zona no dice si esa hora es en Cancún, en Madrid, o en la
zona del servidor que lo escribió. Además, dos filas con el mismo valor
`timestamp` pero originadas en propiedades de zonas horarias distintas
representan instantes absolutos distintos, pero se comparan como si fueran
"iguales" bit a bit — lo cual rompe cualquier cálculo cross-propiedad (p. ej. un
reporte consolidado de check-ins de hoy en todas las propiedades del tenant)
salvo que la aplicación reconstruya manualmente, en cada consulta, a qué zona
pertenece cada fila — trabajo que `timestamptz` + `propiedad.zona_horaria` hace
correctamente por diseño, delegando la aritmética de zonas al motor.

### 4.4 Alternativa: `date` + `zona_horaria` de la propiedad para night-based logic

Si el negocio no necesita hora exacta (solo "noches" de calendario, que es el
modelo dominante en hospedaje: una reserva ocupa las noches del 10 al 14, sin
importar la hora exacta de check-in), `daterange` sobre `date` evita el problema
de zonas horarias por completo para el invariante de ocupación (una fecha es
una fecha, sin ambigüedad de instante). La zona horaria de la propiedad sigue
siendo necesaria para OTRAS decisiones (p. ej. "¿ya pasó la hora de check-in de
hoy para disparar un recordatorio de limpieza?"), pero no contamina el modelo
de rango de ocupación. RV17 recomienda `daterange` como default para el
invariante de ocupación, y reservar `tstzrange`/`timestamptz` para entidades
donde la hora exacta sea un requisito de negocio explícito (p. ej. una tabla de
eventos de check-in real capturado, distinta de la reserva).

---

## 5. Registro de eventos y outbox transaccional

### 5.1 Event sourcing ligero por agregado

Se propone una tabla append-only `reservation_events` (por agregado `reserva`):

```sql
CREATE TABLE reservation_events (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reserva_id      uuid NOT NULL REFERENCES reserva(id),
    tipo_evento     text NOT NULL,      -- 'creada', 'modificada', 'cancelada_por_canal', ...
    payload         jsonb NOT NULL,
    ocurrido_en     timestamptz NOT NULL DEFAULT now(),
    origen          text NOT NULL       -- 'webhook_airbnb', 'poll_booking', 'manual_anfitrion', ...
);
-- Nunca UPDATE ni DELETE sobre esta tabla; es append-only por diseño de aplicación
-- (reforzable con un trigger que rechace UPDATE/DELETE si se requiere garantía a nivel de BD).
```

Esto da trazabilidad completa de "qué pasó y cuándo" sin necesitar reconstruir
el estado actual solo desde eventos (a diferencia de un event sourcing puro): el
estado actual sigue viviendo en `reserva` (tabla mutable, con `version` para
optimistic locking), y `reservation_events` es el historial auditable en
paralelo — un híbrido más simple de operar que event sourcing puro, adecuado
para un dominio donde la mayoría de las lecturas necesitan el estado actual, no
el historial completo.

### 5.2 Por qué hace falta un outbox transaccional para la sincronización con canales

El problema concreto: cuando se crea/modifica una reserva, el sistema necesita
(a) confirmar el cambio en la base de datos Y (b) encolar un mensaje para
sincronizar disponibilidad hacia los otros canales (cerrar esas noches en
Booking si la reserva vino de Airbnb, por ejemplo). Si estos dos pasos son
independientes —primero el commit de BD, luego una llamada a una cola de
mensajes—, existe una ventana real donde el proceso puede morir DESPUÉS del
commit pero ANTES de encolar el mensaje, perdiendo silenciosamente el evento de
sincronización (el canal nunca se entera de que debía cerrar esas noches:
riesgo directo de overbooking, justo lo que el producto existe para evitar).

La literatura de arquitectura de microservicios documenta este problema
explícitamente: *"How to atomically update the database and send messages to a
message broker?"*, con la solución de que *"the service that sends the message
[should] first store the message in the database as part of the transaction
that updates the business entities. A separate process then sends the messages
to the message broker"* [RV17-F-06] [DATO]. Aplicado a RV17:

```sql
CREATE TABLE sync_outbox (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agregado_tipo   text NOT NULL,        -- 'reserva'
    agregado_id     uuid NOT NULL,
    tipo_evento     text NOT NULL,        -- 'cerrar_disponibilidad', 'liberar_disponibilidad'
    payload         jsonb NOT NULL,
    canal_destino_id uuid REFERENCES canal(id),  -- NULL = todos los canales excepto el de origen
    creado_en       timestamptz NOT NULL DEFAULT now(),
    procesado_en    timestamptz,          -- NULL = pendiente
    intentos        integer NOT NULL DEFAULT 0
);

-- En la MISMA transacción que el INSERT/UPDATE de `reserva`:
BEGIN;
  INSERT INTO reserva (...) VALUES (...);
  INSERT INTO reservation_events (reserva_id, tipo_evento, payload, origen) VALUES (...);
  INSERT INTO sync_outbox (agregado_tipo, agregado_id, tipo_evento, payload) VALUES ('reserva', ..., 'cerrar_disponibilidad', ...);
COMMIT;
```

Un worker separado ("message relay" en la terminología de la fuente [RV17-F-06])
lee `sync_outbox WHERE procesado_en IS NULL` (idealmente con `SELECT ... FOR
UPDATE SKIP LOCKED`, cuya documentación oficial precisa: *"With SKIP LOCKED,
any selected rows that cannot be immediately locked are skipped"* y advierte
que *"skipping locked rows provides an inconsistent view of the data, so this
is not suitable for general purpose work, but can be used to avoid lock
contention with multiple consumers accessing a queue-like table"* [RV17-F-10]
[DATO] — exactamente el caso de uso de `sync_outbox` como cola-tabla con varios
workers concurrentes) para permitir varios workers concurrentes sin duplicar
trabajo, llama al adaptador del canal correspondiente, y marca `procesado_en`
solo si la llamada tuvo éxito — si el proceso muere en cualquier punto antes de
marcar `procesado_en`, el mensaje sigue pendiente en la tabla y será reintentado,
nunca se pierde. **No se investigó ni se asume Debezium/CDC como mecanismo de
outbox** — dos URLs de debezium.io fallaron con HTTP 403 en esta sesión (ver
Lagunas); el diseño aquí propuesto usa un worker de polling propio, que es
suficiente para el volumen esperado de un sistema de rentas vacacionales
(órdenes de magnitud menor que un e-commerce de alto tráfico) y no depende de
infraestructura CDC adicional.

---

## 6. Adaptadores por canal con capabilities y estado de conexión honesto

### 6.1 Interfaz interna de adaptador (diseño, no una API externa real)

```ts
interface ChannelCapabilities {
  availabilityPush: boolean;   // puede EMPUJAR cierres de disponibilidad al canal
  ratesPush: boolean;          // puede empujar tarifas
  reservationsPull: boolean;   // puede LEER reservas del canal (webhook o polling)
  icalImportExport: boolean;   // soporta el modelo iCal (pull, ver limitaciones de latencia en RV03)
  messaging: boolean;          // puede enviar/recibir mensajes con huéspedes vía el canal
}

type EstadoConexion =
  | "no_conectado"        // sin credenciales configuradas
  | "bloqueado_por_partner" // credenciales existen pero el canal no aprobó/activó el acceso
  | "sandbox"              // conectado solo a un entorno de pruebas del canal
  | "produccion";          // conectado y sincronizando datos reales

interface ChannelAdapter {
  readonly channelCode: string;         // 'airbnb', 'booking', ...
  readonly capabilities: ChannelCapabilities;
  getConnectionState(cuentaCanalId: string): Promise<EstadoConexion>;
  pushAvailabilityClose(unidadId: string, during: DateRange): Promise<SyncResult>;
  pullReservations(cuentaCanalId: string, since: Date): Promise<ExternalReservation[]>;
  // ... el resto de métodos solo si `capabilities` los declara soportados
}
```

### 6.2 Honestidad del estado de conexión

Regla de diseño explícita: `getConnectionState()` NUNCA debe devolver
`"produccion"` a menos que exista evidencia verificable de que el canal está
efectivamente recibiendo/enviando datos reales (p. ej. una respuesta exitosa
reciente de una llamada real, no solo la presencia de credenciales guardadas).
Un adaptador que tiene credenciales pero cuyo acceso de partner está pendiente
de aprobación debe reportar `"bloqueado_por_partner"`, no `"sandbox"` ni
`"produccion"` — esto es directamente relevante porque las capacidades reales
de las APIs de Airbnb y Booking (qué scopes existen, si hay webhooks
verificados oficialmente, qué requiere aprobación) son objeto de los módulos
RV03/RV04 de este mismo proyecto, no de RV17: **según RV03/RV04 (pendiente)**
para el detalle exacto de qué constituye "producción" en cada canal. Lo que
RV17 fija es la INTERFAZ y la regla de negocio de nunca mentir sobre el estado.

### 6.3 Unicidad de listing activo por unidad y canal

Se recomienda un constraint de unicidad parcial:

```sql
CREATE UNIQUE INDEX listing_canal_unico_activo
  ON listing_canal (unidad_id, cuenta_canal_id)
  WHERE activo;
```

Esto evita que una unidad tenga dos listings activos simultáneos en la misma
cuenta de canal (una fuente de ambigüedad sobre "a cuál external_listing_id le
llegó este evento").

---

## 7. Workers, colas, idempotencia, reintentos, deduplicación

### 7.1 Idempotencia de escritura

Toda escritura derivada de un evento externo (webhook o polling) debe ser
idempotente por una clave compuesta `(canal_id, external_reservation_id,
external_version_o_hash_de_payload)`, siguiendo el mismo principio del patrón
`pms_write_job` documentado como referencia en el proyecto hermano de Hoteles
[RV17-F-08] (adaptado aquí a `sync_write_job` o equivalente para el dominio de
canales OTA): un `UNIQUE` sobre esa clave compuesta, con `INSERT ... ON CONFLICT
DO NOTHING` (o `DO UPDATE` si el nuevo payload debe reemplazar al anterior).
La documentación oficial define la cláusula así: *"The optional ON CONFLICT
clause specifies an alternative action to raising a unique violation or
exclusion constraint violation error... ON CONFLICT DO NOTHING simply avoids
inserting a row as its alternative action. ON CONFLICT DO UPDATE updates the
existing row that conflicts with the row proposed for insertion as its
alternative action"* [RV17-F-12] [DATO]. Esto hace que reprocesar el mismo
webhook dos veces (reintentos del propio canal, reintentos del proceso de
consumo, o un replay manual de depuración) no duplique ni corrompa el estado.

### 7.2 Deduplicación de webhooks entrantes

Se recomienda una tabla `webhook_recibido (canal_id, webhook_id_externo,
recibido_en, payload_hash)` con `UNIQUE (canal_id, webhook_id_externo)` (si el
canal expone un ID de evento único) o `UNIQUE (canal_id, payload_hash)` como
respaldo si no lo expone, para descartar reintentos exactos ANTES de procesar el
efecto de negocio — capa adicional a la idempotencia de escritura de §7.1, útil
para no siquiera invocar la lógica de negocio en un duplicado exacto.

### 7.3 Reintentos con backoff

Tanto el worker de `sync_outbox` (§5.2) como el consumidor de webhooks deben
reintentar con backoff exponencial acotado (p. ej. 1s, 2s, 4s, ... hasta un
máximo, luego mover a una cola de "muertos"/dead-letter para revisión humana en
vez de reintentar indefinidamente). Un contador `intentos` por fila (ya incluido
en el `sync_outbox` de §5.2) permite implementar esto sin infraestructura
adicional.

### 7.4 Concurrencia acotada por unidad/propiedad

Siguiendo el patrón de referencia citado (concurrencia 1 por propiedad en el
`pms_write_job` de Hoteles [RV17-F-08]), se recomienda que los workers que
procesan eventos de sincronización adquieran un `pg_advisory_xact_lock` sobre
`unidad_id` (o `propiedad_id`, según el patrón de contención observado) antes
de aplicar el efecto de negocio. La documentación oficial describe el
mecanismo general: *"PostgreSQL provides a means for creating locks that have
application-defined meanings. These are called advisory locks, because the
system does not enforce their use — it is up to the application to use them
correctly"* [RV17-F-11] [DATO], y sobre el alcance transaccional específico de
`pg_advisory_xact_lock`: *"Transaction-level lock requests... behave more like
regular lock requests: they are automatically released at the end of the
transaction, and there is no explicit unlock operation. This behavior is often
more convenient than the session-level behavior for short-term usage of an
advisory lock"* [RV17-F-11] [DATO] — coherente con su uso aquí (adquirido y
liberado dentro de la misma transacción que procesa un evento de
sincronización, sin necesidad de liberación manual explícita). Esto evita que
dos eventos concurrentes sobre la misma unidad se entrelacen de forma
inconsistente — complementario, no sustituto, del `EXCLUDE` de §2 (el lock
ordena la ejecución; el constraint garantiza el resultado final incluso si el
orden de ejecución fallara).

---

## 8. Multitenancy: RLS y auditoría

### 8.1 Patrón RLS recomendado

La documentación oficial establece la mecánica base: *"When row security is
enabled on a table (with ALTER TABLE ... ENABLE ROW LEVEL SECURITY), all normal
access to the table for selecting rows or modifying rows must be allowed by a
row security policy... If no policy exists for the table, a default-deny policy
is used"* [RV17-F-05] [DATO]. Es decir, activar RLS sin ninguna política deja la tabla
ilegible/inescribible por defecto — comportamiento seguro por diseño (fail
closed).

Sobre quién queda sujeto a las políticas: *"Table owners normally bypass row
security as well, though a table owner can choose to be subject to row security
with ALTER TABLE ... FORCE ROW LEVEL SECURITY"* [RV17-F-05] [DATO]. **Implicación de
requisito directa:** si el rol de conexión que usa el backend de aplicación es
también el dueño de las tablas (patrón común si las migraciones las corre el
mismo rol), RLS NO se aplicará a menos que se ejecute también `FORCE ROW LEVEL
SECURITY` — un error de configuración fácil de cometer y grave (fuga completa
de aislamiento entre tenants).

Sobre el patrón de política en sí, la documentación muestra el ejemplo mínimo
`CREATE POLICY user_policy ON users USING (user_name = current_user);` con
`WITH CHECK` implícito idéntico al `USING` cuando no se especifica por separado
[RV17-F-05] [DATO]. El código real y ya en producción del proyecto hermano
`atiende-restaurantes` usa un patrón más elaborado, verificado directamente en
esta sesión leyendo la migración `20260904050000_enterprise_tenant_isolation.sql`
[RV17-F-09]: una función `security definer` que verifica membresía
(`is_restaurant_staff(auth.uid(), tenant_id)`), referenciada en `USING`/`WITH
CHECK` de cada política:

```sql
create or replace function public.is_tenant_member(_user uuid, _tenant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tenant_staff
    where user_id = _user and tenant_id = _tenant
  )
$$;

alter table reserva enable row level security;
alter table reserva force row level security;  -- necesario si el rol de app es dueño de la tabla

create policy "tenant_staff_select_reserva" on reserva
  for select to authenticated
  using (public.is_tenant_member(auth.uid(), tenant_id));

create policy "tenant_staff_write_reserva" on reserva
  for all to authenticated
  using (public.is_tenant_member(auth.uid(), tenant_id))
  with check (public.is_tenant_member(auth.uid(), tenant_id));
```

Nota importante de discrepancia detectada entre dos fuentes locales: el patrón
de Hoteles [RV17-F-08] describe una función `current_tenant_ids()` sin
parámetros (probablemente derivando el tenant del JWT/sesión internamente),
mientras que el código REAL de Restaurantes [RV17-F-09] usa una función
PARAMETRIZADA de comparación de membresía. RV17 recomienda seguir el patrón
verificado en código real (RV17-F-09) por ser evidencia de mayor confianza (código
en producción, no solo prosa descriptiva) cuando ambos difieran — ver
RV17-R-06.

### 8.2 Auditoría de mutaciones

Tabla `audit_log (id, tabla, fila_id, operacion ['insert'|'update'|'delete'],
actor_user_id, tenant_id, valores_previos jsonb, valores_nuevos jsonb,
ocurrido_en timestamptz)`, poblada por triggers `AFTER INSERT OR UPDATE OR
DELETE` en las tablas sensibles (`reserva`, `bloqueo_manual`, `statement`,
`cuenta_canal`). Esto responde "quién cambió qué y cuándo" de forma
independiente del `reservation_events` de §5.1 (que es específico del agregado
`reserva` y pensado para reconstrucción de negocio, no para auditoría de
seguridad genérica sobre cualquier tabla).

---

## 9. API interna (diseño a alto nivel)

Se recomienda una API interna organizada por agregados (no por tabla cruda):
`POST /reservas`, `POST /bloqueos`, `GET /unidades/:id/calendario`, `POST
/canales/:id/sync` (dispara reconciliación manual), todas devolviendo errores
de dominio explícitos (p. ej. `409 unidad_no_disponible` cuando el `EXCLUDE`
rechaza la escritura, mapeado desde el código de error de PostgreSQL, no un
`500` genérico). El framework HTTP concreto no es una decisión de este módulo;
candidatos evaluados en la sección de stack (§10) incluyen Hono y Fastify, ambos
ya verificados como resolubles vía npm en esta máquina [RV17-F-07], coherentes
con un backend Node/TS.

---

## 10. Decisión de stack

### 10.1 Verificación de herramientas en esta máquina (corrida en esta sesión)

```
$ which docker supabase psql node npm
docker not found
supabase not found
psql not found
/opt/homebrew/bin/node
/opt/homebrew/bin/npm
$ node --version
v25.6.1
```

Esto coincide exactamente con lo ya reportado en el documento de referencia de
Hoteles [RV17-F-07]: sin Docker, sin Supabase CLI global, sin `psql` del
sistema; Node v25.6.1 disponible.

### 10.2 Opciones de stack

**Opción A — Backend Node/TS propio + RLS heredado de Restaurantes (recomendada)**

- Persistencia: `embedded-postgres` (Postgres 18.4 real) para pruebas de
  integración/concurrencia, PGlite para pruebas unitarias rápidas de lógica de
  negocio y RLS sin necesidad de contención real [RV17-F-07].
- Backend: Hono o Fastify (Node/TS), JWT propio (`jose`) emitiendo los mismos
  nombres de claim que ya consumen las políticas RLS reales de Restaurantes
  (`auth.uid()`-equivalente vía claim de `sub`), para poder reutilizar 1:1 el
  patrón de función `security definer` ya verificado en producción
  [RV17-F-09].
- Migraciones: archivos `.sql` versionados a mano, usando `supabase migration
  new` únicamente como generador de nombre/plantilla (funciona sin Docker,
  confirmado en [RV17-F-07]); runner propio o `node-pg-migrate` para aplicarlos
  en orden contra ambos motores de persistencia.
- Pruebas: Vitest + PGlite para unitarias/RLS; Vitest/scripts Node +
  `embedded-postgres` con clientes `pg` concurrentes para validar el `EXCLUDE`
  bajo contención real (crítico: PGlite NO sirve para esto, ver §10.3).
- Pros: máxima reutilización de patrones ya probados en el ecosistema
  (Restaurantes); no depende de Docker; permite validar concurrencia real del
  invariante central antes de tener infraestructura de producción.
- Contras: no reproduce el contrato HTTP exacto de Supabase (PostgREST/GoTrue)
  — si el negocio eventualmente exige paridad total con ese contrato, es
  integración pendiente que requiere Docker [RV17-F-07].

**Opción B — Supabase real (self-hosted o proyecto remoto) desde el inicio**

- Pros: PostgREST + GoTrue + Edge Functions listos, coherente 100% con el
  patrón de `atiende-restaurantes` (Vite+React+TS+shadcn+Supabase/Postgres+RLS+
  Edge Functions Deno).
- Contras: `supabase start`, `db diff` y `gen types` requieren Docker
  internamente incluso apuntando a un Postgres externo real — confirmado con
  errores explícitos de la CLI 2.116.0 en esta máquina [RV17-F-07]; no hay
  Docker instalado aquí. Viable solo apuntando a un proyecto Supabase remoto
  real desde el día uno (ya no es "desarrollo local sin Docker").

**Opción C — Híbrido: desarrollo local con Opción A, despliegue final sobre Supabase remoto**

- Backend Node/TS propio durante desarrollo/pruebas locales (Opción A), pero el
  esquema SQL y las políticas RLS se escriben desde el inicio para ser
  compatibles con Supabase (mismos nombres de función, misma convención de
  claims), de modo que migrar a PostgREST/GoTrue real en un proyecto Supabase
  remoto al final del ciclo de desarrollo sea un cambio de capa HTTP/Auth, no
  de esquema de datos.
- Pros: no bloquea el desarrollo por ausencia de Docker, pero no cierra la
  puerta a converger con el mismo stack que `atiende-restaurantes` en
  producción.
- Contras: exige disciplina de escribir SQL "compatible con Supabase" (evitar
  extensiones no verificadas en PGlite si se quiere mantener velocidad de
  pruebas unitarias — `pgcrypto` como `CREATE EXTENSION` explícito falló en
  PGlite aunque `gen_random_uuid()` nativo funcionó [RV17-F-07]) sin haber
  verificado ese contrato completo en esta máquina.

### 10.3 Recomendación y supuestos

**Recomendación: Opción C** (híbrido). Supuestos declarados:

1. Se asume que el equipo eventualmente desplegará sobre Supabase (o un
   Postgres administrado equivalente con soporte de extensiones estándar),
   dado que es el patrón ya en producción del proyecto hermano
   `atiende-restaurantes` — no se confirmó una decisión de negocio explícita
   de mantener un backend Node/TS propio en producción permanentemente.
2. Se asume que el volumen de datos/tráfico de un sistema de rentas
   vacacionales (decenas a cientos de unidades por tenant, no millones de
   filas por segundo) no exige, en el horizonte cubierto por este módulo, una
   solución de outbox basada en CDC (Debezium) — ver laguna correspondiente en
   §11, ya que esa fuente no pudo verificarse en esta sesión.
3. Se asume que `embedded-postgres` bajo Rosetta 2 en esta máquina es
   suficientemente rápido para el ciclo de pruebas de integración durante
   desarrollo; si esto se vuelve un cuello de botella medible, investigar una
   build arm64 nativa queda como pendiente ya señalada en el documento fuente
   [RV17-F-07].
4. **Requiere validación en base de prueba real** (`embedded-postgres`) del SQL
   exacto de §2.3 antes de considerarlo verificado end-to-end — la composición
   sintáctica se apoya en dos fuentes primarias confirmadas por separado
   (RV17-F-01, RV17-F-02), no en un ejemplo idéntico preexistente citado
   literalmente.

---

## 11. Riesgos y límites

- El exclusion constraint (`unit_id WITH =, during WITH &&`) es una composición
  razonada a partir de dos fuentes primarias verificadas por separado, no una
  cita literal de un ejemplo idéntico preexistente en la documentación oficial
  — debe validarse ejecutándolo en una base de prueba real antes de asumirlo
  como verificado end-to-end (ver RV17-R-01).
- Modelar `reserva` y `bloqueo_manual` como tablas separadas, cada una con su
  propio `EXCLUDE`, NO impide solapamientos ENTRE las dos tablas (un
  `EXCLUDE` no puede referenciar dos tablas distintas) — requiere la tabla
  única `ocupacion_unidad` con discriminador (§2.3) u otro mecanismo
  equivalente; queda pendiente de decisión de producto sobre el modelo de
  "capas" deseado.
- `tstzrange` no se normaliza automáticamente a `[)` como sí lo hacen los
  tipos discretos — un error de construcción manual del rango puede introducir
  inconsistencia; requiere disciplina de aplicación o un `CHECK` adicional
  (RV17-R-03).
- El patrón de outbox propuesto (worker de polling propio) es más simple de
  operar pero tiene mayor latencia potencial que un CDC como Debezium (que no
  se pudo verificar en esta sesión); si el volumen de eventos crece
  significativamente, esta decisión debe revisarse.
- El estado de conexión honesto de canal (§6.2) depende de que RV03/RV04
  determinen exactamente qué señales están disponibles para verificar
  "producción real" en cada canal — RV17 fija la interfaz, no la
  implementación de esa verificación.
- `embedded-postgres` corre bajo Rosetta 2 en esta máquina [RV17-F-07]; el
  rendimiento de las pruebas de integración locales puede no reflejar el
  rendimiento en un entorno de producción arm64 nativo o en un Postgres
  administrado real.

---

## 12. Implicaciones para requisitos

- **RV17-R-01**: El sistema DEBE implementar el invariante de no solapamiento
  de reservas/bloqueos por unidad como un `EXCLUDE USING gist` con
  `btree_gist` habilitado, validado con pruebas de concurrencia real (no solo
  PGlite) antes de considerarse cumplido.
- **RV17-R-02**: Toda estancia (reserva o bloqueo) DEBE modelarse con un rango
  semiabierto `[check_in, check_out)`; ninguna migración o inserción manual
  puede usar bounds inclusivos en el extremo de salida, para no romper el caso
  de turnover el mismo día.
- **RV17-R-03**: Si se usa `tstzrange` en vez de `daterange`, toda
  construcción del rango DEBE especificar explícitamente el tercer argumento
  `'[)'` (o un `CHECK` equivalente que lo valide), dado que PostgreSQL no
  normaliza automáticamente los bounds de tipos continuos como sí lo hace con
  `daterange`.
- **RV17-R-04**: `propiedad` DEBE almacenar una zona horaria IANA obligatoria;
  ninguna columna de fecha/hora operativa relacionada con check-in/checkout
  puede usar el tipo `timestamp without time zone`.
- **RV17-R-05**: Toda escritura que resulte en un cambio de disponibilidad
  hacia otros canales DEBE encolarse en la misma transacción de base de datos
  que el cambio de negocio (patrón outbox), nunca como una llamada de red
  separada después del commit.
- **RV17-R-06**: Las políticas RLS DEBEN implementarse con el patrón de
  función `security definer` parametrizada verificado en código real de
  `atiende-restaurantes` (RV17-F-09), no con el patrón `current_tenant_ids()`
  sin parámetros descrito solo en prosa en el documento de Hoteles
  (RV17-F-08), salvo decisión explícita en contrario.
- **RV17-R-07**: Toda tabla con RLS habilitado DEBE evaluarse también contra
  la necesidad de `FORCE ROW LEVEL SECURITY`, dependiendo de si el rol de
  conexión del backend coincide con el propietario de las tablas.
- **RV17-R-08**: Todo evento entrante de un canal (webhook o resultado de
  polling) DEBE procesarse de forma idempotente por una clave compuesta que
  incluya el identificador externo y una versión o hash del payload, y DEBE
  pasar por deduplicación antes de aplicar efectos de negocio.
- **RV17-R-09**: `getConnectionState()` de un adaptador de canal NUNCA DEBE
  devolver `"produccion"` sin evidencia verificable reciente de sincronización
  real exitosa; el valor por defecto ante ambigüedad DEBE ser el estado más
  conservador (`no_conectado` o `bloqueado_por_partner`).
- **RV17-R-10**: `huesped_minimo` NO DEBE ampliarse para incluir campos de
  perfil enriquecido, historial de marketing o segmentación cross-reserva sin
  una decisión de producto explícita que revise esta restricción de
  minimización de datos.
- **RV17-R-11**: Ninguna transición de `reserva.estado` hacia un estado de
  cancelación puede originarse en lógica interna del sistema; solo puede
  reflejar un estado ya reportado por el canal de origen o una acción humana
  explícita registrada en `audit_log`.

---

## 13. Lagunas

### 13.1 Referencia cruzada a `docs/LAGUNAS.md`

Este módulo aporta el mecanismo técnico que la matriz consolidada de
`docs/LAGUNAS.md` (sección 5, "Riesgos semánticos transversales") marca como
**EVIDENCIA — resuelto** citando RV17 en varias filas: TZID/DST y
`[check-in, check-out)` (bounds semiabiertos de `daterange`/`tstzrange`, §3 de
este documento), estancias contiguas (consecuencia directa de la forma
canónica `[)`, §3.2), y feed inaccesible ≠ calendario vacío (adoptado por
RV20, no por RV17, aunque comparte el mismo principio de "nunca inferir estado
por omisión" que sostiene el `EXCLUDE` con predicate de §2.3). La fila
"Buffers de limpieza" (LAGUNA HONESTA parcial en `docs/LAGUNAS.md`) queda
parcialmente atendida por el campo `capa` de `bloqueo_manual` (§1.1 de este
documento, valor `limpieza` como capa distinguible de `manual_anfitrion`), sin
resolver aún la decisión de si ese bloqueo se exporta o no a los feeds de
canal — se ajustó la fila correspondiente en `docs/LAGUNAS.md` para reflejar
este avance parcial. La fila "Cancelación no reabre noches ya ocupadas" sigue
como LAGUNA HONESTA (decisión de precedencia de capas, responsabilidad de
RV07), pero RV17 aporta el mecanismo de auditoría (`audit_log`, §8.2, y la
regla RV17-R-11) que hace verificable, después del hecho, que ninguna
transición de `reserva.estado` se originó en lógica interna del sistema.

1. **Debezium/outbox event router no verificado.** Dos URLs de
   `debezium.io` (documentación de referencia y blog post de 2019 sobre el
   patrón outbox) devolvieron HTTP 403 Forbidden al intentar el fetch en esta
   sesión (2026-09-05). Se reintentó el acceso a
   `https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html`
   en esta misma sesión (segunda pasada, 2026-09-05) y volvió a devolver HTTP
   403 Forbidden — el bloqueo persiste, no se trató de un fallo transitorio
   verificado como tal. El diseño de outbox de este documento se apoya
   exclusivamente en microservices.io (Chris Richardson) [RV17-F-06], que sí
   se pudo leer directamente. No se afirmó ni se asumió nada específico sobre
   la mecánica interna de Debezium/CDC; si el proyecto decide evaluar CDC como
   alternativa al worker de polling propio, requiere una sesión de
   investigación separada con acceso confirmado a esa fuente.
2. **Ejemplo literal idéntico de `EXCLUDE` con igualdad + rango de fecha/hora
   no encontrado verbatim.** La documentación de `CREATE TABLE` muestra el
   ejemplo con `circle`/`&&` [RV17-F-01]; la documentación de `btree_gist`
   muestra el ejemplo con `=`/`<>` sobre texto [RV17-F-02]. El constraint
   propuesto en §2.3 (`unit_id WITH =, during WITH &&`) es una composición
   razonada de ambos patrones documentados, no una cita de un ejemplo
   idéntico preexistente — requiere validación ejecutándolo en una base de
   prueba real antes de asumirse como verificado end-to-end.
3. **Capacidades reales de Airbnb/Booking (webhooks, scopes, SLA de
   sincronización) fuera de alcance de RV17**, según se indicó explícitamente
   en el encargo — dependen de los módulos RV03/RV04 (pendientes en el
   momento de escribir este documento; RV03 ya existe como
   `docs/investigacion/RV03-airbnb-capacidades.md` y documenta, entre otras
   cosas, que la sincronización iCal de Airbnb tiene un ciclo de 3 horas, no
   instantáneo (confianza baja/media específicamente para su aplicabilidad a
   conexiones producto-Airbnb, ver RV03 supuesto S1; latencia externa no
   controlada por Atiende) — dato relevante para calibrar expectativas de
   latencia de sincronización pero que no se re-verificó en esta sesión de
   RV17).
4. **Decisión de modelo de "capas" de bloqueo (tabla única `ocupacion_unidad`
   con discriminador vs. dos tablas + verificación cruzada) no está resuelta
   como decisión final** — se presenta como la opción recomendada en §2.3,
   pero requiere confirmación de producto sobre cómo se quiere consultar y
   reportar cada capa de forma independiente (p. ej. reportes de "noches
   perdidas por mantenimiento" vs. "noches reservadas").
5. **Rendimiento nativo arm64 de `embedded-postgres`** (evitar la ejecución
   bajo Rosetta 2 observada en esta máquina) no se investigó en esta sesión;
   es una pendiente heredada explícitamente del documento de referencia de
   Hoteles [RV17-F-07].
6. **El documento "BLUEPRINT-HOTELES" citado como fuente original de las filas
   BP-096 a BP-109 no se abrió directamente en esta sesión** — se confía en la
   transcripción del investigador de Hoteles tal como aparece en su tabla
   [RV17-F-08]; cualquier divergencia entre esa transcripción y el documento
   original no pudo detectarse.
7. **Requiere decisión humana:** si la empresa gestora administra unidades de
   terceros (`owner`) en múltiples países con regímenes fiscales distintos, el
   cálculo de `statement` (liquidación) puede requerir reglas fiscales
   específicas por país que están fuera del alcance de este módulo de
   arquitectura de datos (es una decisión de producto/fiscal, no de modelo de
   datos puro) — se modeló `statement` solo con los campos mínimos
   estructurales, sin fórmulas de cálculo fiscal.

---

## 14. Supuestos

- Se asume que una "unidad" (unit) es la granularidad correcta para el
  invariante de no solapamiento — es decir, que dos unidades distintas de la
  misma propiedad pueden reservarse independientemente sin conflicto entre
  sí. Si el negocio tiene casos de "unidades combinables" (p. ej. dos
  habitaciones que a veces se rentan como una sola suite), ese caso requiere
  un modelo adicional no cubierto aquí (fuera de alcance, no se encontró
  evidencia de que sea un caso del negocio en los documentos revisados).
- Se asume que el volumen de propiedades/unidades por tenant es del orden de
  decenas a cientos, no de decenas de miles, para las recomendaciones de
  arquitectura de workers y colas (worker de polling propio en vez de
  infraestructura de streaming/CDC dedicada).
- Se asume que el negocio quiere, eventualmente, converger hacia el mismo
  stack de `atiende-restaurantes` (Supabase/Postgres+RLS+Edge Functions) en
  producción, dado que es el patrón hermano ya operativo — no se confirmó
  esto como decisión de negocio explícita en ningún documento leído.
- Se asume que "capa" de bloqueo (limpieza, mantenimiento, manual del
  anfitrión) es una clasificación cerrada y pequeña (menos de 10 valores),
  modelada como texto validado por aplicación o un `CHECK`, no como una tabla
  de catálogo separada — si el negocio necesita capas configurables por
  tenant, esto requeriría una tabla de catálogo adicional.

---

## Fuentes de este módulo

Todas las fechas de consulta: 2026-09-05. Ledger completo con cita textual,
alcance y confianza de cada una en `docs/fuentes/rv17-18-20.md`, sección
"## RV17 — Arquitectura y modelo de datos" (RV17-F-01 a RV17-F-12).

### Invariante de no solapamiento (`EXCLUDE`, `btree_gist`, `SERIALIZABLE`, range types)

- CREATE TABLE — cláusula EXCLUDE. PostgreSQL Global Development Group.
  https://www.postgresql.org/docs/current/sql-createtable.html [RV17-F-01]
- F.7. btree_gist. PostgreSQL Global Development Group.
  https://www.postgresql.org/docs/current/btree-gist.html [RV17-F-02]
- 13.2. Transaction Isolation (SERIALIZABLE). PostgreSQL Global Development
  Group. https://www.postgresql.org/docs/current/transaction-iso.html
  [RV17-F-03]
- 8.17. Range Types (bounds, forma canónica de `daterange`/`tstzrange`).
  PostgreSQL Global Development Group.
  https://www.postgresql.org/docs/current/rangetypes.html [RV17-F-04]

### Multitenancy y seguridad de fila

- 5.9. Row Security Policies. PostgreSQL Global Development Group.
  https://www.postgresql.org/docs/current/ddl-rowsecurity.html [RV17-F-05]

### Sincronización, outbox transaccional, workers e idempotencia

- Pattern: Transactional outbox. Chris Richardson, microservices.io.
  https://microservices.io/patterns/data/transactional-outbox.html
  [RV17-F-06]
- SELECT — cláusula de bloqueo `FOR UPDATE ... SKIP LOCKED`. PostgreSQL
  Global Development Group.
  https://www.postgresql.org/docs/current/sql-select.html [RV17-F-10]
- 13.3.5. Advisory Locks (`pg_advisory_xact_lock`). PostgreSQL Global
  Development Group.
  https://www.postgresql.org/docs/current/explicit-locking.html [RV17-F-11]
- INSERT — cláusula `ON CONFLICT`. PostgreSQL Global Development Group.
  https://www.postgresql.org/docs/current/sql-insert.html [RV17-F-12]

### Intentos de fuente fallidos (declarados, no sustituidos con contenido de memoria)

- https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
  — HTTP 403 Forbidden en el intento original y en el reintento de esta
  pasada (ambos 2026-09-05).
- https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
  — HTTP 403 Forbidden (intento original, 2026-09-05; no se reintentó en esta
  pasada por ser un blog post secundario, no la documentación de referencia).

**Fuentes internas del mismo grupo de proyectos (NO cuentan como URLs externas):**

- `/Users/javiercamaraportepetit/Documents/Codex/atiende-hoteles-staging/docs/referencia/07-stack-viabilidad.md`
  [RV17-F-07] — hallazgo de primera mano en esta misma máquina, no una fuente
  externa publicada.
- `/Users/javiercamaraportepetit/Documents/Codex/atiende-hoteles-staging/docs/referencia/01-blueprint-y-decision-llm.md`
  [RV17-F-08] — documento local de otro módulo del mismo grupo de proyectos.
- `/Users/javiercamaraportepetit/Documents/Codex/atiende-restaurantes/supabase/migrations/20260904050000_enterprise_tenant_isolation.sql`
  [RV17-F-09] — código fuente real de un repositorio hermano, no una URL
  navegable públicamente.

### Conteo y declaración explícita frente al mínimo de 25 URLs (00-PLAN.md §1.3)

**9 URLs externas reales, en 2 dominios** (postgresql.org: 8 páginas
distintas — RV17-F-01, F-02, F-03, F-04, F-05, F-10, F-11, F-12, cada una una
URL de documentación diferente; microservices.io: 1 página — RV17-F-06), más 2
intentos fallidos declarados de un tercer dominio (debezium.io). Esto queda
**por debajo del mínimo de 25 URLs distintas exigido por 00-PLAN.md §1 punto
3**. Razón declarada explícitamente (no se rellenó con URLs no leídas para
forzar el número, tal como exige el propio plan): RV17 es un módulo de
arquitectura de datos interno (modelo de datos, invariantes de integridad,
patrones de sincronización sobre el motor de persistencia elegido), no un
módulo de investigación de mercado o de capacidades de canal con alto volumen
de fuentes navegables (comparar con RV03/RV04/RV14/RV15, donde el objeto de
estudio son decenas de páginas de partner programs, foros y comparativas). El
criterio cuantitativo relevante que sí cumple es el de **≥3 fuentes de nivel-1
estrictas** (§1 punto 3, segunda cláusula): documentación oficial de
PostgreSQL (motor elegido) cuenta como nivel 1 según 00-PLAN.md §2.1 punto 1
("documentación oficial... repositorios oficiales de SDK") — RV17 aporta
citas verbatim de 8 páginas oficiales distintas de postgresql.org más 1 patrón
de arquitectura con autoría identificable (microservices.io), muy por encima
de ese mínimo de 3. Las 3 fuentes locales (RV17-F-07/F-08/F-09) se listan
arriba en un bloque aparte precisamente para que no se cuenten hacia ningún
mínimo de URLs externas.
