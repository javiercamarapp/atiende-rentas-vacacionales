# RV05 — Vrbo y extensibilidad a otros canales

**Fecha de consulta de todas las fuentes:** 2026-09-05.
**Ledger de citas:** ver `docs/fuentes/rv05-08-14.md` (sección RV05).

## Resumen ejecutivo

Vrbo/Expedia Group ofrece dos vías de conectividad, con una brecha clara entre ellas: (1) **iCal import/export** self-service dentro del Owner Dashboard/app, limitado a disponibilidad (sin tarifas), con hasta 5 calendarios importados por propiedad, ventana de 365 días, y latencias documentadas de ~30 minutos (app móvil) a 24h (cambios generales de configuración); y (2) **conectividad vía software certificado** (Expedia Group Connectivity Partner Program, niveles Elite/Preferred/otros), que sí sincroniza tarifas, disponibilidad y reservas de forma dinámica, con SLA aproximado documentado de "unas horas" para rates/availability y 24–48h para contenido, más una verificación en tiempo real al momento de una reserva. **No existe una API pública de autoservicio del lado oferta (host/PM → Vrbo)**: el acceso a conectividad avanzada requiere aprobación/contrato, sin proceso de onboarding técnico ni costos publicados. El mismo patrón —iCal como mínimo común universal, todo lo demás detrás de partnership certificado— se repite en Google Vacation Rentals (requiere invitación y Technical Account Manager) y Agoda (extranet "calendar link" equivalente a iCal para disponibilidad únicamente; API de partner solo para conectividad contratada). Para RV05, esto define el patrón de extensibilidad: iCal cubre el mínimo (cerrar disponibilidad, sin tarifas, con latencia de minutos a horas) y cualquier canal adicional con paridad de features requiere certificación caso por caso.

## Contenido

### 1. iCal import/export en Vrbo
- Import solo disponible si la propiedad se gestiona desde Vrbo Owner Dashboard/app; **no funciona si la propiedad usa un PMS de terceros** (el import debe hacerse desde ese software).
- Hasta 5 calendarios importados por propiedad; formato `.ics`; ventana de visualización de eventos hasta 365 días.
- Frecuencia de sync documentada: app móvil sincroniza cada 30 minutos (con refresco manual); latencia de aparición de un evento importado hasta 20 minutos. Para el dashboard web no se documenta una cifra explícita (laguna).
- Los calendarios importados **deben** marcar explícitamente bloqueos para que Vrbo cierre disponibilidad — no hay inferencia automática.
- Export: vía URL de suscripción o descarga; Vrbo advierte explícitamente sobre riesgo de reimportar el propio export ("payment issues").
- Cambios generales de configuración (tarifas, estancia mínima) tardan hasta 24h en reflejarse; al aceptar una reserva con "online booking" habilitado, el calendario se actualiza automáticamente sin ese retraso.

### 2. Conectividad vía software integrado (Expedia Group Connectivity)
- Estructura de niveles: Elite, Preferred, y un tercer nivel de partners certificados (nomenclatura exacta no confirmada de forma unívoca entre fuentes).
- Criterios de certificación son cualitativos (calidad de la integración, experiencia del viajero, desempeño), no un checklist técnico numérico público.
- El software conectado gestiona tarifas, disponibilidad, reservas y políticas de forma dinámica.
- SLA aproximado documentado: rates/availability "típicamente en pocas horas"; contenido (fotos, descripciones) 24–48h; verificación en tiempo real al momento de una posible reserva.
- **No hay especificación técnica pública** (payloads, webhooks vs. polling, límites de tasa) para el canal supply-side de Vrbo; el Rapid API documentado públicamente (developers.expediagroup.com) es **demand-side** (para que OTAs/revendedores busquen/reserven inventario Vrbo), no para que un PMS empuje disponibilidad — distinción confirmada por las fuentes, laguna sobre el mecanismo real supply-side.
- El EG Connectivity Hub documenta APIs de disponibilidad/tarifas orientadas principalmente a hoteles (modelo Collect/Merchant); no se confirmó que sea la misma superficie usada por partners de conectividad de vacation rentals.

