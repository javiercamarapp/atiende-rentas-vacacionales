# Ledger de fuentes — RV23 Verificación de APIs de mensajería por canal (2026-09)

Fecha de consulta (todas las entradas salvo que se indique lo contrario): **2026-09-09**
Investigador: Sonnet (agente de investigación), proyecto Atiende Rentas Vacacionales — rama
`fix/mensajeria-nativa-por-canal`.

Convención de confianza: **Alta** = leído directamente en fuente oficial primaria con cita textual;
**Media** = leído en fuente oficial primaria pero contenido genérico/remite a otra página; **Baja** = no
leído directamente (bloqueado, o solo visible vía snippet de buscador/agregador), requiere verificación.

---

## F01 — Understanding the Messaging API (Booking.com Connectivity)
- **URL:** https://developers.booking.com/connectivity/docs/messaging-api/understanding-the-messaging-api
- **Método:** WebFetch directo (HTTP 200)
- **Cita textual:** "designed for accommodation providers to communicate with guests"; endpoint base
  `https://supply-xml.booking.com/messaging`; autenticación "same authentication methods as other
  Booking.com APIs", nuevas cuentas de máquina deben "enable access to the `/messages/latest` endpoint";
  sugiere contactar "your account manager or the Connectivity Support team" antes de ir a producción.
- **Alcance:** Confirma que esta familia de API es del lado de Connectivity Partners (PMS/channel
  manager), no de Demand API affiliates.
- **Confianza:** Alta.

## F02 — Managing messages (Booking.com Connectivity Messaging API)
- **URL:** https://developers.booking.com/connectivity/docs/messaging-api/managing-messages
- **Método:** WebFetch directo (HTTP 200)
- **Cita textual:** `GET https://supply-xml.booking.com/messaging/messages/latest` — "Every request
  retrieves a maximum of 100 messages", respuesta incluye `number_of_messages`; header `Accept-version`
  con valores `1.2`/`1.3` habilita campos extendidos (`message_type`, `attributes`, nombres de huésped,
  `is_redacted` para detección de phishing); confirmación: `PUT
  https://supply-xml.booking.com/messaging/messages?number_of_messages=N`; aviso explícito: "We are soon
  going to deprecate retrieving latest messages by using the `GET /messages/latest` endpoint" en favor de
  la "Connectivity Notification Service".
- **Alcance:** Contrato exacto del pull+confirm de mensajes entrantes.
- **Confianza:** Alta.
- **Laguna:** No documenta el reemplazo (Connectivity Notification Service) con el mismo detalle — no se
  implementó en esta rama por esa razón.

## F03 — Managing conversations (Booking.com Connectivity Messaging API)
- **URL:** https://developers.booking.com/connectivity/docs/messaging-api/managing-conversations
- **Método:** WebFetch directo (HTTP 200)
- **Cita textual:** `POST https://supply-xml.booking.com/messaging/properties/{property_id}/conversations/{conversation_id}`
  con body `{"message": {"content": "...", "attachment_ids": [...]}}`, respuesta `{"message_id",
  "guest_has_account", "ok"}`; `GET .../properties/{property_id}/conversations` (lista) y
  `.../conversations/{conversation_id}` (detalle); header `Accept-version` 1.2/1.3 para campos
  extendidos.
- **Alcance:** Contrato exacto de envío de mensaje a un huésped desde la propiedad.
- **Confianza:** Alta.

## F04 — Using the token-based authentication scheme (Booking.com Connectivity)
- **URL:** https://developers.booking.com/connectivity/docs/token-based-authentication
- **Método:** WebFetch directo (HTTP 200)
- **Cita textual:** `POST https://connectivity-authentication.booking.com/token-based-authentication/exchange`
  con body `{client_id, client_secret}` → respuesta `{jwt, ruid}`; "Authorization: Bearer {JWT}" en
  llamadas posteriores; "The token expires after one hour"; HTTP 401 al expirar, refrescar llamando de
  nuevo al mismo endpoint; límite "up to 30 tokens per hour" por cuenta de máquina.
