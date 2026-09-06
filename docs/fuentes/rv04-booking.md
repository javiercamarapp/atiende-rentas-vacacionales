# Ledger de fuentes — RV04 Booking.com Connectivity

Fecha de consulta (todas las entradas salvo que se indique lo contrario): **2026-09-05**
Investigador: Sonnet (agente de investigación), proyecto Atiende Rentas Vacacionales.

Convención de confianza: **Alta** = leído directamente en fuente oficial primaria con cita textual; **Media** = leído en fuente oficial primaria pero contenido genérico/remite a otra página; **Baja** = no leído directamente (bloqueado, 404, o solo visible vía snippet de buscador), requiere verificación.

---

## F01 — About the Booking.com Connectivity APIs (portal principal)
- **Título:** About the Booking.com Connectivity APIs
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs
- **Fecha publicada/actualizada:** no consta en el contenido extraído
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (lectura directa, HTTP 200)
- **Cita textual:** "send and retrieve data for properties listed on Booking.com" (disponibilidad, precios, reservas); oferta principal siempre incluida = Reservations API + Rates & Availability API; conexiones adicionales opcionales listadas (Guest reviews, Reporting, Content, Photos, Guest messages, Performance data, Payments by Booking.com, Promotions, Facilities, Property settings); base URLs "https://supply-xml.booking.com" (no-PCI) y "https://secure-supply-xml.booking.com" (reservas, PCI); "HTTPS protocol (HTTP/1.1), over Transport Layer Security (TLS 1.2)"; límite general "10000" llamadas/minuto, endpoints específicos 75–700 llamadas/minuto.
- **Alcance:** Estructura general de las APIs de Connectivity (oferta), requisitos generales de partner, seguridad de transporte, rate limiting general.
- **Confianza:** Alta (fuente primaria oficial, cita directa).
- **Laguna:** No se detalla el desglose exacto de qué endpoints tienen cada uno de los límites 75–700/min; no menciona webhooks ni sandbox en esta página.

## F02 — Going live
- **Título:** Going live
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/going_live
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** recomienda "offer the functionality of the API to a small beta group for the first few weeks"; certificación implica "running several test requests on certain API endpoint(s)"; auto-evaluación requiere compartir "RUIDs of API responses and/or screenshots"; matriz de cumplimiento: Reservations API (PCI y PII, certificación), Content API (PII, certificación), Payments API (PCI, auto-evaluación), Messaging API (PII, certificación), Rates & Availability (sin PCI/PII, certificación).
- **Alcance:** Proceso de puesta en producción por API — certificación vs autoevaluación, requisitos normativos PCI/PII.
- **Confianza:** Alta.
- **Laguna:** No se detallan plazos de certificación, criterios exactos de aprobación/rechazo, ni existencia de un entorno sandbox formal separado (no se menciona la palabra "sandbox").

## F03 — Index / Content (overview general)
- **Título:** (página overview de contenido, "index-content")
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/index-content
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** "Calls for building accommodations, rooms, rates, and policies, and linking this information together for the Booking.com website" (categoría Content Methods).
- **Alcance:** Definición general de la categoría "Content Methods"; remite a página dedicada de Content Methods para detalle técnico.
- **Confianza:** Media (contenido genérico, sin detalle técnico de room types/fotos/facilities en esta página específica).
- **Laguna:** Detalle técnico de estructura de datos está en otra página (ver F05).

## F04 — Request to Book: Overview
- **Título:** Request to Book (RtB) — Overview
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/request-to-book/overview
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** "Un `reservationId` no es lo mismo que el `bookingRequestId`" (traducido del original, confirma distinción entre solicitud y reserva); huésped envía solicitud "al menos tres días antes de la fecha de entrada"; partner "tiene 24 horas para aceptar o rechazar"; si acepta, huésped "tiene 24 horas para completar su booking"; si no se actúa, "la solicitud de reserva expirará"; **"No bloqueamos la disponibilidad de Booking.com para solicitudes, por lo que el precio puede cambiar" en modo `INQUIRY`**.
- **Alcance:** Ciclo de vida de Request-to-Book, distinción solicitud vs reserva confirmada, comportamiento de disponibilidad/precio durante una solicitud pendiente.
- **Confianza:** Alta — punto crítico para el requisito de "cierre de disponibilidad" del proyecto: **una solicitud RtB en estado `INQUIRY` NO cierra el calendario de Booking.com**, solo la reserva confirmada (`Booked`) lo hace.
- **Re-verificación 2026-09-05 (corrección C4/Alta):** releído con prompt dirigido a extraer el párrafo completo alrededor de "three days". Cita ampliada: "The guest sends a booking request to a partner's property at least three days before the check-in date" + "RtB properties are excluded from search results with check-in dates less than 3 days" — el umbral de 3 días gobierna la **visibilidad en búsqueda/elegibilidad** de la propiedad para RtB, el mismo concepto que F13 describe con 48 horas. Confirma que la discrepancia con F13 es real y no dos conceptos distintos.
- **Laguna:** No se detalla si Booking.com aplica algún "soft hold" temporal parcial durante la ventana de 24h de decisión del partner, más allá de "no bloqueamos disponibilidad".

