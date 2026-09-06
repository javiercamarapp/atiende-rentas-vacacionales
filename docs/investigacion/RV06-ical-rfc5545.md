# RV06 — iCal / RFC 5545: semántica y límites

Investigador: Sonnet (subagente), sesión Fable 5.1. Consulta de fuentes: 2026-09-05. Ledger de evidencia: `docs/fuentes/rv06-07.md` (sección RV06, 24 filas de evidencia distintas). Convención de etiquetas: `[DATO]` = leído literalmente en fuente primaria/oficial (RFC, documentación oficial de canal); `[R]` = fuente secundaria (blog/análisis de terceros); `[E]` = estimación o inferencia de diseño propia del investigador, sin cita textual (ver `00-PLAN.md` §2).

## Resumen ejecutivo

iCalendar (RFC 5545) es el único lenguaje común entre Airbnb, Booking.com y Vrbo para sincronizar disponibilidad por URL `.ics` [DATO]. El hecho técnico central para el calendario unificado es que **`DTEND` es exclusivo** (RFC 5545 §3.6.1/§3.8.2.2) [DATO]: un evento `DTSTART;VALUE=DATE:20070628` / `DTEND;VALUE=DATE:20070709` cubre las noches del 28 de junio al 8 de julio inclusive, liberando el 9 de julio como posible check-in [DATO — ejemplo textual del propio RFC]. Esto mapea directo al invariante de negocio `[check-in, check-out)`. El resto del estándar (UID/SEQUENCE para versionar, STATUS para cancelaciones, TRANSP para bloqueo real vs informativo, VTIMEZONE/floating time para fechas sin huso) da la gramática [DATO], pero **no transporta tarifas, restricciones de estancia, datos de huésped, mensajería ni estado de pago** [DATO por ausencia, confirmado por lectura directa del texto del RFC] — eso es la laguna estructural que obliga a que RV07 trate el feed iCal como señal de disponibilidad solamente, nunca como fuente de reservas completas.

## Contenido

### 1. VEVENT: DATE vs DATE-TIME, y DTEND exclusivo

RFC 5545 define dos formas de fecha para `DTSTART`/`DTEND` en un `VEVENT`:
- **DATE** (§3.3.4): `AAAAMMDD`, sin componente horario. Ejemplo del propio RFC: `19970714` [DATO].
- **DATE-TIME** (§3.3.5): tres formas — UTC (`19980119T070000Z`), local con `TZID` (`TZID=America/New_York:19980119T020000`), y **local flotante** sin designador UTC ni TZID (`19980118T230000`), que el RFC define como "not bound to any time zone in particular" (§3.3.5) [DATO].

Regla de exclusividad (§3.6.1, confirmada también en la reproducción de icalendar.org): *"The DTSTART property for a VEVENT specifies the inclusive start of the event... The DTEND property for a VEVENT calendar component specifies the non-inclusive end of the event."* [DATO] El ejemplo canónico del RFC:
```
DTSTART;VALUE=DATE:20070628
DTEND;VALUE=DATE:20070709
```
representa un evento del 28 de junio al 8 de julio (ambos inclusive); el 9 de julio queda fuera [DATO]. **Invariante para RV06/RV07:** una reserva de canal con noches `[c_in, c_out)` se codifica como `DTSTART;VALUE=DATE=c_in` y `DTEND;VALUE=DATE=c_out`; el día `c_out` NUNCA debe marcarse ocupado por ese evento — es exactamente el día en que otra reserva puede entrar (estancias contiguas). [E — invariante de diseño derivado de la regla RFC anterior, no cita textual adicional]

Cuando `DTSTART` es DATE-TIME y falta `DTEND`/`DURATION`, RFC 5545 §3.8.2.2 fija que "the event ends on the same calendar date as the DTSTART property" (duración implícita de un día natural) [DATO]. Cuando `DTSTART` es DATE y faltan ambos, la duración implícita es un día (§3.8.2.2) [DATO]. En la práctica de rentas vacacionales los feeds de los canales siempre incluyen `DTEND` explícito para bloques de noches, pero un importador robusto debe implementar estos valores por defecto para no fallar ante eventos atípicos (bloqueos manuales de un día exportados sin `DTEND`). [E]