### 3. Calendario y reglas de disponibilidad en Vrbo
- Bloqueo manual y configuración de estancia mínima/máxima son funciones de dashboard, no expuestas como API pública.
- No existe un motor de reglas de disponibilidad programático documentado equivalente al de un channel manager.

### 4. Extensibilidad a otros canales
- **iCal es el mínimo común denominador real**, confirmado en Vrbo y funcionalmente en Agoda (mecanismo de "calendar link", nunca nombrado literalmente "iCal" en la fuente, pero compatible con Airbnb/Booking.com/Expedia/Vrbo). En Agoda, el enlace de calendario **solo sincroniza disponibilidad, no tarifas**, refresca "varias veces al día" (sin cifra exacta oficial), y se desactiva automáticamente si la unidad pasa a tener más de un tipo de habitación.
- **Google Vacation Rentals** no usa iCal: opera por marcado estructurado (schema.org VacationRental, sin datos de disponibilidad/precio) o feed XML de listados, y **requiere invitación** vía Technical Account Manager y acceso a Hotel Center — no es autoservicio abierto. El mecanismo de feed de disponibilidad/precio no está documentado públicamente en detalle (laguna).
- **Agoda** ofrece una Content Push API (XML push, soporta "Non-Hotel/Vacation rental") y un Demand API, pero ambas son para partners de conectividad certificados/revendedores, no autoservicio para PMs individuales.
- Patrón consistente en los tres canales: todo lo que excede disponibilidad básica (tarifas, contenido enriquecido, reservas instantáneas, feeds a Google) requiere partnership certificado/contratado; no hay autoservicio de API abierta del lado oferta en ninguno de los tres.

### 4.1 Identificadores de reserva/evento — qué documenta oficialmente Vrbo (corrección "Alta", UID/SEQUENCE/dedupe/anti-eco)

**Vía iCal (export/import):** Vrbo no menciona literalmente "UID" ni "SEQUENCE" en la documentación de ayuda leída, pero **sí es el único de los tres canales principales con evidencia oficial directa y explícita del riesgo de eco/bucle de sincronización** [DATO]: "If you also import that same external calendar back into your Vrbo reservations calendar, you may experience payment issues for those dates." Esto confirma que el fenómeno de "reimportar el propio export" es un caso reconocido por el canal, aunque Vrbo no explica el mecanismo técnico (si preserva o reescribe `UID` al reexportar) — eso sigue sin documentarse, ver `docs/LAGUNAS.md` §3.2 fila "UID/SEQUENCE/dedupe/idempotencia" (LAGUNA HONESTA) y fila "Anti-eco de bloqueos" (EVIDENCIA parcial, la única con advertencia oficial directa de los tres canales).

**Vía API de software certificado (Expedia Group Connectivity):** sin especificación técnica pública (payloads, identificadores de reserva, mecanismo de dedupe) — **NO ABORDADA**, confirmado por `docs/LAGUNAS.md` §3.1: "UID/SEQUENCE/dedupe/idempotencia... LAGUNA HONESTA" y "Reservas/modificaciones/cancelaciones... NO ABORDADA". El Rapid API documentado públicamente es demand-side, no aplica a este flujo.

**Convención propia (decisión interna, NO documentada por Vrbo, marcada explícitamente como tal):** dado que Vrbo reconoce oficialmente el riesgo de eco pero no su mecanismo, el proyecto debe aplicar el mismo esquema de anti-eco de dos capas de RV07 §3 (namespace de `UID` propio + hash de contenido) también para Vrbo, tratando la advertencia oficial como confirmación de que el riesgo existe, no como confirmación de que el `UID` se preserva — es más prudente asumir que Vrbo puede reescribir el `UID` al reexportar (comportamiento no descartado por ninguna fuente) y depender del hash de contenido como red de seguridad primaria para este canal.

