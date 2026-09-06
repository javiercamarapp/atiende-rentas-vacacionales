# RV22 · Canales de distribución usados en México
Matriz de integración canal por canal para decidir qué adaptador construir primero y con qué estado honesto

Proyecto: Atiende Rentas Vacacionales — calendario unificado multi-canal
Caso ancla: administrador/cohost de portafolio pequeño-mediano (5-30 unidades) operando en destinos turísticos mexicanos (Riviera Maya/Tulum, Los Cabos, CDMX, Puerto Vallarta), hoy con Airbnb + Booking.com como canales primarios y considerando ampliar a Vrbo y a OTAs regionales (Despegar, Best Day, PriceTravel) — la segmentación completa vive en RV01.
Fecha del informe: 2026-09-06 · Autor: Sonnet (agente de investigación), sesión RV22
Informes relacionados: RV03 (Airbnb), RV04 (Booking.com), RV05 (Vrbo/extensibilidad), RV06 (iCal/RFC5545), RV07 (sincronización/overbooking), RV08 (directa vs. channel manager), RV14 (competencia)

### Nota metodológica (leer primero)

Esta investigación se hizo con **seis sesiones de investigación en paralelo** (todas Sonnet, según instrucción de la coordinación), cada una cubriendo un grupo de canales, más una verificación directa de continuidad sobre Airbnb hecha por el agente coordinador. Todas usaron `WebFetch`/`WebSearch` con acceso real a internet; varias agotaron su cupo de `WebSearch` (200/200) antes o durante la tarea y tuvieron que depender de `WebFetch` directo a URLs candidatas (algunas adivinadas sin buscador, con 404 resultantes por slug incorrecto, no necesariamente ausencia de contenido), de motores vía `WebFetch` (Bing, fiabilidad media-baja; DuckDuckGo, bloqueado por CAPTCHA), y en un caso (Expedia Group) de navegación real con Chrome para superar una SPA en React que `WebFetch`/`curl` no renderizan. `web.archive.org` y `archive.ph` están bloqueados para `WebFetch` en este entorno, lo que limitó la verificación de TripAdvisor Rentals y Hopper Homes. Todo bloqueo (403/404/timeout/ENOTFOUND/CAPTCHA/SPA sin renderizar) se reporta explícitamente como tal en el ledger (`docs/fuentes/rv22-canales-mexico.md`), nunca como ausencia de dato.

**Corrección de alcance a mitad de investigación:** el encargo original mencionaba "Rappi" como canal a investigar; una corrección de la coordinación aclaró que se trataba de una confusión de nombre por "Airbnb" (ya cubierto en RV03). La investigación de Rappi ya iniciada se cerró en una sola entrada breve (ver ledger F47) sin más profundización, y se priorizó en su lugar una verificación de continuidad de Airbnb (ver §1) y los canales explícitamente reconfirmados por la corrección: Booking.com, Expedia Group, Despegar, Best Day, PriceTravel, Google Vacation Rentals, Agoda, TripAdvisor/FlipKey, HomeToGo, Holidu y los channel managers puente.

Convención de etiquetas [DATO]/[R]/[E]: ver `docs/investigacion/00-PLAN.md` §2. Toda cita textual proviene de fuente oficial en vivo salvo que se indique "extraída por herramienta" (aproximación del resumen de `WebFetch`, no copia carácter por carácter) o "vía tercero" (afirmación de un channel manager sobre un canal, no del canal mismo).

---

## 0. Resumen ejecutivo

1. **Airbnb** no cambió en las 24 horas entre RV03 (2026-09-05) y esta verificación (2026-09-06): Sandbox V2 y la estructura Homes API/Activities API siguen vigentes [DATO], y se confirma un dato nuevo — el iCal importa **hasta 2 años de datos** [DATO, F02] — sin novedad sobre NDA/scopes exactos, que siguen gateados tras aprobación de partner.
2. **Booking.com** reconfirma, un día después de B-002, la **pausa de admisión de nuevos Connectivity Partners "hasta nuevo aviso"** [DATO, F03] — sigue siendo el bloqueo más crítico de roadmap entre los tres canales grandes.
3. **Expedia Group** resolvió una laguna abierta desde RV05: **Vrbo NO comparte la misma superficie técnica de disponibilidad/reservas que Expedia** [DATO, F13] — tiene su propio stack REST/XML heredado de HomeAway (Booking service/BUS), mientras Expedia usa GraphQL moderno + SOAP/XML legacy (EQC = "Expedia QuickConnect", confirmado por fuente primaria [DATO, F10]) con límite de **5,000 actualizaciones por mensaje** [DATO, F06] y **sin SLA de latencia publicado** para Availability & Rates [E confirmado como laguna, F07]. Vrbo opera activamente en México: 300+ propiedades solo en Tulum, verificado en vivo [DATO, F14].
4. **Despegar** no publica API/spec técnica propia (`developers.despegar.com` no resuelve [DATO, F16]); la única vía verificada es vía **Rentals United** como channel manager certificado, con comisión ~15% y onboarding de 3-5 días declarados por el tercero [R, F18] — no confirmado directamente por Despegar.
5. **PriceTravel** tiene un portal de auto-registro de hoteles cuyo contenido no se pudo verificar [F22], pero **Rentals United sí lo declara explícitamente como canal de "vacation rentals/short-term rental"** con comisión 18-21% y onboarding de 2-3 semanas [R, F23] — contradice la impresión "solo hoteles" del sitio de consumo de PriceTravel.
6. **Best Day** quedó como una laguna casi total: sitio y dominio corporativo bloqueados/inexistentes en todos los intentos [F20]; solo aparece en el directorio de un channel manager (Vertical Booking), ausente en otros dos (Rentals United, RoomCloud) [F21] — no se puede afirmar ni negar su relevancia para rentas vacacionales sin acceso humano directo.
7. **El mejor "channel manager puente" identificado es SiteMinder**: su tabla técnica de códigos de agente de reserva (documentación primaria, no marketing) confirma conexión activa con Booking.com, Expedia, Vrbo, Despegar y PriceTravel (4-5 de 5, falta Best Day) [DATO, F24], con una API pública real (`pmsXchange`, developer.siteminder.com) diseñada exactamente para que un PMS externo empuje datos a través de un intermediario ya certificado [DATO, F25]. Vertical Booking lista nominalmente los 5 canales en su directorio de marketing, pero su subdominio de documentación de API no resuelve [F26].
8. **Google Vacation Rentals sigue vigente en 2026**, sin aviso de descontinuación, con un **feed de "Pricing" separado y específico** para disponibilidad/tarifa de vacation rentals (además del feed de contenido) [DATO, F29] — dato más específico que el conocido hasta RV05. Sigue siendo por invitación exclusiva (Technical Account Manager), sin autoservicio.
9. **FlipKey está confirmado cerrado** ("Flipkey has closed down, please visit Tripadvisor to plan your next trip", HTTP 200, cita textual [DATO, F32]); **TripAdvisor Rentals sigue con estado indeterminado** — bloqueado (403) en dos sesiones distintas (2026-09-05 y 2026-09-06) sin acceso a Wayback Machine para verificación alterna [F33] — no se puede afirmar que está cerrado, solo que es inaccesible por esta vía.
10. **Mercado Libre tiene una categoría "Renta Vacacional" real y verificada vía su API pública** (`MLM-APARTMENTS_FOR_VACATION_RENTAL`, 442 anuncios activos en México), pero **explícitamente sin motor de reservas** (`"reservation_allowed":"not_allowed"` [DATO, F45]) — es un canal de publicación manual y estática, no de distribución automatizada de disponibilidad; representa ≈0.15% del total de la categoría Inmuebles [E, cálculo propio sobre datos oficiales]. Facebook Marketplace tiene solo una categoría genérica de alquiler, sin evidencia de API estructurada para rentas de corto plazo [F46].

