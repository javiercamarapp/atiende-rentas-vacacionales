# Ledger de fuentes — RV22 (canales de distribución usados en México)

Fecha de consulta de todas las fuentes salvo que se indique otra cosa: **2026-09-06**. Formato por afirmación: Título · Editor · URL exacta · Fecha publicación/actualización · Cita textual · Alcance · Confianza · Laguna asociada (si aplica). Numeración local F01–F84, propia de este ledger (no continúa la numeración `F-xxx` de `docs/FUENTES.md`, que este módulo no toca).

**Nota metodológica general:** la investigación se hizo con seis sesiones de investigación en paralelo (todas Sonnet), cada una con su propio presupuesto de `WebSearch` — varias lo agotaron (200/200) antes de terminar su tarea y tuvieron que apoyarse en `WebFetch` directo a URLs candidatas, `curl` vía Bash, y en un caso navegación real con Chrome (Expedia Group). Esto se declara explícitamente en cada sección donde aplica. Todo bloqueo (403/404/timeout/ENOTFOUND/CAPTCHA/SPA sin renderizar) se reporta como tal, nunca como ausencia de dato. Una corrección del encargo, recibida a mitad de investigación, retiró "Rappi" del alcance (confusión de nombre por "Airbnb" en el pedido original) — la investigación de Rappi ya iniciada se cierra en una sola entrada breve (F68) sin más profundización, por instrucción explícita.

---

## 0. Airbnb — verificación de actualización sobre RV03 (2026-09-05 → 2026-09-06)

RV03 (`docs/investigacion/RV03-airbnb-capacidades.md`, ledger `docs/fuentes/rv03-airbnb.md`) ya cubre a fondo el programa de partner API de Airbnb (Homes API/Activities API bajo NDA, revisión de seguridad, Sandbox V2, plazo de 6 meses post-aprobación) y el iCal (ciclo de 3 horas). Esta sección solo verifica si algo cambió en 24 horas, con dos fetches directos adicionales.

**F01 — Join the Airbnb API Program (verificación de continuidad, sin cambios detectados)**
- Título: "Join the Airbnb API Program" (developer.withairbnb.com, con redirect 301 desde developer.airbnb.com)
- Editor: Airbnb, Inc.
- URL exacta: https://developer.withairbnb.com/join-airbnb-api-program (redirect 301 desde https://developer.airbnb.com/join-airbnb-api-program)
- Fecha de publicación/actualización: no consta en la página
- Fecha de consulta: 2026-09-06
- Cita textual: la página lista **Homes API** ("managing listings, availability checks, and reservations") y **Activities API** ("managing activity content and messaging"), y dirige a guías de "Getting Started" y a un entorno **"Sandbox V2 Testing"**; no expone en esta página el detalle de NDA, scopes exactos ni el proceso de aprobación (estos viven en páginas enlazadas, gateadas o sin URL pública fija).
- Alcance: confirma que Sandbox V2 y la estructura Homes API/Activities API siguen vigentes sin cambios visibles respecto a lo documentado en RV03 (F05/F06/F09/F58 de ese ledger).
- Confianza: alta (lectura en vivo).
- Laguna: la misma ya documentada en RV03 — nombres literales de scopes y proceso de aprobación detallado siguen detrás de acceso de partner. **No hay evidencia de cambio en 24 horas**; se trata como confirmación de continuidad, no como hallazgo nuevo.

**F02 — Airbnb Help Article 99 (iCal), dato nuevo: ventana de importación de 2 años**
- Título: "Sync your calendar" (Airbnb Help Center, artículo 99)
- Editor: Airbnb, Inc.
- URL exacta: https://www.airbnb.com/help/article/99
- Fecha de publicación/actualización: no consta
- Fecha de consulta: 2026-09-06
- Cita textual: "Your Airbnb calendar automatically updates every 3 hours, and pulls in information from the other calendars you've connected." / "Note that we're only able to request updates from the other website so many times—if you exceed that amount of updates, you'll need to wait until the next automatic update." / "Your Airbnb calendar will include nights that are blocked for your availability settings, preparation time, advance notice, and minimum stays." / **"We import up to 2 years of data."**
- Alcance: reconfirma el ciclo de 3 horas y el límite de refresco manual ya citados en RV03 (F01/F02 de ese ledger); agrega un dato nuevo no reportado antes en el corpus del proyecto: **ventana de importación de hasta 2 años de datos**. No menciona datos de huésped (nombre) ni reservas estructuradas — consistente con "solo bloqueos de disponibilidad", pero sin declaración explícita de ausencia de PII (la misma laguna de RV03 persiste).
- Confianza: alta (lectura en vivo, oficial).
- Laguna: ninguna nueva; refuerza LAGUNAS.md §1.2 fila "Cobertura tarifas/restricciones/datos huésped/mensajes" sin cerrarla.

**Conclusión de la verificación:** sin cambios materiales en Airbnb entre el 2026-09-05 (fecha de RV03) y el 2026-09-06 (esta verificación), salvo el dato nuevo de ventana de 2 años de importación iCal. RV22 remite a RV03 como fuente canónica para el resto del detalle de Airbnb (ver §1 del informe principal).

---

## 1. Booking.com — resumen (remite a RV04 y a `docs/fuentes/b002-archivo.md`)

RV22 no reinvestiga Booking.com desde cero: RV04 (`docs/fuentes/rv04-booking.md`) y el intento B-002 (`docs/fuentes/b002-archivo.md`, entradas F01–F04) ya cubren el modelo pull/polling, la certificación diferenciada por API (PCI/PII), los "machine accounts", y — el hallazgo más crítico para RV22 — la **pausa de admisión de nuevos Connectivity Partners "hasta nuevo aviso"** (`connect.booking.com`, cita verbatim ya registrada). Este módulo agrega una sola verificación de continuidad de esa pausa.

**F03 — Booking.com Connectivity Portal: pausa de admisión, reconfirmada**
- Título: página de inicio del Connectivity Portal
- Editor: Booking.com B.V.
- URL exacta: https://connect.booking.com/
- Fecha de publicación/actualización: no consta
- Fecha de consulta: 2026-09-06 (reconfirmado por dos de las seis sesiones de investigación de forma independiente)
- Cita textual: "In an effort to ensure our teams are able to provide the strong partnership experience, we are pausing integrations with new connectivity providers until further notice."
- Alcance: la pausa reportada el 2026-09-05 (B-002) sigue vigente un día después, sin fecha de reapertura.
- Confianza: alta (dos lecturas en vivo independientes, mismo resultado).
- Laguna: sigue sin fecha de inicio ni de reapertura estimada (igual que en B-002).

---

## 2. Expedia Group — Lodging Connectivity APIs (Expedia, Hotels.com, Vrbo)

**Nota metodológica de esta sección:** `developers.expediagroup.com/supply/lodging` redirige (302) a un portal SPA en React (`connectivityportal.expediagroup.com`) que no renderiza contenido con `WebFetch`/`curl` estático (solo devuelve un `<title>Documentation</title>` vacío). La sesión de investigación tuvo que usar navegación real con Chrome (herramientas MCP) para leer el contenido efectivamente publicado — se declara aquí como hallazgo metodológico relevante para el propio due-diligence: la documentación técnica de Expedia Group no es indexable por scraping simple.

