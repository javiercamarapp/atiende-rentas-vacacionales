# Decisiones de arquitectura y producto — Atiende Rentas Vacacionales

Registro ADR numerado (D-001…). Cada decisión cita el módulo de investigación
(RVxx) y, cuando aplica, la fuente del ledger (`docs/fuentes/*.md`, notación
`F-xxx`/`L-RVxx-nn`/`[DATO]`/`[R]`/`[E]`) que la sostiene. Nada se marca
"cerrado" sin evidencia; lo no soportado por evidencia directa se etiqueta
**SUPUESTO** o **PENDIENTE-EXTERNO** en la columna Estado.

Formato de cada entrada: Contexto · Decisión · Alternativas consideradas ·
Evidencia · Consecuencias · Estado.

---

## D-001 — El calendario interno es la única fuente de verdad de ocupación

**Contexto.** El producto debe cerrar disponibilidad entre Airbnb, Booking.com,
Vrbo y otros canales. Ningún canal expone un mecanismo confiable de tiempo
real (RV06 §"Qué NO transporta iCal"; RV07 §1, §9), y cada canal solo conoce su
propia vista de la disponibilidad.

**Decisión.** El estado autoritativo de ocupación por noche y unidad vive
exclusivamente en una tabla interna de bloqueos tipados (`ocupacion_unidad`,
ver D-002/D-012), nunca en un feed iCal (ni de import ni de export) ni en la
respuesta cacheada de una API de canal. Los feeds de export se generan **a
partir** de esta fuente de verdad; los feeds/eventos de import solo la
**alimentan** tras pasar por reconciliación (D-004, D-010).

**Alternativas consideradas.**
- Tratar el feed de Airbnb (o el canal de mayor volumen) como maestro y
  replicar hacia los demás — descartada: ningún canal documenta garantías
  suficientes de latencia o de retención de historial (RV03 §5) para asumir
  ese rol, y crea dependencia estructural de un tercero para el invariante
  central del producto.
- Reconstruir el estado en cada lectura a partir de los feeds vivos — descartada
  por latencia (RV06/RV07: ciclos de horas) y por la imposibilidad de
  representar bloqueos internos (limpieza, mantenimiento) que ningún canal
  conoce.

**Evidencia.** RV07 §1 ("Fuente de verdad interna"); RV17 §1.3 (por qué
`noche_disponibilidad` es proyección, no fuente); RV06 (iCal no transporta
tarifa/restricciones/huésped/pago).

**Consecuencias.** Todo adaptador de canal es unidireccional en su función de
lectura (alimenta candidatos) y unidireccional en su función de escritura
(publica desde la fuente de verdad); ningún adaptador puede escribir
directamente sobre `ocupacion_unidad` sin pasar por el motor de reconciliación
(D-004, D-007 en RV07 §7).

**Estado.** Adoptada.

---

## D-002 — Modelo de bloqueos por capas con precedencia fija

**Contexto.** Una misma noche puede estar disputada por más de una razón
(reserva confirmada de canal, bloqueo manual del propietario, mantenimiento,
buffer de limpieza). Al cancelar o modificar una de ellas, el sistema no debe
reabrir una noche que otra razón todavía reclama.

**Decisión.** Toda ocupación se modela con una `capa`/razón tipada y una
precedencia total y determinística: `RESERVA_CANAL` > `BLOQUEO_PROPIETARIO` >
`MANTENIMIENTO` > `BUFFER_LIMPIEZA`. Formalmente: `ocupado(unidad, noche) = ∃
bloqueo activo b : noche ∈ [DTSTART(b), DTEND(b))`. Cancelar un bloqueo `b`
solo remueve su propio término del existencial; nunca fuerza `ocupado=false`
si otro término lo cubre. Un conflicto entre capas se reporta a un humano,
nunca se resuelve cancelando la reserva de mayor precedencia.