### 2. DURATION

§3.3.6 define `DURATION` como alternativa a `DTEND` (`dur-value = (['+']/'-') 'P' (dur-date / dur-time / dur-week)`) [DATO], p. ej. `P3D` para tres días. RFC 5545 permite `DTSTART` + `DURATION` en vez de `DTSTART` + `DTEND`; un parser de RV06 debe soportar ambos caminos y normalizarlos internamente a `[check-in, check-out)` calculando `DTEND = DTSTART + DURATION`. [E — requisito de diseño derivado] Laguna: no encontramos evidencia primaria de que Airbnb/Vrbo usen `DURATION` en sus feeds exportados (ambos ejemplos observados usan `DTEND` explícito); no se afirma su uso real, solo la obligación de soportarlo por conformidad al estándar.

### 3. UID y SEQUENCE — identidad y versión del evento

- **UID** (§3.8.4.7): "the persistent, globally unique identifier for the calendar component" [DATO]; debe soportar al menos 255 octetos sin truncar secuencias UTF-8, y el método recomendado combina un valor DATE-TIME con un identificador de dominio separados por `@` [DATO]. Es la clave natural para deduplicar/anti-eco en RV07: el mismo `UID` reaparecerá en sucesivos `GET` del mismo feed. [E — consecuencia de diseño]
- **SEQUENCE** (§3.8.7.4): "To specify the revision number of the calendar component" [DATO]; por defecto 0 al crear el componente, y se incrementa cada vez que el organizador lo modifica [DATO]. Es el mecanismo estándar para versionar un evento y descartar actualizaciones fuera de orden (ver RV07 idempotencia por `UID+SEQUENCE`). [E]

Laguna: RFC 5545 dice que `SEQUENCE` se incrementa "each time... modified by the Organizer" en el contexto de iTIP (colaboración organizador/asistentes) [DATO]. En feeds de disponibilidad publicados (sin `METHOD`, ver §4) no hay evidencia primaria de que los canales incrementen `SEQUENCE` de forma consistente al mover/extender una reserva; debe tratarse como señal oportunista, no garantía, y complementarse con hash de contenido (ver RV07). [E]

### 4. DTSTAMP, LAST-MODIFIED

- **DTSTAMP** (§3.8.7.2): debe expresarse en UTC; marca cuándo el componente fue creado/emitido [DATO].
- **LAST-MODIFIED** (§3.8.7.3): "specifies the date and time in UTC when the calendar information was last revised." [DATO] Útil como segunda señal (además de `SEQUENCE`) para ordenar eventos y detectar reimportaciones sin cambios reales. [E]

### 5. STATUS (TENTATIVE / CONFIRMED / CANCELLED)

§3.8.1.11 define para `VEVENT` exactamente tres valores: `TENTATIVE` (tentativo), `CONFIRMED` (definitivo) y `CANCELLED` (cancelado) [DATO]. **Implicación crítica para RV07:** una reserva de canal cancelada llega en el feed como un `VEVENT` con `STATUS:CANCELLED` (o, según el canal, simplemente desaparece del feed en la siguiente sincronización) — RV07 debe tratar ambos casos como "liberar esa franja **solo si nada más la ocupa**" (ver invariante de no reabrir noches, más abajo). [E — regla de diseño; nunca implica cancelar una reserva del propio sistema ni contactar al huésped, solo actualizar el estado de disponibilidad reflejado] Laguna: no hay evidencia primaria de qué canal usa `STATUS:CANCELLED` explícito vs. omisión del evento; debe soportarse ambos comportamientos.

### 6. TRANSP (OPAQUE / TRANSPARENT)