### 5. Tabla comparativa

| Dimensión | Vrbo (iCal self-service) | Vrbo (software certificado) | Google Vacation Rentals | Agoda |
|---|---|---|---|---|
| Método de conexión | Import/export .ics manual | Connectivity Partner Program (proceso cerrado) | Structured data / feed XML vía partner | Extranet "calendar link" (disponibilidad); Content Push API solo contratada |
| Certificación requerida | No (salvo uso de PMS de terceros) | Sí (Elite/Preferred/otro) | Sí (invitación + Technical Account Manager) | Sí para API; no para extranet |
| Frecuencia de sync documentada | 30 min (móvil); latencia hasta 20 min; cambios generales 24h | Rates/Availability: "pocas horas"; contenido: 24–48h; verificación en tiempo real al reservar | No especificada (laguna) | "Varias veces al día" (sin cifra exacta confirmada) |
| ¿Cierra disponibilidad automáticamente? | Solo si el calendario externo marca bloqueos explícitos | Sí, dinámicamente | No aplica directamente (depende del feed de origen) | Solo disponibilidad, no tarifas; requiere 1 tipo de habitación |
| Cobertura | Solo Vrbo, punto a punto | Vrbo (posible ampliación vía Rapid API no confirmada como mismo mecanismo) | Solo Google Search/Travel | Extranet Agoda; Content Push cubre Hotel y Non-Hotel |
| Precio | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |

## Riesgos/límites

- Ninguna página de help.vrbo.com muestra fecha real de publicación/actualización (solo copyright de pie de página) — no se puede establecer antigüedad del contenido citado.
- No se pudo leer directamente `vrbo.com/connectivity` (403 Forbidden); la lista completa y actualizada de partners Elite/Preferred se reconstruyó indirectamente, confianza media-baja para nombres exactos de niveles.
- Cifras de partners Elite (ej. "18 de 400+") provienen de snippets de búsqueda/comunicados de prensa de terceros, no de fetch directo a una fuente oficial única — riesgo de desactualización.
- No se confirmó si la API del EG Connectivity Hub es la misma superficie técnica usada por partners de conectividad de vacation rentals — riesgo de asumir un protocolo incorrecto si se plantea replicar/consumir esa API.
- La cifra "20 minutos" para latencia en Agoda proviene solo de un resumen de WebSearch, no de la fuente fetcheada directamente (que solo dice "several times a day") — tratar con confianza baja.
- Ninguna fuente oficial documenta el fenómeno de "eco"/bucle de sincronización al combinar import y export de iCal en Vrbo más allá de la advertencia genérica sobre "payment issues" al reimportar el propio export.

## Implicaciones para requisitos (RV05-R-nn)

- **RV05-R-01**: El calendario unificado de Atiende debe tratar iCal como canal de "solo disponibilidad" (sin tarifas, sin datos de huésped) y no asumir paridad de datos con canales certificados.
- **RV05-R-02**: Para Vrbo, Atiende debe soportar dos modos de integración distintos según si el host gestiona la propiedad desde Vrbo Owner Dashboard (iCal) o desde un PMS certificado — son mutuamente excluyentes según la documentación de Vrbo.
- **RV05-R-03**: El sistema debe modelar explícitamente la latencia de propagación por canal (30 min–pocas horas según canal y mecanismo) en su lógica de "cierre" de disponibilidad, y no presentar el estado como sincronizado en tiempo real cuando el mecanismo subyacente es polling con ventana documentada.
- **RV05-R-04**: Antes de diseñar cualquier integración supply-side con Vrbo/Expedia Group, se requiere validación directa con Expedia Group Partner Central sobre la especificación técnica real (no está documentada públicamente) — no asumir que el EG Connectivity Hub (hotel-oriented) aplica a vacation rentals.
- **RV05-R-05**: Para extensibilidad a Google Vacation Rentals, el requisito de invitación/Technical Account Manager implica que esta vía no puede ofrecerse como autoservicio en el corto plazo; debe tratarse como roadmap condicionado a aceptación por Google, no como feature inmediata.
- **RV05-R-06**: Para Agoda, cualquier integración de disponibilidad vía "calendar link" debe advertir al usuario que no sincroniza tarifas y se desactiva si la propiedad pasa a multi-habitación.

