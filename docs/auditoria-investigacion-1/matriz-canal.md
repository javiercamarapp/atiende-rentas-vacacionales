# Cobertura de la matriz canal × método — Auditoría independiente Fase 1

Auditor: Sonnet (independiente). Fecha: 2026-09-05. Base: `docs/LAGUNAS.md` completo (todas las filas siguen en estado literal `PENDIENTE`, ver hallazgo crítico de proceso al final) contrastado con el contenido real de RV02–RV11, RV13, RV17, RV20.

Estados usados: **EVIDENCIA REAL** (cita/fuente verificable que cierra la celda) · **LAGUNA HONESTA** (el módulo reconoce explícitamente que no pudo cerrarla) · **RELLENO SIN EVIDENCIA** (presentada como cerrada sin respaldo real) · **NO ABORDADA** (ningún módulo la tocó, ni como evidencia ni como laguna reconocida).

---

## 1. Airbnb — API oficial/partner

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | EVIDENCIA REAL | RV03:25,80 | NDA, API Terms, revisión de seguridad, 6 meses para features obligatorias. |
| Credenciales/sandbox/producción | LAGUNA HONESTA | RV03:28 | "Sandbox V2"/"API Explorer" mencionados pero sin evidencia de detalle exacto de credenciales OAuth. |
| Frecuencia y latencia real | LAGUNA HONESTA | RV03:30 | "Sin evidencia pública de SLA/latencia interna" — explícito. |
| Webhook vs. polling | LAGUNA HONESTA | RV03:31,76,103 | Solo fuentes de terceros; tratado explícitamente como laguna, no hecho. |
| Límites de tasa/reintento | LAGUNA HONESTA | RV03:32,114 | Sin evidencia pública, declarado. |
| Direccionalidad | LAGUNA HONESTA (parcial) | RV03:29 | Capacidad general descrita, especificación exacta no verificada. |
| Cobertura tarifas/restricciones/huésped/mensajes | LAGUNA HONESTA | RV03:34-40 | Fuente de tarifas marcada por el propio módulo como "marketing, no técnica". |
| Reservas/modificaciones/cancelaciones | LAGUNA HONESTA | RV03:36-38 | Reservas "sí" (fuente débil); modificaciones/cancelaciones sin evidencia específica. |
| UID/SEQUENCE/dedupe/idempotencia | **NO ABORDADA** | — | Ningún módulo trata identificadores de la Reservations API de Airbnb. |
| Anti-eco de bloqueos | **NO ABORDADA** | — | RV07 §3 diseña anti-eco solo para el caso iCal; ningún módulo lo aborda a nivel de API/webhook de Airbnb. |

## 2. Airbnb — iCal import/export

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | EVIDENCIA REAL | RV03:25-27 | Self-service, sin aprobación. |
| Credenciales/sandbox/producción | EVIDENCIA REAL (débil) | RV03:28 | "No aplica" razonable, pero no se confirmó activamente ausencia de excepción. |
| Frecuencia y latencia real | EVIDENCIA REAL | RV03:30; RV06:7,71; RV07:71; RV08:35; RV09:13 | Cita verbatim repetida: "cada 3 horas" (Airbnb Help art. 99) — la mejor evidenciada de toda la matriz. |
| Webhook vs. polling | EVIDENCIA REAL | RV06:31,43 | Polling por diseño del formato. |
| Límites de tasa/reintento | EVIDENCIA REAL (parcial) | RV08:35 | "Refrescos manuales limitados por tasa" — cualitativo, no numérico. |
| Direccionalidad | EVIDENCIA REAL | RV03:29,47; RV09:42 | Export siempre; import solo disponibilidad. |
| Cobertura tarifas/restricciones/huésped/mensajes | EVIDENCIA REAL | RV06:88-96; RV13:69 | Fundamentado en RFC + silencio de Airbnb Help. |
| Reservas/modificaciones/cancelaciones | EVIDENCIA REAL | RV03:38,47,51,78; RV09:38-45 | No desbloqueable, distinción cancelada vs. expirada, penalización de host — bien cubierto. |
| UID/SEQUENCE/dedupe/idempotencia | EVIDENCIA REAL (RFC) + LAGUNA HONESTA (canales reales) | RV06:30-35,102-103 | RFC citado con precisión; explícitamente "no hay evidencia de que los canales incrementen SEQUENCE de forma consistente". |
| Anti-eco de bloqueos | LAGUNA HONESTA | RV07:31,150; RV06:127 | Mecanismo de diseño propio; "no existe evidencia primaria de que Airbnb reescriba o preserve el UID original al reexportar". |