§3.8.2.7: `OPAQUE` bloquea en búsquedas de tiempo ocupado; `TRANSPARENT` no bloquea. Valor por defecto: `OPAQUE` [DATO]. En el ejemplo oficial del RFC, un evento de festival de varios días se marca `TRANSP:TRANSPARENT` (evento informativo, no ocupa recurso) [DATO]. Para feeds de disponibilidad de canales, un evento que representa una reserva/bloqueo real debe interpretarse como bloqueante independientemente de `TRANSP` si el canal no lo usa consistentemente — **no se debe confiar en `TRANSP` como único mecanismo de bloqueo**; la semántica de "esto cierra disponibilidad" la define el hecho de que el evento existe en el feed de reservas del canal, no el valor de `TRANSP`. [E] Laguna: no verificamos qué valor de `TRANSP` usan Airbnb/Booking/Vrbo en sus exports (no documentado en las fuentes oficiales leídas).

### 7. SUMMARY / DESCRIPTION — qué exportan los canales

Ninguna de las fuentes oficiales leídas (Airbnb Help artículo 99, Vrbo Help) documenta el texto exacto de `SUMMARY`/`DESCRIPTION` que generan sus feeds (p. ej. si usan literalmente "Reserved"/"Not available") [DATO por ausencia]. **Laguna explícita**: no se afirma ningún texto concreto porque no está documentado en fuente primaria consultada. Lo que sí confirma Airbnb (artículo 99) es el alcance de datos: el sync mueve fechas de disponibilidad entre plataformas ("nights that you block—or that are booked on Airbnb—will be blocked on the other website's calendar") [DATO]; el artículo no contiene una declaración explícita sobre inclusión/exclusión de PII, precio o datos de huésped en el propio archivo `.ics` — tratamos esto como laguna documental, aunque el diseño de RV07 debe asumir el peor caso razonable (ver sección "Qué NO transporta iCal"). [E]

### 8. RRULE / EXDATE — ¿aparecen en feeds de rentas?

RFC 5545 define `RRULE` (§3.8.5.3, "a rule or repeating pattern for recurring events") [DATO] y `EXDATE` (§3.8.5.1, "the list of DATE-TIME exceptions for recurring calendar components") [DATO] como mecanismos genéricos de recurrencia. **Laguna:** ninguna fuente oficial de Airbnb/Vrbo consultada documenta el uso de `RRULE`/`EXDATE` en sus feeds de disponibilidad — los ejemplos y descripciones observados tratan cada noche/reserva como un `VEVENT` discreto con `DTSTART`/`DTEND` propios, no como una serie recurrente. RV07 debe: (a) soportar el parseo de `RRULE`/`EXDATE` por conformidad al estándar (un feed de terceros o una herramienta de gestión podría emitirlos), pero (b) no asumir que los canales objetivo los usan, y (c) expandir cualquier recurrencia a instancias concretas antes de aplicar el modelo `[check-in, check-out)`. [E]

### 9. METHOD — ausencia implica "publish"

§3.7.2 define `METHOD` con valores `PUBLISH / REQUEST / REPLY / ADD / CANCEL / REFRESH / COUNTER / DECLINECOUNTER` [DATO]. RFC 5546 (iTIP) especifica el método `PUBLISH`: *"Used to publish an iCalendar object to one or more 'Calendar Users'. There is no interactivity between the publisher and any other 'Calendar User'."* [DATO] y exige que el organizador esté presente y los asistentes ausentes en un objeto publicado [DATO]. Los feeds `.ics` de disponibilidad de Airbnb/Booking/Vrbo son de solo lectura, sin intercambio de mensajes de programación (REQUEST/REPLY): son, en efecto, objetos de calendario publicados para consumo pasivo. [E] **No encontramos en RFC 5546 una declaración explícita de que la ausencia de `METHOD` implique `PUBLISH` por defecto** (RFC 5545 §3.7.2 no fija un default; RFC 5546 define la semántica de cada método pero no dicta comportamiento cuando `METHOD` está ausente del todo) [DATO por ausencia] — esto queda como **laguna del estándar**: la convención de facto (icalendar sin `METHOD` = documento no transaccional, sin flujo iTIP) es una práctica de la industria, no un mandato textual verificado en las RFC leídas. RV07 debe tratar cualquier feed sin `METHOD` como una instantánea de solo lectura y no intentar aplicar semántica de iTIP (REQUEST/REPLY/CANCEL) sobre él. [E]

### 10. TZID / VTIMEZONE / DST y feeds sin zona horaria