---

## 1. Matriz de integración canal × dimensión

Convención de columnas: **Vía técnica** (`api_partner` / `ical_import` / `ical_export` / `channel_manager_certificado` / `manual` / `ninguna`) · **Acceso** (`abierto` / `registro` / `partner_aprobacion` / `pausado` / `curado_invitacion` / `no_aplica`) · **Sandbox** (sí/no/desconocido) · **Cobertura** resume disponibilidad(D)/tarifas(T)/restricciones(R)/reservas(Rv)/mensajes(M) con ✓/✗/parcial · **Estado honesto** es la recomendación para Atiende.

| Canal | Presencia México | Vía técnica | Acceso | Sandbox | Cobertura D/T/R/Rv/M | Latencia doc. | Etiqueta | Estado honesto |
|---|---|---|---|---|---|---|---|---|
| Airbnb — API partner | Sí (RV03) | api_partner | partner_aprobacion (NDA) | Sí, Sandbox V2 [DATO F01] | ✓/✓/parcial/✓/✓ (parcial=scopes no confirmados) | Sin SLA documentado (RV03) | [DATO] | `partner_pendiente` |
| Airbnb — iCal | Sí | ical_import/export | abierto (self-service) | no_aplica | ✓/✗/parcial/✗/✗ | 3h ciclo, 2 años ventana [DATO F02] | [DATO] | `ical` |
| Booking.com — API Connectivity | Sí (RV04) | api_partner | **pausado** [DATO F03] | Sí (test/prod separados) | ✓/✓/✓/✓/✓ | Polling 20s reservas (RV04) | [DATO] | `partner_pendiente` (pausa) |
| Booking.com — iCal | Sí (por extranet, no confirmado en detalle) | ical_import | registro (extranet, sin fuente primaria) | no_aplica | desconocido (LAGUNA HONESTA, RV04/LAGUNAS §2.2) | sin evidencia primaria | — | `manual` (mientras persista la laguna) |
| Expedia — API (Product/A&R/BN/BR) | Sí | api_partner | partner_aprobacion (PCI/TLS/license) | Sí, `api.sandbox.expediagroup.com` [DATO F12] | ✓/✓/✓/✓/✗(no incluida) | Sin SLA en A&R [F07]; BN "una vez" push [F08] | [DATO] | `partner_pendiente` |
| Vrbo — API (stack propio HomeAway) | Sí, 300+ Tulum [DATO F14] | api_partner | partner_aprobacion (IEM, ~3 semanas whitelisting) | Compartido con Expedia GraphQL para contenido; servicios legacy sin sandbox confirmado | ✓/✓/parcial/✓/✗ | Sin SLA propio confirmado | [DATO/R] | `partner_pendiente` |
| Vrbo — iCal | Sí | ical_import/export | abierto (self-service, Owner Dashboard) | no_aplica | ✓/✗/✗/✗/✗ | 30 min app móvil, hasta 20 min propagación (RV05) | [DATO] | `ical` |
| Hotels.com | Sí (mismo inventario Expedia, sin árbol propio confirmado) | api_partner (asumido = Expedia) | partner_aprobacion | Desconocido | desconocido | desconocido | [E] | `partner_pendiente` |
| Despegar/Decolar | Sí, vía tercero [R F18] | ninguna directa; channel_manager_certificado | partner (mayorista/CM) | desconocido | ✓/✓/parcial/✓/desconocido (según CM) | Onboarding 3-5 días vía Rentals United [R] | [R] | `partner_pendiente` (vía puente) |
| Best Day | Incierta (bloqueo total) | desconocida | desconocido | desconocido | desconocido | desconocido | — (laguna) | `partner_pendiente` (motivo: sin evidencia, requiere verificación humana) |
| PriceTravel | Sí, vía tercero [R F23] | portal auto-registro (contenido no verificado) + channel_manager_certificado | registro + partner (CM) | desconocido | ✓/✓/parcial/✓/desconocido (según CM) | Onboarding 2-3 semanas vía Rentals United [R] | [R] | `partner_pendiente` (vía puente) |
| Google Vacation Rentals | Sí (programa activo) | feed XML (Listings + Pricing) | curado_invitacion (Technical Account Manager) | Desconocido | ✓/✓/desconocido/desconocido/✗ | Sin SLA publicado | [DATO] | `partner_pendiente` |
| Agoda — extranet "calendar link" | Sí (asumido, no reverificado) | ical_export-equivalente | registro (una vez listado) | no_aplica | ✓/✗/✗/✗/✗ | "varias veces al día" (RV05, no oficial exacto) | [R] | `ical` (equivalente funcional) |
| Agoda — Content Push API / YCS | Desconocida (SPA bloqueó verificación) | api_partner | partner_aprobacion | desconocido | desconocido | desconocido | — (laguna) | `partner_pendiente` |
| TripAdvisor Rentals | Estado indeterminado 2026 [F33] | desconocida | desconocido | desconocido | desconocido | desconocido | — (laguna) | `no_aplica` (motivo: estado operativo no verificable) |
| FlipKey | **Cerrado** [DATO F32] | n/a | n/a | n/a | n/a | n/a | [DATO] | `no_aplica` (canal cerrado) |
| HomeToGo | Sí, confirmado [DATO F37] | channel_manager_certificado (solo Smoobu) [DATO F36] | registro + CM certificado único | no_aplica (no API propia) | ✓/✓/desconocido/desconocido/✗ | Sin SLA propio (depende de Smoobu) | [DATO] | `manual`/`no_aplica` (motivo: solo vía Smoobu, sin API propia para PMS de terceros) |
| Holidu | Incierta en LatAm [LAGUNAS §4.1] | api_partner o channel_manager_certificado (75+ CM soportados) | registro/partner | desconocido | ✓/✓/parcial/✓/desconocido | Sin SLA publicado | [DATO] (Europa) | `partner_pendiente` (motivo: cobertura LatAm no confirmada) |
| Marriott Homes & Villas | Sí, parcial (Playa del Carmen) [DATO F40] | channel_manager_certificado (32 partners) | curado (solo vía 32 CM certificados) [DATO F39] | no_aplica (sin API propia) | ✓/✓/parcial/✓/desconocido (según CM) | Depende del CM certificado | [DATO] | `manual`/`no_aplica` (motivo: sin autoservicio, solo vía CM ya certificado) |
| Plum Guide | **No confirmada** [F41] | ical_import | curado_invitacion | no_aplica | ✓/✗/✗/✗/✗ | Sin SLA publicado | [DATO] | `no_aplica` (motivo: sin presencia en México + modelo de curación incompatible con integración masiva) |
| Hopper Homes | Incierta, no confirmada [F42] | desconocida (aparente agregación de terceros) | ninguna identificada | desconocido | desconocido | desconocido | — (laguna) | `no_aplica` (motivo: sin programa de partner/API identificable, estado 2026 no verificable) |
| Mercado Libre (Renta Vacacional) | Sí, 442 anuncios [DATO F45] | api de catálogo general (sin calendario) | abierto (API pública de ítems) | Sí (sandbox general de MercadoLibre, no verificado específicamente aquí) | ✓(estático)/✗/✗/✗/✗ | n/a (`reservation_allowed: not_allowed`) | [DATO] | `manual` |
| Facebook Marketplace | Incierta/marginal [F46] | ninguna confirmada | abierto (anuncio clasificado) | no_aplica | ✗/✗/✗/✗/✗ | n/a | — (laguna) | `manual` |
| Directo (sitio propio + Google Search/Maps, sin Vacation Rentals feed) | Sí | ninguna (sitio propio) | abierto | no_aplica | ✓/✓/✓/✓/✓ (control total, sin límite de canal) | n/a | [E] | `manual`/propio (no es un canal externo) |
| Channel manager puente — SiteMinder (pmsXchange) | Sí (4/5 canales objetivo confirmados) [DATO F24-F25] | api_partner (documentada públicamente) | partner (contrato comercial con SiteMinder) | Desconocido (no verificado en esta sesión) | ✓/✓/✓/✓/desconocido | Push "real-time" declarado, sin cifra numérica | [DATO] | `partner_pendiente` (vía de entrada más sólida) |
| Channel manager puente — Vertical Booking | Nominal 5/5 en directorio [R F26] | api_partner (sin doc pública) | partner comercial, sin portal self-service | desconocido | desconocido | desconocido | [R] | `partner_pendiente` (menor confianza que SiteMinder) |

