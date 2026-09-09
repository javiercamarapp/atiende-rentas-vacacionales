# RV23 — Verificación 2026-09-09: ¿qué vía de mensajería API real existe HOY por canal?

> Investigación de fuentes primarias realizada el 2026-09-09 mediante WebSearch + WebFetch, en el marco
> de la auditoría de producción del mismo día (hallazgo: "el único adaptador real de mensajería es
> `SimuladorMensajeria` — ningún adaptador de canal declara capacidad de mensajería con cliente HTTP
> real"). Mismo criterio de evidencia que `RV10-mensajes-huesped.md`: `[DATO]` = leído literalmente en
> fuente primaria/oficial con WebFetch; `[R]` = fuente secundaria; `[E]` = estimación/decisión de
> producto sin fuente publicada. Ledger con URL, cita y confianza por fila:
> `docs/fuentes/rv23-mensajeria-api.md`.
>
> Este documento NO reemplaza `RV10-mensajes-huesped.md` (políticas de contenido/aprobación humana,
> límites de caracteres, prohibiciones de contacto — eso sigue vigente y sin cambios) — lo complementa
> respondiendo específicamente la pregunta que RV10 dejó como laguna: "¿existe una VÍA TÉCNICA (API) real
> y razonablemente accesible hoy, sin partnership especial, para automatizar el envío/recepción de
> mensajes con huéspedes en cada canal?".

## Resumen ejecutivo

**Booking.com es el único de los tres canales de mensajería de este producto (`CANALES_MENSAJERIA` =
airbnb/vrbo/booking, `packages/domain/src/mensajeria/tipos.ts`) con una Messaging API real, vigente y
completamente documentada públicamente HOY** — endpoints exactos, esquema de autenticación, versionado,
límites — bajo el MISMO programa de partner (Connectivity APIs) y el MISMO host (`supply-xml.booking.com`)
que este repo ya usa para disponibilidad/tarifas (`packages/adapters/src/booking/otaXml.ts`, RV04)
[DATO]. Esto NO significa que esté "accesible sin partnership especial": sigue exigiendo ser Connectivity
Partner de Booking.com, y ese programa sigue pausado a nuevos proveedores (D-011, ya documentado en este
repo) — la novedad verificada es que el **contrato técnico** es público y suficientemente detallado para
construir un cliente real contra él HOY, sin adivinar nada, exactamente como ya se hizo con OTA/B.XML.

**Airbnb sigue sin ninguna vía pública accesible.** Se reconfirma (fuente primaria + agregadores 2026)
que el API Program de Airbnb exige NDA mutuo + revisión de seguridad + certificación, **no acepta
solicitudes nuevas** y Airbnb mismo contacta a los prospectos — sin cambios respecto al esqueleto ya
existente (`packages/adapters/src/airbnb/apiAdapter.ts`) [DATO/R].

**Vrbo confirma, con una fuente primaria NUEVA que RV10/RV22 no tenían** (la página oficial de soporte
Vrbo del Expedia Group Developer Hub), que la mensajería huésped-anfitrión de Vrbo ocurre EXCLUSIVAMENTE
dentro de Vrbo.com y es explícitamente invisible para integraciones de terceros — incluida la propia
Messaging API de Expedia Group (que sí es pública y real, pero es para la marca Expedia/hoteles
tradicionales, NUNCA para propiedades Vrbo) [DATO]. El esqueleto ya existente
(`packages/adapters/src/vrbo/apiAdapter.ts`, `messaging: false`) queda confirmado como correcto, ahora con
mejor evidencia que antes.

**Agoda** (mencionada en el encargo como comparación) no tiene ninguna API pública de mensajería con
huéspedes en su documentación de developer (`developer.agoda.com`) — solo existe una función de mensajería
dentro del panel web YCS para uso humano directo del partner, sin contraparte de API [DATO por ausencia].
No se investigó a mayor profundidad por no ser uno de los tres canales de mensajería de este producto.

## Contenido

### (a) Booking.com — SÍ existe una Messaging API real, pública, del lado de Connectivity (propiedad/PMS)

Hallazgo clave: existen **dos familias de API de mensajería de Booking.com completamente distintas**, y
es fácil confundirlas en una búsqueda superficial:

1. **Demand API Messaging** (`developers.booking.com/demand/docs/messaging/...`) — para **Affiliate
   Partners de Demand API** (sitios que revenden inventario de Booking.com a viajeros, ej. una OTA de
   nicho), NO para quien administra la propiedad. En beta piloto, acceso restringido: *"This API is
   currently offered to a limited number of pilot affiliate partners"*, *"If you are not part of the
   pilot, you will not have access to this API collection"* [DATO]. **Irrelevante para este producto**
   (Atiende actúa del lado de la propiedad/PMS, nunca como afiliado revendedor).

2. **Connectivity Messaging API** (`developers.booking.com/connectivity/docs/messaging-api/...`) — para
   **Connectivity Partners** (PMS/channel managers que administran la propiedad), la MISMA categoría de
   partner que ya usa `packages/adapters/src/booking/otaXml.ts` (RV04) para disponibilidad/tarifas. Esta
   es la relevante para "mensajería nativa por canal". Contrato verificado por WebFetch directo:
   - Propósito explícito: *"designed for accommodation providers to communicate with guests"* [DATO].
   - Enviar un mensaje: `POST https://supply-xml.booking.com/messaging/properties/{property_id}/conversations/{conversation_id}`,
     body `{"message": {"content": "...", "attachment_ids": [...]}}` →
     `{"message_id", "guest_has_account", "ok"}` [DATO, `managing-conversations`].
   - Recibir (pull con reenvío hasta confirmar — mismo patrón "pull + ack" que Booking.com ya usa para
     reservas, RV04, y que Expedia usa para su Booking Retrieval): `GET
     https://supply-xml.booking.com/messaging/messages/latest` (header `Accept-version: 1.2` o `1.3`,
     hasta 100 mensajes + `number_of_messages`), confirmar con `PUT
     https://supply-xml.booking.com/messaging/messages?number_of_messages=N` [DATO, `managing-messages`].
     Booking.com ya anuncia el retiro futuro de este pull a favor de un "Connectivity Notification
     Service" tipo webhook — su contrato detallado NO se pudo confirmar con la misma fuente primaria en
     esta sesión, así que **no se implementa** (ver Lagunas).
   - Autenticación: el esquema histórico Basic/credential-based tiene fecha de sunset anunciada
     (2025-12-31, ya pasada a la fecha de esta investigación) — la vía vigente es
     **token-based**: `POST https://connectivity-authentication.booking.com/token-based-authentication/exchange`
     con `{client_id, client_secret}` → `{jwt, ruid}`; el JWT expira a la hora (`HTTP 401` al expirar,
     refrescar con la misma llamada); máximo 30 tokens/hora por cuenta de máquina [DATO,
     `token-based-authentication`].
   - Mensajería PRE-reserva (Request to Book): misma Messaging API, requiere activar "Enable Messaging
     API RTB" en el Provider Portal; la PLATAFORMA MISMA prohíbe adjuntos y compartir contacto en ese
     modo — más estricto aún que las reglas ya codificadas en este repo (`RV10-R-04`/`RV10-R-07`) [DATO,
     `pre-reservation-messaging`].
   - Requiere certificación explícita para ir a producción — el propio ledger de RV04
     (`docs/fuentes/rv04-booking.md`, F02, "Going live") YA había capturado esto el 2026-09-05 sin
     conectarlo con RV10: *"Messaging API (PII, certificación)"* aparece listada junto a Reservations/
     Content/Rates & Availability como una de las conexiones que exigen certificación explícita antes de
     producción [DATO — cruce con evidencia ya existente en este repo, no releída esta sesión].

**Implicación directa para este repo:** el Connectivity Partner Program de Booking.com sigue PAUSADO a
nuevos proveedores (D-011, ya documentado, reconfirmado 2026-09-06 en RV22 F03 — no se volvió a verificar
en esta sesión por no ser el objeto de esta investigación) — así que el estado honesto de conexión
(`obtenerEstadoConexion()`) del nuevo adaptador de mensajería sigue siendo **SIEMPRE `partner_pendiente`**,
exactamente igual que `BookingChannelAdapter` (disponibilidad/tarifas). Lo que cambia es que ahora existe
un CONTRATO PÚBLICO COMPLETO para construir el cliente real y probarlo de verdad contra un simulador fiel
— exactamente lo que se hizo en `packages/adapters/src/booking/mensajeria.ts` /
`packages/sim/src/booking-api/mensajeria.ts` de esta rama.

### (b) Airbnb — reconfirmado sin vía pública

- *"Access to Airbnb's API requires participation in an API Program and involves a mutual NDA, acceptance
  of the terms, any partner-specific terms, a successful data-security review, and implementation of
  mandatory API features within six months of release."* [R, agregador 2026, no es Airbnb mismo]
- *"As of 2026, Airbnb does not offer public API access... the service does not accept new requests for
  API access, and Airbnb team is now looking only for prospective partners and reaching out to the
  prospective partners themselves."* [R]
- *"The Airbnb API exposes your inventory including listings, rates, availability, bookings, and messages
  to a certified partner channel manager."* — confirma que mensajería SÍ es parte del programa (igual que
  ya declara `CAPACIDADES_AIRBNB_API.messaging = true` en `packages/adapters/src/airbnb/apiAdapter.ts`),
  pero el acceso al programa mismo sigue cerrado [R].