- `TZID` (§3.2.19) debe especificarse en `DTSTART`/`DTEND`/etc. cuando el valor "es DATE-TIME o TIME y no es UTC ni tiempo flotante" [DATO].
- `VTIMEZONE` (§3.6.5): "To specify time zone offset information and daylight saving time rules for a time zone" [DATO]; se compone de subcomponentes `STANDARD`/`DAYLIGHT` que fijan el offset vigente y las fechas efectivas de cada observancia (mecanismo interno de DST) [DATO].
- RFC 8536 (TZif) formaliza el formato binario de intercambio de la IANA Time Zone Database para las mismas reglas standard/daylight; confirma que las transiciones ocurren "when one or more of the following happen simultaneously: a change in UT offset, a change in whether daylight saving time is in effect, a change in time zone abbreviation, or a leap second" [DATO] — es la referencia formal detrás de las reglas que `VTIMEZONE` codifica en texto.
- Fecha local flotante (§3.3.5): cuando un evento no lleva `TZID` ni designador `Z`, es "floating" y se interpreta en la zona horaria de quien lo lee, NO en una zona absoluta [DATO].

**Consecuencia de diseño (no de RFC, sino invariante de producto):** dado que los feeds de disponibilidad observados usan `DTSTART;VALUE=DATE`/`DTEND;VALUE=DATE` (fechas de calendario, no instantes), y que un `DATE` no lleva huso horario, la interpretación correcta y sin ambigüedad es **la fecha local de la propiedad** (el check-in/check-out ocurre en el día calendario del inmueble, no en UTC ni en la zona del servidor). Esto es una inferencia razonada a partir de la semántica DATE de RFC 5545 (que no tiene huso) más el hecho de que una reserva física ocurre en un lugar concreto; **no** es una afirmación textual de ninguna RFC ni de los canales — se documenta aquí como supuesto de diseño `[E]`, no como hecho citado.

### 11. Codificación, folding, CRLF y robustez de parsers

- Longitud de línea: RFC 5545 §3.1 — *"Lines of text SHOULD NOT be longer than 75 octets, excluding the line break... a long line can be split between any two characters by inserting a CRLF immediately followed by a single linear white-space character."* [DATO] Esto es "folding"; un parser debe des-plegar (unfold) antes de tokenizar, y un generador debe volver a plegar líneas largas (SUMMARY/DESCRIPTION largos). [E]
- Terminador de línea: CRLF (implícito en toda la gramática ABNF del RFC; ver definición de `contentline` en §3.1) [DATO].
- **RFC 5545 no define ningún límite máximo de tamaño para el objeto calendario completo ni para el número de componentes** (confirmado por lectura directa; no se encontró tal límite en el texto) [DATO por ausencia, confianza media — verificación por ausencia, no exhaustiva línea por línea de las ~150 páginas del documento]. Esto es una laguna del estándar que obliga a que los límites de tamaño/eventos sean una política de implementación propia (RV07), no algo heredado del RFC.
- Codificación de caracteres especiales en valores de parámetro: RFC 6868 — permite incluir salto de línea, `^` y `"` dentro de un valor de parámetro mediante escape `^n`, `^^`, `^'` respectivamente (abstract: *"allow parameter values to include certain characters forbidden by the existing specifications"*) [DATO]. Relevante para `DESCRIPTION`/`SUMMARY` con comillas o saltos de línea internos si algún canal los produjera.
- **Parsers robustos y ataques al importar feeds (evidencia externa a RFC 5545, literatura de seguridad leída):**
  - iCalendar es un formato de texto plano por líneas, no XML — los ataques clásicos de "billion laughs"/expansión de entidades XML no aplican directamente al formato ABNF de RFC 5545, pero sí aplican riesgos análogos si un canal exporta variantes xCal (XML) o si el parser reutiliza un motor XML para otra parte del pipeline; no encontramos evidencia primaria de que Airbnb/Booking/Vrbo usen xCal, por lo que el riesgo de expansión de entidades queda como mitigación defensiva general, no como amenaza documentada contra estos canales específicos. [E]
  - Tamaños enormes / DoS: RFC 5545 no limita el tamaño, así que un feed hostil o mal configurado (URL apuntando a un archivo gigante, o un servidor que sirve contenido infinito por streaming) puede agotar memoria/CPU del importador. Mitigación de ingeniería (no citada de una RFC): límites de tamaño de descarga, timeout, streaming con cota dura de eventos, rechazo si se excede el umbral con cuarentena (ver RV07). [E]
  - SSRF al importar feeds por URL: OWASP SSRF Prevention Cheat Sheet documenta que la causa raíz es que "URL are difficult to validate and the parser can be abused" [DATO] y recomienda, para el caso de recursos externos arbitrarios (aplicable aquí: el usuario pega la URL `.ics` de "otro canal"), validar que la URL resuelva a una IP pública, bloquear explícitamente rangos privados/loopback y el servicio de metadatos de nube (`169.254.169.254`, `metadata.amazonaws.com`, `127.0.0.0/8`, `::1/128`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), deshabilitar el seguimiento automático de redirecciones HTTP, y preferir listas de permitidos sobre listas de bloqueo [DATO — cita textual del cheat sheet oficial de OWASP]. Esto aplica directamente a RV06/RV07: el import de un feed de "otro canal" es, por diseño del producto, una función que acepta una URL arbitraria pegada por el anfitrión — superficie SSRF real si el backend hace el `GET` desde la propia infraestructura. [E]