## 3. Booking.com — API/Connectivity Partner

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | EVIDENCIA REAL | RV04:12 | Certificación diferenciada por API. |
| Credenciales/sandbox/producción | EVIDENCIA REAL | RV04:27-28 | Machine accounts, JWT — con nota honesta de que la fecha de sunset citada ya pasó. |
| Frecuencia y latencia real | EVIDENCIA REAL (parcial) | RV04:30 | Polling de reservas ~20s confirmado; latencia de push de disponibilidad sin garantía documentada. |
| Webhook vs. polling | EVIDENCIA REAL | RV04:12,18,31 | "Polling puro; sin webhooks documentados" — hallazgo negativo sólido. |
| Límites de tasa/reintento | EVIDENCIA REAL | RV04:32 | 10.000/min general, 75-700/min por endpoint (contradice suposición previa de LAGUNAS.md de "no publicados" — hallazgo positivo genuino). |
| Direccionalidad | EVIDENCIA REAL | RV04:16,29 | Push B.XML/OTA de disponibilidad/tarifas; pull+ack de reservas. |
| Cobertura tarifas/restricciones/huésped/mensajes | EVIDENCIA REAL | RV04:16,33-39 | `roomstosell`, CTA/CTD, min/max stay, límites de precio, ventanas de Messaging API. |
| Reservas/modificaciones/cancelaciones | EVIDENCIA REAL | RV04:53-64 | Ciclo de vida completo, incluida discrepancia RtB declarada. |
| UID/SEQUENCE/dedupe/idempotencia | EVIDENCIA REAL | RV04:62,71 | "Deduplicación es responsabilidad del receptor" — Booking reenvía hasta ack. |
| Anti-eco de bloqueos | **NO ABORDADA** | — | Ningún módulo trata si el "stop-sell" propio puede releerse como cambio externo en la API de Booking.com — pedido explícitamente en LAGUNAS.md:68. |
| Admisión de nuevos partners (pausada o no) | LAGUNA HONESTA | RV04:16,101; RV08:64,81 | "Afirmaciones de terceros no confirmadas en fuente oficial" — declarado. |

## 4. Booking.com — iCal (fallback)

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | LAGUNA HONESTA | RV04:20,26,92-93 | 403 sistemático en partner.booking.com, declarado en cada módulo que lo intentó. |
| Credenciales/sandbox/producción | LAGUNA HONESTA | RV04:27 | Bloqueado igual que el resto. |
| Frecuencia y latencia real | LAGUNA HONESTA | RV07:73,149; RV08:37 | RV07: "no se afirma ninguna cifra"; RV08 reporta snippet de baja confianza explícitamente marcado como no verbatim. |
| Webhook vs. polling | LAGUNA HONESTA | RV04:31 | Se asume polling por naturaleza del formato, sin confirmación directa. |
| Límites de tasa/reintento | LAGUNA HONESTA | RV06:126 | No documentado, bloqueado. |
| Direccionalidad | LAGUNA HONESTA | RV04:29 | No confirmado en fuente primaria. |
| Cobertura tarifas/restricciones/huésped/mensajes | LAGUNA HONESTA | RV04:34,38,108 | Inferencia técnica general del formato, no atribuida a Booking.com. |
| Reservas/modificaciones/cancelaciones | LAGUNA HONESTA | RV04:37 | Sin evidencia de si iCal distingue cancelación de simple liberación. |
| UID/SEQUENCE/dedupe/idempotencia | LAGUNA HONESTA | RV06:127 | "No se tuvo acceso a un feed .ics real de Booking.com". |
| Anti-eco de bloqueos | LAGUNA HONESTA | RV06:126 | Bloqueado por 403, declarado. |