**Corrección de auditoría independiente (BC1, 2026-09-05).** Una lectura
literal de este principio junto con el `EXCLUDE USING gist` de D-012/BLUEPRINT
§3.2 es contradictoria: un `EXCLUDE` sin partición por capa rechaza a nivel de
base de datos cualquier fila que se solape con otra activa, lo que impide que
lleguen a coexistir dos filas de distinta capa — exactamente el estado que
este principio (y el ejemplo motivador de RV07 §7: "una reserva confirmada y
un bloqueo de mantenimiento superpuesto creado por error... la noche
permanece ocupada por la reserva... se alerta el solapamiento... sin tocar la
reserva") presupone que puede existir para resolverse en lectura. Se
especifica ahora el mecanismo exacto, detallado en BLUEPRINT §3.2:

1. El `EXCLUDE` corre **solo** sobre la capa de ocupación efectiva que no
   admite ninguna excepción de negocio: filas `capa='reserva'` con
   `bloqueante=true` (reservas confirmadas y holds que sí cierran la noche,
   REQ-048). Bloqueos de propietario, mantenimiento y buffer de limpieza
   (`capa='bloqueo'`) **nunca** participan en el `EXCLUDE`: su `INSERT` nunca
   es rechazado por la base de datos, sin importar si se solapa con una
   reserva o con otro bloqueo.
2. Si dos reservas confirmadas de distinto canal intentan solaparse (el
   overbooking real que el producto existe para prevenir), la segunda
   violación del `EXCLUDE` se captura como excepción de base de datos
   (`SQLSTATE 23P01`) dentro de la misma transacción; la aplicación inserta
   esa segunda ocupación con `estado='conflicto_pendiente'` (excluido del
   `EXCLUDE` por diseño) y crea una fila en `conflicto_calendario` de máxima
   severidad — nunca cancela ninguna de las dos reservas automáticamente.
3. Si un bloqueo de menor precedencia se solapa con una reserva o con otro
   bloqueo, el `INSERT` se acepta sin excepción de BD; una verificación en la
   misma transacción detecta el solapamiento e inserta una fila en
   `conflicto_calendario` (`tipo='capa_cruzada'`) — la noche permanece
   ocupada por la razón de mayor precedencia (lectura), el conflicto queda
   visible y auditable (escritura), nunca oculto.

Esto reconcilia además el modelo de estados de `ocupacion_unidad` con
REQ-091 (confirmado/provisional/cancelado — corrección 2026-09-05: REQ-091
citaba "liberado", que no existe en el enum real de `estado`; ver REQ-091 y
BLUEPRINT §3.2) y con la distinción de REQ-068 vs.
REQ-048: una solicitud pendiente que el canal de origen sí bloquea (Airbnb)
se inserta con `estado='provisional', bloqueante=true` (participa del
`EXCLUDE`); una solicitud pendiente que el canal de origen no bloquea
(Booking.com `INQUIRY`, REQ-068) se inserta con `estado='provisional',
bloqueante=false` (no participa del `EXCLUDE`, solo trazabilidad/eventual
bloqueo blando interno).

**Alternativas consideradas.**
- Un único tipo de "bloqueo" sin capas, resuelto por orden de llegada —
  descartada: no permite proteger una reserva de canal frente a un bloqueo de
  mantenimiento mal creado, y no da trazabilidad de "por qué esta noche está
  cerrada" que pide RV09-R-01.
- Resolver conflictos con un LLM que decida qué bloqueo prevalece — descartada
  explícitamente por RV18 (la lógica de inventario nunca depende de un LLM).
- Dos `EXCLUDE` independientes, uno por tabla (`reserva`, `bloqueo_manual`) —
  descartada explícitamente en RV17 §2.3: un `EXCLUDE` en una tabla no "ve"
  las filas de la otra, por lo que dos constraints separados no impedirían
  que una reserva y un bloqueo de mantenimiento se solaparan sin detección.

**Evidencia.** RV07 §7 (invariante de no reapertura y ejemplo motivador de
reserva+mantenimiento superpuesto, propuesto como decisión de producto
derivada de la regla "nunca cancelar reservas"); RV17 §2.3 (tabla única
`ocupacion_unidad` con discriminador `capa`, opción recomendada frente a dos
tablas separadas porque un `EXCLUDE` no puede referenciar dos tablas
distintas — la cita correcta para el modelo de tabla única es §2.3, no §1.1,
que en realidad describe `reserva`/`bloqueo_manual` como dos tablas
separadas); RV17 §13, laguna #4.

**Consecuencias.** Requiere una tabla única de ocupación con discriminador
(`ocupacion_unidad`, ver D-012 y BLUEPRINT §3.2) y una tabla auxiliar de
alertas `conflicto_calendario`; toda UI que muestre "por qué está cerrada
esta fecha" debe exponer la capa, no solo el estado binario.

**Estado.** Adoptada; mecanismo de conflicto entre capas y de excepción de
BD ante violación del `EXCLUDE` ahora especificado (BLUEPRINT §3.2, corrección
BC1), pendiente de validación empírica end-to-end contra `embedded-postgres`
igual que D-012.

---

## D-003 — iCal como mínimo común denominador, con política de latencia honesta

**Contexto.** Airbnb documenta un ciclo de sincronización de ~3 horas para
calendarios importados [DATO, RV03/RV06/RV07, art. 99]. **Matiz de confianza
(corrección BC5, auditoría independiente 2026-09-05):** esa cifra está
confirmada verbatim para la sincronización entre calendarios de terceros; su
extrapolación a "cualquier conexión iCal producto-Airbnb" es un supuesto que
el propio RV03 (§Supuestos, S1) etiqueta con **confianza baja/media**, no
como hecho verificado adicional. Toda superficie que cite "~3h" debe llevar
ese calificador y aclarar que es latencia externa del canal, no controlada
por el sistema. Vrbo documenta ~30 minutos + hasta 20 minutos de propagación
[DATO, RV05]; Booking.com no publica cifra oficial accesible para su fallback
iCal [PENDIENTE, RV04 §7, bloqueo 403]. Ningún canal ofrece iCal en tiempo
real.

**Decisión.** iCal se adopta como la vía de conectividad universal de mínimo
esfuerzo (sin aprobación de partner), pero el producto **nunca** comunica
"tiempo real" ni "cero overbooking" cuando el transporte subyacente es iCal.
Toda superficie de usuario y todo contrato comercial debe declarar la ventana
de latencia documentada por canal (o "no documentada" cuando aplique, nunca
inventada) y descomponer "latencia interna" (controlable, objetivo interno
p95 < 5 s según RV20 §3) de "latencia por canal" (no controlable).

**Alternativas consideradas.**
- Prometer sincronización cuasi-instantánea apoyándose en polling agresivo —
  descartada: no reduce la latencia del canal remoto (RV07 §9-10) y arriesga
  bloqueo por rate-limit sin beneficio real.
- Ocultar la existencia de la ventana de latencia al usuario — descartada por
  ser una promesa falsa verificable (RV09-R-10, RV21-R-04).

**Evidencia.** RV03, RV05, RV06 §"Riesgos", RV07 §9-10, RV08 §3, RV09
(hallazgos de latencia verificados con WebFetch), RV21 §2.2/§6.4.

**Consecuencias.** El adaptador de cada canal declara sus capacidades y su
latencia documentada (D-018); la matriz de conectividad por cuenta (BLUEPRINT
§3) debe reflejar el estado real, nunca "sincronizado" genérico.

**Estado.** Adoptada.

---

## D-004 — Anti-eco de bloqueos en al menos dos capas independientes

**Contexto.** Un canal que permite "importar un calendario externo" (p. ej.
Vrbo) puede reexponer en su propio feed de export un bloqueo que en realidad
proviene de nuestro propio export hacia él (o de otro canal a través de él),
creando un ciclo ("looping") que ningún canal OTA documenta oficialmente
[R, Hosthub — confianza media-baja, RV08 §4] salvo el caso confirmado por
Vrbo de "payment issues" al reimportar el propio export [DATO, RV05].

**Decisión.** El importador aplica anti-eco en capas, sin depender de una sola
señal: (1) reconocimiento de `UID`/namespace propio en el evento entrante; (2)
comparación de hash de contenido `(unidad, DTSTART, DTEND, razón inferida)`
contra lo exportado a ese canal; (3) verificación contra metadatos de "a qué
canales se exportó" cada bloqueo interno. Un evento entrante que coincide con
cualquiera de estas señales se descarta como eco, nunca se convierte en un
nuevo bloqueo `RESERVA_CANAL`.

**Alternativas consideradas.**
- Confiar solo en la preservación del `UID` original por el canal —
  descartada: no hay evidencia primaria de que ningún canal preserve el `UID`
  al reexportar contenido importado de otra fuente (RV07 §3, laguna
  explícita).

**Evidencia.** RV06 §3 (UID como identidad); RV07 §3 (mecanismo en 3 capas);
RV05 (advertencia oficial de Vrbo sobre reimportar el propio export); RV08 §4
(fenómeno de "looping", confianza media-baja, fuente comercial).

**Consecuencias.** Cada bloqueo interno debe persistir metadatos de
"exportado_a" (lista de canales); el costo de cómputo de hashing por ciclo de
sync es aceptado como necesario.

**Estado.** Adoptada.

---

## D-005 — Cuarentena de feeds inaccesibles, vacíos o malformados

**Contexto.** Un `GET` fallido, un cuerpo vacío o un `.ics` que no parsea
**nunca** debe interpretarse como "el canal remoto no tiene reservas" — eso
abriría disponibilidad falsa, el escenario exacto de overbooking que el
producto existe para prevenir (`docs/LAGUNAS.md` §5, fila "feed inaccesible ≠
calendario vacío").

**Decisión.** Ante fallo de fetch/parseo, el último estado válido conocido de
ese canal/unidad se congela ("cuarentena"), con timestamp del último éxito;
se emite alerta operativa al superar un umbral configurable de antigüedad
(propuesto 3× el ciclo esperado del canal, RV20 §2); los bloqueos ya conocidos
de ese canal permanecen activos hasta que un ciclo exitoso posterior los
confirme, modifique o cancele explícitamente. Un `.ics` que parsea
correctamente con 0 `VEVENT` es una señal distinta ("sin reservas actuales")
de un fetch fallido, y aun así genera alerta informativa si ese canal
normalmente tiene eventos.

**Alternativas consideradas.**
- Tratar cualquier fallo como "mantener disponible" por defecto optimista —
  descartada por ser exactamente el riesgo de overbooking que el producto
  existe para prevenir.
- Bloquear indefinidamente todo el calendario de esa unidad ante cualquier
  fallo — descartada por ser una degradación excesiva ante fallos transitorios
  (timeouts puntuales).

**Evidencia.** RV07 §8; RV20 §1.2 (un span sin `Status=Ok` se trata aguas
abajo como no confirmado); `docs/LAGUNAS.md` fila de riesgos semánticos
transversales.

**Consecuencias.** Todo estado de canal debe distinguir "última sync exitosa",
"en cuarentena desde", "vacío confirmado"; el runbook de RV20 §2 define la
respuesta humana ante cada caso.

**Estado.** Adoptada.

---

## D-006 — Nunca cancelar reservas ni contactar huéspedes sin aprobación humana explícita; las herramientas de IA ni siquiera existen para esas acciones

**Contexto.** Regla de negocio no negociable del proyecto, reforzada por
evidencia primaria de que las propias plataformas tratan la cancelación y la
mediación de disputas como decisiones excepcionales sujetas a revisión humana
(RV02 §"Resolution Center", "a dedicated team member will review..."; RV02-R-03,
RV02-R-04) y penalizan económicamente la cancelación de host (RV02, RV03-F18).

**Decisión.** El sistema nunca cancela una reserva confirmada ni contacta a un
huésped de forma autónoma. Esto no se implementa como una regla de aprobación
condicional: las herramientas (`tools`) de `cancelar_reserva` y
`contactar_huesped_directo` **no existen en el catálogo de tools accesible a
ningún agente LLM**, bajo ninguna condición de rol (RV18 §5, punto 4 —
corrección BC8: "§5.4" no existe como encabezado real de RV18, que es una
lista plana sin subsecciones numeradas; RV18-R-03). La
única vía de cancelar o contactar es la UI determinista operada por un humano
autorizado. Esta regla se verifica en CI (RV18 §8, mecanismo 3), no solo en
revisión de código.

**Alternativas consideradas.**
- Permitir que un agente proponga la cancelación con aprobación humana
  obligatoria — descartada: el propio catálogo de RV18 distingue "requiere
  aprobación" (borradores, sugerencias) de "no existe la tool" (acciones
  irreversibles); dado el impacto de una ejecución accidental, la ausencia
  estructural es más segura que una puerta de aprobación que pueda
  bypassearse por un bug.

**Evidencia.** RV02, RV03 (F18), RV18 §2.3, §5, §10; RV19-R-15; RV21 (criterio
de aceptación #6, "no cancelación automática").

**Consecuencias.** Ningún roadmap futuro de "autonomía creciente" de agentes
(RV18 §7.4) puede cruzar esta línea; es un límite de producto, no un umbral de
evals.

**Estado.** Adoptada, no negociable.

---

## D-007 — La lógica de inventario/disponibilidad nunca depende de un LLM

**Contexto.** Un modelo de lenguaje puede ser inducido por contenido de
terceros (el propio mensaje del huésped) a intentar acciones fuera de su rol;
Anthropic documenta que los clasificadores de intención fallan quando "el
usuario es quien escribe la instrucción" [DATO, RV18-F-02], que es exactamente
el caso de un huésped conversando por su cuenta.

**Decisión.** Toda decisión de "¿está disponible esta noche?", "¿hay
solapamiento?", "¿se cierra el calendario tras esta reserva?" se implementa
exclusivamente como constraint de base de datos (`EXCLUDE`, D-012) + código
determinista dentro de una transacción SQL. Ningún LLM participa en esa
decisión en ningún punto del flujo, ni siquiera como paso intermedio validado
después. Los agentes LLM (RV18 §2.2: borrador de respuesta, resumen de
incidencias, sugerencia de precio) nunca escriben directamente sobre
inventario o precio final; solo producen sugerencias que un humano aprueba
mediante una tool determinista separada.

**Alternativas consideradas.**
- Usar un LLM como "árbitro" de conflictos de disponibilidad con reglas en
  prompt — descartada por RV18 §2.3 y por RV16-R-04 (decisión de arquitectura
  explícita de que la sincronización es lógica determinista).

**Evidencia.** RV16 §5; RV17 (constraint `EXCLUDE`); RV18 §2.3, §6; RV18-F-02,
RV18-F-06.

**Consecuencias.** Verificable en CI (RV18 §8, mecanismo 2): una prueba de
integración falla si una escritura de disponibilidad ocurre fuera de una
transacción SQL explícita o si dos escrituras concurrentes no son serializadas
por el constraint de exclusión.

**Estado.** Adoptada.

---

## D-008 — Herramientas de IA sin identificadores de tenant/propiedad/huésped como parámetro del modelo

**Contexto.** Ninguna defensa a nivel de modelo es suficiente contra
inyección de prompt cuando el atacante potencial es el propio interlocutor
autorizado de la conversación (el huésped); la única defensa que Anthropic
documenta como sólida en ese escenario es la del entorno/servidor [DATO,
RV18-F-02]. Existe un patrón ya verificado en producción en un producto
hermano (Likida) que aplica este principio.

**Decisión.** Ninguna tool expuesta a un agente LLM declara en su
`input_schema` un parámetro de tipo `tenant_id`, `propiedad_id`, `huesped_id`,
`reserva_id` ni `conversation_id`. El modelo decide *cuándo* invocar una tool;
el servidor resuelve *con qué datos* a partir del `ToolContext` construido
desde la sesión/canal autenticado de la conversación en curso, antes de que el
handler se ejecute. Verificable en CI (RV18 §8, mecanismo 1).

**Alternativas consideradas.**
- Confiar en que el modelo no invoque tools fuera de su alcance mediante
  instrucciones de sistema — descartada por ser una defensa a nivel de modelo,
  exactamente la que RV18-F-02 documenta como insuficiente.

**Evidencia.** RV18 §6 completo (RV18-F-01, F-02, F-06, F-07, F-08, F-11).

**Consecuencias.** Toda resolución de "a qué tenant pertenece este mensaje"
depende de que RV03/RV04 (adaptadores de canal) entreguen correctamente el
mapeo canal-externo → conversación-interna → tenant; un fallo ahí no lo
detecta esta defensa (riesgo documentado en RV18 §9, no cerrado por este
módulo).

**Estado.** Adoptada.

---

## D-009 — Stack técnico: backend Node/TS propio con RLS heredado del patrón de `atiende-restaurantes`, camino de convergencia hacia Supabase

**Contexto.** Esta máquina no tiene Docker/Supabase CLI local funcional para
levantar Postgres+PostgREST+GoTrue (`which docker supabase psql` → no
encontrado, verificado en esta sesión y en RV17 §10.1); `atiende-restaurantes`
(hermano de identidad visual, D-015) ya opera en producción con
Supabase/Postgres+RLS+Edge Functions.

**Decisión (opción híbrida, "C" de RV17 §10.2).** Desarrollo y pruebas con un
backend Node/TS propio (Hono o Fastify) + JWT propio (`jose`) emitiendo los
mismos claims que ya consumen las políticas RLS reales de `atiende-restaurantes`
(`request.jwt.claim.sub`), de modo que el mismo SQL de RLS sea portable; el
esquema y las políticas se escriben desde el inicio "compatibles con
Supabase". Persistencia: `embedded-postgres` (Postgres 18.4 real) para
pruebas de integración/concurrencia, PGlite para pruebas unitarias rápidas de
lógica/RLS sin necesitar contención real.

**Alternativas consideradas.**
- Supabase real desde el día uno — descartada como *desarrollo local*:
  `supabase start`/`db diff`/`gen types` requieren Docker internamente incluso
  apuntando a un Postgres externo real (errores explícitos de la CLI 2.116.0
  verificados en esta máquina, RV17 §10.2); viable solo contra un proyecto
  remoto real, lo cual ya no es "sin Docker".
- Mantener el backend Node/TS propio en producción de forma permanente — no
  descartada, pero no confirmada como decisión de negocio; se asume
  convergencia hacia Supabase por ser el patrón ya en producción del hermano,
  sujeto a validación (RV17 §10.3, supuesto 1).

**Evidencia.** RV17 §10 completo (RV17-F-07, comandos ejecutados en esta
sesión); RV20 §8 (mismos hallazgos, con simuladores de canal etiquetados,
D-020).

**Consecuencias.** PGlite NO sirve para validar contención real del
`EXCLUDE` (mide 1344 ms vs. 302 ms de `embedded-postgres`, ambos medidos en
esta máquina) — toda prueba de concurrencia real del invariante central debe
correr contra `embedded-postgres`, nunca solo contra PGlite. `embedded-postgres`
corre bajo Rosetta 2 en esta Mac; vigilar costo de CPU en CI.

**Estado.** Adoptada para desarrollo; producción sujeta a validación de
negocio (ver D-015 sobre identidad de frontend, que sí se asume estable).

---

## D-010 — Outbox transaccional + idempotencia por `(canal, unidad, UID)`

**Contexto.** Si el commit de una reserva/bloqueo y el encolado del mensaje de
sincronización hacia otros canales son pasos independientes, existe una
ventana real donde el proceso puede morir entre ambos, perdiendo
silenciosamente el evento de sincronización — el escenario de overbooking
exacto que el producto existe para prevenir. La literatura de arquitectura de
microservicios documenta la solución: *"the service that sends the message
[should] first store the message in the database as part of the transaction
that updates the business entities"* [DATO, RV17-F-06, microservices.io].

**Decisión.** Toda escritura que resulte en un cambio de disponibilidad hacia
otros canales se encola en la misma transacción de base de datos que el
cambio de negocio (tabla `sync_outbox`), nunca como una llamada de red
separada después del commit. Un worker separado ("message relay") procesa la
tabla con `SELECT ... FOR UPDATE SKIP LOCKED` y marca `procesado_en` solo tras
éxito confirmado. Todo import externo es idempotente por la clave compuesta
`(canal, unidad, UID)`, con desempate por `SEQUENCE`/hash de contenido cuando
`SEQUENCE` no sea confiable (RV06: no hay garantía de incremento consistente
fuera de flujos iTIP).

**Alternativas consideradas.**
- Change Data Capture (Debezium) como mecanismo de outbox — no adoptada: dos
  URLs de `debezium.io` devolvieron HTTP 403 en esta investigación (RV17 §13
  laguna #1); el volumen esperado del dominio (decenas-cientos de unidades por
  tenant) no justifica la infraestructura adicional frente a un worker de
  polling propio.

**Evidencia.** RV17 §5, §7 (RV17-F-06, RV17-F-08); RV07 §5 (mismo patrón,
citado independientemente en el módulo de sincronización); RV20 §5 (qué
observa el módulo de operación de este mecanismo).

**Consecuencias.** RV20-R-07/R-08 dependen de este diseño: todo restore de
backup debe ir seguido de reconciliación de drift antes de reanudar push
automático, precisamente porque el outbox reproducido de forma no idempotente
puede reenviar cierres duplicados.

**Estado.** Adoptada; CDC como alternativa queda como investigación pendiente
si el volumen crece significativamente.

---

## D-011 — Estrategia de conectividad por canal: iCal primero, partner/channel manager después, por etapas — con hitos de aprobación externa marcados como tales (actualizado con evidencia B-002 en vivo, 2026-09-05)

**Contexto.** Ningún canal (Airbnb, Booking.com, Vrbo/Expedia) publica costo
ni plazo oficial de certificación como partner directo (RV08 §1, §5); el
acceso vía API de partner exige NDA, revisión de seguridad de datos y, en
Airbnb, 6 meses post-aprobación para implementar features obligatorias (RV03
§5, F06).

**Actualización con evidencia de mayor confianza (`docs/fuentes/b002-archivo.md`,
lectura en vivo 2026-09-05, HTTP 200 en `connect.booking.com` y
`developers.booking.com`):**
- **Booking.com — Connectivity Partner Program pausado a nuevos proveedores.**
  Cita textual [DATO, F01]: *"we are pausing integrations with new
  connectivity providers until further notice"*. No hay fecha declarada de
  inicio de la pausa ni de reapertura estimada. **Consecuencia directa de
  producto: la ruta de "Atiende como Connectivity Partner directo de
  Booking.com" queda en PENDIENTE-EXTERNO con pausa activa confirmada por el
  propio canal**, no solo "sin fecha de aprobación conocida" — es una puerta
  cerrada hoy, reevaluable solo si Booking.com anuncia reapertura.
- **Booking.com — las propiedades/gestores individuales no conectan vía API
  de Connectivity bajo ninguna circunstancia**, aunque la pausa se levantara:
  cita textual [DATO, F02]: *"We don't accept direct connections from
  individual properties right now, but you can connect via a channel
  manager."* La única ruta oficial documentada para un anfitrión/gestor
  individual es (a) un **channel manager ya certificado como Connectivity
  Partner** actuando de intermediario, o (b) la **extranet de Booking.com**
  (`Account > Channel Manager` dentro del panel de propiedad, detrás de
  login, no accesible a este agente) — lo que en la práctica reduce a dos
  opciones no-API para Atiende frente a Booking.com: integrarse como cliente
  de un channel manager ya certificado (RV08 §2: Guesty, Hostaway, Smoobu,
  OwnerRez, con API pública verificada), o depender de que el anfitrión
  configure manualmente la sincronización en su propia extranet.
- **iCal de Booking.com sigue sin verificar por ninguna vía** (ni en vivo ni
  archivada): `partner.booking.com` bloquea a nivel de borde (CloudFront,
  incluso `/robots.txt`) y `partnerhelp.booking.com` da timeout de conexión;
  el índice CDX de Wayback Machine devuelve **cero capturas históricas** para
  ambos subdominios — no es solo que la versión actual no esté archivada,
  nunca ha sido indexada [F07]. **Elegibilidad, frecuencia de refresco,
  contenido del feed y riesgo de overbooking declarado del iCal de Booking.com
  permanecen sin fuente primaria de ningún tipo.** Ninguna cifra de frecuencia
  (ni siquiera "minutos a horas") debe presentarse como verificada para este
  canal específico.
- **Vrbo — Connectivity Partner Program confirmado con 3 niveles** (Elite,
  Preferred, Integrated) vía captura archivada de Wayback Machine
  (2026-03-10, **confianza media** por antigüedad de 6 meses respecto a esta
  consulta) [F05]: *"Elite Partners: ... highest quality connections and
  comprehensive functionality"*; *"Preferred Partners: ... advanced systems
  with a wide range of integrated features"*; *"Integrated Partners: ...
  certified integration but not recognized in the top two tiers"*. El nivel
  base (Integrated) ya exige "a certified integration" — no hay evidencia de
  una vía de conectividad Vrbo sin certificación más allá de iCal. Requisitos
  exactos, costos y política de admisión de nuevos proveedores por nivel
  **no están confirmados** (contenido cargado por JavaScript no capturado por
  Wayback).

**Decisión (revisada).** El producto se lanza por etapas: (1) **iCal puro**
para Airbnb y Vrbo (con latencia honesta documentada, D-003) como vía de
validación de demanda sin aprobación externa; para **Booking.com, iCal se
marca explícitamente como "elegibilidad y frecuencia no verificadas"** en toda
superficie de producto hasta obtener evidencia primaria — no se asume
paridad de comportamiento con Airbnb/Vrbo; (2) para Booking.com
específicamente, dado que la conexión directa individual está excluida por
diseño del canal y la vía de partner directo está pausada, la ruta de
conectividad más profunda a corto/medio plazo es **integrarse vía un channel
manager ya certificado** (RV08 §2) que actúe de intermediario hacia Booking,
o depender de la **extranet manual** operada por el propio anfitrión; (3)
evaluación de un channel manager con API pública verificada (Guesty,
Hostaway, Smoobu, OwnerRez) también como capa intermedia para Airbnb/Vrbo si
acelera cobertura multicanal; (4) conectividad directa certificada con
Airbnb o Vrbo (Elite/Preferred/Integrated) solo para canales/volumen que lo
justifiquen, tratada en todos los casos como **dependencia externa sin fecha
controlable** (PENDIENTE-EXTERNO). Ningún hito de homologación con un canal
se marca "completado" sin confirmación explícita del canal (correo/portal de
aprobación como evidencia) — RV21 §6.2, criterio de aceptación #12. La matriz
de conectividad por cuenta (BLUEPRINT §3) debe mostrar, para Booking.com, un
estado distinto y más conservador que para Airbnb/Vrbo: "partner directo:
pausado por el canal" en vez de "pendiente de aprobación", y "iCal: no
verificado" en vez de una cifra de latencia.

**Alternativas consideradas.**
- Comprometer fecha de "integración API certificada" en el roadmap comercial
  antes de iniciar el proceso de aprobación — descartada explícitamente por
  RV08-R-03 y RV21 §7 (riesgo de comprometer fechas que dependen de
  aprobación de terceros sin margen de contingencia); reforzada ahora por la
  evidencia de que Booking.com tiene la puerta cerrada activamente hoy, no
  solo "sin fecha".
- Presentar la vía de channel manager certificado como equivalente a una
  integración directa propia — descartada: introduce una dependencia
  adicional de dos capas (canal + channel manager) que debe declararse
  explícitamente en la matriz de conectividad, no ocultarse tras un genérico
  "conectado".
- Asumir que el iCal de Booking.com se comporta igual que el de Airbnb/Vrbo
  por analogía — descartada explícitamente: no hay evidencia primaria de
  ningún tipo (ni viva ni archivada) que lo confirme.

**Evidencia.** RV08 completo; RV03 §5; RV04 §7 (bloqueo 403 en
partner.booking.com, hallazgo previo); `docs/fuentes/b002-archivo.md`
(F01-F08, lectura en vivo y Wayback 2026-09-05); `docs/BLOQUEOS.md` B-002;
RV21 §6.1-6.2.

**Consecuencias.** El BLUEPRINT (§3, §7) y el plan de fases (§13) deben marcar
explícitamente: (a) Booking.com partner directo = PENDIENTE-EXTERNO con pausa
activa declarada por el canal (no solo "sin aprobar"); (b) Booking.com iCal =
SIN EVIDENCIA (no asumir latencia ni elegibilidad); (c) Vrbo Connectivity
Partner Program = 3 niveles confirmados con confianza media (fuente
archivada), costos/requisitos exactos PENDIENTE; (d) para Booking.com, la
única ruta de integración más profunda que iCal manual es vía channel manager
certificado tercero, lo cual debe reflejarse como una dependencia adicional
en cualquier contrato o SLA que Atiende ofrezca sobre ese canal.

**Estado.** Adoptada; hitos de partner en estado PENDIENTE-EXTERNO por
definición, con el caso de Booking.com marcado adicionalmente como "pausa
activa confirmada", no solo "pendiente".

---

## D-012 — Invariante de no solapamiento como `EXCLUDE USING gist` con rango semiabierto `[in, out)`

**Contexto.** El invariante central del producto (ninguna unidad puede tener
dos reservas/bloqueos que se solapen) debe garantizarse a nivel de base de
datos, no solo en lógica de aplicación, para sobrevivir a bugs de concurrencia.

**Decisión.** Modelar `during` como `daterange` (o `tstzrange` si se necesita
hora exacta) con bounds semiabiertos `[check_in, check_out)`, y aplicar
`EXCLUDE USING gist (unidad_id WITH =, during WITH &&)` habilitando la
extensión `btree_gist` (necesaria porque GiST no indexa nativamente tipos como
`uuid`/`date` para el operador de igualdad). `daterange` normaliza
automáticamente a la forma canónica `[)` [DATO, RV17-F-04]; si se usa
`tstzrange`, la aplicación debe forzar explícitamente el tercer argumento
`'[)'` en cada inserción, dado que PostgreSQL no lo normaliza automáticamente
para tipos continuos.

**Alternativas consideradas.**
- Verificación de solapamiento solo en código de aplicación (sin constraint de
  BD) — descartada: no protege contra condiciones de carrera entre procesos
  concurrentes ni contra escrituras directas fuera del código de aplicación.
- Modelar con bounds inclusivos en ambos extremos — descartada: rompe el caso
  de estancias contiguas (checkout de A el mismo día que check-in de B en la
  misma unidad) al marcarlo como solapamiento falso.

**Evidencia.** RV17 §2, §3 completos (RV17-F-01, F-02, F-04); marcado
explícitamente como composición razonada de dos fuentes primarias verificadas
por separado, no como cita de un ejemplo idéntico preexistente — requiere
validación en base de prueba real antes de considerarse verificado end-to-end
(RV17 §11, riesgo #1; §13, laguna #2).

**Consecuencias.** Complementar con transacciones `SERIALIZABLE` y reintento
automático ante SQLSTATE `40001` para flujos de "leer disponibilidad, luego
reservar" (RV17 §2.4); reforzar con `pg_advisory_xact_lock` por unidad en
workers concurrentes (RV17 §7.4).

**Estado.** Adoptada; pendiente de validación empírica contra
`embedded-postgres` antes de tratarse como verificado end-to-end (ver
LAGUNAS).

---

## D-013 — Zona horaria por propiedad (IANA), nunca por servidor ni por usuario

**Contexto.** "Check-in hoy a las 3pm" depende de dónde está la propiedad, no
de dónde corre el servidor ni de dónde está el anfitrión o el huésped. Un
`timestamp without time zone` es ambiguo y rompe silenciosamente comparaciones
cross-propiedad si el servidor cambia de región.

**Decisión.** `propiedad.zona_horaria` almacena una zona horaria IANA
(`America/Cancun`, `Europe/Madrid`), nunca un offset fijo. Toda columna de
fecha/hora operativa usa `timestamptz` (instante absoluto en UTC
internamente); la conversión a hora local ocurre siempre en lectura. Para el
invariante de ocupación (D-012), se prefiere `date`/`daterange` (sin hora) por
defecto, reservando `tstzrange`/`timestamptz` para entidades donde la hora
exacta sea un requisito de negocio explícito (p. ej. check-in real capturado).

**Alternativas consideradas.**
- Offset fijo por propiedad — descartada: se desincroniza dos veces al año en
  países con horario de verano.
- Zona horaria del servidor o del usuario que opera — descartada por ser
  ambigua cuando el operador y la propiedad están en zonas distintas (caso
  normal de un portafolio multi-ciudad).

**Evidencia.** RV17 §4 completo; RV06 §10 (interpretación de `DATE` como fecha
local de la propiedad, marcado explícitamente como supuesto de diseño, no cita
textual de ningún canal); RV07 §14 (DST no afecta el cálculo de noches con
`DATE`, sí afecta timestamps de auditoría, que deben normalizarse a UTC).

**Consecuencias.** Ningún cálculo de negocio de ocupación puede mezclar
timestamps UTC con timestamps locales sin normalizar primero.

**Estado.** Adoptada.

---

## D-014 — Huésped mínimo: minimización de datos, explícitamente no un CRM

**Contexto.** El producto no debe contactar huéspedes de forma autónoma
(D-006) ni construir un perfil enriquecido cross-reserva; los datos que un
canal expone al host tienen uso limitado por sus propios términos (Airbnb:
*"You should only use personal information you receive through the Airbnb
Platform as necessary to manage your reservations..."* [DATO, RV10, artículo
2862]).

**Decisión.** `huesped_minimo` guarda solo lo que un canal expone y lo
estrictamente necesario para operar la reserva vigente (nombre, referencia de
contacto si el canal la expone). Explícitamente no se diseña: historial de
conversación completo, segmentación de marketing, ni perfil unificado
cross-reserva de "todas las estancias de esta persona".

**Alternativas consideradas.**
- Construir un CRM de huéspedes con historial enriquecido para
  personalización — descartada por exceder el principio de minimización de
  datos y por no ser necesaria para la promesa central del producto (cerrar
  disponibilidad).

**Evidencia.** RV17 §1.4, RV17-R-10; RV10-R-08 (limitación de uso de datos
personales, retención limitada al fin operativo); RV19 §2.1 ("Logs sin PII").

**Consecuencias.** Ampliar `huesped_minimo` requiere una decisión de producto
explícita que revise esta restricción, no un cambio incremental de esquema.

**Estado.** Adoptada.

---

## D-015 — Identidad visual y frontend reutilizados de `atiende-restaurantes`

**Contexto.** Existe un inventario completo y verificado del frontend de
`atiende-restaurantes` (Vite 8 + React 18 + TypeScript + shadcn/ui + Tailwind
3, Supabase), incluyendo tokens de color, tipografías, componentes y patrones
de layout, documentado en `atiende-hoteles-staging/docs/referencia/05-frontend-restaurantes.md`.

**Decisión.** Atiende Rentas Vacacionales reutiliza el mismo stack de
frontend, el mismo sistema de tokens de color (paleta "white / blue /
sky-blue": `--primary` `224 76% 48%`, `--secondary/accent` `199 89% 55%`/`0EA5E9`),
la misma tipografía (Inter / Inter Tight / IBM Plex Mono), y los mismos
componentes base reutilizables tal cual: `AtiendeLogo`/`AtiendeMark`,
`ThemeSelector`, `StatCard`/`TrendStatCard`, shells de modal
(`ModalFormularioLateral`), y los 43 primitivos shadcn/ui del catálogo
(excepto `ui/sidebar.tsx`, confirmado sin uso real en el hermano). El patrón
de sidebar con acordeón (`AdminSidebar`) se adapta con `menuSections` propias
del dominio de rentas vacacionales (ver BLUEPRINT §3).

**Alternativas consideradas.**
- Diseñar una identidad visual nueva — descartada: no hay razón de negocio
  declarada para diferenciar visualmente esta línea de producto de sus
  hermanas (Hoteles, Restaurantes), y reutilizar reduce tiempo de desarrollo
  y mantiene coherencia de marca "atiende".

**Evidencia.** `atiende-hoteles-staging/docs/referencia/05-frontend-restaurantes.md`
(inventario completo, solo lectura).

**Consecuencias.** Hereda también las deudas conocidas del hermano: el panel
admin no tiene experiencia mobile real (solo un stub de header en
`AdminDashboard`) y no hay pruebas E2E de accesibilidad — deben resolverse
explícitamente si el caso de uso de rentas vacacionales exige operación desde
tablet/celular (housekeeping, check-in en sitio), a diferencia del panel de
restaurantes que es predominantemente de escritorio.

**Estado.** Adoptada.

---

## D-016 — Presupuesto duro de gasto de IA por tenant, reservado antes de cada llamada

**Contexto.** El costo de IA por conversación es variable y trazable (RV16
§3b: entre $0.0006 y $0.0225 USD por conversación según modelo, con supuesto
explícito de 2,000/500 tokens no verificado con producción real), a diferencia
de la infraestructura base que es predecible. Existe un patrón ya verificado
en producción en Likida (`reserveLlmBudget`/`settleLlmBudget`).

**Decisión.** Cada tenant tiene un presupuesto de gasto de LLM (USD/mes,
configurable por plan) reservado **antes** de cada llamada al modelo, no
facturado después. Si el saldo no cubre la reserva estimada, la llamada no se
ejecuta; se degrada a una respuesta determinista explícita ("presupuesto de
IA agotado este mes"). Al terminar la llamada se liquida el costo real y se
libera la diferencia. Verificable en CI (RV18 §8, mecanismo 5).

**Alternativas consideradas.**
- Facturar el gasto de IA después de ocurrido, con alerta posterior —
  descartada por el mismo principio que llevó a Likida a declarar sus topes
  como duros y no como sugerencias (RV18 §3.2).

**Evidencia.** RV16 §3b, §5; RV18 §3.2, §10 (RV18-F-09, RV18-F-10).

**Consecuencias.** Requiere telemetría de consumo de tokens por conversación
desde el primer lanzamiento (RV16-R-03) para reemplazar el supuesto de
2,000/500 tokens por datos reales.

**Estado.** Adoptada.

---

## D-017 — Estado de conexión de canal honesto: nunca reportar "producción" sin evidencia verificable

**Contexto.** El estado de una cuenta de canal puede ser ambiguo (credenciales
guardadas pero acceso de partner aún no aprobado, sandbox vs. producción real).
Reportar "conectado"/"producción" sin evidencia real es exactamente el tipo de
promesa falsa que RV14 identifica como hueco de mercado no cubierto por
ningún competidor investigado ("estado de sync honesto").

**Decisión.** `getConnectionState()` de un adaptador de canal usa un tipo
cerrado: `no_conectado | bloqueado_por_partner | sandbox | producción`, y
**nunca** devuelve `"producción"` sin evidencia verificable reciente de
sincronización real exitosa (una respuesta exitosa reciente de una llamada
real, no solo la presencia de credenciales). El valor por defecto ante
ambigüedad es el estado más conservador.

**Alternativas consideradas.**
- Un booleano simple "conectado/no conectado" — descartada por ocultar la
  diferencia crítica entre "aprobado por el partner" y "credenciales
  guardadas pero sin aprobación", que tiene implicaciones legales y de
  producto distintas.

**Evidencia.** RV17 §6.2, RV17-R-09; RV14 (hueco de mercado: "estado de sync
honesto"); RV09-R-04/R-05 (indicador visible de estado de conexión con al
menos tres niveles).

**Consecuencias.** El detalle exacto de qué constituye "producción real" por
canal depende de RV03/RV04 (qué señales están disponibles para verificarlo);
RV17 fija la interfaz, no la implementación de esa verificación.

**Estado.** Adoptada.

---

## D-018 — Separación de costos: lógica determinista en cuota base, IA como add-on facturado aparte

**Contexto.** La sincronización de disponibilidad/precios es de costo casi
fijo por tenant (infraestructura predecible, RV16 §3a); el costo de IA escala
con el volumen conversacional y es altamente variable según el modelo
elegido. **Corrección aritmética (BC4, auditoría independiente
2026-09-05):** la propia tabla de RV16 §3b da $0.0006 USD/conversación para
el modelo más barato verificado (GPT-4o mini) y $0.0225 USD/conversación para
el más caro (Claude Opus 5) — una razón real de **~37.5×**, no de "~5×"
(RV16-R-06 arrastra este error aritmético). La cifra "~5×" solo es exacta si
se comparan dos modelos de la misma familia (Claude Haiku 4.5, $0.0045, vs.
Claude Opus 5, $0.0225), un par distinto al citado originalmente. El punto
cualitativo (el costo de IA varía mucho entre modelos, justificando el
add-on separado) se mantiene válido con la cifra correcta.

**Decisión.** El modelo de negocio separa: (a) cuota base de suscripción por
unidad/mes con escalones de volumen, que cubre la lógica determinista de
inventario (nunca facturada como "uso de IA" porque no lo es, D-007); (b) un
add-on de IA conversacional facturado por separado (por conversación o por
paquete mensual), desacoplado del ciclo de facturación de unidades.

**Alternativas consideradas.**
- Subsidiar el costo de IA dentro de la cuota base para todos los tenants por
  igual — descartada: penaliza a tenants de bajo uso conversacional y no
  protege el margen objetivo en escenarios de alto volumen o uso de modelos
  caros (RV16 §4).

**Evidencia.** RV16 §1, §5 completos; patrón de mercado parcialmente
verificado en Uplisting ("AI Suite Unlimited: £49/month" como add-on
explícito, RV16 §2 L-RV16-03).

**Consecuencias.** El sistema de facturación debe soportar dos ciclos
independientes (RV16-R-01, RV16-R-02).

**Estado.** Adoptada.

---

## D-019 — Simuladores de canal etiquetados explícitamente, nunca confundibles con producción

**Contexto.** En desarrollo, cada conector de canal necesita una
implementación simulada (fixtures grabados) para no depender de credenciales
reales ni de acceso de partner aprobado. El riesgo es que un simulador mal
etiquetado se confunda con producción, generando alertas falsas o, peor,
decisiones operativas sobre datos ficticios.

**Decisión.** Cada simulador de canal lleva nombre inequívoco en código y
configuración (ej. `AirbnbChannelSimulator`, nunca solo `AirbnbChannel` con un
flag oculto), URL base obviamente falsa (`simulador.local`), y una
comprobación de arranque que se niega a correr si las credenciales
configuradas parecen de producción real. En staging, si no hay sandbox real
del partner disponible, se mantiene el simulador con un banner explícito
"staging, no producción" visible en cualquier panel de operación. En
producción, los simuladores no existen.

**Alternativas consideradas.**
- Reutilizar el mismo nombre de clase con un flag de entorno — descartada por
  el riesgo de que el flag se pierda o se ignore silenciosamente en un
  despliegue mal configurado.

**Evidencia.** RV20 §8 completo.

**Consecuencias.** Las alertas de producción y de staging deben estar
visual/canalmente separadas (distinto canal de notificación) para que la
guardia humana nunca actúe sobre una alerta de staging pensando que es
producción, ni al revés.

**Estado.** Adoptada.

---

## D-020 — Multitenancy vía RLS con función `security definer` parametrizada, `FORCE ROW LEVEL SECURITY` evaluado por tabla

**Contexto.** Existe un patrón ya verificado en código real de producción del
proyecto hermano `atiende-restaurantes`
(`20260904050000_enterprise_tenant_isolation.sql`), que usa una función
`security definer` parametrizada (`is_restaurant_staff(auth.uid(), tenant_id)`)
referenciada en `USING`/`WITH CHECK`. Un documento de referencia distinto
(Hoteles) describe en cambio una función `current_tenant_ids()` sin
parámetros, solo en prosa, no verificada contra código real.

**Decisión.** Las políticas RLS de Atiende Rentas Vacacionales replican el
patrón de función `security definer` parametrizada verificado en código real
(`is_tenant_member(_user, _tenant)`), no el patrón sin parámetros descrito
solo en prosa. Toda tabla con RLS habilitado se evalúa también contra la
necesidad de `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, dado que activar RLS
sin ella no protege si el rol de conexión del backend es también el dueño de
las tablas (comportamiento documentado explícitamente por PostgreSQL: *"Table
owners normally bypass row security... unless FORCE ROW LEVEL SECURITY"*
[DATO, RV17-F-05]).

**Alternativas consideradas.**
- Seguir el patrón `current_tenant_ids()` sin parámetros del documento de
  Hoteles — descartada por ser evidencia de menor confianza (prosa
  descriptiva, no código en producción verificado).

**Evidencia.** RV17 §8.1 completo (RV17-F-05, RV17-F-09).

**Consecuencias.** RLS es fail-closed por defecto (una tabla con RLS
habilitado y sin políticas es ilegible/inescribible); todo endpoint que reciba
un ID de propiedad/reserva/calendario debe verificar permiso explícito del
llamador (RV19-R-08, ASVS 8.4.1/8.2.2/8.2.3/8.3.1).

**Estado.** Adoptada.

---

## D-021 — Observabilidad basada en semántica de OpenTelemetry, con "logs sin PII" como decisión de producto propia (no mandato de OTel)

**Contexto.** OpenTelemetry no prescribe una regla de PII en su especificación
de atributos/logs (confirmado leyendo directamente dos páginas independientes
de la especificación viva, RV20 nota metodológica). La separación `Body`/
`Attributes` del modelo de logs de OTel sí permite construir la política sin
depender de una garantía automática de la herramienta.

**Decisión.** El diseño de métricas usa los tipos de instrumento de OTel
(Counter, Histogram, UpDownCounter, Gauge asíncrono) con las dimensiones
definidas en RV20 §1.1; el flujo de sincronización se traza como una única
traza con spans PRODUCER/CONSUMER en el cruce cola-worker. La política "ningún
log interpola nombre/documento/teléfono de huésped en `Body`" se declara
explícitamente como decisión de producto de Atiende (coherente con RV19), no
como mandato externo de OpenTelemetry.

**Alternativas consideradas.**
- Atribuir la política de "logs sin PII" a un requisito de OpenTelemetry —
  descartada por ser una atribución incorrecta a la fuente, verificada como
  falsa en esta misma investigación.

**Evidencia.** RV20 §1 completo (RV20-F-01 a F-09).

**Consecuencias.** El cumplimiento de "logs sin PII" depende de disciplina de
implementación, no de una garantía automática de la herramienta de
observabilidad; requiere revisión de código, no solo configuración.

**Estado.** Adoptada.

---

## D-022 — Toolchain de pruebas: PGlite para unitarias/RLS, `embedded-postgres` para concurrencia real, Playwright contra Chrome del sistema para E2E

**Contexto.** Verificado en esta máquina (RV17 §10.1, RV20 §8): sin Docker,
sin Supabase CLI local funcional, sin `psql` de sistema; Node v25.6.1
disponible. PGlite serializa toda concurrencia (1344 ms medido vs. 302 ms de
`embedded-postgres` para la misma prueba); Playwright puede conducir el Chrome
ya instalado sin descargar binarios propios.

**Decisión.** Unitarias y pruebas de lógica de negocio/RLS corren contra
PGlite + Vitest (arranque instantáneo). Pruebas de integración/concurrencia
real del `EXCLUDE` (D-012) y de idempotencia bajo carrera corren
obligatoriamente contra `embedded-postgres`, nunca solo contra PGlite. E2E usa
Playwright con `channel: 'chrome'` contra el Chrome del sistema.

**Alternativas consideradas.**
- Validar el `EXCLUDE` solo con PGlite por conveniencia de velocidad —
  descartada explícitamente: PGlite da falsos positivos de seguridad para
  pruebas de contención real (medido en esta sesión y en la de referencia de
  Hoteles).

**Evidencia.** RV17 §10 completo; RV20 §8 completo (mediciones reales
ejecutadas en esta máquina y heredadas de `atiende-hoteles-staging/docs/referencia/07-stack-viabilidad.md`).

**Consecuencias.** El pipeline de CI debe incluir ambos motores como gates
separados, no uno como sustituto del otro.

**Estado.** Adoptada.

---

## D-023 — Ninguna funcionalidad fiscal/legal se libera sin lectura de norma vigente y revisión de fiscalista/abogado local

**Contexto.** Lagunas legales significativas y declaradas: vigencia post-2024
de las tasas de retención ISR/IVA en México (`docs/BLOQUEOS.md` **B-005**,
RV19 §6 — corrección BC3, auditoría independiente 2026-09-05: la versión
anterior de esta decisión atribuía erróneamente esta laguna a B-003/B-004,
que son en realidad la normativa española de registro y la regulación local
de CDMX, no la fiscal mexicana; B-005 se creó específicamente para esta
laguna), existencia no confirmada de un Real Decreto español de "Registro
Único de Arrendamientos" (`docs/BLOQUEOS.md` B-003, RV19 §2.5, laguna
crítica), regulación local de CDMX no verificable (`docs/BLOQUEOS.md`
B-004).

**Decisión.** Ninguna funcionalidad de cálculo/declaración fiscal, registro de
viajeros, o número de registro de anuncio se libera a producción sin (a)
lectura confirmada de la normativa oficial vigente y (b) revisión firmada de
un contador/abogado local. Estas funciones se implementan, cuando se
implementan antes de esa confirmación, como campos opcionales configurables
sin afirmar fundamento legal en la UI (RV19-R-13).

**Alternativas consideradas.**
- Lanzar con supuestos razonables sobre la normativa vigente marcados como
  "mejor esfuerzo" — descartada: el riesgo legal/reputacional de una cifra
  fiscal incorrecta o una promesa de cumplimiento falsa supera el costo de
  esperar la verificación.

**Evidencia.** RV19 completo, especialmente §2.4-2.5, §6; `docs/BLOQUEOS.md`
B-003 (España), B-004 (CDMX), B-005 (fiscal México).

**Consecuencias.** El plan enterprise (BLUEPRINT §13) marca estos hitos como
condicionados a verificación externa (misma categoría que D-011).

**Estado.** Adoptada.

---

## Índice de decisiones por estado

| Estado | Decisiones |
|---|---|
| Adoptada (cerrada) | D-001, D-003, D-004, D-005, D-006, D-007, D-008, D-013, D-014, D-015, D-016, D-017, D-018, D-019, D-020, D-021, D-022, D-023 |
| Adoptada con detalle pendiente | D-002 (mecanismo de conflicto capa-cruzada especificado en BLUEPRINT §3.2, corrección BC1; pendiente de validación empírica), D-009 (convergencia a Supabase sujeta a validación de negocio), D-012 (validación empírica pendiente) |
| PENDIENTE-EXTERNO (depende de tercero) | D-011 (aprobación de partners de canal) |