**F04 — Product API / Product management: dos generaciones**
- Título: "Lodging APIs" (overview) e "Intro to the product management capability"
- Editor: Expedia Group
- URL exacta: https://connectivityportal.expediagroup.com/documentation/expedia y https://connectivityportal.expediagroup.com/documentation/expedia/onboarding_capabilities/product_mgmt/intro
- Fecha de publicación/actualización: no consta fecha explícita por página
- Fecha de consulta: 2026-09-06 (navegación real con Chrome)
- Cita textual: "With the Product API, you can read, create, and edit room types and rate plans without having to use Partner Central or contact a market manager." / "The product management capability is available to pilot partners only, and it is still in development."
- Alcance: **Product API (legacy, REST/XML)** gestiona room types y rate plans; **Product management capability (GraphQL)** es su reemplazo moderno, **solo para partners piloto**, cubre properties/units/unit spaces/rate plans/cancellation policies/fee sets, pero explícitamente **no gestiona disponibilidad** (eso es de Availability & Rates API) ni datos de propiedad (solo lectura).
- Confianza: alta (lectura en vivo, oficial).
- Laguna: acceso a la versión GraphQL restringido a partners piloto; no se documenta cuándo pasará a disponibilidad general.

**F05 — Availability & Rates API: alcance y límite de mensaje**
- Título: "Intro to the Availability and Rates API"
- Editor: Expedia Group
- URL exacta: https://connectivityportal.expediagroup.com/documentation/expedia/avail_and_rate_apis/avail_rates/introduction
- Fecha de consulta: 2026-09-06
- Cita textual: "The Availability and Rates API is a simple interface that allows you to update your inventory on all Expedia points of sale... Availability and Rates API cannot be implemented alone. Either Booking Notification API or the Booking Retrieval/Booking Confirmation set of APIs... must be adopted in conjunction with Availability and Rates API."
- Alcance: actualiza disponibilidad/tarifas/restricciones (min/max LOS, CTA/CTD) hasta 2 años a futuro, identificadores exclusivamente Expedia IDs (no códigos internos del PMS); no cubre contenido, impuestos, comisiones ni políticas de depósito/cancelación.
- Confianza: alta.
- Laguna: **sin SLA de latencia de procesamiento publicado** (ver F07).

**F06 — Límite de actualizaciones por mensaje (histórico, vía changelog oficial)**
- Título: "What's New" — EG Connectivity Hub changelog, entrada del 1 de diciembre de 2020
- Editor: Expedia Group
- URL exacta: https://developers.expediagroup.com/supply/lodging/updates
- Fecha de publicación: 2020-12-01 (fecha propia de la entrada del changelog)
- Fecha de consulta: 2026-09-06
- Cita textual: "Expedia Quick Connect (EQC) Availability and Rates API only allowed 3,000 updates to be sent in one message. We have extended the number of updates to 5,000."
- Alcance: límite vigente (salvo cambio posterior no anunciado) de 5,000 actualizaciones por mensaje.
- Confianza: alta.

**F07 — Latencia de Availability & Rates API: laguna confirmada; SLA sí existe para el webhook GraphQL nuevo**
- Editor: Expedia Group
- URL exacta: (búsqueda exhaustiva en `connectivityportal.expediagroup.com/documentation/expedia` y `developers.expediagroup.com/supply/lodging/updates`)
- Fecha de consulta: 2026-09-06
- Hallazgo: **no se encontró ninguna cifra explícita de SLA/latencia** de procesamiento para Availability & Rates API (legacy) en la documentación pública. Sí existe una cifra concreta para el reemplazo moderno: el webhook GraphQL `ReservationNotificationEvent` documenta 2.5 horas de reintento exponencial antes de hacer fallback a email (dato citado dentro de la documentación de reservas GraphQL, mismo portal).
- Confianza: alta en la ausencia confirmada (búsqueda exhaustiva, no omisión); alta en la cifra de 2.5h para el webhook nuevo.
- Laguna: sin SLA de latencia para Availability & Rates (legacy), que es la vía más probable de integración inicial.

**F08 — Booking Notification API: push SOAP/XML, una sola vez, en mantenimiento**
- Título: "Migrating from Booking Notification API"
- Editor: Expedia Group
- URL exacta: https://connectivityportal.expediagroup.com/documentation/expedia/booking_apis/reservations/migrating_bn
- Fecha de consulta: 2026-09-06
- Cita textual: "The Booking Notification API pushes reservation details to a specified endpoint." / "Booking Notification API sends details when the booking is created (one call). After that, details are no longer sent." / "As GraphQL has become Expedia Group's standard for supply APIs, Booking Retrieval and Booking Notification APIs are now in a state of maintenance and will not take on further feature enhancements."
- Alcance: push único (no reenvío) de SOAP/XML estándar OTA (`OTA_HotelResNotifRQ/RS`) al crear la reserva; IDs de reserva: `HotelReservationID ResID_Type="3"` (número de confirmación) y `ResID_Type="8"` (ID Expedia numérico). API legacy, en mantenimiento, sin nuevas features — Expedia empuja migración a "Reservation management" GraphQL con webhooks JSON.
- Confianza: alta.
- Laguna: sin SLA numérico de latencia del push (se asume "inmediato" sin confirmación oficial).

**F09 — Booking Retrieval API + Booking Confirmation: pull/polling, límite de 125 registros**
- Título: "Migrating from the Booking Retrieval and Confirmation APIs"
- Editor: Expedia Group
- URL exacta: https://connectivityportal.expediagroup.com/documentation/expedia/booking_apis/reservations/migrating_br
- Fecha de consulta: 2026-09-06
- Cita textual: "With BRBC, booking details need to be retrieved with a GET call followed by an acknowledgement response. Your system is constantly sending messages to our system asking for new reservations that have been created." / "For the Booking Retrieval API, if a specific reservation expired and reverted to an alternate delivery method (email), it cannot be retrieved, even when using the booking ID."
- Alcance: pull/polling con `BookingRetrievalRQ` (filtro por ID o `NbDaysInPast`), confirmación vía `BookingConfirmRQ` con `confirmNumber`; **límite de 125 registros por llamada** (el reemplazo GraphQL pagina hasta 10,000/25 por página); ID de reserva: `Booking id` numérico + `confirmNumber` alfanumérico.
- Confianza: alta.
- Laguna: cadencia de polling recomendada no publicada explícitamente.

**F10 — EQC = Expedia QuickConnect (nombre de marca/protocolo legacy, no producto separado)**
- Editor: Expedia Group
- URL exacta: https://developers.expediagroup.com/supply/lodging/updates (entradas del 2020-12-01 y 2020-04-29) y https://connectivityportal.expediagroup.com/documentation/expedia/getting_started
- Fecha de consulta: 2026-09-06
- Cita textual: "Previously, Expedia Quick Connect (EQC) only allowed updates to availability and rates on one integrated connection at a time for each property." / "If you are an existing API partner, use your current API credentials to fetch the access token... They are typically prefixed with 'EQC'."
- Alcance: EQC = "Expedia QuickConnect", el nombre histórico del stack SOAP/XML (dominio `expediaconnect.com`) que sustenta Availability & Rates API, Booking Notification API y Booking Retrieval/Confirmation — no es una API separada.
- Confianza: alta (dos citas oficiales independientes).

