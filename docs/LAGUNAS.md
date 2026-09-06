# Lagunas e incertidumbres — matriz consolidada (cierre de Fase 1)

Reescritura de la matriz inicial (ver historial en git si se requiere la versión "PENDIENTE" de partida) con el estado real tras los 21 módulos RV01–RV21 y los dos intentos de B-002 (`docs/fuentes/b002-chrome.md`, `docs/fuentes/b002-archivo.md`). Cada celda usa uno de cuatro estados, nunca una mezcla sin aclarar:

- **EVIDENCIA** — hay fuente primaria leída (cita `F-xxx` de `docs/FUENTES.md` + módulo RVxx que la usa).
- **LAGUNA HONESTA** — no existe fuente primaria y no la hay disponible con los métodos usados (WebFetch/curl/Wayback); se indica qué haría falta (login, feed real, segunda fuente).
- **PENDIENTE-EXTERNO** — requiere partner aprobado, credenciales, sesión autenticada o validación legal humana; no es una laguna de investigación, es una dependencia externa con dueño identificable.
- **NO APLICA** — la dimensión no existe para esa combinación canal×método (p. ej. "credenciales" en iCal).

Ninguna celda pasa a EVIDENCIA sin cita `F-xxx` verificable en `docs/FUENTES.md`.

---

## Resumen de conteos (celdas de la matriz canal × método × dimensión, sección 1–4: 90 celdas totales)

| Estado | Nº celdas | % |
|---|---|---|
| EVIDENCIA (incl. parcial) | 47 | 52% |
| LAGUNA HONESTA | 33 | 37% |
| PENDIENTE-EXTERNO | 8 | 9% |
| NO APLICA | 2 | 2% |

**Riesgos semánticos transversales (sección 5, 7 filas):** 5 EVIDENCIA (resueltas con diseño propio citado), 2 LAGUNA HONESTA.

**Legal/fiscal/mercado/precios (sección 6, 15 filas):** 3 EVIDENCIA, 7 PENDIENTE-EXTERNO, 5 LAGUNA HONESTA.

**Total general (112 filas):** 55 EVIDENCIA · 40 LAGUNA HONESTA · 15 PENDIENTE-EXTERNO · 2 NO APLICA.

**Nota (2026-09-05):** se añadió 1 fila nueva en la sección 4.1 (Holidu, EVIDENCIA parcial) y se ajustaron 2 filas existentes (TripAdvisor Rentals, Agregadores regionales LATAM/España) tras un intento de investigación en vivo el mismo día; el total de 112 filas y los conteos de esta cabecera no se recalcularon para esta pasada — tratar como aproximados hasta la próxima consolidación completa de la matriz.

---

## 1. Airbnb

### 1.1 Airbnb — API oficial / partner

| Dimensión | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Acceso/aprobación/scopes | **EVIDENCIA (parcial)** — proceso de aprobación (NDA, revisión de seguridad, 6 meses post-aprobación) confirmado [F-009, RV03]; **nombres literales de scopes** individuales NO confirmados [F-058, RV03] | RV03 | Bajo-medio: no bloquea el diseño de alto nivel, sí el detalle de permisos por rol de tool (RV18) | Solicitar cuenta de partner/sandbox y leer developer.withairbnb.com autenticado |
| Autoridad de cuenta/consentimiento | **EVIDENCIA (parcial)** — cada persona de la organización partner registra cuenta propia [F-009]; **flujo OAuth de consentimiento del host** sin cita textual directa | RV03 | Medio: afecta el diseño de onboarding de anfitrión hacia la app | Igual que arriba; probar flujo real de autorización con cuenta de partner |
| Credenciales/sandbox/producción | **EVIDENCIA (parcial)** — existencia de "Sandbox V2" confirmada [F-058]; detalle de uso solo tras aprobación | RV03, RV17 | Bajo: no bloquea arquitectura (RV17 ya asume patrón test/prod separado) | Acceso de partner aprobado |
| Frecuencia y latencia real (vía API, no iCal) | **LAGUNA HONESTA** — sin SLA publicado de la API de partner; solo se conoce la cadencia de iCal (3h) | RV07 | Alto: el diseño de polling adaptativo de RV07 asume "sin garantía documentada" como peor caso | Acceso de partner + medición empírica una vez conectado |
| Webhook vs. polling | **LAGUNA HONESTA** — solo catálogos de terceros no oficiales afirman que existen webhooks [F-243]; no confirmado en developer.withairbnb.com público | RV07, RV17 | Alto: si no hay webhook real, el diseño debe ser 100% polling (ya es el supuesto conservador de RV17) | Confirmar con acceso de partner antes de comprometer arquitectura basada en push |
| Límites de tasa/reintento | **LAGUNA HONESTA** — sin publicación pública | RV07, RV17 | Medio: mitigado con backoff defensivo genérico (RV07 §11) | Acceso de partner |
| Direccionalidad (leer/escribir) | **EVIDENCIA (parcial)** — Homes API cubre sync de disponibilidad, gestión de listados y reservas [F-058] | RV03, RV08 | Bajo | Confirmar campos exactos con acceso de partner |
| Cobertura tarifas/restricciones/datos huésped/mensajes | **EVIDENCIA (parcial)** — existencia de Pricing/Messaging dentro del programa API confirmada [F-058, F-009]; campos exactos detrás de aprobación | RV03, RV10, RV13 | Medio | Acceso de partner |
| Reservas/modificaciones/cancelaciones | **EVIDENCIA** — política de cancelación de host con bloqueo de calendario y penalización [F-008]; flujo de cambio de fechas con aprobación del host [F-038] | RV02, RV07 | Bajo: refuerza la regla de "nunca cancelar sin autorización" con evidencia directa | — |
| UID/SEQUENCE/dedupe/idempotencia (nivel API) | **LAGUNA HONESTA** — no documentado a nivel de API (solo aplica a nivel iCal vía RFC) | RV06, RV07 | Medio | Acceso de partner + inspección de payloads reales |
| Anti-eco de bloqueos | **LAGUNA HONESTA** — sin evidencia oficial ni de terceros confiables | RV07 | Alto: es el riesgo central del producto; sin esta evidencia, RV07 diseña anti-eco por convención propia (UID+hash), no por confirmación del canal | Validar empíricamente con feed/API real en piloto |