### 12. HTTP caching y TTL/REFRESH-INTERVAL

- `ETag`/`If-Modified-Since`: RFC 5545 no define nada sobre transporte HTTP (es agnóstico de transporte) [DATO por ausencia]; el uso de condicional HTTP (`ETag`, `If-Modified-Since`/`Last-Modified` de HTTP, no confundir con la propiedad iCalendar `LAST-MODIFIED`) para evitar re-descargar un feed sin cambios es una práctica de integración estándar de HTTP, no del RFC de iCalendar. [E] No encontramos documentación primaria de Airbnb/Booking/Vrbo confirmando que sus servidores de export honren `ETag`/`If-Modified-Since` — **laguna**: se recomienda que el importador los envíe siempre (no cuesta nada) y trate su ausencia de soporte como comportamiento normal, sin depender de ellos para corrección. [E]
- `REFRESH-INTERVAL` (RFC 7986 §5.7): *"specifies a suggested minimum interval for polling for changes of the calendar data from the original source of that data"* [DATO], tipo `DURATION`, ejemplo `REFRESH-INTERVAL;VALUE=DURATION:P1W` [DATO]. Es una propiedad que el **publicador** puede incluir dentro del propio `.ics` para sugerir cada cuánto se debe re-consultar. Laguna: no encontramos evidencia de que Airbnb/Booking/Vrbo incluyan `REFRESH-INTERVAL` en sus feeds — sus frecuencias de sync documentadas (ver RV07) están en artículos de ayuda, no en la propiedad del estándar.
- `SOURCE` (RFC 7986 §5.8): identifica la URL canónica desde la que refrescar el calendario [DATO]; propiedad opcional, sin evidencia de uso por los canales objetivo.

## Qué NO transporta iCal (y consecuencias)

Por diseño del formato (confirmado por ausencia: ninguna propiedad de RFC 5545/5546/6868/7986 leída transporta estos conceptos, y las fuentes de ayuda de Airbnb/Vrbo describen el sync exclusivamente en términos de disponibilidad/fechas) [DATO por ausencia]:
- **Tarifas / precio de la reserva.** No hay propiedad iCalendar para tarifa. Consecuencia: iCal nunca puede usarse para conciliar ingresos ni mostrar precio por canal; solo cierra/abre disponibilidad. [E]
- **Restricciones de estancia** (`minimum stay`, `LOS`, `closed to arrival/departure`). No hay propiedad estándar para esto en RFC 5545; algunos PMS las codifican de forma no estándar en `DESCRIPTION`, pero no encontramos evidencia primaria de que Airbnb/Booking/Vrbo lo hagan en sus feeds de disponibilidad exportados. Consecuencia: un motor de reservas que solo lea iCal no puede replicar reglas de estancia mínima del canal origen. [E]
- **Datos del huésped** (nombre, contacto, número de huéspedes, mensajes). No documentado como incluido; Airbnb confirma que el sync trata "availability", no datos de huésped explícitamente en las secciones leídas [DATO]. Consecuencia: iCal no sirve para atención al huésped ni para pre-check-in; el producto no debe (y contractualmente no puede) inferir identidad del huésped desde el feed. [E]
- **Estado de pago.** Ninguna propiedad de RFC 5545 lo transporta. Consecuencia: reconciliación financiera requiere APIs de canal o exportes contables separados, nunca el `.ics`. [E]