**F11 — Requisitos de partner: PCI/TLS/license agreement confirmados; NDA/costos no publicados**
- Título: overview `/supply/lodging` y changelog "What's New"
- Editor: Expedia Group
- URL exacta: https://developers.expediagroup.com/supply/lodging y https://developers.expediagroup.com/supply/lodging/updates (entrada del 2020-10-06)
- Fecha de consulta: 2026-09-06
- Cita textual: "Payment card industry (PCI) compliance is a requirement for working with Expedia Group." / "All companies that accept credit card payment information must be PCI compliant and provide Expedia with an Attestation of Compliance (AOC)... Once a year. We undergo a yearly audit with all connectivity partners." / "To partner with Expedia Group, you must be TLS 1.2 or higher."
- Alcance: certificación por capability (checklist técnico propio por API), requiere "license agreement" y auditoría PCI anual; Expedia Group **no acepta conexiones directas de propiedades individuales**, solo conectividad vía PMS/software providers certificados.
- Confianza: alta.
- Laguna: no se encontró mención explícita de "NDA" (solo "license agreement"); costos monetarios de la API no publicados (el proceso de aplicación real vive detrás de un formulario comercial tipo Typeform en `developers.expediagroup.com/supply/lodging/contact`, no completado en esta investigación por no corresponder entregar datos de terceros a un formulario comercial sin instrucción explícita).

**F12 — Sandbox: dominio real `api.sandbox.expediagroup.com`, no `test.ean.com`**
- Título: "Testing your implementation using the sandbox"
- Editor: Expedia Group
- URL exacta: https://connectivityportal.expediagroup.com/documentation/expedia/booking_apis/reservations/testing
- Fecha de consulta: 2026-09-06
- Cita textual: "A sandbox is a controlled and isolated environment... The Sandbox Data Management API, which enables you to set up test data... A sandbox version of the Lodging Supply GraphQL API..."
- Alcance: sandbox real documentado en `api.sandbox.expediagroup.com/supply/lodging/graphql` (queries/mutations estándar), `.../supply/lodging-sandbox/graphql` (crear/borrar datos de prueba) y `.../supply/payments/graphql` (tarjetas de prueba); credenciales vía OAuth2 client_credentials contra `api.expediagroup.com/identity/oauth2/v3/token`; requiere allowlistear `35.82.59.192/26` para webhooks de sandbox.
- **Corrección importante:** el dominio `test.ean.com` citado en RV05 (`docs/fuentes/rv05-08-14.md`, F107) como sandbox de "Expedia Rapid" **no aparece en absoluto en esta documentación de Lodging Connectivity 2026**; corresponde probablemente al legado "EAN" (Expedia Affiliate Network), un stack distinto y ya no vigente en esta superficie. **No se confirma que sea la misma superficie técnica** — de hecho, esta investigación sugiere que son superficies distintas (ver F13).
- Confianza: alta.

**F13 — Vrbo NO comparte la misma superficie de Availability/Booking que Expedia (cierre de laguna de RV05)**
- Título: "Integration overview" (Vrbo Developer Documentation)
- Editor: Vrbo, an Expedia Group company
- URL exacta: https://connectivityportal.expediagroup.com/documentation/vrbo
- Fecha de consulta: 2026-09-06
- Cita textual: "Our Lodging Supply GraphQL API provides the majority of our capabilities, and it is a unified API for use by both Expedia and Vrbo partners. We also offer several services that enable you to push property data to us, including rate and availability information." / (en la documentación de Expedia): "Retrieving reservations for Vrbo properties is not supported at this time." / (en `getting_started` de Expedia): "Note that if you onboarded properties directly to Vrbo in addition to Expedia, you must obtain a separate token using your Vrbo credentials to issue requests based on Vrbo supplier IDs. The Expedia token can only be used to issue requests based on Expedia IDs."
- Alcance: hay una **capa compartida** (Lodging Supply GraphQL API, para contenido/compliance, con mutaciones Vrbo-específicas como `generatePreviewVrboReservationUpdate`/`executeVrboCancelReservation`/`refundVrboReservation`) y una **capa separada de servicios REST/XML legacy propios de Vrbo** heredados de HomeAway (`Lodging Rate update service`, `Unit Availability update service`, `Fast Availability service`, `Booking service`, `Booking update service` (BUS), `Reservation Fulfillment service` — evidencia de origen HomeAway: ejemplos con `assignedSystemId="FAUX_PMS_HAXML_1_2"`, referencia a `OLB schema`). Onboarding de Vrbo usa un "Integration Engagement Manager (IEM)" con whitelisting de URLs de callback (hasta 3 semanas), distinto del portal self-service de Expedia. Vrbo ofrece dos modelos de negocio ("Agency model" y "Vrbo Payments model") sin equivalente del lado Expedia.
- Confianza: alta (observación directa de ambos árboles de documentación en vivo, con namespaces XML y nombres de mutación GraphQL reales citados).
- Laguna cerrada: RV05 (F089/F107 de `docs/fuentes/rv05-08-14.md`) dejaba como laguna si la superficie de Rapid API/EG Connectivity Hub era la misma usada por partners de Vrbo vacation rentals. **Respuesta: no, son árboles hermanos con una capa compartida limitada; Hotels.com no tiene árbol de documentación propio visible, probablemente usa el de Expedia como point-of-sale adicional sobre el mismo inventario (no confirmado con cita directa).**

**F14 — Presencia de Vrbo en México: evidencia directa en vivo**
- Título: "Tulum, Quintana Roo, Mexico Vacation Rental Search Results"
- Editor: Vrbo (Expedia Group)
- URL exacta: https://www.vrbo.com/search?destination=Tulum+Quintana+Roo+Mexico&regionId=182189&sort=RECOMMENDED
- Fecha de consulta: 2026-09-06 (datos en vivo del sitio, con disponibilidad para fechas sep-nov 2026)
- Observación directa: la búsqueda devolvió "300+ properties" (villas, aparthoteles, condos, apartamentos) en Tulum, con reseñas reales y precios en USD para fechas 2026.
- Alcance: confirma operación activa de inventario de rentas vacacionales de Vrbo en México (no solo vuelos/hoteles).
- Confianza: alta (observación en vivo del sitio oficial, no reporte de tercero).
- Nota: `vrbo.com/en-mx` devuelve 404; la tabla oficial de "master brand sites" en la documentación de Vrbo no incluye México (sí Francia, Alemania, Austria, Nueva Zelanda, Reino Unido, EE.UU., Australia, España, Italia, Japón, Portugal, Singapur) — México se sirve desde el dominio genérico en inglés/USD, sin localización dedicada (inferencia propia marcada como tal).
- Laguna: presencia de Expedia.mx y Hotels.com México no se reverificó en esta sesión (conocimiento de mercado ampliamente documentado, pero sin cita oficial fresca de esta investigación).

**F15 — Vrbo iCal: sin hallazgos nuevos que contradigan RV05**
- Editor: Expedia Group / Vrbo
- URL exacta: (búsqueda dentro de `connectivityportal.expediagroup.com/documentation/vrbo` y el changelog)
- Fecha de consulta: 2026-09-06
- Hallazgo: no se encontró mención de iCal, límite de 5 calendarios, ni latencia de 30 minutos en la documentación de API para software/PMS (que es un árbol separado del flujo self-service de iCal para propietarios individuales vía app móvil, ya documentado en RV05).
- Confianza: alta en la ausencia de contradicción; RV05 sigue siendo la fuente canónica para Vrbo iCal.

---

## 3. Despegar / Decolar

**Nota metodológica:** el presupuesto de `WebSearch` de esta sesión estaba agotado antes de iniciar la tarea; toda la evidencia proviene de `WebFetch` directo a URLs candidatas y de páginas oficiales de terceros (channel managers).