- **Alcance:** Esquema de autenticación vigente para las Connectivity APIs.
- **Confianza:** Alta.

## F05 — Using the Credentials-based authentication scheme (Booking.com Connectivity)
- **URL:** https://developers.booking.com/connectivity/docs/basic-authentication
- **Método:** Snippet de WebSearch (no releído completo con WebFetch — solo se usó para confirmar la
  fecha de sunset ya circulando en agregadores)
- **Cita textual (vía snippet de búsqueda):** el esquema de credenciales (Basic Auth) tiene fecha de
  sunset anunciada 2025-12-31, recomendando migrar al esquema token-based.
- **Alcance:** Justifica por qué esta rama implementa SOLO el esquema token-based (F04), no Basic Auth.
- **Confianza:** Media (snippet de búsqueda, no releído completo con WebFetch esta sesión — pero
  consistente con que F04 describe el esquema "vigente" sin mencionar alternativa activa).

## F06 — Pre-reservation messaging (Booking.com Connectivity, Request to Book)
- **URL:** https://developers.booking.com/connectivity/docs/request-to-book/pre-reservation-messaging
- **Método:** WebFetch directo (HTTP 200)
- **Cita textual:** "communication between the partner and the guest during the request to book process,
  before the reservation is created"; "managed using the Messaging API, and not through the RtB API";
  requiere activar "Enable Messaging API RTB" en el Provider Portal; "Attachments—in any form—are not
  allowed"; "Sharing of contact information is not allowed"; "Tagging labels to RtB conversations and
  messages is disabled"; solo disponible para "guests who make a booking request book on an iOS device".
- **Alcance:** Confirma que la misma Messaging API cubre mensajería pre-reserva bajo un feature flag
  separado, con restricciones impuestas por la propia plataforma.
- **Confianza:** Alta.

## F07 — About the Booking.com Connectivity APIs (ya citado en RV04 F01, releído para confirmar vigencia)
- **URL:** https://developers.booking.com/connectivity/docs
- **Método:** referencia cruzada con `docs/fuentes/rv04-booking.md` F01/F02 (2026-09-05) — no releído con
  WebFetch en esta sesión, se cita la evidencia ya capturada.
- **Cita textual (ya en el ledger de RV04):** conexiones opcionales listadas incluyen "Guest messages";
  "Going live" (F02 de RV04) lista "Messaging API (PII, certificación)" junto a Reservations/Content/
  Rates & Availability como conexión que exige certificación explícita.
- **Alcance:** Evidencia de que la existencia de esta API ya estaba parcialmente documentada en este repo
  desde el 2026-09-05 (RV04), sin que RV10 (mensajería, mismo día) la conectara con su propio análisis.
- **Confianza:** Alta (fuente primaria, ya verificada en una investigación anterior de este mismo repo).

## F08 — Airbnb API access (agregador 2026, sin URL primaria de Airbnb nueva)
- **URL:** resumen agregado de WebSearch (elfsight.com/blog/how-to-get-and-use-airbnb-api..., y
  resultados relacionados de vorplabs.com/keysteward.co.uk) — no se identificó una página nueva de
  `airbnb.com/help` no cubierta ya por RV03.
- **Método:** WebSearch (resumen), no WebFetch de una única fuente primaria de Airbnb.
- **Cita textual (agregada):** "Access to Airbnb's API requires participation in an API Program and
  involves a mutual NDA... As of 2026, Airbnb does not offer public API access... does not accept new
  requests for API access... The Airbnb API exposes your inventory including listings, rates,
  availability, bookings, and messages to a certified partner channel manager."