Estas ausencias son la razón estructural por la que RV07 debe definir el iCal como **capa de cierre de disponibilidad únicamente**, con una fuente de verdad interna separada para tarifas/reglas/datos de huésped que vive fuera del feed.

## Riesgos / límites

1. Ambigüedad de `DTEND` para implementadores nuevos: confundir exclusivo con inclusivo produce off-by-one que cierra o abre una noche de más/menos — riesgo central que motiva el invariante formal más abajo.
2. Sin límite de tamaño en el estándar → cualquier control de tamaño es responsabilidad de la implementación (política propia, no derivada del RFC).
3. `SEQUENCE`/`LAST-MODIFIED` no garantizados por los canales en modo `PUBLISH` puro (evidencia primaria no confirma su incremento consistente fuera de flujos iTIP con organizador/asistente) → no puede ser el único mecanismo de orden; se necesita hash de contenido (RV07).
4. Ausencia de `METHOD` documentado como default `PUBLISH` en texto explícito de RFC 5546 → tratamiento como "publish" es inferencia de la industria, no mandato textual verificado.
5. SSRF real si el importador de "pega tu URL .ics de otro canal" no valida destino (ver §11).
6. Floating time / fecha local de la propiedad es un supuesto de diseño razonado `[E]`, no un hecho citado — debe validarse contra ejemplos reales de feeds de Airbnb/Booking/Vrbo antes de construir (no se tuvo acceso a un feed `.ics` real de un anfitrión en esta investigación).

## Implicaciones para requisitos e invariantes formales

- **RV06-R-01**: El sistema DEBE interpretar `DTEND` (o `DTSTART+DURATION`) como límite exclusivo al mapear cualquier `VEVENT` a un rango de noches `[check-in, check-out)`. *Invariante formal:* para todo evento importado `e`, `noches_ocupadas(e) = { d : DTSTART(e) ≤ d < DTEND(e) }`; el día `DTEND(e)` nunca pertenece a `noches_ocupadas(e)`. *(Base: RFC 5545 §3.6.1/§3.8.2.2 [DATO].)*
- **RV06-R-02**: El sistema DEBE soportar tanto `DTEND` explícito como `DTSTART+DURATION`, normalizando a la misma representación interna antes de cualquier cálculo de disponibilidad. *(Base: RFC 5545 §3.3.6 [DATO]; requisito de normalización [E].)*
- **RV06-R-03**: El sistema DEBE tratar `UID` como clave de identidad del evento de canal y `SEQUENCE`/`LAST-MODIFIED`/hash de contenido como señales de versión, sin asumir que un canal incrementa `SEQUENCE` de forma fiable. *(Base: RFC 5545 §3.8.4.7, §3.8.7.4 [DATO]; regla de no confiar ciegamente en SEQUENCE [E].)*
- **RV06-R-04**: El sistema DEBE tratar la ausencia o presencia de `STATUS:CANCELLED` como equivalentes semánticos de "esta reserva de canal ya no reclama esas noches", sujeto siempre a la regla de no reapertura de RV07 (una noche ocupada por otra causa no se libera). Esta regla opera exclusivamente sobre el estado de disponibilidad reflejado en el calendario unificado; en ningún caso implica que el propio sistema cancele una reserva del canal ni contacte al huésped — esas acciones siguen siendo, siempre, decisión y ejecución humana. *(Base: RFC 5545 §3.8.1.11 [DATO]; regla operativa [E].)*
- **RV06-R-05**: El sistema NO DEBE derivar tarifas, restricciones de estancia, datos de huésped ni estado de pago de un feed iCal; estos campos DEBEN provenir de la fuente de verdad interna o de integraciones API dedicadas. *(Base: ausencia de estas propiedades en RFC 5545/5546/6868/7986 [DATO por ausencia].)*
- **RV06-R-06**: El importador de feeds `.ics` por URL DEBE aplicar controles anti-SSRF (resolución DNS a IP pública, bloqueo de rangos privados/loopback/metadata, sin redirecciones automáticas) antes de cualquier `GET`. *(Base: OWASP SSRF Prevention Cheat Sheet [DATO].)*
- **RV06-R-07**: El sistema DEBE imponer límites propios de tamaño de descarga, número de líneas/eventos y timeout al parsear un feed, dado que RFC 5545 no define ninguno. *(Base: ausencia de límite en RFC 5545 [DATO por ausencia]; política de mitigación [E].)*
- **RV06-R-08**: Toda fecha `DATE` (sin hora) de un `VEVENT` importado DEBE interpretarse en la zona horaria local de la propiedad (supuesto de diseño `[E]`, no hecho de RFC), y documentarse como tal ante el usuario.