## 5. Vrbo — API/Expedia Partner Central

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | LAGUNA HONESTA (parcial) | RV05:20-22,52-53; RV08:18 | Niveles Elite/Preferred confirmados cualitativamente; `vrbo.com/connectivity` bloqueado (403). |
| Credenciales/sandbox/producción | EVIDENCIA REAL (vía RV08, no RV05/RV17) | RV08:18 | Proceso de 6 pasos oficial: sandbox `test.ean.com`, credenciales, "site review". |
| Frecuencia y latencia real | EVIDENCIA REAL (parcial) | RV05:24,44 | "Rates/availability: pocas horas; contenido: 24-48h" — cualitativo. |
| Webhook vs. polling | LAGUNA HONESTA | RV05:25,69 | Sin especificación técnica pública. |
| Límites de tasa/reintento | **NO ABORDADA** | — | Ni RV05 ni RV07/RV17 tratan límites de tasa de la API certificada de Vrbo. |
| Direccionalidad | LAGUNA HONESTA | RV05:23,46 | Cualitativo, sin detalle de qué escribe cada nivel de partner. |
| Cobertura tarifas/restricciones/huésped/mensajes | LAGUNA HONESTA | RV05:25; RV13:86-88,96 | Confusión demand-side/supply-side (Rapid API) confirmada como laguna, no resuelta. |
| Reservas/modificaciones/cancelaciones | **NO ABORDADA** | — | Ningún módulo describe el mecanismo de notificación de reservas de la API certificada de Vrbo. |
| UID/SEQUENCE/dedupe/idempotencia | **NO ABORDADA** | — | Sin tratamiento específico de Vrbo API. |
| Anti-eco de bloqueos | **NO ABORDADA** | — | Sin tratamiento específico. |

## 6. Vrbo — iCal import/export

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | EVIDENCIA REAL | RV05:13 | "No funciona si la propiedad usa un PMS de terceros" — cita oficial. |
| Credenciales/sandbox/producción | EVIDENCIA REAL (débil, inferido) | RV05:14 | Análogo a Airbnb, no probado activamente. |
| Frecuencia y latencia real | EVIDENCIA REAL | RV05:15,18; RV07:72; RV09:55 | "Sincroniza cada 30 minutos", hasta 20 min de propagación adicional — bien citado y consistente. |
| Webhook vs. polling | EVIDENCIA REAL | RV07:72 | Polling confirmado por mecánica documentada. |
| Límites de tasa/reintento | EVIDENCIA REAL (parcial) | RV05:14 | "Hasta 5 calendarios importados por propiedad" — límite de cantidad, no de tasa de requests. |
| Direccionalidad | EVIDENCIA REAL | RV05:17,56; RV09:48 | Import/export documentados, con advertencia oficial sobre reimportar el propio export. |
| Cobertura tarifas/restricciones/huésped/mensajes | EVIDENCIA REAL | RV13:70,96 | Secciones separadas en Help Center — inferencia razonable con soporte. |
| Reservas/modificaciones/cancelaciones | EVIDENCIA REAL | RV09:48 | "tentative reservations appear as blocked dates" — cita directa. |
| UID/SEQUENCE/dedupe/idempotencia | LAGUNA HONESTA | RV06:127-132 | Sin feed real de Vrbo inspeccionado; solo tratamiento genérico vía RFC. |
| Anti-eco de bloqueos | EVIDENCIA REAL | RV05:17,56,79; RV09:48,88 | Vrbo advierte sobre "payment issues" al reimportar su propio export — la mejor evidencia de eco entre los tres canales. |

## 7. Otros canales — API oficial/partner

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | LAGUNA HONESTA (parcial) | RV05:34-36 | Google VR (invitación + TAM) y Agoda (certificación) cubiertos; **TripAdvisor Rentals y agregadores LATAM/España: 0 menciones en todo el corpus**. |
| Credenciales/sandbox/producción | **NO ABORDADA** | — | Ni para Google VR/Agoda ni para TripAdvisor/LATAM. |
| Frecuencia y latencia real | LAGUNA HONESTA | RV05:34,44,55 | Google "no especificada"; Agoda "varias veces al día" sin cifra exacta. |
| Webhook vs. polling | **NO ABORDADA** | — | — |
| Límites de tasa/reintento | **NO ABORDADA** | — | — |
| Direccionalidad | LAGUNA HONESTA | RV05:25,35 | Confusión demand-side/supply-side declarada como laguna. |
| Cobertura tarifas/restricciones/huésped/mensajes | LAGUNA HONESTA | RV05:34 | Google VR: structured data sin disponibilidad/precio documentado. |
| Reservas/modificaciones/cancelaciones | **NO ABORDADA** | — | — |
| UID/SEQUENCE/dedupe/idempotencia | **NO ABORDADA** | — | — |
| Anti-eco de bloqueos | **NO ABORDADA** | — | — |

## 8. Otros canales — iCal import/export (fallback universal)