---

## 2. Fichas por canal

### 2.1 Airbnb (resumen de RV03 + verificación de continuidad)

RV03 es la fuente canónica. Esta verificación (2026-09-06, ledger F01-F02) confirma sin cambios: programa de partner API (Homes API/Activities API) bajo NDA, revisión de seguridad, certificación, y un plazo de 6 meses post-aprobación para features obligatorias [DATO, RV03]; Sandbox V2 vigente [DATO, F01]; iCal con ciclo de actualización de 3 horas [DATO, RV03/F02] y **ventana de importación de hasta 2 años** (dato nuevo, no reportado antes en el corpus del proyecto) [DATO, F02]. La laguna de webhook vs. polling en la API de partner, y la ausencia de declaración oficial sobre PII en el feed iCal, siguen abiertas exactamente como en RV03/LAGUNAS §1.

### 2.2 Booking.com (resumen de RV04 + reconfirmación de la pausa)

RV04 es la fuente canónica: modelo pull/polling, "machine accounts" a nivel de propiedad, certificación diferenciada por API (PCI/PII), distinción explícita entre Request-to-Book pendiente y reserva confirmada (RtB no bloquea disponibilidad automáticamente) [DATO, RV04]. La reconfirmación de esta sesión (F03) muestra que la **pausa de admisión de nuevos Connectivity Partners "hasta nuevo aviso"** sigue vigente un día después de B-002, sin fecha de reapertura — sigue siendo el bloqueo de roadmap más crítico entre los tres canales grandes para un partner nuevo como Atiende. El iCal de Booking.com sigue sin fuente primaria (partner.booking.com/partnerhelp.booking.com bloqueados en vivo y sin capturas en Wayback, ver LAGUNAS §2.2).

### 2.3 Expedia Group — Expedia, Hotels.com, Vrbo (Lodging Connectivity APIs)

**Arquitectura técnica confirmada (F04-F13):**

- **Product API / Product management**: Product API (legacy, REST/XML) gestiona room types y rate plans sin pasar por Partner Central; su reemplazo, "Product management capability" (GraphQL), está **solo disponible para partners piloto** y no gestiona disponibilidad (eso vive en Availability & Rates API) [DATO, F04].
- **Availability & Rates API (A&R)**: push de disponibilidad/tarifas/restricciones (min/max LOS, CTA/CTD) hasta 2 años a futuro, identificadores exclusivamente Expedia IDs, límite de **5,000 actualizaciones por mensaje** [DATO, F06], **debe combinarse obligatoriamente** con Booking Notification o Booking Retrieval/Confirmation [DATO, F05]. Sin SLA de latencia de procesamiento publicado — laguna confirmada por búsqueda exhaustiva, no por omisión [F07].
- **Booking Notification API (BN)**: push SOAP/XML de una sola vez al crear la reserva (sin reenvío), IDs `HotelReservationID` (ResID_Type 3=confirmación, 8=Expedia numérico); **API legacy, "en mantenimiento", sin nuevas features** — Expedia migra a "Reservation management" GraphQL con webhooks JSON [DATO, F08].
- **Booking Retrieval API + Booking Confirmation (BRBC)**: pull/polling con `BookingRetrievalRQ`, límite de **125 registros por llamada** (vs. hasta 10,000 paginados en el reemplazo GraphQL), confirmación separada vía `BookingConfirmRQ` [DATO, F09].
- **EQC = "Expedia QuickConnect"**, confirmado por dos citas oficiales independientes: es el **nombre de marca/protocolo legacy** (SOAP/XML, dominio `expediaconnect.com`) que sustenta A&R + BN + BR/BC, no un producto separado [DATO, F10].
- **Requisitos de partner**: PCI compliance obligatorio con Attestation of Compliance (AOC) anual auditada, TLS 1.2+, "license agreement" — **no se encontró el término "NDA" explícito**; costos de la API no publicados (proceso real de aplicación vive detrás de un formulario comercial tipo Typeform no completado en esta investigación) [DATO/laguna, F11].
- **Sandbox**: dominio real es **`api.sandbox.expediagroup.com`** (GraphQL de supply/lodging, supply/lodging-sandbox para crear/borrar datos de prueba, supply/payments para tarjetas de prueba), con OAuth2 client_credentials. **Corrección importante**: el dominio `test.ean.com` citado en RV05 como sandbox de "Expedia Rapid" **no aparece en esta documentación 2026** — corresponde al legado "EAN" (Expedia Affiliate Network), un stack probablemente distinto [DATO, F12].
- **Vrbo NO comparte la misma superficie que Expedia** (cierre de laguna de RV05): hay una capa GraphQL compartida (contenido/compliance, con mutaciones Vrbo-específicas), pero Vrbo tiene su **propio stack REST/XML legacy heredado de HomeAway** (Lodging Rate update service, Unit Availability update service, Booking service, Booking update service/BUS, Reservation Fulfillment service — evidencia de origen HomeAway con `assignedSystemId="FAUX_PMS_HAXML_1_2"`). La documentación de Expedia declara explícitamente: "Retrieving reservations for Vrbo properties is not supported at this time." Onboarding de Vrbo usa un "Integration Engagement Manager" con whitelisting de hasta 3 semanas, más artesanal que el portal self-service de Expedia [DATO, F13].
- **Presencia en México**: Vrbo confirma operación activa — 300+ propiedades solo en Tulum, observado en vivo con reseñas y precios reales para fechas 2026 [DATO, F14]. `vrbo.com/en-mx` da 404; México no aparece en la tabla oficial de "master brand sites" localizados — se sirve desde el dominio genérico en inglés/USD.
- **Hotels.com**: sin árbol de documentación propio visible en el portal; probablemente usa el mismo stack de Expedia como point-of-sale adicional sobre el mismo inventario — no confirmado con cita directa (laguna).