**F16 — `developers.despegar.com` no existe**
- URL probada: https://developers.despegar.com
- Fecha de consulta: 2026-09-06
- Resultado: error DNS `ENOTFOUND` — el dominio no resuelve.
- Confianza: alta (fallo técnico directo).
- Alcance: no descarta que exista un portal de desarrolladores bajo otro dominio no identificado, pero no hay evidencia de uno público bajo ese nombre.

**F17 — Sitio de consumo despegar.com.mx bloqueado**
- URLs probadas: https://www.despegar.com.mx/, /hoteles, /hoteles-de-alquiler-temporario, /apartamentos
- Fecha de consulta: 2026-09-06
- Resultado: HTTP 403 Forbidden (WAF/anti-bot) o 404 en todos los casos.
- Confianza: N/A — bloqueo explícito.
- Laguna: no se pudo verificar directamente si Despegar México muestra categoría de apartamentos/alquiler temporario.

**F18 — Rentals United confirma a Despegar como canal de rentas vacacionales conectable**
- Título: "Despegar - Rentals United"
- Editor: Rentals United
- URL exacta: https://www.rentalsunited.com/connected-listings/despegar/
- Fecha de publicación: no consta
- Fecha de consulta: 2026-09-06
- Cita textual (extraída por herramienta de WebFetch, no copia directa del HTML fuente): "Despegar is the leading travel company in Latin America. Operating across 20 countries, they provide a broad suite of travel products including vacation rentals, but also airline tickets, travel packages, and hotels to over 17 million customers." / "Commission: 15%" / "Onboarding Time: 3-5 days" / "Minimum Requirements to Connect: Located in Argentina, Brazil, Chile, Colombia, Dominican Republic, Mexico or Peru"
- Alcance: fuente primaria del channel manager (no de Despegar directamente) afirmando integración viva con comisión ~15% y onboarding de 3-5 días, incluyendo México como país elegible.
- Confianza: media-alta (página oficial en vivo de un tercero, cita procesada por el modelo de resumen de la herramienta, no HTML crudo verificado carácter por carácter).
- Laguna: no hay confirmación directa de Despegar sobre estos términos (comisión, plazos); depende enteramente de la declaración del channel manager.

**F19 — "Decolar" no aparece como entrada separada en Rentals United**
- URL exacta: https://www.rentalsunited.com/connected-listings/
- Fecha de consulta: 2026-09-06
- Resultado: solo existe la entrada "Despegar"; no hay entrada distinta para "Decolar" en el directorio.
- Confianza: alta (verificación directa del listado).

**Conclusión de sección:** ninguna fuente (propia o de terceros) confirma una API/spec técnica pública de Despegar. La única vía verificada hoy es a través de un channel manager certificado (Rentals United); ver §6 para el hallazgo de "puente".

---

## 4. Best Day

**F20 — Best Day: sitio y dominio corporativo bloqueados/inexistentes**
- URLs probadas: https://www.bestday.com, https://www.bestday.com.mx/, https://www.bestday.com/proveedores (redirige a home), https://www.grupobestday.com
- Fecha de consulta: 2026-09-06
- Resultado: HTTP 403 Forbidden persistente en bestday.com.mx; `ENOTFOUND` en grupobestday.com.
- Confianza: N/A — bloqueo/inexistencia explícitos.
- Laguna: no se pudo verificar directamente el modelo de conectividad de Best Day por ninguna vía.

**F21 — Best Day ausente de los directorios de channel managers consultados**
- URLs verificadas: https://www.rentalsunited.com/connected-listings/ (ausente), https://roomcloud.net/channels/ (404), https://d-edge.com/connectivity/ (imagen PNG binaria no legible), Vertical Booking (ver F72, donde SÍ aparece — nota de discrepancia entre agentes, documentada explícitamente más abajo)
- Fecha de consulta: 2026-09-06
- Resultado: "Best Day" no aparece en Rentals United, RoomCloud (bloqueado) ni D-EDGE (bloqueado); **sí aparece en el directorio de Vertical Booking** (F72) — discrepancia entre proveedores, no error: cada channel manager certifica canales distintos de forma independiente, es plausible que solo Vertical Booking tenga esa conexión activa.
- Confianza: N/A / alta según la fuente (ver nota).
- Laguna: sin fuente primaria de Best Day que confirme o niegue ningún canal de conectividad; ausencia de evidencia en 2 de 3 directorios no es evidencia de ausencia total, dado el hallazgo positivo en Vertical Booking.

---

## 5. PriceTravel

**F22 — Portal de auto-registro de hoteles confirmado, contenido no verificable**
- Título: página principal de PriceTravel + enlace de footer "Registrar hotel"
- Editor: PriceTravel
- URL exacta: https://www.pricetravel.com (accesible) → enlace a https://autoenrollment.pricetravel.com/ ("PriceTravel Partner Platform")
- Fecha de consulta: 2026-09-06
- Resultado: la existencia del portal de auto-registro se confirma (URL y título de página reales, "PriceTravel Partner Platform"), pero el contenido funcional (requisitos, si acepta rentas vacacionales, si hay API/XML) no pudo verificarse — error de carga/JS en el fetch.
- Alcance: según el resumen de la página principal de pricetravel.com, el sitio de consumo se enfoca en "hotels, flights, tours, transfers, and car rentals", sin categoría explícita de apartamentos/rentas vacacionales visible.
- Confianza: media (existencia del portal confirmada; contenido no verificado).

**F23 — Rentals United confirma a PriceTravel como canal de rentas vacacionales/short-term rental**
- Título: "Connect to Price Travel"
- Editor: Rentals United
- URL exacta: https://www.rentalsunited.com/connected-listings/price-travel/
- Fecha de consulta: 2026-09-06
- Cita textual (extraída por herramienta): "PriceTravel Holding is a leading travel technology and distribution company across Latin America and North America, powering B2C, B2B, and corporate booking channels." / "No minimum required" / "18-21% including taxes" / "Onboarding time: 2–3 weeks, depending on mapping and validation" / "Sync Capabilities: Prices, availability, reservations, photos, content, policies, fees, minimum stay, discounts, taxes, and amenities"
- Alcance: cobertura geográfica declarada: México, Colombia, Brasil, EE.UU.; contradice (o complementa) la impresión "solo hoteles tradicionales" del sitio de consumo, afirmando explícitamente soporte de "vacation rentals/short-term rental".
- Confianza: media-alta (página oficial en vivo de un tercero, cita procesada por herramienta).
- Laguna: sin confirmación directa de PriceTravel sobre estos términos.

---

## 6. Channel managers "puente" para México (Booking + Expedia + Despegar + Best Day + PriceTravel)

**F24 — SiteMinder: tabla técnica de códigos de agente de reserva (mejor candidato)**
- Título: "Booking Agent Codes" (tabla de referencia técnica)
- Editor: SiteMinder Ltd.
- URL exacta: https://developer.siteminder.com/pmsxchange-api/additional-resources/reference-tables/booking-agent-codes.md
- Fecha de publicación: no consta (documentación técnica viva)
- Fecha de consulta: 2026-09-06 (verificado dos veces con consultas independientes al mismo documento)
- Dato exacto (tabla, códigos verificados): BDC = Booking.com; EXP = Expedia; VRB = Vrbo (HomeAway); DDC = Despegar.com; PRC = PriceTravel (New); PTL = PriceTravel (Old). **La tabla no contiene entradas para "Decolar" ni "Best Day".**
- Alcance: documentación técnica primaria (no marketing) usada por integradores de PMS reales.
- Confianza: alta.
- Laguna: no confirma si "Decolar" tiene código propio distinto de Despegar, ni si Best Day tiene alguna conexión con SiteMinder por otra vía no listada en esta tabla específica.