| Dimensión | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| Acceso/aprobación/scopes | LAGUNA HONESTA | RV05:33,42 | Agoda "calendar link" — nunca llamado iCal literalmente. |
| Credenciales/sandbox/producción | **NO ABORDADA** | — | — |
| Frecuencia y latencia real | LAGUNA HONESTA | RV05:33,44,55 | "Varias veces al día" sin cifra; "20 minutos" marcado como confianza baja (solo snippet). |
| Webhook vs. polling | EVIDENCIA REAL (razonable) | RV05:33 | Por diseño del mecanismo. |
| Límites de tasa/reintento | **NO ABORDADA** | — | — |
| Direccionalidad | LAGUNA HONESTA | RV05:33,45 | Solo disponibilidad, se desactiva con &gt;1 tipo de habitación. |
| Cobertura tarifas/restricciones/huésped/mensajes | EVIDENCIA REAL (parcial) | RV05:33,45 | "Solo disponibilidad, no tarifas" para Agoda. |
| Reservas/modificaciones/cancelaciones | **NO ABORDADA** | — | — |
| UID/SEQUENCE/dedupe/idempotencia | **NO ABORDADA** | — | — |
| Anti-eco de bloqueos | **NO ABORDADA (grave)** | — | El escenario de "3+ feeds cruzados sobre la misma unidad" pedido explícitamente en LAGUNAS.md:152 nunca se investigó con ningún channel manager genérico. |

**Hallazgo de cobertura silenciosa más grave de la sección 4:** TripAdvisor Rentals y "agregadores LATAM/España" están nombrados explícitamente en el alcance de RV05 (`00-PLAN.md:226-227`, `LAGUNAS.md:12-13`) pero tienen **0 menciones como canal de conectividad en todo el corpus** (confirmado por grep) — vacío silencioso, no laguna reconocida, en 20 celdas.

---

## Sección 9 — Riesgos semánticos transversales

| Riesgo | Estado real | Módulo:línea | Nota |
|---|---|---|---|
| 1. TZID/DST | EVIDENCIA REAL (RFC) + LAGUNA HONESTA (feeds reales) | RV06:62-69,105,131-132; RV07:98-100 | RFC 5545/8536 citados con precisión; "no se tuvo acceso a un feed .ics real para validar empíricamente" — declarado como supuesto de diseño. |
| 2. Intervalo `[check-in, check-out)` | EVIDENCIA REAL | RV06:16-24,109; RV17:219-266 | El más sólido de los 7: RFC 5545 §3.6.1 verbatim + documentación oficial de PostgreSQL sobre `daterange`/bounds `[)`. Verificación empírica por canal real sigue siendo supuesto no verificado (RV06:132). |
| 3. Buffers de limpieza | EVIDENCIA REAL (mixta) | RV03:35,48-49,78 (Airbnb oficial); RV11:25-32 (Breezeway, Hostaway, Operto — reales) | **Turno bloqueado (403), laguna declarada explícitamente** (RV11:40,112). **Properly (nombrado en LAGUNAS.md:167) nunca se investigó — NO ABORDADA silenciosa.** |
| 4. Estancias contiguas | EVIDENCIA REAL | RV06:22; RV17:219-239 | El más sólido: RFC (DTEND exclusivo) + semántica de rangos de PostgreSQL (`&&` evalúa FALSE entre rangos adyacentes). |
| 5. Multi-unidad | MIXTO | RV04:16,44,84 (Booking, `Quantity`); RV13:118 (Airbnb, "multiple units property"); RV17:838-844 | Booking y Airbnb: evidencia real específica (logro poco común). Vrbo: "PENDIENTE" (RV13:120). RV17 declara explícitamente que es supuesto no confirmado con casos reales de "unidades combinables". |
| 6. Cancelación que no reabre noches | EVIDENCIA REAL (mecanismo) + LAGUNA HONESTA (precedencia + vendors) | RV17:167-215 (constraint `EXCLUDE...WHERE`, Postgres docs); RV07:53-58 | Mecanismo de BD bien fundamentado. Precedencia de capas marcada explícitamente como decisión de producto propia, no hecho documentado (RV07:158). **Casos reportados de overbooking por vendors — pedidos explícitamente por LAGUNAS.md — nunca se buscaron; NO ABORDADA dentro de un riesgo por lo demás bien tratado.** |
| 7. Feed inaccesible ≠ calendario vacío | EVIDENCIA REAL | RV07:60-66 (diseño, cuarentena); RV20:43-51 (OTel Span Status, cita real); RV09:56-61 (Hospitable: banner, cola de reintento, badge — vendor real) | El mejor ejemplo de triangulación: mecanismo técnico + práctica de vendor real + diseño propio explícitamente etiquetado. Cierra exactamente lo que LAGUNAS.md pedía. |