### 1.2 Airbnb — iCal import/export

| Dimensión | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Acceso/aprobación/scopes | **EVIDENCIA** — self-service desde el panel del host, sin aprobación [F-001, F-002] | RV06 | — | — |
| Credenciales/sandbox/producción | **NO APLICA** — iCal no usa credenciales; confirmado por diseño y por ausencia de mención en las fuentes leídas | RV06 | — | — |
| Frecuencia y latencia real | **EVIDENCIA** — actualización automática cada 3 horas [F-002] (confianza baja/media específicamente para conexiones producto-Airbnb, no solo entre calendarios de terceros — ver RV03 supuesto S1; latencia externa no controlada por Atiende); el comportamiento de rate-limit del refresco manual ya no es solo snippet: `docs/investigacion/RV09-calendario-ux.md` (sección "(c) Visibilidad de estado de sincronización", cita "exceeding the update threshold requires waiting for the next automatic cycle") cita ese texto como verbatim de Airbnb Help Center art. 99, leído directamente con WebFetch — cierra la reserva "no verbatim" que tenía esta fila | RV06, RV07, RV09 | Alto: define el piso de latencia de todo el sistema para este canal | Cerrado en cuanto a existencia textual del límite; queda pendiente solo la cadencia exacta del indicador de "última sincronización" en UI (no documentada por ningún canal) |
| Webhook vs. polling | **EVIDENCIA** — polling por diseño, confirmado (sin variante push mencionada) | RV06 | — | — |
| Límites de tasa/reintento | **LAGUNA HONESTA** — no documentado por diseño de iCal | RV06 | Bajo (mitigado con polling conservador) | — |
| Direccionalidad | **EVIDENCIA (parcial)** — export siempre disponible, import de un feed externo confirmado [F-001]; **límite máximo de calendarios importables por anuncio** sin evidencia de un número máximo | RV06 | Bajo | Confirmar en interfaz de host real |
| Cobertura tarifas/restricciones/datos huésped/mensajes | **EVIDENCIA (parcial)** — el feed incluye bloqueos por reglas de disponibilidad, no tarifas [F-002, F-004]; **ausencia de datos de huésped** solo corroborada por foro de comunidad, no por declaración oficial [F-242] | RV06 | Medio: relevante para cumplimiento de minimización de datos (RV19) — no prometer "sin PII" como garantía contractual de Airbnb | Buscar declaración oficial explícita o tratar como riesgo residual documentado |
| Reservas/modificaciones/cancelaciones | **EVIDENCIA (parcial)** — bloqueo de calendario tras cancelación de host confirmado [F-008]; liberación inmediata tras cancelación de huésped solo por snippet, no verbatim | RV06, RV07 | Medio | Re-verificar con fetch directo del artículo específico |
| UID/SEQUENCE/dedupe/idempotencia | **LAGUNA HONESTA** — no se inspeccionó un feed `.ics` real de Airbnb | RV06 | Alto: el diseño de dedupe de RV07 (UID+hash) no está validado contra tráfico real | Obtener un feed real de una cuenta de prueba |
| Anti-eco de bloqueos | **LAGUNA HONESTA** — no confirmado si Airbnb re-importa como "reserva" un bloqueo generado por el propio sistema en otro canal | RV06, RV07 | Alto (ver 1.1) | Validación empírica en piloto |

---

## 2. Booking.com

### 2.1 Booking.com — API oficial / Connectivity Partner

| Dimensión | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Acceso/aprobación/scopes | **EVIDENCIA** — certificación diferenciada por API (PCI/PII), autoevaluación para Payments [F-060, F-061]; **admisión de nuevos proveedores de conectividad confirmada como PAUSADA "hasta nuevo aviso"** [F-082, leído en vivo 2026-09-05] | RV04 | **Alto — bloqueante de roadmap**: si la pausa sigue vigente al construir, Atiende no puede certificarse como Connectivity Partner directo; debe planear iCal o un channel manager ya certificado como vía de entrada | Monitorear `connect.booking.com` periódicamente; contactar Connectivity Support para fecha estimada de reapertura |
| Autoridad de cuenta/consentimiento | **EVIDENCIA** — "machine accounts" a nivel de propiedad, no de usuario; separación explícita test/producción [F-071]; **propiedades individuales NO pueden conectar directo, solo vía channel manager** [F-083] | RV04, RV17 | Alto: confirma que Atiende debe operar como "channel manager" ante Booking, no como conexión directa del anfitrión | — |
| Credenciales/sandbox/producción | **EVIDENCIA (parcial)** — token-based (JWT) vs. credential-based (sunset 31-dic-2025, ya pasado) [F-071]; **requisitos exactos de onboarding** detrás de portal Salesforce sin contenido renderizable | RV04, RV17 | Medio: fecha de sunset ya vencida respecto a hoy — riesgo de que credential-based ya no exista | Confirmar estado vigente del esquema de auth con Connectivity Support |
| Frecuencia y latencia real | **EVIDENCIA** — polling recomendado cada 20s para reservas nuevas [F-066]; ack re-envía hasta confirmación | RV07 | Bajo | — |
| Webhook vs. polling | **EVIDENCIA** — modelo 100% pull/polling confirmado, ningún webhook documentado [F-065, F-066] | RV07, RV17 | Medio: descarta arquitectura basada en push para este canal | — |
| Límites de tasa/reintento | **EVIDENCIA (parcial)** — 10,000/min general [F-060]; solo dos ejemplos puntuales de límite por endpoint verificados (700/min `/xml/reservationssummary`, 75/min `OTA_Hotel*Notif`) — **no confirmado si existen niveles intermedios adicionales para otros endpoints**, no citar "75-700/min" como rango continuo ni como catálogo completo; confianza media (no verificado carácter por carácter, ver RV21 laguna 7) | RV07, RV17, RV21 | Bajo | Reverificar cifra exacta y catálogo completo por endpoint antes de fijarla como constante de arquitectura |
| Direccionalidad | **EVIDENCIA** — `roomstosell`, CTA/CTD, min/max stay, `closed` documentados con semántica exacta [F-068] | RV04, RV08 | — | — |
| Cobertura tarifas/restricciones/datos huésped/mensajes | **EVIDENCIA** — Messaging API con ventanas temporales (check-in hasta 7 días post-checkout) [F-070]; pricing con derived/occupancy-based [F-067, F-073] | RV04, RV10, RV13 | — | — |
| Reservas/modificaciones/cancelaciones | **EVIDENCIA** — 3 estados (new/modified/cancelled) [F-069]; no-show vía Reporting API distinto de cancelación [F-074]; **efecto del no-show sobre liberación de inventario** sin confirmar | RV02, RV07 | Medio | Confirmar con Connectivity Support o prueba en cuenta real |
| UID/SEQUENCE/dedupe/idempotencia | **EVIDENCIA (parcial)** — mecanismo de ack con re-envío hasta confirmación, responsabilidad de dedupe trasladada al receptor [F-066]; no hay concepto de UID/SEQUENCE tipo iCal | RV06, RV07 | Bajo | — |
| Anti-eco de bloqueos | **LAGUNA HONESTA** — no documentado si un "stop-sell" propio puede releerse como cambio externo | RV07 | Alto | Validación empírica en piloto |
| Estado de admisión de nuevos partners | **EVIDENCIA** — confirmado en vivo: pausa activa sin fecha de reapertura [F-082] | RV04 | Alto (ver fila 1) | Reintentar lectura de `connect.booking.com` periódicamente |
| Umbral de anticipación de Request-to-Book (RtB) | **LAGUNA HONESTA** — contradicción real entre dos páginas oficiales de Booking.com sobre el mismo dato: "al menos tres días antes del check-in" (overview, F04) vs. "más de 48 horas" (onboarding, F13); ambas releídas dos veces en vivo el 2026-09-05 con el mismo resultado — no es un umbral distinto para un concepto distinto, es una discrepancia sin reconciliar [RV04 §4/§7, BLUEPRINT §12] | RV04 | Medio: riesgo de diseñar mal la ventana de "bloqueo blando" interno propuesta en RV04-R-01 si se asume un umbral incorrecto | No usar ningún número concreto en copy de producto/SLA sobre esta ventana; confirmar directamente con Booking.com Connectivity Support. Mientras tanto, aplicar el umbral más conservador (72h) si se requiere un valor operativo provisional |