**F25 — SiteMinder pmsXchange: API pública real orientada a PMS externos**
- Título: "Developer Portal — Overview / pmsXchange"
- Editor: SiteMinder Ltd.
- URL exacta: https://developer.siteminder.com/
- Fecha de consulta: 2026-09-06
- Dato exacto: el portal describe 5 productos de API con audiencias distintas; sobre pmsXchange: dirigido a "Property Management Systems (PMS) and Revenue Management Systems (RMS)", "pushes real-time rates, availability, and restrictions" y permite "retrieving reservations, including modifications and cancellations."
- Alcance: confirma que pmsXchange es exactamente el modelo de "puente" buscado — un PMS externo (como el de Atiende) se conecta una vez a SiteMinder, que ya está certificado con los canales de F24.
- Confianza: alta.
- Nota de bloqueo: todas las URLs de `www.siteminder.com` (sitio de marketing) devolvieron HTTP 403 Forbidden; toda la evidencia proviene del subdominio `developer.siteminder.com`, que sí fue accesible.

**F26 — Vertical Booking: directorio nominal de 5/5 canales, sin portal de API pública verificable**
- Título: "Integrations Directory"
- Editor: Vertical Booking S.r.l.
- URL exacta: https://www.verticalbooking.com/en/connectivity/integrations/
- Fecha de consulta: 2026-09-06
- Dato exacto (entradas verbatim del listado alfabético, verificadas con contexto alrededor de cada nombre): "Booking.com — OTAs/IDS, Wholesalers, Tour Operator" / "Expedia — OTAs/IDS, Wholesalers, Tour Operator" / "Despegar.com — OTAs/IDS, Wholesalers, Tour Operator" / "BestDay — OTAs/IDS, Wholesalers, Tour Operator" / "Price Travel — OTAs/IDS, Wholesalers, Tour Operator". Vrbo/HomeAway y Decolar no encontrados en el mismo listado.
- Alcance: directorio público de integraciones (marketing, sin metadatos de "certificación" ni fecha), pero verificado línea por línea.
- Confianza: media-alta.
- Laguna crítica: `developer.verticalbooking.com` no resuelve (`ENOTFOUND`) — no existe portal de documentación técnica pública autoservicio; la página de producto (`.../api-xml/`) solo dice "Our CRS has APIs for integration with Property Management Systems (PMS)" sin más detalle. El acceso técnico real probablemente requiere contacto comercial/NDA.

**F27 — Beds24: cubre Despegar/Decolar con API pública documentada; Best Day y PriceTravel no encontrados**
- Título: página de Channel Manager y Developer API
- Editor: Beds24 Limited
- URL exacta: https://www.beds24.com/channel-manager.html y https://api.beds24.com/v2/
- Fecha de consulta: 2026-09-06
- Dato exacto: "Despegar" y "Decolar" aparecen explícitamente en la lista de OTAs soportadas dentro del contenido de la página de channel manager (además de los ya conocidos Airbnb/Booking/Vrbo/Expedia/Agoda de RV14); Best Day y PriceTravel no se encontraron mencionados. La Developer API (`api.beds24.com/v2/`) es REST con especificación OpenAPI/Swagger real, tokens con scopes.
- Confianza: alta para Despegar/Decolar; media para la ausencia de Best Day/PriceTravel (la página de "lista completa" de canales, `/list-of-channels.html`, devolvió 404).