### 2.4 Despegar / Decolar

Sin API/spec técnica pública propia: `developers.despegar.com` no resuelve (ENOTFOUND) [DATO, F16]; el sitio de consumo (despegar.com.mx) bloqueó todos los intentos de fetch directo (403) [F17]. La única evidencia de conectividad viene de un tercero: **Rentals United** declara en su página oficial en vivo que Despegar es "the leading travel company in Latin America... including vacation rentals", con comisión ~15% y onboarding de 3-5 días, elegible para propiedades en México [R, F18] — esto no está confirmado directamente por Despegar. "Decolar" no aparece como entrada separada en el mismo directorio (probablemente la misma entidad corporativa para efectos de conectividad) [F19].

### 2.5 Best Day

La laguna más profunda del informe: bestday.com.mx bloqueó todos los intentos (403), grupobestday.com no resuelve (ENOTFOUND) [F20]. En los directorios de channel managers consultados, Best Day está **ausente** de Rentals United y RoomCloud, pero **sí aparece** en el directorio de Vertical Booking [F21] — discrepancia real entre proveedores (cada uno certifica canales de forma independiente), no un error de investigación. **No se puede confirmar ni negar** si Best Day acepta rentas vacacionales o si tiene algún mecanismo de conectividad técnica; requiere verificación humana directa (contacto comercial o acceso de navegador real sin bloqueo anti-bot).

### 2.6 PriceTravel

Tiene un portal de auto-registro de hoteles (`autoenrollment.pricetravel.com`, título confirmado "PriceTravel Partner Platform") cuyo contenido funcional no se pudo verificar por error de carga [F22]. El sitio de consumo se presenta enfocado en "hotels, flights, tours, transfers, and car rentals", sin categoría explícita de apartamentos. Sin embargo, **Rentals United declara explícitamente** que PriceTravel sincroniza "Prices, availability, reservations, photos, content, policies, fees, minimum stay, discounts, taxes, and amenities" para "vacation rentals/short-term rental", con comisión 18-21% y onboarding de 2-3 semanas, cubriendo México, Colombia, Brasil y EE.UU. [R, F23] — de nuevo, no confirmado directamente por PriceTravel.

### 2.7 Google Vacation Rentals

Programa vigente en 2026 (última actualización de la guía técnica: 2025-02-28 UTC, sin banner de deprecación) [DATO, F29]. Arquitectura de **tres feeds**: Property Listings (estático), **Pricing (disponibilidad y tarifa, feed específico y separado del listado)**, y Landing Pages — dato más granular que el conocido hasta RV05. Acceso exclusivamente por invitación con Technical Account Manager de Google; sin autoservicio [DATO, F29-F30]. No se localizó la referencia técnica exacta del feed de "Pricing" (laguna: URLs candidatas dieron 404 por slug incorrecto, no por ausencia confirmada).

### 2.8 Agoda

Sin avance material sobre RV05: `ycs.agoda.com` redirige (307) a `portal.agoda.com` ("Partner Portal"), sugiriendo consolidación de marca del extranet, pero el contenido es una SPA en JavaScript que `WebFetch` no puede renderizar — **no se pudo confirmar si YCS cubre homes/vacation rentals o solo hoteles, ni si existe iCal literal para homes, ni presencia de listados en México** [F31]. RV05 sigue siendo la fuente canónica: extranet "calendar link" funcionalmente equivalente a iCal (solo disponibilidad, sin tarifas), y Content Push API (XML) para partners certificados que soporta "Non-Hotel/Vacation rental".

### 2.9 TripAdvisor Rentals / FlipKey

**FlipKey está confirmado cerrado**: la raíz de flipkey.com muestra HTTP 200 con el texto "Flipkey has closed down, please visit Tripadvisor to plan your next trip", y `/help` redirige (301) al dominio principal de TripAdvisor [DATO, F32]. **TripAdvisor Rentals (standalone) sigue con estado indeterminado**: bloqueado con HTTP 403 en cuatro variantes de URL, en dos sesiones de investigación distintas (2026-09-05 y 2026-09-06) — un bloqueo de acceso no es evidencia de cierre, a diferencia de FlipKey [F33]. La sala de prensa oficial de TripAdvisor no menciona rentals/FlipKey en sus tres comunicados más recientes de 2026 (centrados en "Experiences"/Viator) — evidencia circunstancial, no una declaración explícita de cierre [F34]. Herramientas de archivo (Wayback, archive.today) están bloqueadas en este entorno, sin vía alterna de verificación.

### 2.10 HomeToGo

Modelo híbrido metabuscador + marketplace. Corrección de premisa: **no hay evidencia de relación corporativa entre HomeToGo y Holidu** — son metabuscadores alemanes independientes y competidores; las property management companies propias de HomeToGo son Interhome y Kraushaar, no Holidu [DATO, F35]. Confirmado en vivo: presencia en México (234,923 propiedades comparadas across 77 partners agregados) [DATO, F37]. Para listado directo de host, **HomeToGo certifica un único channel manager: Smoobu** ("Smoobu is the only channel manager integrated with our platform for hosts") — sin API pública abierta para cualquier PMS [DATO, F36]. Comisión declarada: 15%+IVA (plan Flex) o €249-448/propiedad (plan Flat). No especifica elegibilidad geográfica exacta del programa de host directo.

### 2.11 Holidu

Sin reinvestigación a fondo en esta sesión (fuera del alcance de los seis subagentes lanzados); se remite a la fuente ya verificada en RV08/LAGUNAS §4.1 (holidu.com/host/partners, leída en vivo 2026-09-05): "integrates with over 75 Property Management Systems and Channel Managers worldwide... via Property Management System, Channel Manager, or directly through our Holidu API", distribuye a "25+ international booking sites", sin comisión pública, **sin cobertura LatAm confirmada** (enfoque predominantemente europeo). Ninguna evidencia adicional de operación en México surgió de forma incidental en esta sesión [F38].

### 2.12 Marriott Homes & Villas