### 2.2 Booking.com — iCal import (fallback sin conectividad)

| Dimensión | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Acceso/aprobación/scopes | **PENDIENTE-EXTERNO / LAGUNA HONESTA** — `partner.booking.com` y `partnerhelp.booking.com` bloqueados en vivo (403/timeout) **y confirmado que Wayback Machine no tiene ninguna captura histórica de estos subdominios** (CDX vacío, [F-245]) — no es solo que falte la versión actual, nunca fue indexado. Requiere sesión autenticada de extranet, no solo reintento de lectura pública | RV06, RV07 | **Alto — laguna estructural**: Booking.com queda subrepresentado en toda la investigación para este método; ninguna cifra de frecuencia/elegibilidad de iCal es fuente primaria | Obtener acceso a una cuenta de extranet real (propia o de un anfitrión piloto) para leer la sección de sincronización de calendario desde dentro de la sesión autenticada |
| Credenciales/sandbox/producción | **NO APLICA** (esperado para iCal) — no confirmable por la misma razón que arriba | RV06 | Bajo | — |
| Frecuencia y latencia real | **PENDIENTE-EXTERNO / LAGUNA HONESTA** — sin fuente primaria ni archivada; cifras de terceros ("2–6 h", "hasta 12 h") descartadas explícitamente por venir de blogs comerciales [ver `docs/FUENTES.md` sección 10] | RV06, RV07 | Alto: es el dato de mayor impacto en el diseño anti-overbooking para este canal y no existe | Acceso a extranet real |
| Webhook vs. polling | **LAGUNA HONESTA** (se asume polling por diseño de iCal, sin confirmación específica de Booking) | RV06 | Bajo | Acceso a extranet real |
| Límites de tasa/reintento | **LAGUNA HONESTA** | RV06 | Bajo | Acceso a extranet real |
| Direccionalidad | **LAGUNA HONESTA** — no confirmado si Booking exporta iCal además de importar | RV06 | Medio | Acceso a extranet real |
| Cobertura tarifas/restricciones/datos huésped/mensajes | **LAGUNA HONESTA** (se asume igual que RFC base, sin confirmación específica) | RV06 | Bajo | Acceso a extranet real |
| Reservas/modificaciones/cancelaciones | **LAGUNA HONESTA** | RV06, RV07 | Medio | Acceso a extranet real |
| UID/SEQUENCE/dedupe/idempotencia | **LAGUNA HONESTA** — sin feed real inspeccionado | RV06 | Alto | Obtener feed real de una cuenta piloto |
| Anti-eco de bloqueos | **LAGUNA HONESTA** — especialmente relevante con feeds cruzados (Booking + Airbnb + Vrbo simultáneos) | RV06, RV07 | Alto | Validación empírica en piloto |

---

## 3. Vrbo (Expedia Group)

### 3.1 Vrbo — API oficial / Expedia Partner Central