---

## Resumen cuantitativo

Sobre 88 celdas evaluadas (81 canal×método×dimensión + 7 riesgos transversales):

| Categoría | Cantidad aprox. | % |
|---|---|---|
| EVIDENCIA REAL (incl. parciales bien fundamentadas) | ~29 | 33% |
| LAGUNA HONESTA (explícitamente reconocida) | ~30 | 34% |
| NO ABORDADA (silencio de cobertura) | ~28 | 32% |
| RELLENO SIN EVIDENCIA (afirmada cerrada sin respaldo real) | ~1 | 1% |

**Hallazgo principal — disciplina de citación inusualmente alta:** el corpus casi no comete "relleno sin evidencia" en sentido estricto. Los módulos separan sistemáticamente [DATO]/[R]/[E] conceptualmente (aunque no con la etiqueta formal, ver `barra-calidad.md`), marcan "SIN EVIDENCIA" en vez de inventar, y declaran bloqueos 403 explícitamente. El problema dominante no es la fabricación — es el **silencio de cobertura (NO ABORDADA)** y la **fragmentación** (evidencia real existe pero dispersa en módulos no asignados por LAGUNAS.md; p. ej. el sandbox de Vrbo lo cierra RV08, no RV05/RV17 como asigna la matriz).

## Hallazgo crítico de proceso: `docs/LAGUNAS.md` nunca fue actualizado

El archivo instruye explícitamente (líneas 4-10, 175-184) que cada módulo debe actualizar el estado de sus filas con cita a la fuente que las cierra. **Las 88 filas siguen literalmente en `PENDIENTE`** pese a que esta auditoría demuestra que al menos ~29 celdas tienen evidencia real sólida. El trabajo de cierre existe, pero el artefacto de seguimiento —que RV07 y RV20 debían leer "completo antes de escribirse"— nunca se sincronizó con él.

## Lista priorizada de celdas más graves

### NO ABORDADA en dimensiones críticas para overbooking (máxima prioridad)
1. **UID/SEQUENCE/dedupe/idempotencia — Airbnb API, Vrbo API, Otros (API e iCal)**: solo verificado para Booking.com API y, vía RFC, para iCal genérico. Riesgo directo de duplicar o perder cierres de disponibilidad en 3 de 4 canales a nivel API.
2. **Anti-eco de bloqueos — Airbnb API, Booking API, Vrbo API, Otros**: el mecanismo de diseño (RV07 §3) nunca se validó contra ningún canal salvo la advertencia de Vrbo sobre su propio export. El "stop-sell" de Booking.com releído como cambio externo (pedido explícitamente por LAGUNAS.md:68) nunca se investigó.
3. **Reservas/modificaciones/cancelaciones — Vrbo API**: sin tratamiento, a diferencia de Airbnb y Booking.com.
4. **Casos reales de overbooking por vendors de channel manager (riesgo transversal 6)**: pedido explícitamente por LAGUNAS.md, nunca investigado — la precedencia de capas de RV07 es 100% diseño propio sin contraste empírico externo.
5. **TripAdvisor Rentals y agregadores LATAM/España**: nombrados en el alcance de RV05 y nunca investigados — 20 celdas vacías sin reconocer.
6. **Properly** (vendor de limpieza nombrado en LAGUNAS.md:167): nunca investigado, a diferencia de Breezeway/Hostaway/Operto.
7. **Vrbo/Otros — multi-unidad**: sin evidencia, mientras Airbnb y Booking.com sí están cubiertos — asimetría relevante porque RV17 asume respuesta uniforme entre canales.

### Nota metodológica sobre asignación de la matriz
El sandbox/certificación de Vrbo lo cierra RV08 (no RV05/RV17 como asigna LAGUNAS.md), y la admisión de partners de Booking.com queda como laguna honesta en RV04 y RV08 simultáneamente sin que ninguno actualice `docs/LAGUNAS.md`. La matriz debe reasignarse por evidencia real encontrada, no solo por el módulo originalmente designado.