Confirma el patrón esperado: conexión exclusivamente vía **32 partners de PMS/channel manager certificados** (7 "Elite": BookingPal, Guesty, Hostfully, Hostify, NextPax, Rentals United, VacayHome Connect; 25 "Standard": Avantio, Beds24, Bookandlink, BrightSide, Eviivo, HiSITE, Homhero, Hostaway, Icnea, Inhabit, KrossBooking, Octorate, OwnerRez, Resly, Smiley, Stays.net, Tokeet, Track, TravelStaytion, VRBookings) [DATO, F39]. Sin cita literal "prohibido para individuales", pero confirmado estructuralmente: rutas de aplicación directa (`/en/property-managers`, `/en/homeowners-and-property-managers`, `/en/become-a-partner`, `/en/homeowners`) devuelven HTTP 404 en todos los casos, sin botón de listado directo visible. Presencia en México confirmada parcialmente: "Playa del Carmen" listado como destino destacado en la portada oficial [DATO, F40]; volumen y otras ciudades (Los Cabos, Tulum, CDMX) no verificables por bloqueo 403 en páginas de búsqueda dinámica.

### 2.13 Plum Guide

Modelo de curación explícita: "Our team of local experts vet every home, only accepting the top 3%", onboarding por invitación ("If you received an email from us directly..."), sincronización vía **iCal** (no API de PMS), programa de partnership limitado a agencias de viaje (comisión mínima 7.5%), no a property managers [DATO, F41]. **Sin presencia confirmada en México**: no aparece entre las ~9 ciudades destacadas de la homepage, y `/mexico` y `/destinations` devuelven HTTP 404 — ausencia citada explícitamente, no silencio.

### 2.14 Hopper Homes

Lanzado en enero de 2022 según Wikipedia y prensa contemporánea (Engadget, "more than two million properties spread across the world" dentro de la app móvil) [DATO/R, F42]. Con ese volumen y sin página de "list your property" ni API pública identificada en ningún momento de la investigación, el modelo aparente es de **agregación de inventario de terceros**, no reclutamiento directo de property managers. El sitio actual (hopper.com) es una SPA fuertemente dependiente de JS que impidió verificar su estado en 2026; Wayback Machine confirma **cero capturas** para `hopper.com/homes`. Sin evidencia de presencia en México en ninguna fuente revisada — ni confirmación ni negación explícita.

### 2.15 Mercado Libre (categoría "Renta Vacacional")

Verificado directamente vía la **API pública oficial** de Mercado Libre (sin autenticación para lectura de categorías): existe una categoría diferenciada `MLM-APARTMENTS_FOR_VACATION_RENTAL` en Casas y Departamentos, con atributos propios de hospedaje corto (huéspedes, estadía mínima, check-in/out, número de registro nacional de turismo/RNT) [DATO, F43-F45]. Sin embargo, es explícitamente un **anuncio clasificado sin motor de reservas** (`"buying_modes":["classified"]`, `"reservation_allowed":"not_allowed"`) — publicable con la misma API general de ítems, sin channel-manager ni sincronización de disponibilidad. Volumen: 442 anuncios activos en México, ≈0.15% del total de la categoría Inmuebles (302,898) [E, cálculo propio sobre datos oficiales] — canal de escala marginal.

### 2.16 Facebook Marketplace

Existe una categoría genérica "Alquiler de propiedades" (meta description: "vende tus artículos de forma gratuita"), sin diferenciación de renta vacacional ni evidencia confiable de API estructurada — `developers.facebook.com/docs/marketplace` devolvió 403 vía `WebFetch` y un cuerpo vacío (SPA sin SSR) vía `curl` [F46]. No se pudo confirmar ni descartar la existencia histórica de una categoría "Vacation Rentals" dedicada de Facebook. Relevancia para rentas vacacionales estructuradas en México: **no verificada**, tratada como canal marginal/manual, no como confirmación de uso significativo.

### 2.17 Rappi — fuera de alcance

Corrección de la coordinación: "Rappi" en el encargo original era una confusión de nombre por "Airbnb" (ya cubierto en §2.1). La investigación ya iniciada se cerró sin profundizar más, por instrucción explícita. Dato mínimo registrado antes del corte: existe "Rappi Travel" (travel.rappi.com.mx) como agencia de viajes (vuelos/autos/hoteles seleccionados), `developers.rappi.com` no resuelve, sin evidencia de renta vacacional peer-to-peer ni programa de partner de alojamiento [F47]. **Estado honesto: `no_aplica` — fuera de alcance del encargo, no ampliar sin nueva instrucción.**

### 2.18 Canal directo (sitio propio + Google)

No es un "canal externo" en el sentido de los anteriores: el anfitrión/administrador controla su propio motor de reserva y calendario, con Google Search/Maps como fuente de descubrimiento orgánico (no el programa "Vacation Rentals" de pago/invitación de §2.7, sino resultados orgánicos y Google Business Profile). Cobertura completa de todas las dimensiones porque no hay canal intermediario que imponga restricciones — el costo es 100% del esfuerzo de marketing/adquisición recae en el operador. Para el calendario unificado de Atiende, el canal directo es el "canal cero": el propio sistema de Atiende ES el motor de reservas directo, por lo que no requiere adaptador de sincronización — es la fuente de verdad, no un canal a sincronizar.

---

## 3. Channel managers "puente" para canales pausados/cerrados/bloqueados

Booking.com pausó nuevos Connectivity Partners (§2.2); Despegar y PriceTravel no tienen API pública propia (§2.4-2.6); Best Day es una laguna casi total (§2.5). Esto hace relevante identificar un intermediario ya certificado con estos canales, al que Atiende pueda conectarse una sola vez con una API pública documentada.

**Hallazgo principal: SiteMinder.** Su documentación técnica primaria (no marketing) — la tabla "Booking Agent Codes" de `developer.siteminder.com` — confirma códigos activos para Booking.com (BDC), Expedia (EXP), Vrbo (VRB), Despegar (DDC) y PriceTravel (PRC/PTL); **no** contiene entradas para "Decolar" (probablemente subsumido bajo Despegar) ni para Best Day [DATO, F24]. Su producto **pmsXchange** es una API pública documentada dirigida explícitamente a "Property Management Systems (PMS) and Revenue Management Systems (RMS)", con push de "real-time rates, availability, and restrictions" y recuperación de reservas incluyendo modificaciones y cancelaciones [DATO, F25] — es decir, el modelo exacto de "puente" que necesita Atiende: un solo contrato/integración con SiteMinder sustituye la necesidad de certificarse directamente con 4 de los 5 canales objetivo.

**Candidato secundario: Vertical Booking.** Su directorio público de integraciones lista los 5 nombres exactos (Booking.com, Expedia, Despegar.com, BestDay, Price Travel) [R, F26], pero `developer.verticalbooking.com` no resuelve — no hay portal de documentación de API autoservicio verificable; el acceso técnico real probablemente requiere negociación comercial directa, con mayor riesgo/tiempo de due diligence que SiteMinder.