**F28 — DerbySoft, Cloudbeds, RoomCloud, WebHotelier, RateGain: evidencia insuficiente o negativa para el caso de uso**
- Editor: cada proveedor respectivamente
- URLs y resultado, resumidos:
  - **DerbySoft** (https://www.derbysoft.com/): logos de Booking.com/Expedia/Despegar en home, pero sin API pública autoservicio localizada ("API Playground" es solo un enlace sin contenido accesible); más una red B2B para OTAs/hoteles/TMCs que un channel manager al que un PMS externo se conecte de forma autoservicio.
  - **Cloudbeds** (https://developers.cloudbeds.com/): tiene API pública real y documentada, pero en la **dirección opuesta** a la necesitada — es para que terceros construyan apps sobre propiedades que ya usan Cloudbeds como PMS, no para que un PMS externo empuje datos hacia OTAs a través de Cloudbeds.
  - **RoomCloud** (https://www.roomcloud.net/en/): menciona "two-way API communication" con Booking.com/Expedia/Airbnb/HRS de forma genérica; la mayoría de subpáginas relevantes (canales, partners) fallaron (404 o "socket hang up").
  - **WebHotelier** (https://docs.webhotelier.net/): portal de API real mas enfocado en su propio booking engine, sin mención de Booking.com/Expedia/Despegar/Best Day/PriceTravel.
  - **RateGain** (https://rategain.com/): bloqueo total por WAF ("Request Rejected") en las 5 URLs probadas, incluido `/robots.txt` — sin ningún dato obtenido.
- Fecha de consulta: 2026-09-06
- Confianza: baja-media según proveedor (ver detalle arriba); RateGain es N/A por bloqueo total.
- Laguna: RateGain y RoomCloud (con reputación LatAm reportada de forma anecdótica en la industria) quedan sin verificación fiable — se recomienda verificación humana directa con navegador real.

**Conclusión de sección (ver también §9 del informe principal):** ningún proveedor confirma, con evidencia primaria verificable hoy, los 5 canales simultáneamente. **SiteMinder** es el candidato más sólido (4/5 confirmados en documentación técnica primaria — falta Best Day — más API pública real `pmsXchange`). **Vertical Booking** lista nominalmente 5/5 en su directorio de marketing pero carece de portal de API autoservicio verificable.

---

## 7. Google Vacation Rentals

**Nota metodológica:** el presupuesto de `WebSearch` de esta sesión estaba agotado desde el inicio; toda la evidencia proviene de `WebFetch` directo. Varias URLs adivinadas sin buscador dieron 404 (no necesariamente ausencia de contenido, sino slug incorrecto).

**F29 — Guía técnica de onboarding para Vacation Rentals: vigente en 2026, con feed de Pricing separado**
- Título: "Get started with Vacation Rentals" (guía de onboarding para desarrolladores)
- Editor: Google (developers.google.com)
- URL exacta: https://developers.google.com/hotels/vacation-rentals/dev-guide/onboarding
- Fecha de publicación/actualización: "Last updated 2025-02-28 UTC"
- Fecha de consulta: 2026-09-06
- Cita textual: "Vacation Rentals allows Google partners in the travel industry to create reservation and payment pages for their individual Vacation Rental properties." / "Once approved, a Google Technical Account Manager will be in touch with you at every step of the integration pipeline." / "Each XML file must be less than 100 MB" / "Each XML file can only contain one language." / "Room-sharing is not supported in Google Vacation Rentals. We only support full properties."
- Alcance: confirma **tres feeds distintos**: Property Listings (estático), **Pricing (disponibilidad y tarifa — feed específico para esta vertical, separado del feed de listado)**, y Landing Pages. Dos métodos de entrega: crawling de datos estructurados schema.org + sitemap XML, o envío directo de archivos XML en ZIP.
- Confianza: alta (página oficial en vivo, sin banner de deprecación).
- Laguna: no se ubicó la página de referencia técnica exacta del feed de "Pricing" (URLs adivinadas `/dev-guide/pricing-feed` y `/dev-guide/listing-feed` dieron 404).

**F30 — Confirmación de continuidad del programa (ayuda al usuario)**
- Título: "Get started with Vacation rentals"
- Editor: Google
- URL exacta: https://support.google.com/hotelprices/answer/10062327
- Fecha de consulta: 2026-09-06
- Cita textual: "Our integration makes it easy to share up-to-date rates, availability, photos, descriptions, and more for your vacation rental on Google." / "Our free booking links redirect users to book directly on your website, and there are no fees for Google-generated referrals or bookings."
- Alcance: reconfirma el modelo sin comisión de Google sobre reservas referidas.
- Confianza: alta.

**Conclusión de sección:** Google Vacation Rentals sigue vigente en 2026 (sin evidencia de descontinuación), con acceso exclusivamente por invitación/Technical Account Manager — sin autoservicio.

---

## 8. Agoda

**F31 — YCS consolidado bajo "Partner Portal"; contenido no verificable por SPA en JS**
- Hallazgo: `https://ycs.agoda.com` responde con **307 Temporary Redirect** hacia `https://portal.agoda.com/` ("Partner Portal").
- Fecha de consulta: 2026-09-06
- Confianza: alta (comportamiento HTTP en vivo, verificable).
- Alcance/laguna: `portal.agoda.com` es una SPA en JavaScript; `WebFetch` solo recuperó el encabezado "Partner Portal" sin texto adicional extraíble. **No se pudo confirmar si YCS cubre homes/vacation rentals o solo hoteles, ni si existe iCal literal para homes de Agoda, ni la presencia de listados en México** — todo esto queda como **desconocido por bloqueo técnico de herramienta (SPA sin renderizar)**, no como negativo. RV05 ya documenta el "calendar link" de Agoda (funcionalmente equivalente a iCal, solo disponibilidad) como la fuente canónica existente; esta sesión no logró ampliarla.

**Conclusión de sección:** sin avance material sobre RV05 para Agoda; laguna declarada explícitamente, requiere navegador real o sesión con `WebSearch` disponible.

---

## 9. TripAdvisor Rentals / FlipKey

**F32 — FlipKey confirmado cerrado (fuente primaria en vivo, alta confianza)**
- URL: https://www.flipkey.com
- Editor: TripAdvisor / FlipKey
- Fecha de consulta: 2026-09-06
- Cita textual: "Flipkey has closed down, please visit Tripadvisor to plan your next trip"
- Alcance: la raíz de flipkey.com ya no es un sitio funcional de renta vacacional; muestra un aviso de cierre con enlace a tripadvisor.com. `flipkey.com/help` → 301 hacia `tripadvisor.com/` (confirma también que las subrutas de ayuda redirigen al dominio principal).
- Confianza: alta (HTTP 200, texto explícito de cierre, sin fecha exacta del cierre en el propio aviso).

**F33 — TripAdvisor Rentals sigue bloqueado (403), estado indeterminado (no confirmado cerrado ni abierto)**
- URLs probadas: https://www.tripadvisor.com/Rentals, /Rentals?fromRentalsHomePage, /RentalOwners, /Rentals-g1-Vacation_Rentals-Home.html
- Fecha de consulta: 2026-09-06 (repite intento del 2026-09-05, mismo resultado)
- Resultado: **HTTP 403 Forbidden** en los cuatro intentos.
- Confianza: N/A — bloqueo de acceso (posible WAF/anti-bot contra el user-agent de la herramienta), **no puede interpretarse como evidencia de cierre** (a diferencia de FlipKey, donde sí hubo HTTP 200 con contenido explícito de cierre).
- Herramientas de archivo bloqueadas: `web.archive.org` y `archive.ph` devolvieron el error explícito "Claude Code is unable to fetch from [dominio]" en este entorno — no se pudo usar Wayback Machine como respaldo.

**F34 — Sala de prensa oficial de TripAdvisor: sin mención de Rentals/FlipKey en comunicados recientes de 2026**
- Título: TripAdvisor Media Room
- Editor: TripAdvisor, Inc.
- URL exacta: https://tripadvisor.mediaroom.com
- Fecha de consulta: 2026-09-06
- Hallazgo: los tres comunicados más recientes (2026-08-25 "Mid-Year Experiences Trends Report"; 2026-08-11 "Airbnb Experiences Partnership"; 2026-07-30 "Viator... Google's First Connected App") están centrados en la vertical "Experiences"/Viator; ninguno menciona rentals/FlipKey.
- Alcance: evidencia circunstancial (no una declaración explícita) consistente con — pero no prueba definitiva de — que rentals ya no es parte de la narrativa pública de la compañía en 2026.
- Confianza: media (ausencia en 3 comunicados recientes, no un archivo histórico completo revisado).

**Conclusión de sección:** **FlipKey: cerrado, alta confianza.** **TripAdvisor Rentals (standalone): estado indeterminado en 2026** — bloqueado en 4 intentos adicionales (2 sesiones distintas, 2026-09-05 y 2026-09-06), sin herramientas de archivo disponibles en este entorno para verificación alterna. Declarado como laguna honesta, no como cierre.

---

## 10. HomeToGo

**F35 — HomeToGo y Holidu: sin relación corporativa confirmada (corrección de premisa)**
- Editor: HomeToGo SE / Holidu GmbH
- URL exacta: https://www.holidu.com/about-us y https://ir.hometogo.de/
- Fecha de consulta: 2026-09-06
- Hallazgo: la búsqueda de "Holidu" en el sitio de relaciones con inversionistas de HomeToGo SE no arrojó resultados; el material de HomeToGo sí identifica a **Interhome y Kraushaar** (bajo el paraguas "HomeToGo Originals") como sus property management companies propias, **no Holidu**. Se corrige la premisa inicial de la tarea: no hay evidencia de que HomeToGo sea matriz o afiliada de Holidu — son metabuscadores alemanes independientes y competidores.
- Confianza: alta (ambas fuentes oficiales en vivo).

**F36 — HomeToGo: modelo híbrido metabuscador + marketplace, único channel manager certificado es Smoobu**
- Título: "List your property with HomeToGo"
- Editor: HomeToGo SE
- URL exacta: https://www.hometogo.com/list-your-property
- Fecha de consulta: 2026-09-06
- Cita textual: "List with HomeToGo, one of the world's largest vacation rental marketplaces, and show your property across multiple HomeToGo brands." / Plan Flex: "No subscription. HomeToGo retains a 15% commission (+VAT) on each booking." / Plan Flat: "€249 per property, plus a 1.7% host platform fee per booking" (on-platform) o "€448 per property, with no additional cost per booking" (off-platform). / **"Smoobu is the only channel manager integrated with our platform for hosts, allowing you to synchronize your rates and availability with HomeToGo."**
- Alcance: HomeToGo **no tiene API pública abierta para cualquier PMS**; certifica un único channel manager (Smoobu) para conexión automatizada de hosts directos. No se menciona iCal explícitamente en esta página.
- Confianza: alta.

**F37 — Presencia confirmada en México (vía metabúsqueda de 77 partners)**
- Título: "HomeToGo Mexico Vacation Rentals"
- Editor: HomeToGo SE
- URL exacta: https://www.hometogo.com/mexico
- Fecha de consulta: 2026-09-06
- Cita textual: "Browse 234,923 available vacation homes and compared across 77 trusted partners" — listados de Cancún, Cabo San Lucas, Playa del Carmen, Puerto Vallarta, Cozumel.
- Alcance: confirma el lado metabuscador (agrega across partners, no necesariamente hosts directos mexicanos); la página de listado directo (F36) no especifica qué países son elegibles para el programa de host directo.
- Confianza: alta para presencia agregada; laguna sobre elegibilidad geográfica del programa de host directo.

---

## 11. Holidu (reconfirmación, sin cambios respecto a RV08/LAGUNAS §4.1)

**F38 — Holidu: sin cambios respecto a la investigación previa**
- Referencia: `docs/investigacion/RV08-directa-vs-channel-manager.md` §1.4 y `docs/LAGUNAS.md` §4.1 ya documentan, con fuente oficial (holidu.com/host/partners, leída en vivo el 2026-09-05), que Holidu "integrates with over 75 Property Management Systems and Channel Managers worldwide... via Property Management System, Channel Manager, or directly through our Holidu API", distribuye a "25+ international booking sites", sin comisión pública, y **sin cobertura LatAm confirmada** (enfoque predominantemente europeo).
- Esta sesión de RV22 no reinvestigó Holidu a fondo (fuera del alcance de los seis subagentes lanzados); se remite a la fuente ya citada como canónica. No se encontró, de forma incidental durante la investigación de HomeToGo (F35–F37), ninguna evidencia adicional de Holidu operando en México.
- Confianza: alta (fuente ya verificada, sin contradicción encontrada).
- Laguna: presencia en México/LatAm sigue sin confirmar (misma laguna de LAGUNAS.md §4.1).

---

## 12. Marriott Homes & Villas

**F39 — 32 partners certificados de PMS/channel manager como único mecanismo de conexión**
- Título: "Connectivity Partners — Homes & Villas by Marriott Bonvoy"
- Editor: Marriott International
- URL exacta: https://homes-and-villas.marriott.com/en/connectivity-partners
- Fecha de consulta: 2026-09-06
- Cita textual: "Property management companies can tap into a multitude of benefits through Homes & Villas, including access to Marriott Bonvoy's 220+ million loyalty members."
- Alcance: lista 7 "Elite Partners" (BookingPal, Guesty, Hostfully, Hostify, NextPax, Rentals United, VacayHome Connect) y 25 "Standard Partners" (Avantio, Beds24, Bookandlink, BrightSide, Eviivo, HiSITE, Homhero, Hostaway, Icnea, Inhabit, KrossBooking, Octorate, OwnerRez, Resly, Smiley, Stays.net, Tokeet, Track, TravelStaytion, VRBookings) como único mecanismo de conexión técnica.
- Confianza: alta.
- Matiz honesto: no hay cita literal "prohibido para anfitriones individuales"; lo confirmado es la ausencia estructural de autoservicio — rutas `/en/property-managers`, `/en/homeowners-and-property-managers`, `/en/become-a-partner`, `/en/homeowners` devolvieron **HTTP 404 Not Found** en todos los casos, y no hay botón de "listar tu casa" visible en el sitio.

**F40 — Presencia en México: Playa del Carmen confirmado como destino destacado**
- Título: portada de Homes & Villas by Marriott Bonvoy
- Editor: Marriott International
- URL exacta: https://homes-and-villas.marriott.com/en
- Fecha de consulta: 2026-09-06
- Cita textual: enlace "Playa del Carmen — Beach getaway" en la sección "Popular Destinations/Trending Curated Collections".
- Alcance: confirma presencia en al menos un destino mexicano; no se pudo verificar volumen ni otras ciudades (Los Cabos, Tulum, CDMX) por bloqueo HTTP 403 en páginas de búsqueda dinámica.
- Confianza: alta para la mención en portada; laguna sobre volumen/cobertura completa en México.

---

## 13. Plum Guide

**F41 — Curación por invitación, iCal (no API de PMS), sin presencia en México**
- Título: "Plum Guide — Become a Host" y homepage
- Editor: Plum Guide
- URL exacta: https://plumguide.com/become-a-host y https://plumguide.com
- Fecha de consulta: 2026-09-06
- Cita textual: "If you received an email from us directly, please use the link provided to apply" / "Our team of local experts vet every home, only accepting the top 3% to guarantee an exceptional stay every time." / "iCal is a standardized calendar format that is widely accepted and used by other platforms like Airbnb, Booking.com, Homeaway, and VRBO." (sobre el mecanismo de sincronización de calendario que sí usa Plum Guide)
- Alcance: onboarding por invitación (no formulario abierto), curación manual explícita ("top 3%"), sincronización vía iCal, **sin mención de API pública para PMS**. El programa "Partnership" (`plumguide.com/partnership`) es solo para agencias/asesores de viaje (comisión mínima 7.5%), no para property managers.
- México: no aparece mencionado en la homepage entre las ~9 ciudades destacadas (Londres, París, Mallorca, Cassis, Provenza, Lisboa, Toscana, Devon, Los Ángeles); `plumguide.com/mexico` y `/destinations` devolvieron **HTTP 404**.
- Confianza: alta.
- Conclusión: sin presencia confirmada en México (ausencia en homepage + 404 en rutas específicas, citado explícitamente, no silencio).

---

## 14. Hopper Homes

**F42 — Producto lanzado en 2022, sin programa de partner/API identificable, estado 2026 no verificable**
- Título: "Hopper (company)" — Wikipedia (fuente secundaria, con referencias de prensa verificadas por separado)
- URL exacta: artículo de Wikipedia sobre Hopper; cita: "In January 2022, Hopper Homes was launched to provide short-term house rentals."
- Fuente primaria de prensa verificada: "Hopper wants to challenge Airbnb with short-term vacation rentals" — Editor: Engadget — Autor: Sam Rutherford — Fecha: 28 de enero de 2022 — URL: https://www.engadget.com/hopper-wants-to-challenge-airbnb-with-short-term-vacation-rentals-191525896.html — Cita: "more than two million properties spread across the world", disponibles "inside the Hopper app".
- Fecha de consulta: 2026-09-06
- Alcance: con "más de 2 millones de propiedades mundiales" disponibles solo dentro de la app móvil, el modelo aparente es de **agregación de inventario de terceros**, no reclutamiento directo de property managers; no se encontró página de "list your property", API pública, ni anuncio de partnership con ningún PMS.
- Bloqueo: `hopper.com/homes`, `/hopper-cloud`, `/careers` y la portada solo devolvieron el `<title>` (SPA fuertemente dependiente de JS); Wayback Machine confirma "archived_snapshots": {} (sin capturas) para `hopper.com/homes`.
- México: sin evidencia encontrada en ninguna fuente revisada (ni confirmación ni negación explícita).
- Confianza: media (fuente secundaria + prensa de 2022, sin verificación directa de continuidad en 2026 por bloqueo técnico del sitio).
- Conclusión: estado de Hopper Homes en 2026 **no verificable** con las herramientas disponibles en esta sesión; sin programa de partner/API identificable en ningún momento de la investigación.

---

## 15. Mercado Libre — categoría "Renta Vacacional" confirmada vía API pública

**F43 — Categoría raíz Inmuebles**
- Título: respuesta JSON de categoría
- Editor: Mercado Libre
- URL exacta: https://api.mercadolibre.com/categories/MLM1459
- Fecha de consulta: 2026-09-06
- Cita textual (JSON): `"name":"Inmuebles"`, `"total_items_in_this_category":302898`, `"buying_modes":["classified"]`, `"vertical":"real_estate"`.
- Confianza: alta (API oficial en vivo, sin autenticación, respuesta directa).

**F44 — Subcategoría "Renta Vacacional" en Departamentos y Casas**
- URL exacta: https://api.mercadolibre.com/categories/MLM1472 (Departamentos) y https://api.mercadolibre.com/categories/MLM1466 (Casas)
- Fecha de consulta: 2026-09-06
- Cita textual (JSON): Departamentos → `{"id":"MLM1479","name":"Renta","total_items_in_this_category":15710}`, `{"id":"MLM50730","name":"Renta Vacacional","total_items_in_this_category":241}`, `{"id":"MLM1480","name":"Venta","total_items_in_this_category":62505}`. Casas → `{"id":"MLM1467","name":"Renta","total_items_in_this_category":11234}`, `{"id":"MLM50729","name":"Renta Vacacional","total_items_in_this_category":201}`, `{"id":"MLM1468","name":"Venta","total_items_in_this_category":95319}`.
- Alcance: confirma que existe una categoría "Renta Vacacional" distinta de "Renta" (largo plazo) y "Venta", tanto en Casas como en Departamentos.
- Confianza: alta.

**F45 — Detalle de la categoría "Renta Vacacional": sin motor de reservas**
- URL exacta: https://api.mercadolibre.com/categories/MLM50730 y https://api.mercadolibre.com/categories/MLM50730/attributes
- Fecha de consulta: 2026-09-06
- Cita textual (JSON `settings`): `"catalog_domain":"MLM-APARTMENTS_FOR_VACATION_RENTAL"`, `"buying_modes":["classified"]`, `"listing_allowed":true`, **`"reservation_allowed":"not_allowed"`**. Atributos de la categoría incluyen `GUESTS`, `MINIMUM_STAY`, `CHECK_IN`, `CHECK_OUT`, `NATIONAL_TOURISM_REGISTRATION_NUMBER_NTR` (RNT), más ~50 atributos de amenidades — **sin ningún atributo de rango de fechas/disponibilidad/calendario**.
- Alcance: publicable vía la API general de ítems/categorías de Mercado Libre (sin programa de partner distinto), pero explícitamente **sin mecanismo de reserva ni calendario de disponibilidad** — es un anuncio clasificado con contacto directo al vendedor.
- Confianza: alta.
- Cálculo propio [E]: Renta Vacacional = 442 anuncios activos (241+201) frente a Renta largo plazo = 26,944 y Venta = 157,824, sobre 302,898 totales en Inmuebles — Renta Vacacional ≈ 0.15% del total de Inmuebles. Interpretación de "marginal" es propia del agente de investigación, no una declaración oficial de Mercado Libre.
- Laguna: documentación oficial en prosa (`developers.mercadolibre.com.mx`, `www.mercadolibre.com.mx/ayuda/inmuebles`) bloqueada con HTTP 403 en todos los intentos; la evidencia usada es la API pública misma, no la documentación explicativa.

---

## 16. Facebook Marketplace

**F46 — Categoría genérica de alquiler de propiedades, sin diferenciación vacacional confirmada**
- Título: "Alquiler de propiedades | Facebook Marketplace"
- Editor: Meta/Facebook
- URL exacta: https://www.facebook.com/marketplace/category/propertyrentals
- Fecha de consulta: 2026-09-06
- Cita textual (meta description): "Alquiler de propiedades en tu zona en Facebook Marketplace. Explora o vende tus artículos de forma gratuita."
- Alcance: fraseo genérico ("vende tus artículos"), sin mención de estadías cortas, temporadas o reservas.
- Confianza: alta (página oficial en vivo).
- Laguna: `developers.facebook.com/docs/marketplace` devolvió HTTP 403 vía WebFetch y un cuerpo vacío (SPA sin SSR) vía `curl` — no se pudo verificar si existe una API estructurada para esta categoría. No se pudo confirmar ni descartar la existencia histórica de una categoría "Vacation Rentals" dedicada (intentos de verificación vía TechCrunch y Meta Newsroom dieron 404 o resultados no concluyentes).

**Conclusión de secciones 15-16:** Mercado Libre y Facebook Marketplace se documentan como canales **`manual`**, de escala marginal/no verificada, sin channel-manager API ni sincronización de disponibilidad — publicación estática de un anuncio por propiedad, no un canal de distribución automatizado.

---

## 17. Rappi — fuera de alcance (corrección del encargo)

**F47 — Rappi retirado del alcance de RV22**
- Nota: durante la investigación, una corrección del encargo aclaró que la mención de "Rappi" en la asignación original era una confusión de nombre por "Airbnb" (ya cubierto en RV03 y en la §0 de este ledger). Se detuvo la profundización sobre Rappi por instrucción explícita, sin dedicar más tiempo del ya invertido.
- Dato mínimo ya obtenido antes del corte (no ampliado): existe un producto "Rappi Travel" (travel.rappi.com.mx) descrito como agencia de viajes (vuelos, autos, hoteles de cadena "seleccionados"); `developers.rappi.com` no resuelve (`ENOTFOUND`); no se encontró evidencia de un producto de renta vacacional peer-to-peer ni de programa de API/partner para anfitriones.
- Confianza: baja-media (varios datos vía snippets de buscador, no lectura directa completa; ver detalle completo en el registro interno del agente, no transcrito aquí por estar fuera de alcance).
- Estado honesto: **no_aplica — fuera de alcance del encargo (confusión de nombre); no ampliar sin nueva instrucción explícita.**

---

## Notas de procedencia y limitaciones transversales

- Varias de las seis sesiones de investigación paralelas agotaron su cupo de `WebSearch` (200/200) antes o durante la tarea, y tuvieron que depender de `WebFetch` directo a URLs candidatas (a veces adivinadas sin buscador, con 404 resultantes que reflejan slug incorrecto, no necesariamente ausencia de contenido), de motores de búsqueda vía `WebFetch` (Bing, con resultados de fiabilidad media-baja; DuckDuckGo, bloqueado por CAPTCHA en varios intentos), y en un caso (Expedia Group) de navegación real con Chrome para superar una SPA en React.
- `web.archive.org` y `archive.ph` están bloqueados explícitamente para `WebFetch` en este entorno ("Claude Code is unable to fetch from [dominio]"), lo cual limitó la verificación de TripAdvisor Rentals y de Hopper Homes.
- Todas las citas marcadas "extraída por herramienta" pasaron por el modelo de resumen interno de `WebFetch` (que convierte HTML a markdown y lo procesa con un modelo pequeño antes de devolver la respuesta) — se tratan como aproximación de alta fidelidad, no como copia carácter por carácter verificada del HTML fuente; se marca la confianza en consecuencia (media-alta, no alta, para esas citas específicas).
- Este ledger no toca `docs/FUENTES.md` (regla de alcance del encargo); las referencias cruzadas a RV03/RV04/RV05/RV08/RV14 remiten a sus ledgers propios (`docs/fuentes/rv03-airbnb.md`, `rv04-booking.md`, `rv05-08-14.md`) y a `docs/fuentes/b002-archivo.md`, sin duplicar sus citas F-xxx originales.