- No se encontró ninguna página nueva de `airbnb.com/help` con información adicional a la ya capturada en
  RV03/RV10 sobre esto — no se repite esa investigación aquí.
- **Sin cambios de código**: el esqueleto de `airbnb/apiAdapter.ts` (sin cliente HTTP, `messaging: true`
  declarado como capacidad del PROGRAMA pero sin vía de acceso) permanece intacto y correcto.

### (c) Vrbo — confirmado con fuente primaria nueva: la mensajería vive SOLO en Vrbo.com

- Fuente primaria nueva (no citada en RV05/RV10/RV22): *Expedia Group Developer Hub*, página de soporte
  específica de Vrbo — https://developers.expediagroup.com/rapid/lodging/vacation-rentals/vrbo-support
  — *"Travelers can reach out to host on Vrbo.com"* y, explícitamente, *"A2A or CDS support will not have
  visibility on the host and traveler communications via Vrbo.com"* [DATO] (A2A/CDS son los mecanismos de
  soporte/integración de Expedia Group para sus partners de contenido — la cita dice literalmente que esas
  vías de partner NO VEN la conversación huésped-anfitrión de Vrbo).
- La misma página limita explícitamente qué puede hacer un partner de Expedia Group con una reserva de
  Vrbo: *"you can cancel a Vrbo booking through Affiliate Voyager but no other servicing features will be
  available for Vrbo bookings"* [DATO] — mensajería no es una de las funciones disponibles.