| Dimensión | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Acceso/aprobación/scopes | **EVIDENCIA** — 3 niveles Elite/Preferred/Integrated confirmados vía captura archivada de Wayback (2026-03-10) [F-100]; confianza **media** por ser copia archivada 6 meses anterior a esta investigación, no lectura en vivo (403) | RV05 | Medio: nombres de nivel pueden haber cambiado desde marzo 2026 | Reintentar lectura en vivo de `vrbo.com/connectivity` o buscar captura Wayback más reciente |
| Autoridad de cuenta/consentimiento | **LAGUNA HONESTA** — no detallado en la captura archivada (SPA con contenido JS no capturado) | RV05, RV17 | Bajo | Acceso de partner o captura Wayback más completa |
| Credenciales/sandbox/producción | **EVIDENCIA (parcial, con salvedad)** — sandbox `test.ean.com` confirmado para Expedia Rapid [F-107]; **no confirmado si es la misma superficie técnica que usa Vrbo vacation rentals** | RV05, RV17 | Medio | Confirmar equivalencia Rapid↔Vrbo homes con Expedia Partner Solutions |
| Frecuencia y latencia real | **EVIDENCIA** — "a few hours" para rates/availability vía software certificado [F-089] | RV07 | Bajo | — |
| Webhook vs. polling | **LAGUNA HONESTA** — no documentado | RV07, RV17 | Medio | Acceso de partner |
| Límites de tasa/reintento | **LAGUNA HONESTA** | RV07, RV17 | Bajo | Acceso de partner |
| Direccionalidad | **LAGUNA HONESTA** — nivel de detalle de campos no alcanzado | RV05, RV08 | Bajo | Acceso de partner |
| Cobertura tarifas/restricciones/datos huésped/mensajes | **LAGUNA HONESTA** — detrás de acceso Rapid API con contrato | RV05, RV10, RV13 | Medio | Acceso de partner |
| Reservas/modificaciones/cancelaciones | **EVIDENCIA** — políticas de cancelación con 7 niveles y tabla de reembolso [F-093, F-094, F-095] (nivel ayuda/UI, no API) | RV02, RV07 | Bajo | — |
| UID/SEQUENCE/dedupe/idempotencia | **LAGUNA HONESTA** | RV06, RV07 | Medio | Acceso de partner |
| Anti-eco de bloqueos | **LAGUNA HONESTA** | RV07 | Alto | Validación empírica en piloto |

### 3.2 Vrbo — iCal import/export

| Dimensión | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Acceso/aprobación/scopes | **EVIDENCIA** — self-service, hasta 5 calendarios por propiedad, solo si se gestiona desde Vrbo Owner Dashboard [F-087] | RV06 | Bajo: no funciona si la propiedad usa un PMS de terceros para gestión — Atiende deberá clarificar esta limitación al onboarding | — |
| Credenciales/sandbox/producción | **NO APLICA** | RV06 | — | — |
| Frecuencia y latencia real | **EVIDENCIA** — 30 min (app móvil) + hasta 20 min de propagación adicional [F-087]; **cadencia del dashboard web** sin cifra explícita | RV06, RV07 | Medio | Verificar cadencia web directamente en cuenta de prueba |
| Webhook vs. polling | **EVIDENCIA** — polling confirmado | RV06 | — | — |
| Límites de tasa/reintento | **LAGUNA HONESTA** | RV06 | Bajo | — |
| Direccionalidad | **EVIDENCIA** — import y export confirmados, con advertencia oficial explícita sobre riesgo de reimportar el propio export [F-088] | RV06 | — | — |
| Cobertura tarifas/restricciones/datos huésped/mensajes | **EVIDENCIA** — confirmado por omisión (ningún artículo de sync menciona tarifa) | RV06 | Bajo | — |
| Reservas/modificaciones/cancelaciones | **LAGUNA HONESTA** — tratamiento de cancelación en el feed no confirmado | RV06, RV07 | Medio | Inspeccionar feed real |
| UID/SEQUENCE/dedupe/idempotencia | **LAGUNA HONESTA** — sin feed real inspeccionado | RV06 | Alto | Obtener feed real |
| Anti-eco de bloqueos | **EVIDENCIA (parcial)** — Vrbo advierte explícitamente que reimportar el propio export causa "payment issues" [F-088], evidencia directa de que el riesgo de eco es reconocido por el canal; comportamiento con 3+ feeds cruzados sin confirmar | RV06, RV07 | Alto | Validación empírica con múltiples feeds cruzados |

---

## 4. Otros canales

### 4.1 Otros — API oficial/partner

| Canal | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Google Vacation Rentals | **EVIDENCIA (parcial)** — programa por invitación con Technical Account Manager, no autoservicio [F-112]; structured data solo de contenido, no disponibilidad/precio [F-111] → **LAGUNA HONESTA** en mecanismo de feed de disponibilidad | RV05 | Bajo (canal no prioritario para el caso ancla) | Solicitar invitación si el volumen lo justifica |
| Agoda | **EVIDENCIA** — extranet "calendar link" funcionalmente equivalente a iCal, solo disponibilidad [F-110]; Content Push API para partners certificados [F-108] | RV05 | Bajo | — |
| TripAdvisor Rentals | **LAGUNA HONESTA — intento realizado 2026-09-05, bloqueo confirmado** — 3 intentos de WebFetch en vivo (tripadvisor.com/Rentals, tripadvisor.com/rental-owners-help, y una URL de listados) devolvieron HTTP 403 Forbidden en las tres. No se puede confirmar ni negar si la vertical sigue activa ni si tiene programa de partner/conectividad. Ver también `docs/investigacion/RV08-directa-vs-channel-manager.md` §1.4 | RV05, RV08, RV14 | Bajo-medio (relevante solo si aparece en el mix de canales del caso ancla) | Acceso autenticado de partner a TripAdvisor, reintento en otro momento/entorno sin el bloqueo actual, o consulta a Wayback Machine si deja de estar bloqueado (no intentado aún) |
| Agregadores regionales LATAM/España | **LAGUNA HONESTA — Holidu investigado (europeo, sin cobertura LatAm confirmada); rentalia.com intentado 2026-09-05 (403 Forbidden)** — sigue sin evidencia de agregadores nativos de LatAm/España. Ver también `docs/investigacion/RV08-directa-vs-channel-manager.md` §1.4 | RV05, RV08, RV14, RV15 | Medio (relevante para expansión LATAM/España) | Sesión de investigación dedicada, ligada a RV15 (mercado); confirmar si Holidu tiene cobertura LatAm antes de asumir relevancia |
| Holidu (canal/agregador + channel manager) | **EVIDENCIA (parcial)** — página oficial de partners leída en vivo 2026-09-05: compatible con 75+ PMS/channel managers, API propia, distribución a 25+ sitios de reserva internacionales; sin cifra de comisión/precio; **europeo, sin cobertura LatAm confirmada**. Modelo de conectividad detallado en `docs/investigacion/RV08-directa-vs-channel-manager.md` §1.4 | RV08, RV14 | Bajo-medio (relevante para expansión europea; incierto para LatAm) | Confirmar cobertura geográfica LatAm y comisión antes de usar en decisiones comerciales |