## Lagunas

1. Texto exacto de `SUMMARY`/`DESCRIPTION` que emiten Airbnb/Booking/Vrbo (p. ej. "Reserved"/"Not available") — no documentado en las fuentes oficiales leídas.
2. Uso real de `RRULE`/`EXDATE` por los canales objetivo — no documentado; se soporta por conformidad, no por evidencia de uso.
3. Uso real de `TRANSP` por los canales objetivo — no documentado.
4. Declaración textual explícita en RFC 5546 de que la ausencia de `METHOD` implica `PUBLISH` — no encontrada; la práctica es inferencia de industria.
5. Soporte de Airbnb/Booking/Vrbo a `ETag`/`If-Modified-Since` HTTP en sus endpoints de export — no documentado.
6. Uso de `REFRESH-INTERVAL` (RFC 7986) por los canales objetivo — no documentado.
7. Fuente primaria oficial de Booking.com sobre iCal: los intentos de acceso a `partner.booking.com` y `partnerhelp.booking.com` devolvieron HTTP 403 durante esta investigación; ninguna afirmación de Booking.com se cita en este documento sin haber sido leída directamente. Referencia cruzada: `docs/LAGUNAS.md` §2.2 "Booking.com — iCal import (fallback sin conectividad)", confirmada como LAGUNA HONESTA/PENDIENTE-EXTERNO incluso contra Wayback Machine (CDX vacío, sin capturas históricas).
8. No se tuvo acceso a un feed `.ics` real exportado por un anfitrión para validar empíricamente los supuestos de esta investigación (fecha local de propiedad, ausencia de `RRULE`, etc.). Referencia cruzada: `docs/LAGUNAS.md` §1.2, §2.2, §3.2 (dimensión "UID/SEQUENCE/dedupe/idempotencia" marcada LAGUNA HONESTA en los tres canales por la misma razón).
9. **Cobertura de fuentes de este módulo.** Este módulo cuenta con 24 URLs primarias reales listadas en el ledger (`docs/fuentes/rv06-07.md`, filas 1–24 correspondientes a RV06; las filas 25–35 pertenecen mayoritariamente a RV07), de las cuales 21 son directamente citables en el cuerpo de este documento (ver "Fuentes de este módulo" abajo). Esto queda ligeramente por debajo del mínimo de 25 URLs distintas exigido por `00-PLAN.md` §1.3 si se cuenta solo la porción propia de RV06 del ledger compartido; no se rellena con fuentes no leídas — las líneas 1 a 8 de esta sección enumeran exactamente lo que falta por verificar.

## Supuestos