## F05 — Content API (Manage room/property content)
- **Título:** Content API
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/content
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** "Manage room type content", "Manage property content"; áreas de cobertura: contenido de habitaciones/amenities, información de propiedad, facilities, políticas (infantiles, de casa, CVC collection); requiere certificación previa ("you'll need to meet certain requirements") antes de producción.
- **Alcance:** Alcance funcional de Content API.
- **Confianza:** Media (nivel de detalle todavía general; sin esquema de campos).
- **Laguna:** No se obtuvo el detalle exacto de "SubRooms"/room type aquí (ver F16, página distinta, más específica).

## F06 — Understanding the Reservations API
- **Título:** Understanding the Reservations API
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/reservations-api/reservations-overview
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** modelo de **pull**: "GET /OTA_HotelResNotif" y "POST /reservations" para recuperar reservas activamente; "si no se recuperan dentro de 30 minutos, el sistema envía email de respaldo a la propiedad"; tres estados: nuevas (GET OTA_HotelResNotif), modificadas y canceladas (ambas vía GET OTA_HotelResModifyNotif); acknowledgement vía "POST /OTA_HotelResNotif"; "Proper implementation of the acknowledgement step eliminates chances that any data has been overlooked"; sugiere procesar modificaciones/cancelaciones como "parallel task at a lower priority level" respecto a nuevas reservas.
- **Alcance:** Arquitectura pull de la Reservations API, fallback por email, prioridad de procesamiento.
- **Confianza:** Alta.
- **Laguna:** No se documenta explícitamente ningún mecanismo push/webhook — el modelo descrito es 100% pull/polling. No se detallan garantías de orden estricto de eventos.

## F07 — Retrieving new reservations (GET/POST OTA_HotelResNotif)
- **Título:** Retrieving new reservations
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/reservations-api/retrieving-new-reservations-ota
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** "call `GET OTA_HotelResNotif` once per twenty seconds"; "wait five seconds between `POST OTA_HotelResNotif` and the next `GET OTA_HotelResNotif`"; parámetro `limit` entre 10–200, "The API may return reservations less than the specified limit based on the immediate availability of data"; GET devuelve por defecto solo reservas no confirmadas (no acknowledged); repetirá el envío hasta que se haga ack ("GET OTA_HotelResNotif will repetitively return bookings until they are acknowledged. Make sure to handle this repeated data, and avoid creating duplicate bookings" — recuperado también vía snippet de búsqueda coincidente con el contenido de la página).
- **Alcance:** Frecuencia de polling recomendada, parámetro limit, mecánica de acknowledgement, advertencia explícita de deduplicación a cargo del receptor.
- **Confianza:** Alta.
- **Re-verificación 2026-09-05 (corrección C21, completitud):** releído con prompt dirigido al timeout de 30 minutos. Cita confirmada: "if you do not successfully acknowledge (OTA) or retrieve (B.XML) reservation(s) within a certain timeout period (30 minutes)... our system forwards the reservations to the property as an email" + "You can increase the timeout period from 30 minutes to 24 hours by contacting the Connectivity Support team." El timeout de 30 minutos es un valor por defecto configurable hasta 24h vía soporte, no un límite fijo.
- **Laguna:** No se especifica timeout HTTP recomendado ni política de reintentos ante fallos de red en el contenido efectivamente leído (un intento de leer el user-guide legado en connect.booking.com resultó en página "sunset"/redirect sin contenido útil).

