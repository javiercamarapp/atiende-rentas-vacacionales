# RV21 — Pruebas, aceptación y plan enterprise

Fuentes: ver `docs/fuentes/rv19-21.md` (entradas B1–B12, A4, A16, C1–C7). Los objetivos numéricos de carga/latencia que no tienen respaldo en fuente oficial se marcan explícitamente como **pendientes de fijar empíricamente en piloto**, nunca como SLA inventado.

Contexto de producto: calendario unificado que sincroniza disponibilidad entre canales (Airbnb, Booking.com, otros) vía feeds iCal periódicos, y **cierra disponibilidad entre canales** para evitar overbooking. Nunca cancela reservas ni contacta huéspedes sin autorización.

---

## 1. Resumen ejecutivo

La especificación iCalendar (RFC 5545/5546) define un algoritmo de resolución de conflictos —**UID (clave primaria) → SEQUENCE (clave secundaria) → DTSTAMP (desempate)**— pero deja explícitamente sin definir tanto el comportamiento ante UID reciclado como cualquier límite de tamaño/volumen del feed. **Corrección de énfasis (alineada con RV06/RV07 y con la contradicción #6 de la auditoría independiente):** este algoritmo describe la sintaxis normativa del estándar, pero no debe tratarse como garantía confiable contra los canales reales — no hay evidencia primaria de que Airbnb, Booking.com o Vrbo incrementen SEQUENCE de forma consistente al mover/extender una reserva en sus feeds `PUBLISH`; debe tratarse como **señal oportunista, no garantía**, y todo criterio de aceptación que dependa de él (casos adversariales 1, 3 y 13 de la sección 3) exige además la verificación por **hash de contenido** del evento (fechas, estado) como respaldo obligatorio antes de considerar resuelto un conflicto de sincronización. Esto convierte "UID reciclado", "mensajes fuera de orden" y "feed sin límite de tamaño" en riesgos reales derivados del propio estándar, no en casos de prueba artificiales. Los canales reales (Airbnb, Vrbo) documentan oficialmente cadencias de sincronización de horas, no de segundos (Airbnb ~3h — confianza baja/media específicamente para su aplicabilidad a conexiones producto-Airbnb, ver RV03 supuesto S1; latencia externa no controlada por Atiende; Vrbo ~30min en app) — cualquier promesa de "cierre instantáneo" entre canales vía iCal es técnicamente inviable y debe reformularse como gestión de ventana de riesgo. OWASP ASVS 2.3.4 es, literalmente, el requisito de verificación oficial contra doble-reserva, y ancla la sección de pruebas de concurrencia del motor de cierre de disponibilidad. Este módulo entrega la estrategia de pruebas, el catálogo adversarial obligatorio, el plan enterprise con fases y homologación de canales, y un borrador de `docs/ACEPTACION.md` con criterios verificables.

---

## 2. Estrategia de pruebas

### 2.1 Niveles

- **Unitarias**: lógica pura de resolución de conflictos (UID/SEQUENCE/DTSTAMP), cálculo de noches/fechas incluyendo DST, parsing de RRULE, validación de allowlist/deny-list SSRF. Sin I/O real.
- **Integración**: contra un parser ICS real y una base de datos real (o embebida), verificando que el motor de cierre de disponibilidad aplica correctamente los invariantes de estado (una noche nunca queda "abierta" en dos canales simultáneamente tras un import exitoso).
- **Contratos con adaptadores**: cada adaptador de canal (Airbnb import/export, Booking.com Connectivity API si se certifica, Vrbo) debe tener una suite de contrato que valide contra fixtures grabados del comportamiento real documentado (cadencia de refresco, formato de campos, ausencia/presencia de nombre de huésped) — actualizada cuando cambie la documentación oficial del canal (fuentes B8, B10, B11, C7).
- **E2E**: flujo completo desde import de feed hasta bloqueo de disponibilidad visible en el calendario unificado, en un entorno que simula al menos dos canales con feeds reales o fixtures fieles al formato oficial.
- **Adversariales**: catálogo obligatorio de la sección 3, ejecutado como suite dedicada, no como "extras" de la suite de integración.
- **Carga**: medición de throughput/latencia del importador bajo volumen de feeds y tamaño de feed, con objetivos derivados de lo observado en piloto (ver sección 5), nunca de una cifra asumida a priori.
- **Seguridad**: verificación activa de los controles de RV19 (SSRF, XXE si aplica, límites de tamaño, aislamiento multitenant) como pruebas automatizadas, no solo revisión manual — con base en OWASP ASVS V1/V2/V5/V8 y el Business Logic Security Cheat Sheet (fuente A16) para condiciones de carrera.

### 2.2 Medición separada de latencia interna vs. por canal

La latencia total observable por el usuario tiene dos componentes que deben medirse e informarse por separado, porque tienen dueños y remedios distintos:
- **Latencia interna**: tiempo desde que el sistema recibe/descarga un feed hasta que el cambio de disponibilidad es efectivo en el calendario unificado y visible a otros canales. Esta es la única que el producto controla y puede optimizar.
- **Latencia por canal**: tiempo desde que ocurre el evento real (reserva/cancelación) en el canal externo hasta que ese cambio aparece en el feed que el producto descarga. Depende de la cadencia de refresco del canal (Airbnb **~3h** [DATO, B8] — confianza baja/media específicamente para su aplicabilidad a conexiones producto-Airbnb, ver RV03 supuesto S1, Vrbo **~30min** en app [DATO, B11]) y **no es controlable por el producto** (latencia externa no controlada).

Cualquier reporte de "tiempo de cierre de disponibilidad" debe descomponerse en ambos números; prometer un total agregado sin esta descomposición oculta la parte no controlable y genera expectativas inviables.

### 2.3 Pruebas de carga con objetivos justificados

No existe SLA/latencia oficial publicada por ningún canal para su mecanismo iCal (laguna confirmada, ver `rv19-21.md` resumen de lagunas #7). Booking.com sí publica límites de tasa duros para su API de conectividad ARI (10,000 llamadas/min general, con límites menores y distintos por endpoint — ej. 700/min para `/xml/reservationssummary`, 75/min para `OTA_Hotel*Notif` — fuente B12; **detalle completo de por qué estas dos cifras no deben tratarse como catálogo completo ni como rango continuo: ver `docs/investigacion/RV04-booking-connectivity.md` §7 (Lagunas #7), fuente original de esta cita**), pero con la advertencia explícita de que "Booking.com reserves the right to... change these limits at any time, without prior notice". Por tanto:
- Los objetivos de throughput del importador (feeds/minuto, eventos/segundo procesados) **deben fijarse empíricamente durante el piloto**, observando el comportamiento real de los canales integrados, no asumirse de una cifra de industria.
- El sistema debe ser resiliente a HTTP 429 y cambios de política de rate limit sin configuración hardcodeada de un límite fijo (backoff exponencial, respeto de `Retry-After` si el canal lo provee).
- La ventana de "frescura máxima aceptable" del calendario unificado debe calibrarse contra las cadencias documentadas de los canales integrados [DATO, B8/B11] (mínimo realista: minutos a horas, no segundos, vía iCal) — cualquier objetivo más agresivo requiere una vía de integración distinta (API oficial certificada, no iCal).

---

## 3. Catálogo de casos adversariales obligatorio

Cada caso incluye criterio de aceptación verificable (observable en logs/estado de BD/respuesta de API, no solo "funciona").

| # | Caso | Fundamento | Criterio de aceptación verificable |
|---|---|---|---|
| 1 | **Doble evento**: el mismo feed contiene dos VEVENT con el mismo UID+SEQUENCE pero contenido distinto (fechas diferentes) | RFC 5546 §2.1.5 (B5): UID+SEQUENCE+DTSTAMP es la clave de resolución; con SEQUENCE igual, DTSTAMP decide. **No se trata como algoritmo normativo autosuficiente**: no hay evidencia primaria de que los canales incrementen SEQUENCE/DTSTAMP de forma consistente en la práctica (ver RV06-R-03/RV07-R-03-04, contradicción #6 de `docs/auditoria-investigacion-1/contradicciones.md`) — debe tratarse como señal oportunista, respaldada por hash de contenido | El sistema aplica DTSTAMP como desempate **y además calcula y compara un hash del contenido relevante del evento (fechas de inicio/fin, estado/status) de ambos VEVENT antes de considerar el conflicto resuelto**; si el hash de contenido de ambos eventos es idéntico pese al "empate" de UID+SEQUENCE, se registra como duplicado inocuo, y si difieren de forma incompatible con lo que DTSTAMP sugeriría, el caso se marca para revisión humana en vez de resolverse solo por DTSTAMP. El sistema registra en log cuál VEVENT prevaleció y el resultado de la comparación de hash; el estado final del calendario refleja exactamente un evento, no ambos ni ninguno |
| 2 | **Reserva simultánea en dos canales** para las mismas noches | Ventana de staleness documentada (Airbnb ~3h — confianza baja/media, ver RV03 S1; Vrbo ~30min — B8, B11); ASVS 2.3.4 (A4) | El sistema detecta el conflicto al procesar el segundo import, marca la propiedad en estado de "conflicto requiere atención humana" y **no cancela automáticamente ninguna reserva** (regla de producto); el conflicto queda auditable con timestamp de ambos eventos |
| 3 | **Eventos desordenados** (el CANCEL de una reserva llega antes que su CREATE/UPDATE original, por reintento o red) | RFC 5546 §2.1.4/2.1.5 (B4, B5): SEQUENCE/DTSTAMP no bastan solos, requiere comparación de versiones — "CUAs SHOULD NOT rely solely on a change in sequence number" (B4); consistente con la advertencia de RV06/RV07 de que SEQUENCE es señal oportunista, no garantía, y debe respaldarse con hash de contenido | El sistema no aplica el CANCEL prematuro como estado final; al llegar el CREATE con SEQUENCE/DTSTAMP menor, el estado resultante es "cancelado" (el mayor SEQUENCE/DTSTAMP gana), **verificado además comparando el hash de contenido (fechas, estado) de la versión CREATE contra la versión CANCEL ya aplicada** — si el hash de contenido de la reserva referenciada por el CANCEL no coincide con la reserva real que el sistema tiene registrada bajo ese UID, el caso se marca para revisión humana en vez de aplicar el CANCEL por SEQUENCE/DTSTAMP solamente; verificable comparando el resultado con el orden de llegada real |
| 4 | **Modificación de fechas** de una reserva existente (mismo UID, SEQUENCE incrementado, DTSTART/DTEND distintos) | RFC 5545 §3.8.7.4 (B2) | El bloqueo de disponibilidad se mueve completamente a las nuevas fechas; las noches originales quedan liberadas si ya no se solapan con las nuevas; verificable por consulta directa al estado de disponibilidad antes/después |
| 5 | **Cancelación que no reabre noches ocupadas** (bug de referencia: un CANCEL libera noches que en realidad siguen ocupadas por otra reserva legítima que comparte fechas por error de UID) | RFC 5546 §3.2.5 (B3): CANCEL debe aplicarse solo al UID exacto | El sistema verifica que ninguna otra reserva activa referencia las mismas noches antes de marcarlas como disponibles tras un CANCEL; criterio: 0 falsos positivos de disponibilidad en un set de prueba con reservas solapadas por error deliberado de fixture |
| 6 | **Timeout tras éxito remoto** (el canal procesó el cambio pero la respuesta HTTP se pierde por timeout antes de llegar al producto) | Patrón de idempotencia estándar; ASVS 2.4.1 (A4) sobre anti-automatización/control de estado | El reintento subsiguiente usa una clave de idempotencia (UID+SEQUENCE) y no duplica el efecto (no se bloquean las mismas noches dos veces ni se generan dos registros del mismo evento) |
| 7 | **Reintento** de un import ya procesado exitosamente (mismo feed, sin cambios) | Idempotencia | El segundo procesamiento no genera cambios de estado ni eventos duplicados en el log de auditoría; verificable por diff de estado antes/después = vacío |
| 8 | **ACK perdido** (el producto procesó el feed pero el mecanismo de confirmación/ack hacia el canal o hacia un componente interno se pierde) | Patrón de mensajería at-least-once | Un reproceso posterior del mismo mensaje no corrompe el estado (ver caso 6/7); el sistema debe tolerar entrega at-least-once sin efectos duplicados |
| 9 | **Feed malformado** (ICS con sintaxis inválida, VEVENT sin UID, campos obligatorios faltantes) | RFC 5545 no define comportamiento de receptor ante malformación (laguna del propio estándar, B7) | El sistema rechaza el feed completo o el VEVENT específico de forma explícita (no silenciosa), registra el error con detalle suficiente para diagnóstico, y no dejar el calendario en estado parcial/inconsistente |
| 10 | **Feed vacío** (0 VEVENT, o feed técnicamente válido pero sin contenido) | — | El sistema no interpreta un feed vacío como "cancelar todas las reservas existentes de ese canal"; requiere confirmación explícita o alerta antes de cualquier acción masiva derivada de un feed vacío |
| 11 | **Feed inaccesible** (timeout de red, DNS no resuelve, HTTP 4xx/5xx) | SSRF/robustez (A10) | El sistema reintenta con backoff acotado, marca la fuente como "no disponible" tras N intentos, y preserva el último estado conocido en vez de vaciar el calendario |
| 12 | **Bloqueo manual superpuesto** (el anfitrión bloquea manualmente noches en el calendario unificado que luego un import intenta liberar) | Regla de producto: el cierre entre canales no debe pisar decisiones manuales del anfitrión sin señal clara | El sistema preserva el bloqueo manual salvo que el anfitrión confirme explícitamente el cambio, o al menos genera alerta de conflicto en vez de sobrescribir silenciosamente |
| 13 | **UID reciclado** (un canal reutiliza un UID para una reserva distinta, por bug o migración) | RFC 5545 §3.8.4.7 (B1): la unicidad del UID es responsabilidad exclusiva del emisor, sin verificación normada del receptor — por lo que UID/SEQUENCE **no puede tratarse como garantía de identidad del evento**, solo como señal oportunista (consistente con RV06/RV07) | El sistema **calcula y almacena un hash del contenido relevante (fechas de inicio/fin, estado) de cada UID conocido** y lo compara contra el hash del nuevo VEVENT entrante; detecta que un UID conocido llega con datos incompatibles con su historial (ej. hash de contenido no relacionable, DTSTART muy distante sin relación de recurrencia) y lo marca para revisión humana en vez de fusionar silenciosamente el estado de dos reservas distintas — el hash de contenido es el respaldo obligatorio que evita depender solo de UID/SEQUENCE para esta detección |
| 14 | **DST** (cambio de horario de verano/invierno afectando check-in/check-out) | RFC 5545 §3.3.5 (B6): reglas normativas exactas de desambiguación (hora repetida → primera ocurrencia; hora inexistente → offset previo al salto) | El cálculo de número de noches/duración para eventos que cruzan la transición DST coincide exactamente con la regla del RFC, verificado con casos de fixture en al menos una zona horaria con DST real |
| 15 | **Estancias contiguas** (checkout de una reserva el mismo día que el checkin de otra en la misma propiedad) | Lógica de negocio de disponibilidad | El sistema no marca error de solapamiento cuando checkout(A) == checkin(B) en el mismo día (regla estándar de hospedaje); verificable con un caso de fixture explícito |
| 16 | **Crash/replay** (el proceso de importación se interrumpe a mitad de un batch de eventos y se reinicia) | Idempotencia + atomicidad | El reinicio no dobla-aplica los eventos ya procesados antes del crash ni deja el batch a medio aplicar; el estado final es equivalente a haber procesado el batch completo una sola vez |
| 17 | **Límites de API** (el canal responde 429 o cierra la conexión por exceso de tasa) | Booking.com Connectivity API rate limits (B12) | El sistema respeta backoff y no entra en bucle de reintento agresivo que agrave el bloqueo; verificable por conteo de reintentos y respeto de intervalos crecientes |
| 18 | **Aislamiento multitenant** (un tenant intenta leer/modificar el calendario de otro) | ASVS 8.4.1 (A5) | Toda petición cross-tenant es rechazada con error de autorización, verificado con una suite de pruebas de privilegios que intenta explícitamente el cruce (RLS o control equivalente activo) |
| 19 | **Escalada de privilegios** (un usuario con rol limitado intenta ejecutar una acción reservada a administrador/propietario) | ASVS 8.2.2/8.2.3/8.3.1 (A5) | Enforcement verificado en la capa de servicio backend, no solo en UI; intento rechazado con auditoría del intento |
| 20 | **SSRF** (una URL de feed apunta a un rango privado, IP de metadata cloud, o usa un esquema no permitido) | OWASP SSRF Prevention Cheat Sheet (A10) | La petición se rechaza antes de realizar cualquier conexión de red saliente; verificado contra la lista completa de rangos citados en RV19-R-01/02 (169.254.169.254, RFC1918, loopback, etc.) |

---

## 4. Evidencia requerida

Para cada caso del catálogo de la sección 3 y para cada requisito RV19-R-xx/RV21-R-xx: comando(s) exacto(s) ejecutado(s), salida completa (o extracto relevante con referencia al log completo), y cuando aplique captura de pantalla o extracto de base de datos que muestre el estado antes/después. La evidencia debe ser reproducible por un tercero con el mismo comando, no un resumen narrado sin comando asociado.

## 5. Definición de "hecho" por módulo

Un módulo (RV19, RV21, o cualquier módulo de producto que dependa de ellos) se considera "hecho" cuando:
1. Todos los requisitos RVxx-R-nn correspondientes tienen al menos una prueba automatizada que los verifica, con evidencia registrada (sección 4).
2. El catálogo adversarial de la sección 3 aplicable al módulo pasa en CI, no solo localmente.
3. Ninguna laguna declarada en `rv19-21.md` que bloquee el módulo sigue abierta sin decisión explícita documentada (o bien se resolvió, o bien se documentó la mitigación temporal y el riesgo aceptado).
4. La documentación de usuario/legal correspondiente (avisos de privacidad, campos de registro) fue revisada por la persona/rol legal designado, no solo generada automáticamente.

---

## 6. Plan enterprise

### 6.1 Fases

1. **Fase 0 — Cimientos**: motor de resolución de conflictos (UID/SEQUENCE/DTSTAMP), parser ICS con límites propios, controles SSRF, aislamiento multitenant. Sale cuando pasa el catálogo adversarial completo en un solo canal simulado (fixtures).
2. **Fase 1 — Piloto de un canal real**: integración con un canal (recomendado empezar por el que tenga vía de integración más simple y documentada, ej. Airbnb iCal) con un grupo reducido de propiedades reales. Objetivo: medir latencia por canal real, calibrar objetivos de carga (sección 2.3).
3. **Fase 2 — Multicanal**: incorporar segundo canal (Booking.com), con la decisión de arquitectura de si se integra vía iCal o vía certificación Connectivity Partner (requiere proceso de homologación externo, ver 6.2). El catálogo adversarial se re-ejecuta contra el escenario multicanal real (doble reserva cross-canal, no solo simulada).
4. **Fase 3 — Escala/enterprise**: multitenancy en producción con clientes múltiples, SLOs iniciales validados con datos reales del piloto, RACI operativo.

### 6.2 Hitos de homologación con canales — qué depende de aprobación externa

Estos hitos **no pueden marcarse como completados por el equipo interno**; dependen de una aprobación/certificación de un tercero (Airbnb o Booking.com) fuera del control del proyecto:
- **Certificación como "Connectivity Provider" de Booking.com** (fuente C6, C7): requiere onboarding formal cuyo proceso exacto no está documentado públicamente (laguna declarada). No se puede fijar fecha de finalización sin respuesta del canal.
- **Acceso a la API oficial de Airbnb para channel managers/PMS** (fuente C3): descrita como de acceso restringido; el proceso de solicitud/aprobación no fue verificable con fuente oficial en esta ronda. Tratar como dependencia externa de duración desconocida.
- **Cualquier cambio de términos de uso** de Airbnb o Booking.com que afecte el mecanismo de integración vigente (fuentes C3-C7): riesgo continuo, no un hito de una sola vez — requiere monitoreo periódico, no solo verificación inicial.

Mientras estos hitos no se resuelvan, el plan debe operar sobre feeds iCal públicos (sin certificación), que sí están disponibles sin aprobación externa pero con las limitaciones funcionales documentadas (sin precio en Airbnb/Vrbo, sin nombre de huésped, cadencia de horas).

### 6.3 Criterios de salida de piloto

1. El catálogo adversarial completo (sección 3) pasa en el entorno de piloto con datos reales de al menos un canal, no solo fixtures.
2. Se registró al menos un ciclo completo de doble-reserva real detectada (o simulada de forma realista si no ocurrió orgánicamente) con resolución auditable sin cancelación automática no autorizada.
3. La latencia interna medida (sección 2.2) está documentada con percentiles (p50/p95/p99) sobre al menos 2 semanas de operación real, y la latencia por canal está documentada por separado.
4. Ninguna laguna legal crítica de RV19 que aplique a la jurisdicción del piloto sigue sin decisión (aceptar el riesgo documentado, o resolver la verificación pendiente).
5. Cero incidentes de fuga cross-tenant detectados en la suite de aislamiento multitenant durante el piloto.

### 6.4 SLO iniciales (con supuestos explícitos)

Dado que no existe SLA oficial de ningún canal para su mecanismo iCal (laguna confirmada), estos SLO son **propuestas iniciales sujetas a validación empírica en piloto**, no compromisos:
- **Latencia interna** (import descargado → disponibilidad reflejada en calendario unificado): objetivo propuesto de minutos (no segundos) [E], a validar con datos de piloto — supuesto: el cuello de botella dominante es la cadencia de refresco del canal externo (horas), no el procesamiento interno.
- **Disponibilidad del importador**: objetivo propuesto **≥99%** [E] de ejecuciones de sincronización programadas completadas sin error no manejado — supuesto: basado en prácticas estándar de la industria para procesos batch, no en una cifra de canal específico.
- **Ventana de staleness máxima aceptable comunicada al usuario**: debe expresarse como rango realista derivado de las cadencias documentadas (Airbnb **~3h** [DATO, B8] — confianza baja/media, latencia externa no controlada, ver RV03 S1; Vrbo **~30min** [DATO, B11]), nunca como "tiempo real" o "instantáneo" vía iCal.

### 6.5 Matriz RACI mínima

| Actividad | Responsable (R) | Aprueba (A) | Consultado (C) | Informado (I) |
|---|---|---|---|---|
| Definir límites de tamaño/timeout del importador ICS | Equipo de ingeniería | Tech lead | — | Producto |
| Validar controles SSRF/aislamiento multitenant | Equipo de ingeniería/seguridad | Tech lead | — | Producto |
| Revisar avisos de privacidad y flujos ARCO/RGPD generados | Producto | Legal/compliance | Ingeniería | Anfitriones (usuarios finales) |
| Confirmar vigencia de normas fiscales/registro por jurisdicción | Legal/compliance externo | Dirección de producto | Ingeniería | Todo el equipo |
| Solicitar/gestionar certificación Connectivity Partner (Booking.com) | Dirección de producto/negocio | Dirección | Ingeniería | Equipo completo |
| Ejecutar catálogo adversarial en CI | Equipo de ingeniería (QA) | Tech lead | — | Producto |
| Decidir criterios de salida de piloto | Dirección de producto | Dirección | Ingeniería, Legal | Clientes piloto |

---

## 7. Riesgos/límites

- Ningún objetivo de carga/latencia de este documento tiene respaldo de SLA oficial de canal — todos requieren validación empírica; presentarlos como compromisos firmes antes del piloto sería engañoso.
- Los hitos de homologación con canales (6.2) son dependencias externas sin fecha controlable; el plan enterprise no debe comprometer fechas de lanzamiento que dependan de aprobación de Airbnb/Booking sin margen de contingencia.
- El catálogo adversarial de la sección 3 fue derivado de fuentes primarias (RFC, OWASP, documentación de canal) pero no es exhaustivo de todos los bugs posibles; debe tratarse como el piso obligatorio, no el techo, de la cobertura de pruebas.
- Las cifras exactas de rate limit de Booking.com (B12) se obtuvieron con confianza media (no verificadas carácter por carácter); no deben hardcodearse como constantes de arquitectura sin reverificación.

## 8. Implicaciones para requisitos

- **RV21-R-01**: El motor de resolución de conflictos DEBE implementar el algoritmo UID → SEQUENCE → DTSTAMP tal como lo define RFC 5546 §2.1.5, con prueba automatizada que lo verifique explícitamente (fuente B5). **DEBE además comparar un hash del contenido relevante del evento (fechas de inicio/fin, estado) como respaldo antes de considerar resuelto el conflicto** — UID/SEQUENCE/DTSTAMP no debe tratarse como suficiente por sí solo, dado que no hay evidencia primaria de que los canales reales incrementen SEQUENCE de forma consistente (ver RV06-R-03/RV07-R-03-04; casos adversariales 1 y 3).
- **RV21-R-02**: El sistema DEBE tratar cada llegada de UID conocido con datos incompatibles como caso de revisión, nunca de fusión silenciosa (fuente B1, caso adversarial 13), **verificando la incompatibilidad mediante comparación de hash de contenido (fechas, estado) contra el historial del UID, no solo mediante SEQUENCE/DTSTAMP**.
- **RV21-R-03**: El cálculo de duración de estancia DEBE implementar las reglas de desambiguación DST de RFC 5545 §3.3.5 exactamente, con prueba automatizada sobre al menos una transición real (fuente B6, caso adversarial 14).
- **RV21-R-04**: Todo reporte de "tiempo de sincronización" o "cierre de disponibilidad" DEBE descomponerse en latencia interna y latencia por canal, nunca presentarse como cifra agregada única (sección 2.2).
- **RV21-R-05**: El catálogo adversarial completo de la sección 3 DEBE ejecutarse en CI antes de cualquier release que toque el motor de sincronización o el importador de feeds.
- **RV21-R-06**: Ningún objetivo de carga/latencia DEBE publicarse como SLO comprometido antes de completar al menos un ciclo de piloto con datos reales (sección 6.4).
- **RV21-R-07**: El sistema DEBE manejar HTTP 429 y cierres de conexión por rate limit con backoff, sin asumir un límite numérico fijo como constante de arquitectura (fuente B12, caso adversarial 17).
- **RV21-R-08**: Ninguna acción derivada de un feed vacío o malformado DEBE aplicarse de forma masiva/silenciosa sin alerta o confirmación explícita (casos adversariales 9, 10).

## 9. Lagunas

1. No existe SLA/latencia oficial de sincronización para ningún canal vía iCal — solo cadencias de refresco documentadas (B8, B11); cualquier objetivo debe fijarse en piloto.
2. No hay límites de tasa públicos específicos para el mecanismo iCal de Airbnb, Vrbo o Booking.com — los límites de Booking.com encontrados (B12) corresponden a su API de conectividad ARI para partners, no a un feed iCal.
3. Las cifras de Booking.com (10,000/min general; 700/min y 75/min como los dos ejemplos de endpoint verificados en la fuente leída) provienen de extracción con confianza media, no verificadas carácter por carácter — requieren reverificación antes de usarse como constante de arquitectura. **Nota (corrección 2026-09-05): el detalle de por qué estas cifras no son un rango continuo ni un catálogo completo se documenta en `docs/investigacion/RV04-booking-connectivity.md` §7 (Lagunas #7), que es donde vive la cita original — este módulo (RV21) solo referencia el hallazgo, no lo posee.**
4. No hay declaración oficial de Airbnb (solo corroboración de comunidad) sobre la ausencia de nombre de huésped en el iCal exportado — riesgo de diseño si el producto depende de esto para cumplimiento de privacidad. Ver `docs/LAGUNAS.md` sección 6, fila "Declaración oficial de Airbnb sobre ausencia de nombre de huésped en iCal exportado" (módulos RV19/RV21).
5. El proceso concreto de solicitud/certificación de la API de Airbnb para channel managers/PMS, y el proceso de onboarding como Connectivity Provider de Booking.com, no están documentados públicamente — bloquean la planificación de fecha de los hitos de homologación (sección 6.2). Ver `docs/LAGUNAS.md` sección 6, fila "Costo/plazo de certificación directa Airbnb/Booking/Vrbo" (módulos RV08/RV16) y sección 6, fila "España — Orden INT (modelo operativo del parte de viajeros)" (módulos RV19/RV21) para dependencias externas relacionadas.
6. RFC 5545/5546 no define comportamiento del receptor ante UID duplicado/reciclado — el caso adversarial 13 se basa en la ausencia normativa, no en una regla explícita a implementar "según el estándar"; el comportamiento defensivo es una decisión de producto. Ver `docs/LAGUNAS.md` sección 5, fila "UID/SEQUENCE/DTSTAMP como señal oportunista, no garantía (respaldo de hash de contenido)" (módulos RV06/RV07/RV21).
7. **Referencia cruzada — corrección de rate limits reubicada (2026-09-05).** La cita imprecisa "75-700/min" y su corrección (dos valores discretos verificados, catálogo por endpoint no confirmado como completo) vivían originalmente en `docs/investigacion/RV04-booking-connectivity.md` (líneas ~32/72/109), no en este módulo. La corrección se aplicó por error aquí en una ronda previa; ahora está aplicada en RV04 §7 (Lagunas #7) y en `docs/LAGUNAS.md` §2.1, fila "Límites de tasa/reintento" (módulos RV07/RV17/RV21). Este punto queda como referencia cruzada únicamente.
8. **Cobertura de fuentes.** Este módulo referencia las entradas B1-B12, A4, A16 y C1-C7 del ledger compartido `docs/fuentes/rv19-21.md` (parte RV21), un subconjunto de ~20 fuentes distintas propias más las compartidas con RV19 en ese mismo ledger — ver sección "Fuentes de este módulo" para el detalle; si el conteo total combinado con RV19 no alcanza el mínimo de 25 URLs exigido por `docs/investigacion/00-PLAN.md` §1.3, la razón declarada es que varias páginas técnicas (Booking.com Genius, procesos de certificación de partner) están bloqueadas por HTTP 403 o no documentadas públicamente (ver ledger).
9. Ver también `docs/LAGUNAS.md` sección 5, filas "[check-in, check-out)" y "UID/SEQUENCE/DTSTAMP..." (ambas módulo RV21, riesgos ya resueltos por diseño), y sección 2.1, fila "Límites de tasa/reintento" (módulos RV07/RV17/RV21, ver punto 7 de arriba).

## 10. Supuestos

- Se asume que el primer canal de piloto será uno con mecanismo de sincronización por iCal público (sin necesidad de certificación externa previa), para no bloquear la Fase 1 en una dependencia externa sin fecha controlable.
- Se asume que "cerrar disponibilidad entre canales" nunca implica cancelar una reserva existente de forma automática; todo conflicto detectado (caso adversarial 2) genera alerta para decisión humana del anfitrión, no una acción automática irreversible.
- Se asume que el volumen inicial de propiedades/tenants en piloto es lo suficientemente bajo para que los objetivos de carga (sección 2.3) puedan calibrarse con datos reales antes de escalar, sin necesitar pruebas de carga sintéticas masivas en Fase 0-1.

---

## 11. Borrador — sección final de `docs/ACEPTACION.md`

> Nota: esta sección es un borrador para incorporar como cierre de `docs/ACEPTACION.md`. Cada criterio debe ser verificable con un comando y una evidencia esperada concretos; ninguno se marca cumplido sin esa evidencia adjunta.

### Criterios de aceptación verificables — RV19/RV21

1. **Resolución de conflictos UID/SEQUENCE/DTSTAMP + hash de contenido**: ejecutar la suite unitaria del motor de conflictos (`<comando de test suite, ej. npm test -- conflict-resolution>`). Evidencia esperada: reporte de test en verde cubriendo explícitamente los casos "mismo UID, SEQUENCE distinto", "mismo UID+SEQUENCE, DTSTAMP distinto" **y "SEQUENCE/DTSTAMP indica un resultado pero el hash de contenido de fechas/estado lo contradice"** (caso en el que el sistema debe escalar a revisión humana en vez de confiar solo en SEQUENCE/DTSTAMP, casos adversariales 1, 3 y 13).
2. **Bloqueo SSRF**: ejecutar la suite de seguridad del importador contra la lista de URLs de prueba (localhost, 169.254.169.254, rangos RFC1918, esquemas no-http). Evidencia esperada: todas las peticiones rechazadas antes de conexión de red saliente, verificable en log de la suite con 0 conexiones salientes registradas hacia esas URLs.
3. **Límites de tamaño del importador ICS**: alimentar el importador con un feed de tamaño/profundidad de recurrencia por encima del límite configurado. Evidencia esperada: el feed se rechaza con error explícito registrado, sin caída del proceso ni consumo de memoria fuera de límite (adjuntar métrica de memoria del proceso durante la prueba).
4. **Aislamiento multitenant**: ejecutar la suite de pruebas de privilegios que intenta acceso cross-tenant sobre el calendario/reservas. Evidencia esperada: 100% de los intentos cross-tenant rechazados con error de autorización, verificable en el reporte de la suite.
5. **Catálogo adversarial completo (20 casos, sección 3 de RV21)**: ejecutar la suite adversarial completa en CI (`<comando de CI, ej. make test-adversarial>`). Evidencia esperada: reporte de CI con los 20 casos identificados por nombre y en verde; cualquier caso omitido debe estar documentado como laguna abierta, no silenciado.
6. **No cancelación automática de reservas**: revisión de código/prueba que confirme que ninguna ruta del motor de sincronización invoca una cancelación de reserva sin un flag de autorización explícita del anfitrión. Evidencia esperada: grep/análisis estático del código mostrando 0 llamadas de cancelación fuera del flujo autorizado, más prueba de integración que verifique que un conflicto detectado (caso adversarial 2) produce una alerta, no una cancelación.
7. **Logs sin PII/secretos**: ejecutar un import de prueba con datos de huésped ficticios y tokens de canal ficticios, luego inspeccionar los logs generados. Evidencia esperada: grep de los logs no encuentra el token ni datos de huésped en texto plano (comando de verificación documentado y su salida "0 coincidencias").
8. **Medición separada de latencia**: extraer del sistema de observabilidad un reporte de al menos una ejecución real (o de piloto) mostrando latencia interna y latencia por canal como métricas distintas. Evidencia esperada: dashboard o export con ambas series claramente etiquetadas y no combinadas en un solo número.
9. **Avisos de privacidad y flujo ARCO/RGPD**: revisión firmada por la persona/rol legal designado del contenido generado del aviso de privacidad y del flujo de solicitudes de derechos. Evidencia esperada: documento de aprobación fechado y referenciado en el sistema de gestión de tareas del proyecto.
10. **Registro de viajeros (España) — solo si se activa esta función**: prueba de captura y exportación de los datos exigidos por RD 933/2021 con retención configurada a 3 años. Evidencia esperada: exportación de muestra más confirmación legal explícita de que el modelo operativo usado corresponde al vigente (referenciar la verificación de la laguna E3 de `rv19-21.md` como resuelta, no omitida).
11. **Número de registro en anuncios (UE 2024/1028) — solo si se activa esta función**: confirmación explícita de que la jurisdicción de destino activó el régimen de registro condicional (Art. 4.2) antes de habilitar el campo como obligatorio en la UI. Evidencia esperada: documento de verificación legal referenciado, no solo la existencia del campo en el producto.
12. **Homologación con canales**: para cada integración que dependa de certificación externa (Connectivity Partner de Booking.com, API de Airbnb), el estado se reporta como "pendiente de aprobación externa" con la fecha de solicitud, y **nunca se marca como completado** sin la confirmación explícita del canal (correo/portal de aprobación adjunto como evidencia).

---

## Fuentes de este módulo

Fecha de consulta de todas las fuentes: 2026-09-05. Ledger completo (incluida la parte de RV19, no editada por este corrector): `docs/fuentes/rv19-21.md`. Este módulo (RV21) usa las entradas B1-B12, A4, A5, A10, A16 y C3/C6/C7. Total de URLs distintas propias de esta sección: 13 (por debajo del mínimo de 25 del plan — ver Laguna 8; varias páginas de certificación de partner están bloqueadas por HTTP 403 o no documentadas públicamente).

**RFC / especificaciones técnicas iCalendar:**
- https://www.rfc-editor.org/rfc/rfc5545 (RFC 5545 — UID §3.8.4.7, Sequence §3.8.7.4, Date-Time/DST §3.3.5, Content Lines §3.1) — B1, B2, B6, B7
- https://www.rfc-editor.org/rfc/rfc5546 (RFC 5546/iTIP — CANCEL §3.2.5, Component Revisions §2.1.4, Message Sequencing §2.1.5) — B3, B4, B5

**Cadencias de sincronización de canal:**
- https://www.airbnb.com/help/article/99 (Sync your calendar to other websites) — B8
- https://community.withairbnb.com/t5/Help/No-Guest-Names-on-ICal-seriously/td-p/1129637 (foro, no oficial) — B9
- https://help.vrbo.com/articles/Export-your-reservation-calendar — B10
- https://help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar — B11

**Rate limits y certificación de partner (Booking.com):**
- https://developers.booking.com/connectivity/docs (About the Booking.com Connectivity APIs) — B12, C7
- https://admin.booking.com/hotelreg/terms-and-conditions.html?cc1=01&lang=en (General Delivery Terms) — C6

**Términos de API (Airbnb):**
- https://www.airbnb.com/help/article/3418 (API Terms of Service) — C3

**OWASP (seguridad/aceptación):**
- https://github.com/OWASP/ASVS/blob/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md (ASVS 2.3.4, anti-overbooking) — A4
- https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md (ASVS 8.x, aislamiento multitenant/privilegios) — A5
- https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html — A10
- https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html — A16