- Por contraste, Expedia Group SÍ tiene una Messaging API real y pública para su propia marca de
  alojamiento (Property Management APIs, GraphQL "LSGQL"): mutación `sendMessage`, notificación webhook
  `MessageReceived` con payload real documentado (`property_id`, `message_thread_id`, `message_id`,
  `reservation_id`) [DATO,
  `developers.expediagroup.com/supply/lodging/docs/booking_apis/booking_notification/getting_started/introduction/`
  y páginas de referencia de notificaciones]. **Esta API existe y es real, pero es de la familia
  "Expedia Lodging Supply" — no aplica a propiedades Vrbo** (confirmado por la cita de arriba y ya
  consistente con lo que este repo tenía documentado: RV22 F13, "Vrbo NO comparte la misma superficie
  técnica de disponibilidad/reservas que Expedia" — la misma separación se extiende a mensajería).
- **Sin cambios de código**: `vrbo/apiAdapter.ts` (`messaging: false`, sin simulador "si la spec no es
  pública") permanece correcto — ahora con una fuente primaria explícita en vez de solo la ausencia de
  evidencia.

### (d) Agoda — mencionada en el encargo, sin vía de API pública encontrada

- `developer.agoda.com` (portal de developer de Agoda) lista para partners de supply: YCS API, OTA API,
  Content Push API, Promotion API — **ninguna documentación de una API de mensajería con huéspedes**
  [DATO por ausencia, WebFetch directo de `developer.agoda.com/supply/reference/where-to-start`].
- La única función de mensajería encontrada es un feature del panel web YCS ("YCS App – Messaging Guest &
  Responding to Review") — mensajería humana dentro del portal de partner, no una API [R,
  `partnerhub.agoda.com`].
- No se investigó más a fondo: Agoda no es uno de los tres canales de `CANALES_MENSAJERIA` de este
  producto (`packages/domain/src/mensajeria/tipos.ts`) — se documenta aquí solo porque el encargo pidió
  explícitamente revisarlo como comparación. No se construyó ningún adaptador para Agoda en esta rama.

## Riesgos/límites

1. **Cobertura de esta sesión es dirigida, no exhaustiva** — a diferencia de RV10 (que buscó agotar el
   tema de mensajería de forma amplia), esta investigación fue puntual: confirmar/negar la existencia de
   una vía técnica real por canal. No se releyeron las páginas de políticas de contenido/privacidad ya
   cubiertas por RV10 (siguen vigentes sin cambios).
2. **"Connectivity Notification Service" de Booking.com (reemplazo futuro del pull `/messages/latest`)
   NO se implementó** — su contrato público detallado no se pudo confirmar con la misma fuente primaria
   en esta sesión (solo se supo, por la propia documentación de `managing-messages`, que existe y que el
   pull actual "se va a deprecar"). El cliente de esta rama implementa el mecanismo de pull+confirm
   VIGENTE hoy, documentado con el mismo nivel de detalle que el resto del repo exige — no se inventa el
   contrato del webhook.
3. **Ninguna prueba de esta rama corrió contra Booking.com real** — el Connectivity Partner Program sigue
   pausado a nuevos proveedores (D-011); todo lo construido se probó contra
   `BookingMessagingApiSimulator` (`@atiende-rv/sim`), un simulador local fiel al contrato documentado,
   nunca contra la red real. Ver la cabecera de
   `packages/adapters/src/booking/mensajeria.ts` para la lista exacta de credenciales/pasos que hacen
   falta para la primera prueba real.
4. **El esquema de autenticación Basic/credential-based de Booking.com ya tiene fecha de sunset pasada**
   (2025-12-31) al momento de esta investigación (2026-09-09) — se implementó directamente el esquema
   token-based vigente, sin construir el esquema deprecado.

## Implicaciones para requisitos (complementa RV10, no lo reemplaza)

- **RV23-R-01**: El adaptador real de mensajería de Booking.com debe construirse contra la Connectivity
  Messaging API (`supply-xml.booking.com/messaging/*`), NUNCA contra la Demand API Messaging (esa es para
  afiliados revendedores, un rol de negocio distinto al de este producto). *(Fuente:
  `developers.booking.com/demand/docs/messaging/about-messaging` vs.
  `developers.booking.com/connectivity/docs/messaging-api/*`. [DATO])*
- **RV23-R-02**: El estado de conexión del adaptador de mensajería de Booking.com debe reportar
  `partner_pendiente` con el mismo criterio D-017 ya usado por `BookingChannelAdapter` — la existencia de
  un contrato público completo NO es evidencia de partner aprobado. *(Consistente con D-011/D-017 ya
  documentados en este repo.)*
- **RV23-R-03**: No debe implementarse ningún cliente de mensajería para Airbnb o Vrbo más allá del
  esqueleto ya existente — ninguna fuente primaria nueva encontrada en esta sesión cambia esa conclusión.
  *(Fuente: secciones (b) y (c) de este documento.)*
- **RV23-R-04**: Si en el futuro se implementa el reemplazo "Connectivity Notification Service" de
  Booking.com, debe investigarse su contrato con el mismo rigor de fuente primaria antes de escribir
  código — no debe inferirse del nombre ni de analogías con otros webhooks del repo.

## Lagunas

- Contrato detallado del "Connectivity Notification Service" de Booking.com (mencionado como reemplazo
  futuro del pull `/messages/latest`, sin URL de documentación propia localizada en esta sesión).
- No se confirmó con fuente primaria si Booking.com aplica algún mecanismo de idempotencia
  (`Idempotency-Key` o similar) al `POST .../conversations/{conversation_id}` de envío — por esa razón
  `BookingMessagingClient.enviarMensaje` NO reintenta automáticamente ante fallos ambiguos (ver
  comentario en el código).
- No se investigó Agoda más allá de confirmar la ausencia de API de mensajería pública — no es uno de los
  tres canales de este producto.
- No se reintentó leer `partner.booking.com`/`partnerhelp.booking.com` (bloqueados por 403 en RV10) — la
  investigación de esta sesión usó exclusivamente `developers.booking.com`, que sí fue accesible.

## Fuentes de este módulo

Fecha de consulta de todas las URLs: 2026-09-09. Ledger completo con cita textual y nivel de confianza por
fila: `docs/fuentes/rv23-mensajeria-api.md`.