## F08 — Rates & Availability API Overview (ari)
- **Título:** Rates & Availability API Overview
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/ari
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** "set inventory, pricing, and restrictions for a property's rooms on Booking.com"; tres familias de endpoints: B.XML (crear/actualizar inventario+tarifas+restricciones, tarifas derivadas, recuperar inventario/tarifas), OTA (crear/actualizar inventario+restricciones; crear/actualizar tarifas), CSV (tarifas LOS); modelos de precio: "Standard, Derived pricing or Rate-Level Occupancy (RLO), Occupancy-Based Pricing (OBP), Length Of Stay (LOS)".
- **Alcance:** Panorama de endpoints de disponibilidad/tarifas y modelos de pricing.
- **Confianza:** Alta para lo citado; el documento es una página "overview" que remite a sub-páginas para detalle técnico de restricciones.
- **Laguna:** No se confirma en esta página si el modelo es push (el proveedor empuja cambios) o si Booking también expone algún mecanismo de consulta programada; el detalle de CTA/CTD/min-max stay está en F09.

## F09 — Create/update inventory, rates and restrictions (B.XML availability)
- **Título:** Create or update inventory, rates and restrictions
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/b_xml-availability
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** `roomstosell` — "The number of available rooms applies across all rates"; valor máximo 254, 255 = ilimitado; `closedonarrival` — "Specifies if the room is unavailable to book if the guest checks in on the specified date" (1=cerrado); `closedondeparture` — "Specifies if the room is unavailable to book if the guest checks out on the specified date" (1=cerrado); `minimumstay`, `minimumstay_arrival`, `maximumstay`, `maximumstay_arrival` como los cuatro campos de restricción de estancia; `closed` — "Specifies whether all rooms of a room type are closed", aplicable a nivel room type o combinación room+rate.
- **Alcance:** Semántica exacta de inventario numérico y restricciones de calendario en el proveedor de conectividad (push desde el proveedor hacia Booking.com vía B.XML).
- **Confianza:** Alta — es la evidencia primaria más directa sobre cómo se representa el "cierre de disponibilidad" en Booking.com Connectivity.
- **Laguna:** No se confirma en el texto extraído el equivalente exacto OTA (`OTA_HotelAvailNotifRQ`) con los mismos nombres de campo; se documentó la variante B.XML, no la variante OTA XML en detalle de campos.

## F10 — Retrieving reservations / managing reservations B.XML (estados)
- **Título:** Retrieving reservations using B.XML
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/reservations-api/managing-reservations-bxml
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** "Modified: Returns `reservations` object with updated reservation details. Cancelled: Returns the same `reservations` object but with different child objects."; "`status`: Specifies the reservation status. Possible values are: `new`, `modified`, `cancelled`"; "`total_cancellation_fee`: [Only for cancelled reservations] Specifies the total amount of cancellation fees a guest has to pay".
- **Alcance:** Confirma los tres estados de reserva expuestos por la API y el campo de cargos por cancelación.
- **Confianza:** Alta para lo citado.
- **Laguna:** El documento leído NO contiene detalle explícito sobre deduplicación específica de este endpoint (más allá de lo ya cubierto en F07), ni sobre orden garantizado de eventos modificación/cancelación, ni sobre no-show (ver F15 para no-show, que es un endpoint distinto — Reporting API).

## F11 — Understanding the Messaging API
- **Título:** Understanding the Messaging API
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/messaging-api/understanding-the-messaging-api
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** capacidades: "Send (and reply to) text messages", "Upload, download, and send attachments"; alcance pre-reserva: "pre-reservation messages sent during the Request-to-Book (RtB) process"; alcance post-reserva: propiedades pueden enviar mensajes "From the time of booking until 7 days after the guest checkout" o "7 days after the booking is cancelled", ampliable +14 días si el huésped inicia contacto; desde v1.2 soporta cambios de hora check-in/out, preferencias de cama, cunas/camas extra vía "free text special requests" (cambios de fecha y cancelaciones excluidos, requieren extranet); mensajes con contenido de phishing se redactan a "This message was deleted" y se eliminan adjuntos; no es posible probar solicitudes de estacionamiento en entornos de prueba.
- **Alcance:** Qué permite y qué NO permite la Messaging API (relevante para la regla del proyecto de "nunca contactar huéspedes sin autorización": la API es el canal legítimo pero tiene ventanas temporales y restricciones de contenido).
- **Confianza:** Alta.
- **Laguna:** No se detalla límite de tasa (rate limit) específico de esta API en el contenido leído, ni el mecanismo de entrega (push/webhook vs polling) — solo se documentó `GET /messages/latest` (polling, "máximo 100 mensajes por request", vía snippet de búsqueda que reproduce texto de la doc, no confirmado con fetch directo de esa sub-página).