- **Alcance:** Reconfirmación de que el estado de Airbnb no cambió respecto a RV03/RV10/RV22.
- **Confianza:** Media-baja (agregadores comerciales, no Airbnb mismo — mismo nivel de confianza que
  fuentes equivalentes ya aceptadas en RV10 para Booking/Vrbo).

## F09 — Vrbo support (Expedia Group Developer Hub) — fuente primaria NUEVA
- **URL:** https://developers.expediagroup.com/rapid/lodging/vacation-rentals/vrbo-support
- **Método:** WebFetch directo (HTTP 200)
- **Cita textual:** "Travelers can reach out to host on Vrbo.com"; "A2A or CDS support will not have
  visibility on the host and traveler communications via Vrbo.com"; "you can cancel a Vrbo booking
  through Affiliate Voyager but no other servicing features will be available for Vrbo bookings".
- **Alcance:** Confirma con fuente primaria (no citada antes en RV05/RV10/RV22) que la mensajería
  huésped-anfitrión de Vrbo es exclusiva de Vrbo.com, invisible para integraciones de partner de Expedia
  Group.
- **Confianza:** Alta.

## F10 — Booking Notification API / notifications (Expedia Group Developer Hub)
- **URL:**
  https://developers.expediagroup.com/supply/lodging/docs/booking_apis/booking_notification/getting_started/introduction/
  y https://developers.expediagroup.com/docs/products/rapid/lodging/notifications
- **Método:** WebSearch con snippets extensos + intento de WebFetch (la URL de introducción a messaging
  redirige a `connectivityportal.expediagroup.com`, portal que no se pudo confirmar como público o
  autenticado con certeza en esta sesión — se documenta el contenido vía los snippets de búsqueda, que
  incluyen la cita literal del payload).
- **Cita textual:** mutación `sendMessage`; notificación `MessageReceived` con payload de ejemplo
  `{"notification_id", "event_name": "MessageReceived", "payload": {"property_id", "message_thread_id",
  "message_id", "message_type": "FREE_TEXT", "from_role": "TRAVELER", "reservation_id"}}`;
  "Implementation of the messaging capability, notifications capability, and attachment service is
  mandatory".
- **Alcance:** Confirma que Expedia Group SÍ tiene una Messaging API real para su propia marca de
  hospedaje — usada aquí solo para CONTRASTAR con F09 (Vrbo NO la comparte), no para construir ningún
  cliente (Expedia no es uno de los tres canales de mensajería de este producto).
- **Confianza:** Media (contenido verificado por snippets de búsqueda extensos con cita literal, la
  página de introducción específica quedó detrás de un portal cuyo estado de acceso no se confirmó del
  todo — no se construyó ningún código contra esta API, así que el nivel de confianza es suficiente solo
  para la afirmación contrastiva de la sección (c) de RV23).

## F11 — Agoda developer portal — ausencia de API de mensajería
- **URL:** https://developer.agoda.com/supply/reference/where-to-start
- **Método:** WebFetch directo
- **Resultado:** lista YCS API, OTA API, Content Push API, Promotion API — ninguna mención de mensajería
  con huéspedes vía API.
- **Alcance:** Confirma ausencia de API pública de mensajería para Agoda (mencionada solo como
  comparación en el encargo, no es canal de este producto).
- **Confianza:** Alta (ausencia verificada por lectura directa de la página índice).

## F12 — Agoda YCS App — mensajería de huésped (panel web, no API)
- **URL:** https://partnerhub.agoda.com/ycs-app-messaging-guest-responding-to-review/
- **Método:** Snippet de WebSearch, no releído completo.
- **Cita textual (agregada):** función de mensajería dentro de la app/panel YCS para comunicarse con
  huéspedes y responder reseñas — requiere "Customer Messaging" activado.
- **Alcance:** Confirma que la única mensajería de Agoda documentada es de uso humano en su panel, no una
  API.
- **Confianza:** Media (snippet, no fuente primaria releída completa — suficiente para la afirmación
  acotada de "existe función de panel, no API").