## Lagunas

- Especificación técnica exacta (payloads, webhooks/polling, límites de tasa) del canal supply-side de conectividad certificada de Vrbo.
- Proceso de certificación paso a paso y tiempos reales de aprobación para partners de software de Vrbo/Expedia Group.
- Confirmación directa (fetch bloqueado) del contenido completo de `vrbo.com/connectivity`.
- Mecanismo y especificación de campos del feed de disponibilidad/precio de Google Vacation Rentals (solo se documentó el structured data de contenido).
- Confirmación de si "iCal" es el término técnico exacto usado por Agoda o solo un protocolo funcionalmente equivalente.
- Todos los precios de certificación, APIs y programas de partner: **PENDIENTE** en las tres plataformas (Vrbo/Expedia Group, Google, Agoda).
- **Cobertura de fuentes por debajo del mínimo del plan.** Este módulo cita ~13 URLs distintas en "Fuentes de este módulo" (help.vrbo.com, partner.expediagroup.com, developers.expediagroup.com, developers.google.com, support.google.com, content-push.agoda.com, developer.agoda.com, partnerhub.agoda.com), por debajo del mínimo de 25 URLs distintas exigido por `docs/investigacion/00-PLAN.md` §1.3. La razón declarada: `vrbo.com/connectivity` (la página con el detalle técnico más específico de payloads/webhooks) devolvió HTTP 403 en todos los intentos, y no existe documentación pública adicional de niveles de partner ni de rate limits sin acceso autenticado (ver Lagunas, primeras dos filas). Ampliar esta cobertura requiere acceso de partner de Expedia Group autenticado, no repetir el mismo fetch bloqueado.

## Supuestos

- Se asume que el "Connectivity Partner Program" de Expedia Group aplica de forma unificada a Vrbo como marca dentro del grupo, aunque no se confirmó una página exclusiva y actualizada que lo detalle sin ambigüedad de nomenclatura de niveles.
- Se asume que la advertencia de Vrbo sobre "payment issues" al reimportar el propio export es indicativa de un riesgo más amplio de bucles de sincronización aplicable también a otros canales, aunque no está documentado explícitamente fuera de ese contexto.

---

## Fuentes de este módulo

Todas leídas o consultadas el 2026-09-05. Ledger completo: `docs/fuentes/rv05-08-14.md` (sección RV05).

- **iCal Vrbo (import/export, anti-eco):** help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar, help.vrbo.com/articles/Export-your-reservation-calendar, help.vrbo.com/articles/How-does-the-calendar-work [DATO].
- **Conectividad certificada (Expedia Group):** help.vrbo.com/articles/About-Vrbo-integration, partner.expediagroup.com/en-us/industries/vacation-rentals/vrbo-connectivity-solutions, developers.expediagroup.com/supply/lodging/updates [DATO — cualitativo; SLA "pocas horas"/"24-48h" sin especificación técnica de payload].
- **Rapid API (demand-side, no aplica a supply-side):** developers.expediagroup.com/rapid/lodging/vacation-rentals/about-vacation-rentals-api, .../vrbo-integration-guide [DATO].
- **Google Vacation Rentals:** developers.google.com/search/docs/appearance/structured-data/vacation-rental, support.google.com/hotelprices/answer/10062327 [DATO].
- **Agoda:** content-push.agoda.com/docs/cm/properties, developer.agoda.com/demand/docs/getting-started, partnerhub.agoda.com/how-do-i-connect-my-agoda-calendar-with-other-websites/ [DATO].
- **Bloqueado (declarado, no usado como fuente):** vrbo.com/connectivity (403).