## F12 — Authentication (Connectivity APIs)
- **Título:** Authentication
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/authentication
- **Fecha publicada/actualizada:** no consta (menciona sunset de credential-based auth "31 Dec, 2025", lo cual ya sería pasado respecto a la fecha de consulta 2026-09-05)
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** dos esquemas: "token-based" (recomendado, tokens de corta duración renovados cada hora, JWT) y "credential-based" (marcado como "Sunset on 31 Dec, 2025"); machine accounts se crean a nivel de propiedad, "You can add more than one property to a machine account"; recomendación: "Enforce separation of concerns by creating dedicated machine accounts for testing purposes and to use in production." y "Configure test machine accounts with test properties and production machine accounts with production properties."
- **Alcance:** Modelo de autoridad de cuenta (machine account por propiedad, no por usuario individual) y separación test/producción.
- **Confianza:** Alta para lo citado directamente.
- **Laguna:** Dado que la fecha de sunset del esquema credential-based (31-dic-2025) es anterior a la fecha de consulta (2026-09-05), es posible que a la fecha de este informe el esquema credential-based ya no esté disponible; no se confirmó el estado actual con una fuente adicional — se señala como riesgo de vigencia de la documentación cacheada. No se usa ni confirma el término "sandbox" explícitamente; se documentan "test machine accounts / test properties" como mecanismo equivalente.

## F13 — Request to Book: Onboarding an eligible partner
- **Título:** Onboarding an eligible partner (Request to Book)
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/request-to-book/onboarding
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** requisito de mostrar el flujo: huéspedes pueden enviar solicitudes con check-in a "más de 48 horas" (nota: esto difiere ligeramente de "al menos tres días" citado en F04 — posible variación entre el texto de onboarding y el texto de overview, o entre umbral mínimo distinto; se documenta la discrepancia); partner tiene 24h para responder, huésped otras 24h para confirmar; "partners deben ser informados que están sujetos a la misma política de no discriminación que aquellos que no usan proveedor de conectividad"; texto obligatorio a mostrar: "By accepting or declining this request, you acknowledge that you are doing so in accordance with Booking.com's non-discrimination policy"; requiere usar Content API (`OTA_HotelDescriptiveContentNotif`) y tener la feature `content_api_rtb_enabled` habilitada para cambiar el modelo de reserva a RTB; el alojamiento también puede cambiar su modelo de reserva directamente en Extranet.
- **Alcance:** Requisitos de onboarding específicos para habilitar Request-to-Book vía un connectivity provider, y política de no discriminación aplicable.
- **Confianza:** Alta para lo citado; **discrepancia de plazos detectada entre F04 (3 días) y F13 (48 horas) que debe tratarse como incertidumbre a verificar**, no se debe asumir cuál prevalece sin confirmación adicional.
- **Re-verificación 2026-09-05 (corrección C4/Alta):** releído con prompt dirigido a extraer el párrafo completo alrededor de "48 hours". Cita ampliada: "Guests who want to make booking with the checkin that is more than 48 hours in the future will be able to find your apartment and send the booking request." Este texto vive en la sección de onboarding que el connectivity provider debe mostrar al partner, y describe el mismo concepto que F04 (elegibilidad de la propiedad para recibir solicitudes RtB según anticipación del check-in) — **no un umbral distinto para un paso distinto del flujo**. Confirma que la discrepancia es real: dos páginas oficiales de Booking.com dan cifras distintas (72h vs. 48h) para la misma pregunta.
- **Laguna:** Ya no queda como "posible concepto distinto" (hipótesis descartada por la re-verificación); la discrepancia numérica en sí sigue sin resolver — requiere aclaración directa de Booking.com Connectivity Support antes de fijar cualquier número en copy de producto/SLA.