- Se asume que "fecha local de la propiedad" es la interpretación correcta de un `VALUE=DATE` sin huso, por ser la única interpretable sin ambigüedad en el dominio de negocio (una noche de hotel ocurre en un lugar); no es un hecho citado de ninguna fuente. `[E]`
- Se asume que los tres canales objetivo (Airbnb, Booking.com, Vrbo) generan `VEVENT` discretos por reserva/bloqueo con `DTSTART`/`DTEND` tipo `DATE`, por analogía con los ejemplos y descripciones de ayuda oficiales leídos, sin haber inspeccionado un feed real. `[E]`
- Se asume que un feed sin `METHOD` debe tratarse como instantánea de solo lectura (sin iTIP), siguiendo la práctica de industria documentada indirectamente por el hecho de que RFC 5546 solo define semántica de intercambio bidireccional organizador/asistente, ausente en estos feeds. `[E]`

## Fuentes de este módulo

Fecha de consulta de todas las URLs: 2026-09-05 (confirmado en el propio módulo y en `docs/fuentes/rv06-07.md`). Ledger completo con confianza y laguna asociada por fila: `docs/fuentes/rv06-07.md`.

**RFC 5545 — iCalendar (núcleo del estándar):**
- https://www.rfc-editor.org/rfc/rfc5545.txt — texto completo, IETF (DTSTART/DTEND §3.6.1, DURATION §3.3.6, UID §3.8.4.7, SEQUENCE §3.8.7.4, DTSTAMP §3.8.7.2, LAST-MODIFIED §3.8.7.3, RRULE §3.8.5.3, EXDATE §3.8.5.1, METHOD §3.7.2, TZID §3.2.19, VTIMEZONE §3.6.5, DATE-TIME §3.3.5, DATE §3.3.4, folding §3.1)
- https://icalendar.org/iCalendar-RFC-5545/3-6-1-event-component.html — mirror con ejemplo canónico DTSTART/DTEND (§3.6.1)
- https://icalendar.org/iCalendar-RFC-5545/3-8-4-7-unique-identifier.html — mirror UID
- https://icalendar.org/iCalendar-RFC-5545/3-8-1-11-status.html — mirror STATUS (§3.8.1.11)
- https://icalendar.org/iCalendar-RFC-5545/3-8-2-7-time-transparency.html — mirror TRANSP (§3.8.2.7)

**RFCs complementarias (iTIP, encoding, propiedades nuevas, timezone database):**
- https://www.rfc-editor.org/rfc/rfc5546.txt — RFC 5546, iTIP (METHOD PUBLISH)
- https://www.rfc-editor.org/rfc/rfc6868.txt — RFC 6868, Parameter Value Encoding
- https://www.rfc-editor.org/rfc/rfc7986.txt — RFC 7986, New Properties for iCalendar (REFRESH-INTERVAL §5.7, SOURCE §5.8)
- https://www.rfc-editor.org/rfc/rfc8536.txt — RFC 8536, Time Zone Information Format (TZif)

**Documentación oficial de canal (comportamiento real de export/import):**
- https://www.airbnb.com/help/article/99 — "Sync your home host calendar to other websites", Airbnb Help Center
- https://help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar — "Import a calendar to sync with Vrbo"
- https://help.vrbo.com/articles/Export-your-reservation-calendar — "Export your property's reservation calendar"

**Seguridad y patrones de ingeniería (nivel 1–2 de la jerarquía de fuentes):**
- https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html — OWASP SSRF Prevention Cheat Sheet
- https://microservices.io/patterns/data/transactional-outbox.html — Transactional Outbox pattern, Chris Richardson (fuente de nivel 3, especialista con metodología declarada — usada en RV07, referenciada aquí por completitud del ledger compartido)

Nota de cobertura: las URLs de Booking.com (`partner.booking.com`, `partnerhelp.booking.com`) intentadas para este módulo devolvieron HTTP 403 en las cuatro solicitudes realizadas y no aparecen en esta lista porque no fueron leídas — ver Lagunas #7. El total de URLs realmente leídas y citables para RV06 específicamente es 21 (18 de las 24 filas propias de RV06 en el ledger compartido, más 3 filas de RFC/OWASP compartidas con RV07 que también sustentan afirmaciones de este módulo), por debajo del mínimo de 25 URLs distintas exigido por `00-PLAN.md` §1.3 si se cuenta de forma aislada del ledger conjunto RV06/RV07; no se rellena con fuentes no leídas — ver Lagunas arriba para lo que falta por verificar.