**Beds24** cubre Despegar y Decolar explícitamente (además de los ya conocidos Airbnb/Booking/Vrbo/Expedia/Agoda de RV14) con una API REST/OpenAPI real y documentada [DATO, F27], pero no se encontró mención de Best Day ni PriceTravel.

Otros proveedores evaluados (DerbySoft, Cloudbeds, RoomCloud, WebHotelier, RateGain) no cumplen el criterio: o su API pública apunta en la dirección opuesta (Cloudbeds: apps que se conectan a Cloudbeds-PMS, no viceversa), o carecen de portal de documentación accesible, o están completamente bloqueados (RateGain, WAF total) [F28].

**Recomendación:** evaluar una integración comercial con **SiteMinder pmsXchange** como vía puente prioritaria para Despegar y PriceTravel (y potencialmente Booking.com/Expedia si la certificación directa sigue bloqueada al momento de construir), confirmando directamente con SiteMinder si Best Day y "Decolar" (como marca separada de Despegar) están o pueden estar cubiertos antes de firmar cualquier acuerdo.

---

## 4. Recomendación de adaptadores para Fase 3 — 3 niveles, con prioridad para México

**Nivel A — implementable hoy con iCal o API pública documentada, sin bloqueo de aprobación:**

| Orden | Canal | Vía | Motivo de prioridad |
|---|---|---|---|
| 1 | Airbnb — iCal | `ical_import`/`ical_export` | Canal primario del caso ancla (RV01); self-service inmediato, ciclo de 3h documentado [DATO] |
| 2 | Vrbo — iCal | `ical_import`/`ical_export` | Presencia confirmada en México (300+ Tulum); self-service, hasta 5 calendarios, 30 min [DATO] |
| 3 | Agoda — "calendar link" (equivalente iCal) | `ical_export`-equivalente | Solo disponibilidad, pero sin aprobación adicional una vez listado [R] |
| 4 | Mercado Libre — publicación estática (sin calendario) | `manual` vía API de ítems | Volumen marginal (442 anuncios), pero API abierta sin partner; solo para presencia, no para sincronización [DATO] |

**Nivel B — implementable contra spec pública documentada, pero bloqueado por partner/credenciales → adaptador construido + simulador contra la spec + estado `partner_pendiente` con motivo citado:**

| Orden | Canal | Motivo del bloqueo | Fuente |
|---|---|---|---|
| 1 | Booking.com — API Connectivity | Pausa de admisión de nuevos Connectivity Partners "hasta nuevo aviso" | F03 (reconfirmado 2026-09-06) |
| 2 | SiteMinder pmsXchange (puente a Despegar/PriceTravel/Booking/Expedia) | Requiere contrato comercial con SiteMinder, no autoservicio abierto | F24-F25 |
| 3 | Expedia Group API (Expedia/Hotels.com) | Requiere PCI/TLS/license agreement y aprobación de partner; formulario comercial no público | F11 |
| 4 | Vrbo — API (stack HomeAway) | Onboarding vía "Integration Engagement Manager", whitelisting ~3 semanas | F13 |
| 5 | Airbnb — API partner | NDA + revisión de seguridad + certificación (RV03) | RV03 |
| 6 | Despegar/PriceTravel (directo, sin puente) | Sin API/spec pública propia; depende 100% de intermediario certificado | F16-F17, F22 |
| 7 | Google Vacation Rentals | Programa por invitación exclusiva (Technical Account Manager) | F29-F30 |
| 8 | Holidu | Cobertura LatAm no confirmada; requiere confirmar geografía antes de invertir | LAGUNAS §4.1 |

**Nivel C — sin vía técnica implementable → `manual`/`no_aplica`, con motivo explícito:**

| Canal | Motivo | Fuente |
|---|---|---|
| Best Day | Sin evidencia verificable de ningún tipo (bloqueo total de fuentes); requiere verificación humana antes de clasificar | F20-F21 |
| TripAdvisor Rentals | Estado operativo indeterminado (403 persistente, sin herramientas de archivo disponibles) | F33 |
| FlipKey | Canal cerrado, confirmado | F32 |
| HomeToGo (adaptador propio) | Solo acepta Smoobu como channel manager; sin API abierta para terceros | F36 |
| Marriott Homes & Villas (adaptador propio) | Solo vía 32 CM ya certificados; sin autoservicio | F39 |
| Plum Guide | Sin presencia en México; modelo de curación incompatible con integración masiva | F41 |
| Hopper Homes | Sin programa de partner/API identificable; estado 2026 no verificable | F42 |
| Facebook Marketplace | Sin evidencia de API estructurada ni de uso significativo verificado | F46 |
| Rappi | Fuera de alcance (confusión de nombre en el encargo) | F47 |

**Orden de prioridad recomendado para México (combinando A+B por impacto de mercado):** (1) Airbnb iCal, (2) Vrbo iCal, (3) Booking.com API — construir el adaptador contra la spec pública ahora, activar en cuanto se reabra la admisión o se resuelva vía puente, (4) evaluación comercial de SiteMinder como puente a Despegar/PriceTravel, (5) Expedia Group API (Expedia/Hotels.com), (6) Vrbo API (una vez agotado el margen de iCal), (7) Airbnb API partner, (8) Google Vacation Rentals (si el volumen de tráfico orgánico lo justifica), (9) Agoda Content Push API. El resto queda en Nivel C hasta nueva evidencia.

---

## 5. Requisitos RV22

- **RV22-R-01**: El adaptador de Airbnb debe soportar iCal import/export como vía primaria (Nivel A), con reconciliación por hash de contenido (no solo UID/SEQUENCE, ver RV07/RV21) dado el ciclo de 3h y ventana de 2 años documentados.
- **RV22-R-02**: El adaptador de Vrbo debe soportar iCal import/export (Nivel A) como vía primaria, y debe modelarse desde el diseño con un adaptador de API separado del de Expedia (no asumir superficie compartida), dado F13.
- **RV22-R-03**: El adaptador de Booking.com debe construirse completo contra la spec pública (B.XML/OTA, RV04) en modo Nivel B — funcional contra un simulador de contrato, con bandera `partner_pendiente` visible en el estado del canal mientras la pausa de admisión siga vigente (monitoreo periódico de `connect.booking.com` recomendado, ver LAGUNAS §2.1).
- **RV22-R-04**: Evaluar en paralelo una integración comercial con SiteMinder pmsXchange como vía puente, antes de comprometer recursos de ingeniería en certificación directa con Despegar o PriceTravel — confirmar con SiteMinder la cobertura real de Best Day y "Decolar" como marca separada.
- **RV22-R-05**: El adaptador de Expedia Group debe distinguir explícitamente credenciales/tokens de Expedia-brand vs. Vrbo-brand (no intercambiables, F13), y debe implementarse contra el stack GraphQL moderno (no el legacy SOAP/XML en mantenimiento) donde sea posible, dado que Expedia declara BN/BR/BC "en mantenimiento, sin nuevas features".
- **RV22-R-06**: Ningún canal de Nivel B debe presentarse en la UI del calendario unificado como "conectado" hasta tener credenciales de producción reales; el estado debe ser `partner_pendiente` con el motivo citado (ver LAGUNAS.md), nunca un ícono verde genérico (principio ya adoptado en RV20 "Feed inaccesible ≠ calendario vacío").
- **RV22-R-07**: Mercado Libre y Facebook Marketplace no deben tratarse como canales de sincronización de disponibilidad (no tienen calendario ni motor de reservas); si se ofrecen, deben limitarse a generación asistida de un anuncio estático, sin promesa de "cierre de disponibilidad" en ese canal.
- **RV22-R-08**: Google Vacation Rentals, Marriott Homes & Villas y Plum Guide no deben aparecer en el roadmap de adaptadores de Fase 3 salvo que el cliente ancla ya tenga invitación/partnership vigente con ellos — son canales de invitación/curación, no de autoservicio.
- **RV22-R-09**: Antes de clasificar Best Day como `no_aplica`, se requiere un intento de verificación humana (navegador real, sin bloqueo anti-bot, o contacto comercial directo) — no cerrar la laguna con inferencia.
- **RV22-R-10**: El estado de TripAdvisor Rentals (activo/cerrado) debe reverificarse periódicamente (cada 4-6 semanas) mientras persista el bloqueo 403, dado que FlipKey sí mostró un aviso de cierre accesible — es plausible que TripAdvisor Rentals muestre un aviso similar si el bloqueo se resuelve.