## F14 — Frequently asked questions about the Rates & Availability API
- **Título:** Frequently asked questions about the Rates & Availability API
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/con-faq-rates-availability
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** remite a "información regarding the mandatory functionalities and restrictions you need to support before going live" en el portal de conectividad; ocupancia: precio estándar independiente del número de huéspedes vs. precio por ocupancia; "child occupancy serves as an add-on to adult occupancy"; error "PRICE_EXCEEDS_MAX_PRICE" — "You're trying to load prices higher than €50,000 (or the equivalent in the property local currency)"; error "PRICE_BELOW_MIN_PRICE" — "You're trying to load prices lower than €5"; "Rate Rewrite" permite tarifas hijas desde una tarifa padre, con IDs propios, no actualizables directamente por el proveedor de conectividad.
- **Alcance:** Límites de precio válidos y modelo de tarifas derivadas ("Rate Rewrite").
- **Confianza:** Alta para lo citado.
- **Laguna:** No se listó aquí el detalle de "mandatory functionalities and restrictions before going live" (remite a otra sección del portal de conectividad, posiblemente con acceso restringido/autenticado, no verificado).

## F15 — Report reservations changes (Reporting API — no-show)
- **Título:** Report reservations changes (B.XML reporting)
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/reporting-api/b_xml-reporting
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** endpoint "POST https://supply-xml.booking.com/hotels/xml/reporting"; ventana de no-show: "desde las 00:00 (medianoche, hora local de la propiedad) en la fecha de check-in planificada, hasta 48 horas después de la fecha de check-out planificada" (paráfrasis del rango documentado); "If a guest doesn't show up on the planned check-in date, the property may mark the reservation (or a specific room in a multi-room reservation) as 'no show'"; "The property can waive no-show fees, if desired. This means Booking.com will not charge commission"; errores de ventana temporal: "Not able to cancel booking earlier than 1 day after the check in" y "Not able to cancel booking later than 2 days after the check in"; una vez marcada no-show, la reserva no es modificable de nuevo.
- **Alcance:** Cómo se reporta un no-show (distinto de cancelación), ventana temporal válida, condiciones (reserva no debe estar overbookeada, no modificable tras el marcado), condonación de comisión.
- **Confianza:** Alta.
- **Laguna:** No se cubre en este documento el efecto de no-show sobre la liberación/no liberación de disponibilidad en el calendario (si las noches quedan libres nuevamente o no) — no confirmado en el texto leído.

## F16 — Managing room types (multi-unidad)
- **Título:** Managing room types
- **Editor:** Booking.com (developers.booking.com)
- **URL:** https://developers.booking.com/connectivity/docs/room-type-and-rate-plan-management/managing-room-types
- **Fecha publicada/actualizada:** no consta
- **Fecha de consulta:** 2026-09-05
- **Método:** WebFetch (HTTP 200)
- **Cita textual:** definición de room type: "A room type code... The max occupancies of the room type... A more descriptive name to refer to the room type"; límite: "You can create a maximum of 100 room types for a property, including both active and inactive room types"; tipos que soportan subespacios multi-habitación: "Apartment, Suite, Chalet, Bungalow, Holiday home, Villa, Mobile home", vía elemento `SubRooms` > `SubRoom` con `RoomType` en {Bedroom, Living room, Bathroom}, cada uno con `MaxGuests` y `PrivateBathroom`; requisitos de cocina: "Apartment (PCT code 3), Aparthotel (PCT code 5000) and Condominium (PCT code 8) require a kitchen or kitchenette in the room types to become open and bookable. For Holiday home (PCT code 5006), Holiday park (PCT code 5009), Lodge (PCT code 22) and Villa (PCT code 35) a kitchen or kitchenette is highly recommended."; parámetro "Quantity: [Optional] Specifies the number of units of a room type" para manejar múltiples unidades idénticas sin duplicar room types.
- **Alcance:** Semántica de "room type" en alojamientos vacacionales/homes vs. hoteles, mecanismo de multi-unidad (`Quantity`) vs. unidad única, requisitos de contenido específicos por tipo de propiedad (PCT code).
- **Confianza:** Alta — evidencia primaria directa sobre inventario multi-unidad (room type con `Quantity` > 1) vs. unidad única (`Quantity` = 1 o ausente).
- **Laguna:** No se confirma en el texto leído si `Quantity` interactúa de forma especial con `roomstosell` de F09 (p. ej., si `roomstosell` no puede superar `Quantity`), ni el comportamiento exacto de asignación de unidad física a nivel de reserva individual.

---

## Intentos fallidos / bloqueados (documentados por transparencia, NO usados como fuente de afirmaciones)