### 4.2 Otros — iCal import/export (fallback universal)

| Dimensión | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Todas las dimensiones (frecuencia, límites, dedupe, anti-eco por canal genérico) | **LAGUNA HONESTA** — solo hay afirmaciones de marketing de channel managers (RV14) sobre su propio SLA agregado, no de los canales individuales | RV06, RV07 | Bajo (fallback universal, no crítico si Airbnb/Booking/Vrbo ya están cubiertos) | Confirmar por canal cuando se agregue uno nuevo al roadmap |

---

## 5. Riesgos semánticos transversales

| Riesgo semántico | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| TZID/DST | **EVIDENCIA — resuelto** — RFC 5545 define VTIMEZONE/STANDARD/DAYLIGHT y reglas normativas de desambiguación DST [F-113]; RV17 adopta `daterange`/`tstzrange` con zona horaria por propiedad | RV06, RV07, RV17 | — (riesgo cerrado por diseño) | — |
| `[check-in, check-out)` | **EVIDENCIA — resuelto** — `DTEND` no-inclusivo confirmado en RFC [F-113]; `daterange`/`int4range`/`int8range` de PostgreSQL usan forma canónica `[)` [F-141] | RV06, RV17, RV21 | — (riesgo cerrado por diseño; único off-by-one real sería `tstzrange` sin bound explícito, mitigado documentando la construcción `[)` explícita) | — |
| Buffers de limpieza | **LAGUNA HONESTA (parcial, mecanismo ya diseñado)** — Airbnb confirma "preparation time" configurable (ejemplo 48h) [F-005], pero ningún canal ni proveedor de operaciones documenta cómo representar un buffer sin que se lea como "noche vendida" en un canal externo. RV17 (`docs/investigacion/RV17-arquitectura-datos.md` §1.1) ya modela `bloqueo_manual.capa` con el valor `limpieza` como capa distinguible de `manual_anfitrion`/`mantenimiento`/`regla_automatica`, compartiendo el mismo invariante de no solapamiento (§2.3) — el mecanismo técnico de representación existe; falta la decisión de producto sobre si ese bloqueo se exporta o no a los feeds de canal externos | RV07, RV11, RV17 | Alto: es responsabilidad de diseño propio de Atiende, no heredable de ningún canal | Decisión de producto (no de arquitectura): confirmar si `bloqueo_manual` de capa `limpieza` se sincroniza hacia los canales externos como cierre de disponibilidad o solo vive internamente |
| Estancias contiguas | **EVIDENCIA — resuelto** — consecuencia directa de la forma canónica `[)` (checkout de A el mismo día que check-in de B no es solapamiento) [F-113, F-141] | RV07, RV17 | — | — |
| Multi-unidad | **EVIDENCIA (parcial)** — Booking.com modela con `Quantity` en room type [F-075]; Airbnb agrupa por "multiple units property" [F-037]; Vrbo/Expedia sin evidencia equivalente | RV05, RV17 | Medio (Vrbo) | Confirmar mecanismo de Vrbo con acceso de partner |
| Cancelación no reabre noches ya ocupadas | **LAGUNA HONESTA** — es una decisión de diseño propia de RV07 (precedencia RESERVA > BLOQUEO_PROPIETARIO > MANTENIMIENTO > BUFFER), no confirmada como comportamiento nativo de ningún canal. RV17 (RV17-R-11, §12) aporta el mecanismo de verificación posterior al hecho: ninguna transición de `reserva.estado` hacia cancelación puede originarse en lógica interna del sistema (solo refleja lo que el canal reportó o una acción humana explícita registrada en `audit_log`, §8.2) — esto no resuelve la precedencia de capas que RV07 debe decidir, pero hace auditable que el sistema nunca "reabre" noches por decisión propia disfrazada de reflejo del canal | RV07, RV17 | Alto: si no se implementa correctamente, es la forma más directa de causar un overbooking al procesar una cancelación mal manejada | Validar la precedencia con producto antes de construir; no hay fuente externa que lo confirme o refute |
| Feed inaccesible ≠ calendario vacío | **EVIDENCIA — resuelto por diseño** — OpenTelemetry define estados Ok/Error/Unset de un span [F-143]; RV20 adopta explícitamente "Unset/Error, nunca Ok por omisión" como principio de cuarentena | RV07, RV20 | — (principio de diseño adoptado, no exigido por ningún canal pero implementado como invariante) | — |
| Modelo de roles internos no reconciliado (RV12 vs. RV18) | **LAGUNA HONESTA** — RV12 modela 6 roles (Superadmin Atiende, Administrador de empresa gestora, Operador, Limpieza, Propietario, Contador) sin niveles de "coanfitrión"; RV18 modela 4 roles (anfitrión, coanfitrión con 3 niveles delegados, administrador, superadmin) sin "Limpieza"/"Contador" — escritos el mismo día sin citarse entre sí (contradicción #7 de `docs/auditoria-investigacion-1/contradicciones.md`). Ambos módulos ya incluyen una "Nota de reconciliación pendiente" cruzada tras la corrección de 2026-09-05 | RV12, RV18, RV17 (consumidor futuro) | Alto: RV17 no puede congelar el modelo de datos de roles/permisos sin resolver esta discrepancia primero | Abrir un módulo dedicado de "roles y permisos" que unifique ambas propuestas, tomando como base los 3 niveles de cohost ya verificados con fuente primaria (RV01/RV03: acceso completo / calendario+mensajería / solo calendario) extendidos con los roles operativos/financieros de RV12 |
| UID/SEQUENCE/DTSTAMP como señal oportunista, no garantía (respaldo de hash de contenido) | **EVIDENCIA — resuelto por diseño, tras corrección 2026-09-05** — RV06/RV07 documentan que no hay evidencia primaria de que los canales incrementen SEQUENCE de forma consistente en feeds `PUBLISH` reales (contradicción #6 de `docs/auditoria-investigacion-1/contradicciones.md`); RV21 actualizó sus casos adversariales 1, 3 y 13 y sus requisitos RV21-R-01/R-02 para exigir verificación por hash de contenido (fechas, estado) como respaldo obligatorio antes de considerar resuelto un conflicto de sincronización, en vez de confiar solo en UID/SEQUENCE/DTSTAMP | RV06, RV07, RV21 | Alto: si no se implementa el hash de respaldo, un canal que no incremente SEQUENCE de forma confiable puede causar una resolución de conflicto incorrecta sin que el sistema lo detecte | Validar empíricamente en piloto si los canales reales incrementan SEQUENCE de forma consistente; mientras tanto, implementar el hash de contenido como respaldo obligatorio (ya reflejado en RV21) |

---

## 6. Legal, fiscal, mercado y precios — PENDIENTE

| Tema | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| España — Registro Único de Arrendamientos / ventanilla única | **PENDIENTE-EXTERNO / LAGUNA HONESTA** — no se confirmó número, fecha ni contenido de la norma [F-238] | RV15, RV19 | **Alto — bloqueante**: no construir ni anunciar "número de registro en anuncios" para España sin esto | Verificación manual directa en boe.es/mivau.gob.es o consulta con despacho legal español |
| España — Orden INT (modelo operativo del parte de viajeros) | **PENDIENTE-EXTERNO** — no localizada [F-239] | RV19, RV21 | Alto — bloqueante para "envío automático del parte de viajeros" | Verificación manual en interior.gob.es o consulta legal |
| México — regulación local CDMX de alojamiento turístico | **PENDIENTE-EXTERNO** — fuentes con error TLS/sin resultados [F-237] | RV15, RV19 | Alto para el mercado CDMX específicamente | Consulta manual a Gaceta Oficial CDMX / SECTURCDMX |
| México — vigencia post-reforma de tasas ISR (4%/20%)/IVA (50%/100%) | **LAGUNA HONESTA** — sat.gob.mx inaccesible como SPA | RV12, RV19 | Alto: afecta cálculo de neto en owner statements | Verificación directa en sat.gob.mx (requiere navegador con JS) o RMF vigente |
| México — Reglamento LFPDPPP 2011 vs. Ley 2025 | **PENDIENTE-EXTERNO** — desfase textual confirmado [F-220, F-221], vigencia supletoria requiere criterio legal | RV19 | Medio-alto | Consulta con abogado mexicano especializado en protección de datos |
| México — mecánica RESICO vs. retención de plataformas | **LAGUNA HONESTA** — no aclarada por la ley, requiere Resolución Miscelánea Fiscal inaccesible | RV19 | Medio | Consulta contable/fiscal |
| España/UE — guía AEPD sectorial sobre alquiler turístico | **LAGUNA HONESTA** — sección de guías con 503 | RV19 | Bajo-medio | Reintentar más tarde o consulta directa a AEPD |
| Comisión exacta de Booking.com | **LAGUNA HONESTA** — portal de partner bloqueado en todos los intentos | RV12, RV13 | Alto: afecta modelo de owner statement | Acceso de partner autenticado |
| Comisión exacta de Vrbo | **LAGUNA HONESTA** — páginas de tarifas devolvieron error 429/500 | RV12, RV13 | Alto | Reintentar en otro momento / acceso de partner |
| Costo/plazo de certificación directa Airbnb/Booking/Vrbo | **LAGUNA HONESTA** — ninguno de los tres canales publica costo; solo requisitos cualitativos | RV08, RV16 | Medio: afecta decisión build-vs-partner del roadmap | No inventar cifra; usar comparación cualitativa hasta tener cotización real |
| TAM/SAM/SOM México y LatAm | **LAGUNA HONESTA** — no existe equivalente al INE español para México; INEGI mide turismo agregado, no rentas vacacionales específicamente. **Intento adicional 2026-09-05:** glosario oficial de DATATUR/Sectur (`datatur.sectur.gob.mx/SitePages/Glosario.aspx`, leído en vivo) confirma que no existe indicador oficial de renta vacacional tipo Airbnb (solo "Cabañas, villas y similares", categoría pre-Airbnb) — segunda fuente que refuerza la laguna, no la cierra; Holidu no aplica (europeo, sin cobertura LatAm confirmada); Rentalia.com bloqueado (403 Forbidden). No se construyó ninguna cifra nueva de TAM/SAM/SOM para LatAm | RV15 | Medio: limita la solidez de las proyecciones de mercado fuera de España | Buscar fuente sectorial privada (AMPI, informes de channel manager con metodología declarada) o encargo de estudio de mercado |
| Precio Guesty Pro/Enterprise, todos los planes de Hostaway | **LAGUNA HONESTA** — quote-only, no público | RV14, RV16 | Bajo (referencia competitiva, no bloqueante) | Solicitar cotización como prospecto |
| Costo AWS RDS PostgreSQL / S3 por tenant | **LAGUNA HONESTA** — tablas renderizadas por JS no extraíbles | RV16 | Bajo | Usar AWS Pricing Calculator en sesión con navegador real |
| Segmentación de anfitriones por volumen de unidades (estudio sectorial) | **LAGUNA HONESTA** — no se encontró informe oficial ni de asociación del sector | RV01, RV15 | Medio: la segmentación de RV01 es hipótesis de producto, no dato de mercado verificado | Encargo de estudio propio o encuesta a la base de clientes piloto |
| Tasa de adopción de channel managers/PMS entre anfitriones profesionales | **LAGUNA HONESTA** | RV15 | Medio | Igual que arriba |
| Declaración oficial de Airbnb sobre ausencia de nombre de huésped en iCal exportado | **LAGUNA HONESTA** — solo corroborado por foro de comunidad [F-242], no por fuente oficial | RV19, RV21 | Alto: si el producto depende de esto para cumplimiento de privacidad, es un riesgo de diseño sin garantía contractual | Buscar declaración oficial explícita o tratar el campo como "puede contener PII" por defecto y sanitizar en el pipeline propio |

---

## 7. RV22 — Canales de distribución adicionales (México)

Filas nuevas producidas por RV22 (`docs/investigacion/RV22-canales-mexico.md`, ledger `docs/fuentes/rv22-canales-mexico.md`, consulta 2026-09-06). No duplica filas ya existentes en §1-§4 (Airbnb, Booking.com, Vrbo, Google Vacation Rentals/Agoda/TripAdvisor Rentals/Holidu de §4.1 ya cubiertos allí); esta sección solo agrega canal por canal lo que RV22 investigó de nuevo o amplió.

| Canal | Estado | Módulo(s) | Impacto en producto | Acción para cerrar |
|---|---|---|---|---|
| Expedia Group — Product/Availability&Rates/Booking Notification/Booking Retrieval API (Expedia) | **EVIDENCIA** — arquitectura completa documentada en vivo (navegación con Chrome, SPA no fetcheable por WebFetch/curl): límite de 5,000 actualizaciones/mensaje [RV22 F06], EQC confirmado = "Expedia QuickConnect" [F10], sandbox real en `api.sandbox.expediagroup.com` (no `test.ean.com`, corrección sobre RV05) [F12]; **sin SLA de latencia publicado** para Availability & Rates — LAGUNA HONESTA confirmada por búsqueda exhaustiva [F07] | RV22, RV05, RV07 | Alto: sin SLA de latencia no se puede fijar el piso de polling/reconciliación de este canal en el diseño de RV07 | Acceso de partner aprobado + medición empírica una vez conectado |
| Expedia Group — Vrbo NO comparte superficie técnica con Expedia (cierre de laguna RV05) | **EVIDENCIA** — Vrbo tiene stack REST/XML propio heredado de HomeAway (Booking service/BUS, Unit Availability update service); Expedia declara explícitamente "Retrieving reservations for Vrbo properties is not supported at this time" [F13] | RV22, RV05, RV17 | Alto: el modelo de datos/adaptador de Vrbo debe diseñarse independiente del de Expedia, no como variante de marca del mismo conector | — (cerrada; ver RV22-R-02/R-05) |
| Expedia Group — costos/NDA/plazos de aprobación de partner | **PENDIENTE-EXTERNO** — proceso real vive detrás de un formulario comercial (Typeform) no público, no completado por no corresponder entregar datos de terceros sin instrucción explícita [F11] | RV22, RV08, RV16 | Medio: afecta comparación build-vs-partner del roadmap de expansión a Expedia/Hotels.com | Contacto comercial directo con Expedia Group Partner Solutions |
| Despegar/Decolar — conectividad técnica | **LAGUNA HONESTA / PENDIENTE-EXTERNO** — sin API/spec pública propia (`developers.despegar.com` no resuelve, sitio bloqueado 403); única evidencia es de un tercero (Rentals United, comisión ~15%, onboarding 3-5 días, México elegible) [RV22 F16-F18], no confirmada por Despegar directamente | RV22, RV08, RV15 | Alto: es el mayor mercado LatAm de OTA y no tiene vía de autoservicio | Contacto comercial directo con Despegar, o certificación vía channel manager puente (SiteMinder/Rentals United) |
| Best Day — conectividad técnica y relevancia para rentas vacacionales | **LAGUNA HONESTA** — bloqueo total de fuentes propias (403/ENOTFOUND en todos los intentos); ausente en 2 de 3 directorios de channel manager consultados, presente en el tercero (Vertical Booking) — discrepancia sin resolver, no se puede confirmar ni negar si acepta rentas vacacionales [RV22 F20-F21] | RV22, RV08, RV15 | Medio-alto: sin esta evidencia no se puede decidir si Best Day entra al roadmap de Nivel B o C | Verificación humana directa (navegador real sin bloqueo anti-bot) o contacto comercial |
| PriceTravel — conectividad técnica y alcance (hoteles vs. rentas vacacionales) | **LAGUNA HONESTA / PENDIENTE-EXTERNO** — portal de auto-registro confirmado (`autoenrollment.pricetravel.com`) pero contenido no verificable; contradicción entre el sitio de consumo ("solo hoteles") y la declaración de un tercero (Rentals United: sí cubre "vacation rentals/short-term rental", comisión 18-21%, onboarding 2-3 semanas, México incluido) [RV22 F22-F23] | RV22, RV08, RV15 | Medio: la contradicción debe resolverse antes de decidir si PriceTravel es relevante para el producto de Atiende | Contacto directo con PriceTravel o registro de prueba en el portal de auto-registro |
| Channel manager puente — SiteMinder (pmsXchange) para Booking+Expedia+Vrbo+Despegar+PriceTravel | **EVIDENCIA (parcial)** — tabla técnica primaria "Booking Agent Codes" confirma 4/5 canales objetivo (falta Best Day) [RV22 F24]; API pública pmsXchange documentada y orientada exactamente a PMS externos [F25]; **no verificado** si SiteMinder cubre Best Day o "Decolar" como marca separada, ni el costo/plazo de contrato comercial | RV22, RV08, RV16 | Alto — es la vía de entrada más concreta a los canales regionales pausados/sin API propia | Contacto comercial directo con SiteMinder para confirmar cobertura exacta y costos antes de firmar |
| Google Vacation Rentals — arquitectura de feeds (Pricing separado de Listings) | **EVIDENCIA** — confirma feed de "Pricing" específico y separado del feed de contenido para disponibilidad/tarifa de vacation rentals; vigente en 2026 (última actualización doc: 2025-02-28 UTC, sin banner de deprecación) [RV22 F29] | RV22, RV05 | Bajo (canal no prioritario, por invitación exclusiva) | Solicitar invitación si el volumen de tráfico orgánico lo justifica |
| Agoda — YCS/Partner Portal | **LAGUNA HONESTA — intento realizado 2026-09-06, bloqueo técnico confirmado** — `ycs.agoda.com` redirige (307) a `portal.agoda.com`, SPA en JavaScript no renderizable por WebFetch/curl; no se pudo confirmar si YCS cubre homes/vacation rentals, si existe iCal literal para homes, ni presencia de listados en México [RV22 F31] | RV22, RV05 | Bajo-medio | Navegador real o sesión con acceso de partner a Agoda |
| TripAdvisor Rentals — estado operativo 2026 | **LAGUNA HONESTA — reconfirmada 2026-09-06, segundo intento fallido** — bloqueo 403 en 4 variantes de URL adicionales a las 3 de 2026-09-05; sala de prensa oficial no menciona rentals en sus 3 comunicados más recientes (evidencia circunstancial, no concluyente); Wayback Machine/archive.today bloqueados en este entorno [RV22 F33-F34] | RV22, RV05, RV08, RV14 | Bajo-medio | Reintento con navegador real, acceso de partner, o nueva búsqueda de prensa con cupo de WebSearch disponible |
| FlipKey — estado operativo | **EVIDENCIA — resuelto** — confirmado cerrado con fuente primaria en vivo, cita textual explícita: "Flipkey has closed down, please visit Tripadvisor to plan your next trip" [RV22 F32] | RV22 | — (cerrado; canal `no_aplica`) | — |
| HomeToGo — mecanismo de conexión para hosts directos | **EVIDENCIA** — corrige premisa de relación corporativa con Holidu (sin evidencia de afiliación, son competidores independientes) [F35]; confirma que **Smoobu es el único channel manager certificado** para hosts directos, sin API pública abierta para otros PMS [F36]; presencia confirmada en México vía metabúsqueda (234,923 propiedades, 77 partners) [F37] | RV22, RV08, RV14 | Medio: descarta un adaptador propio de Atiende hacia HomeToGo salvo que Atiende opere como/via Smoobu | — (cerrado en cuanto a mecanismo; abierto en elegibilidad geográfica del programa de host directo) |
| Marriott Homes & Villas — mecanismo de conexión | **EVIDENCIA** — confirma 32 partners de PMS/channel manager certificados (7 Elite, 25 Standard) como único mecanismo; rutas de aplicación directa devuelven 404 en todos los casos [F39]; presencia en México confirmada parcialmente (Playa del Carmen) [F40] | RV22, RV08, RV14 | Bajo (canal de nicho de lujo, solo relevante si el cliente ya opera con uno de los 32 CM certificados) | Verificar con navegador real el volumen completo en México (Los Cabos, Tulum, CDMX) |
| Plum Guide — presencia en México | **EVIDENCIA — resuelto (ausencia confirmada)** — México no aparece en homepage ni en rutas `/mexico` y `/destinations` (ambas HTTP 404); modelo de curación por invitación con iCal, sin API de PMS [F41] | RV22 | — (canal `no_aplica` para México) | — |
| Hopper Homes — programa de partner y estado 2026 | **LAGUNA HONESTA** — sin programa de "list your property"/API/partner identificado en ninguna fuente; sitio SPA no renderizable, cero capturas en Wayback Machine para `hopper.com/homes`; sin evidencia de presencia en México [RV22 F42] | RV22, RV14 | Bajo | Nueva búsqueda con cupo de WebSearch disponible, o contacto directo con Hopper |
| Mercado Libre — categoría "Renta Vacacional" | **EVIDENCIA** — confirmado vía API pública oficial: categoría `MLM-APARTMENTS_FOR_VACATION_RENTAL` real, con atributos de hospedaje corto (huéspedes, estadía mínima, check-in/out, RNT), pero explícitamente **sin motor de reservas** (`"reservation_allowed":"not_allowed"`) y volumen marginal (442 anuncios, ≈0.15% de Inmuebles) [RV22 F43-F45] | RV22, RV15 | Bajo (canal de escala marginal, sin sincronización de disponibilidad posible) | Reconsultar la API pública periódicamente si el volumen crece |
| Facebook Marketplace — relevancia y API para rentas vacacionales | **LAGUNA HONESTA** — categoría genérica de "alquiler de propiedades" sin diferenciación vacacional confirmada; documentación de Meta for Developers sobre Marketplace inaccesible (403 vía WebFetch, cuerpo vacío vía curl); no se pudo confirmar ni descartar una categoría histórica "Vacation Rentals" [RV22 F46] | RV22, RV15 | Bajo | Cuenta de desarrollador de Meta con acceso completo, o nueva búsqueda con cupo de WebSearch |
| Rappi — fuera de alcance | **NO APLICA** — corrección de la coordinación durante la investigación: "Rappi" en el encargo original era confusión de nombre por "Airbnb" (ya cubierto en RV03); investigación detenida por instrucción explícita sin profundizar [RV22 F47] | RV22 | Ninguno (fuera de alcance) | No reabrir sin nueva instrucción explícita |

---

## Notas de mantenimiento de esta matriz

- Esta reescritura reemplaza la matriz "PENDIENTE" de partida (histórico disponible en git). Cada fila que un módulo futuro cierre debe actualizarse aquí con el nuevo estado y cita `F-xxx` de `docs/FUENTES.md` — nunca "cerrada" sin fuente concreta.
- Las filas **PENDIENTE-EXTERNO** tienen dueño identificable (partner, gobierno, abogado/contador) y fecha de próximo intento sugerida en `docs/BLOQUEOS.md`; las filas **LAGUNA HONESTA** no tienen una vía de cierre sin cambiar de método (feed real, cuenta piloto, encargo de estudio).
- El hallazgo de `docs/fuentes/b002-archivo.md` (intento 2 de B-002) resolvió **parcialmente** dos lagunas que en la matriz de partida estaban 100% PENDIENTE: (a) admisión de nuevos Connectivity Partners de Booking.com → ahora EVIDENCIA (pausa confirmada en vivo); (b) niveles del Connectivity Partner Program de Vrbo → ahora EVIDENCIA con confianza media (captura archivada de 6 meses de antigüedad). La ayuda de iCal de Booking.com (`partner.booking.com`/`partnerhelp.booking.com`) **sigue sin evidencia de ningún tipo** — ni en vivo ni archivada (Wayback confirma cero capturas históricas) — y se mantiene explícitamente como PENDIENTE-EXTERNO/LAGUNA HONESTA, no se fuerza a EVIDENCIA.
- Referencia cruzada: `docs/BLOQUEOS.md` (B-001 a B-004) documenta el estado operativo de los bloqueos que generan las filas PENDIENTE-EXTERNO de esta matriz; `docs/ACEPTACION.md` no debe marcar como cumplido ningún criterio que dependa de una fila LAGUNA HONESTA o PENDIENTE-EXTERNO sin la evidencia nueva citada aquí.