---

## 6. Implicaciones para producto/requisitos

### 6.1 Qué decide/afecta este módulo en el calendario unificado

RV22 confirma que, de los ~20 canales evaluados, solo **2 tienen una vía Nivel A limpia hoy** (Airbnb iCal, Vrbo iCal) — el resto requiere partnership, está pausado, o no aplica. Esto valida la estrategia de RV08 (iCal como mínimo común denominador universal) y añade evidencia nueva de que **ningún canal regional mexicano (Despegar, Best Day, PriceTravel) tiene una vía de autoservicio** — todos requieren certificación vía mayorista/channel manager, lo que hace del hallazgo de SiteMinder (§3) una pieza central del roadmap de expansión regional, no un "nice to have".

### 6.2 Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| SiteMinder no cubre Best Day/Decolar en la práctica pese al indicio de la tabla de códigos | Media | Medio (afecta solo canales regionales secundarios) | Confirmar cobertura exacta antes de firmar contrato comercial (RV22-R-04) |
| Booking.com reabre admisión con requisitos distintos a los documentados hoy | Media | Alto (afecta el canal #2 de facto del caso ancla) | Monitoreo periódico de `connect.booking.com`; mantener el adaptador Nivel B listo contra spec pública |
| TripAdvisor Rentals resulta estar cerrado (como FlipKey) y se invierte esfuerzo en un canal muerto | Baja-media | Bajo (canal ya en Nivel C, sin inversión de ingeniería planeada) | Reverificación periódica antes de cualquier inversión (RV22-R-10) |
| Mercado Libre/Facebook Marketplace se sobre-venden como "canal más" sin dejar claro que no sincronizan disponibilidad | Media | Medio (riesgo de overbooking si un anfitrión asume que Atiende "cierra" ese canal) | RV22-R-07: nunca prometer cierre de disponibilidad en canales sin calendario |
| Vrbo se trata erróneamente como "mismo adaptador que Expedia" en el diseño técnico | Media (si no se documenta) | Alto (bloquea reservas Vrbo si se usan credenciales/endpoints de Expedia) | RV22-R-02/R-05: adaptadores separados desde el diseño |

### 6.3 Alcance mínimo viable vs. diferido

**Construir primero (Fase 3, Nivel A):** adaptadores iCal de Airbnb y Vrbo — ya tienen precedente técnico completo en RV06 (RFC5545) y RV07 (sincronización/overbooking).

**Construir en paralelo, activar cuando se resuelva el bloqueo (Nivel B, prioridad alta):** adaptador de Booking.com contra spec pública B.XML/OTA con simulador; evaluación comercial de SiteMinder.

**Diferir hasta validar demanda o resolver lagunas (Nivel B, prioridad media-baja):** Expedia Group API, Vrbo API propia, Airbnb API partner, Google Vacation Rentals, Agoda Content Push API, Holidu.

**No construir sin nueva evidencia (Nivel C):** Best Day, TripAdvisor Rentals, FlipKey, HomeToGo/Marriott/Plum Guide como adaptadores propios, Hopper Homes, Facebook Marketplace, Rappi.

---

## 7. Tabla de supuestos

| Supuesto | Valor usado | Lógica/fórmula | Módulo(s) que lo consumen | Cómo se reemplaza por dato real |
|---|---|---|---|---|
| Volumen de "Renta Vacacional" en Mercado Libre es "marginal" | ≈0.15% del total de Inmuebles (442/302,898) | 442 anuncios activos (Casas+Departamentos, categoría MLM50730/MLM50729) ÷ 302,898 total en categoría raíz Inmuebles, ambos de la API pública oficial [DATO] | RV22 §2.15, §4 (Nivel A #4) | Reconsultar la API pública periódicamente; el umbral de "marginal" es interpretación propia, no una cifra oficial de Mercado Libre |
| "Decolar" está cubierto por la misma conectividad que "Despegar" en SiteMinder/Rentals United | Se asume marca hermana sin código/entrada propia | Ninguno de los directorios consultados (SiteMinder, Rentals United) lista "Decolar" por separado; ambas marcas pertenecen al mismo grupo corporativo (conocimiento de mercado, no confirmado por fuente primaria de esta investigación) | RV22 §2.4, §3 | Confirmar directamente con SiteMinder/Rentals United si "Decolar" requiere onboarding separado |
| Rentals United y Vertical Booking declaran fielmente sus conexiones activas con Despegar/PriceTravel/Best Day | Se toman como [R] (evidencia de tercero), no [DATO] de los canales mismos | Ningún canal (Despegar, PriceTravel, Best Day) confirmó directamente estos términos; solo los channel managers lo afirman en sus propias páginas de marketing | RV22 §2.4-2.6, §3 | Verificación directa con Despegar/PriceTravel/Best Day, o con una cuenta de prueba real en el channel manager |
| Hotels.com usa el mismo stack técnico que Expedia (sin árbol de documentación propio) | Asumido por ausencia de contraevidencia, no confirmado | El portal de Expedia Group no muestra "documentation/hotels" en su navegación; Hotels.com es históricamente un point-of-sale adicional sobre el inventario de Expedia | RV22 §2.3, matriz §1 | Confirmar con Expedia Group Connectivity Support si Hotels.com requiere token/onboarding separado |
| "Manual" es el estado honesto correcto para Mercado Libre/Facebook Marketplace (no `no_aplica`) | Se eligió `manual` en vez de `no_aplica` porque sí existe una vía de publicación (aunque sin calendario) | Ambos permiten publicar un anuncio (API de ítems en Mercado Libre; interfaz web en Facebook), pero ninguno sincroniza disponibilidad — se interpreta como "requiere intervención humana", no "sin vía alguna" | RV22 §4 (Nivel A #4, Nivel C) | Reevaluar si alguno de los dos canales introduce un mecanismo de calendario/reserva en el futuro |

---

## 8. Lagunas e incertidumbres

| Afirmación/dato pendiente | Por qué quedó pendiente | Fuente esperada para cerrarlo | Fila de LAGUNAS.md relacionada |
|---|---|---|---|
| Best Day: modelo de conectividad, si acepta rentas vacacionales | Bloqueo total (403/ENOTFOUND) en todos los intentos automatizados; solo 1 de 3 directorios de CM lo menciona | Contacto comercial directo o navegador humano real sin protección anti-bot | Nueva fila §7 "Otros canales — RV22", ver abajo |
| TripAdvisor Rentals: estado operativo 2026 (activo/cerrado) | Bloqueado 403 en 2 sesiones distintas; Wayback Machine/archive.today bloqueados en este entorno | Reintento con navegador real, o acceso de partner, o nueva búsqueda de prensa cuando haya cupo de WebSearch disponible | Nueva fila §7, ver abajo |
| Agoda YCS: si cubre homes/vacation rentals, si tiene iCal literal, presencia en México | `portal.agoda.com` es SPA en JS, no renderizable por WebFetch/curl | Navegador real o sesión con acceso de partner a Agoda | Nueva fila §7, ver abajo |
| Costos/proceso de aprobación completo de Expedia Group (NDA, plazos, tarifas) | Formulario comercial tipo Typeform, no completado por no corresponder entregar datos sin instrucción explícita | Contacto directo con Expedia Group Partner Solutions | Nueva fila §7, ver abajo (relacionada con LAGUNAS §3.1 Vrbo) |
| SLA de latencia de Availability & Rates API (Expedia) | Búsqueda exhaustiva en documentación pública sin resultado | Acceso de partner aprobado + medición empírica | Nueva fila §7, ver abajo (relacionada con LAGUNAS §3.1) |
| Cobertura geográfica LatAm de Holidu (confirmar o descartar México) | Ya documentado como laguna en RV08/LAGUNAS §4.1; no reinvestigado a fondo en RV22 | Contacto directo con Holidu o nueva sesión de investigación dedicada | LAGUNAS §4.1 fila "Holidu" (ya existente, no se abre fila nueva) |
| Elegibilidad geográfica exacta del programa de host directo de HomeToGo (¿México incluido?) | La página de listado no especifica países elegibles | Iniciar el flujo de registro como host de prueba, o contacto directo | Nueva fila §7, ver abajo |
| Volumen/cobertura completa de Marriott Homes & Villas en México (más allá de Playa del Carmen) | Páginas de búsqueda dinámica bloqueadas con 403 | Reintento con navegador real o acceso de partner certificado | Nueva fila §7, ver abajo |
| Presencia de Hopper Homes en México y continuidad del producto en 2026 | Sitio SPA sin renderizar, sin capturas en Wayback, sin cobertura de prensa reciente localizada | Nueva búsqueda cuando haya cupo de WebSearch, o contacto directo con Hopper | Nueva fila §7, ver abajo |
| Existencia de una API estructurada de Facebook Marketplace para renta de corto plazo | `developers.facebook.com/docs/marketplace` inaccesible (403/SPA vacía) | Cuenta de desarrollador de Meta con acceso completo a la documentación | Nueva fila §7, ver abajo |

---

## 9. Fuentes consultadas

Ver ledger completo con citas textuales, fechas y códigos de error exactos en `docs/fuentes/rv22-canales-mexico.md` (F01-F47). Resumen por subtema:

- **Airbnb (verificación de continuidad):** developer.withairbnb.com/join-airbnb-api-program; airbnb.com/help/article/99. [F01-F02]
- **Booking.com (reconfirmación):** connect.booking.com. [F03]
- **Expedia Group (Expedia/Hotels.com/Vrbo):** connectivityportal.expediagroup.com/documentation/{expedia,vrbo} (múltiples subpáginas); developers.expediagroup.com/supply/lodging/updates; vrbo.com/search (Tulum, en vivo). [F04-F15]
- **Despegar/Decolar:** developers.despegar.com (ENOTFOUND); despegar.com.mx (403); rentalsunited.com/connected-listings/despegar. [F16-F19]
- **Best Day:** bestday.com/.com.mx (403); grupobestday.com (ENOTFOUND); directorios de Rentals United/RoomCloud/Vertical Booking. [F20-F21]
- **PriceTravel:** pricetravel.com; autoenrollment.pricetravel.com; rentalsunited.com/connected-listings/price-travel. [F22-F23]
- **Channel managers puente:** developer.siteminder.com (pmsXchange, tabla de códigos); verticalbooking.com/connectivity/integrations; beds24.com/channel-manager + api.beds24.com/v2; derbysoft.com; developers.cloudbeds.com; roomcloud.net; webhotelier.net/docs.webhotelier.net; rategain.com (bloqueado). [F24-F28]
- **Google Vacation Rentals:** developers.google.com/hotels/vacation-rentals/dev-guide/onboarding; support.google.com/hotelprices/answer/10062327. [F29-F30]
- **Agoda:** ycs.agoda.com / portal.agoda.com. [F31]
- **TripAdvisor Rentals/FlipKey:** flipkey.com; tripadvisor.com/Rentals (bloqueado); tripadvisor.mediaroom.com. [F32-F34]
- **HomeToGo:** holidu.com/about-us; ir.hometogo.de; hometogo.com/list-your-property; hometogo.com/mexico. [F35-F37]
- **Holidu:** remite a `docs/investigacion/RV08-directa-vs-channel-manager.md` §1.4 (holidu.com/host/partners). [F38]
- **Marriott Homes & Villas:** homes-and-villas.marriott.com/en/connectivity-partners; homes-and-villas.marriott.com/en. [F39-F40]
- **Plum Guide:** plumguide.com/become-a-host; plumguide.com. [F41]
- **Hopper Homes:** en.wikipedia.org (Hopper company); engadget.com (2022-01-28); hopper.com (bloqueado). [F42]
- **Mercado Libre:** api.mercadolibre.com/categories/{MLM1459,MLM1472,MLM1466,MLM50730} (+/attributes). [F43-F45]
- **Facebook Marketplace:** facebook.com/marketplace/category/propertyrentals; developers.facebook.com/docs/marketplace (bloqueado). [F46]
- **Rappi (fuera de alcance):** ver F47, no ampliado.

Fin del informe RV22. Siguiente paso sugerido: contactar comercialmente a SiteMinder para confirmar cobertura exacta de Best Day/Decolar dentro de pmsXchange, y en paralelo iniciar el registro de host de prueba en `autoenrollment.pricetravel.com` y en el sitio de Despegar (si existe una vía self-service oculta detrás de login) para reemplazar los datos [R] de channel managers de terceros por confirmación directa de los propios canales regionales — esto es lo que más rápido movería el Nivel B de "spec pública sin confirmar" a "acceso real de partner".