### X1 — partner.booking.com: Syncing your Booking.com calendar to third-party calendars (iCal)
- **URL intentada:** https://partner.booking.com/en-us/help/rates-availability/extranet-calendar/syncing-your-bookingcom-calendar-third-party-calendars
- **Resultado:** HTTP 403 Forbidden en dos intentos independientes (WebFetch). Sin acceso a navegador autenticado (extensión Chrome no conectada).
- **Consecuencia:** No se pudo leer directamente el artículo oficial de ayuda de Booking.com sobre elegibilidad, frecuencia y límites del sync iCal para "homes"/alojamientos vacacionales. Cualquier dato sobre esto que circule (ver X3) proviene de fuentes secundarias (blogs de terceros) o de snippets de motor de búsqueda, **no de la fuente primaria**, y se marca como no verificado.
- **Confianza:** N/A (fuente no leída).
- **Laguna crítica:** Elegibilidad exacta de "homes" para iCal, frecuencia real de import/export declarada por Booking, y cualquier advertencia oficial de riesgo de overbooking — **sin evidencia primaria**.

### X2 — partner.booking.com: Understanding the Connectivity Partner Program / Setting up and working with a connectivity provider
- **URLs intentadas:**
  - https://partner.booking.com/en-us/help/channel-manager/partner-program/understanding-connectivity-partner-program
  - https://partner.booking.com/en-us/help/channel-manager/setup/setting-and-working-connectivity-provider
- **Resultado:** HTTP 403 Forbidden (WebFetch).
- **Consecuencia:** No se pudo confirmar en fuente primaria la existencia/definición de niveles del Connectivity Partner Program (p. ej. "Premier"/"Preferred", mencionados solo en snippets de búsqueda de terceros) ni el detalle exacto de "conexión directa del anfitrión" vs. "connectivity partner" desde la perspectiva del extranet de Booking.
- **Confianza:** N/A (fuente no leída).
- **Laguna crítica:** Política formal de "connectivity partner" vs. conexión directa del anfitrión — **sin evidencia primaria confirmada por lectura directa**; solo inferible indirectamente de F01/F02/F12 (que sí describen el modelo de "Connectivity Partner" desde el lado developers.booking.com).

### X3 — Información de iCal obtenida solo vía snippets de WebSearch (NO fuente primaria leída)
- **Fuentes citadas en snippets (terceros, no oficiales):** rentalsunited.com, guesty.com — blogs comerciales, no Booking.com.
- **Afirmaciones que circulan (sin verificación primaria):** frecuencia de refresco de Booking.com "cada 2 a 6 horas" o "hasta 12 horas de delay"; requisito de "20 room types o menos y máximo una unidad por room type" para habilitar import/export de calendario iCal en Booking.com.
- **Confianza:** Baja — son afirmaciones de terceros comerciales (con posible interés en vender software de channel manager) sobre el comportamiento de Booking.com, no confirmadas por lectura directa de partner.booking.com (bloqueado, ver X1).
- **Laguna crítica:** Se recomienda que el equipo de producto verifique manualmente (login en partner.booking.com/extranet) estos datos antes de usarlos como base de requisitos, dado que RV04 exige que el calendario unificado CIERRE disponibilidad correctamente — un dato de frecuencia/latencia incorrecto aquí tiene alto impacto en el diseño anti-overbooking.

### X4 — URLs con 404 / redirect sin contenido
- https://developers.booking.com/connectivity/docs/reservations → HTTP 404 (URL incorrecta; la correcta es reservations-api/reservations-overview, ver F06).
- https://developers.booking.com/connectivity/docs/availability → HTTP 404 (URL incorrecta; la correcta es /ari, ver F08).
- https://connect.booking.com/user_guide/site/en-US/reservations-api/retrieving-new-reservations-ota/ → contenido: "This URL is sunset. Bookmark the new URL. Redirecting now..." (portal legado, sin contenido útil).
- **Confianza:** N/A.

---

## Resumen de cobertura del ledger
- **16 fuentes primarias leídas directamente** (F01–F16), todas en developers.booking.com/connectivity/docs, HTTP 200.
- **2 páginas oficiales de partner.booking.com bloqueadas** (403) — brecha documentada (X1, X2).
- **1 discrepancia de plazos sin reconciliar** entre F04 y F13 (3 días vs. 48 horas para elegibilidad de RtB).
- Ninguna afirmación de este ledger proviene de contenido "bajo contrato" o que requiera login — toda la documentación leída es de acceso público en developers.booking.com.
