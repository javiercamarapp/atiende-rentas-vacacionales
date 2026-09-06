# Ledger de fuentes — RV03 Matriz de capacidades Airbnb

Fecha de consulta de todas las entradas: 2026-09-05.
Convención de confianza: alta (texto propio de Airbnb leído directamente y sin ambigüedad), media (texto propio de Airbnb pero fragmentario, resumido por herramienta de fetch, o requiere inferencia), baja (fuente secundaria/foro/agregador, o contenido no confirmado directamente).

---

### F01 — Sincronización de calendario cada 3 horas (no instantánea)
- **Título:** Sync your home host calendar to other websites
- **Editor:** Airbnb (Help Center, versión .co.uk)
- **URL:** https://www.airbnb.co.uk/help/article/99
- **Fecha publicada/actualizada:** no consta en el contenido extraído
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "Your Airbnb calendar automatically updates every 3 hours and pulls in information from the other calendars you've connected."
- **Alcance:** confirma que la importación de calendarios externos hacia Airbnb NO es instantánea; ocurre en ciclos de ~3 horas. También: "If you've connected multiple calendars, they may automatically update at different times" — es decir, cada feed importado puede tener su propio ciclo, no sincronizado entre sí.
- **Confianza:** alta (documentación oficial, cita directa).
- **Laguna:** no se confirmó si existe un botón "Refresh" manual para forzar sincronización inmediata dentro de esta misma sesión con acceso directo al texto oficial (una búsqueda secundaria lo menciona, ver F02); no se verificó la versión en español ni si el intervalo es idéntico en todas las regiones/idiomas.

### F02 — Botón de actualización manual y ejemplo de causa del retraso (fuente secundaria, no verificada directamente)
- **Título:** (agregado de búsqueda, no artículo único)
- **Editor:** resultado de WebSearch (contenido de terceros/foros, no verificado con fetch directo a texto oficial)
- **URL:** no aplica (snippet de búsqueda)
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "To check your latest availability sooner than 3 hours, you can go to your connected calendar and select Refresh."
- **Alcance:** posible función de refresco manual; **no confirmado leyendo la página oficial directamente en esta sesión**.
- **Confianza:** baja.
- **Laguna:** requiere verificación directa en help center; no usar como afirmación de producto sin re-confirmar.

### F03 — Contenido del calendario exportado por Airbnb (qué incluye el feed)
- **Título:** Sync your home host calendar to other websites
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.co.uk/help/article/99
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "Your Airbnb calendar will include nights that are blocked for your availability settings, preparation time, advance notice and minimum stays." Y: "when a night is booked on one calendar, it'll automatically block on the other – keeping your schedule up to date."
- **Alcance:** el feed exportado de Airbnb incluye reservas y bloqueos derivados de reglas de disponibilidad (preparación, anticipación, estancia mínima), no solo reservas confirmadas.
- **Confianza:** alta.
- **Laguna:** no se confirmó explícitamente si el feed iCal exportado incluye datos de huésped (nombre, contacto) o tarifas/precios; ver F04 para el lado de importación (no se transfieren datos de huésped en la dirección Airbnb-importa-de-otros). No hay evidencia directa sobre exportación de tarifas.

### F04 — Ventana de 2 años confirmada; NO transferencia de datos de huésped NO CONFIRMADA (corrección C2, re-releído 2026-09-05)
- **Título:** Sync your home host calendar to other websites
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/99 y https://www.airbnb.co.uk/help/article/99 (ambas versiones releídas directamente el 2026-09-05, con prompt dirigido específicamente a buscar mención de huésped/PII/identidad)
- **Fecha de consulta original:** 2026-09-05. **Fecha de re-verificación:** 2026-09-05 (auditoría independiente + corrección directa).
- **Cita textual confirmada verbatim:** "We import up to 2 years of data." Esta es la ÚNICA oración relacionada con el alcance de los datos importados encontrada en ambas versiones de la página.
- **Hallazgo de la re-verificación:** tras dos búsquedas dirigidas explícitamente a "guest information", "PII", "identity", "personal information" en el contenido completo de ambas páginas, **no se encontró ninguna mención a datos de huésped, identidad o información personal**. La afirmación "Airbnb no transfiere datos de huésped al importar calendarios externos" — presente en 5 lugares de la versión previa de `RV03-airbnb-capacidades.md` — no tiene respaldo verbatim en esta fuente. "We import up to 2 years of data" se interpreta más razonablemente como antigüedad/rango temporal de las reservas/bloqueos importados, no como una declaración de política de privacidad.
- **Alcance:** al importar un iCal externo hacia Airbnb, se confirma la ventana de 2 años; la exclusión de identidad del huésped/tarifas del feed importado queda **NO CONFIRMADA**, no como hecho verificado.
- **Confianza:** alta en cuanto a "no se encontró tal afirmación en la fuente" (verificación negativa dirigida, dos fetches independientes); nula respecto a la afirmación de no-transferencia en sí (no se puede confirmar ni descartar solo con esta fuente).
- **Laguna:** requiere inspección directa de un feed `.ics` real exportado por un canal externo e importado a una cuenta de prueba de Airbnb para determinar empíricamente qué campos trae el `VEVENT` resultante (SUMMARY/DESCRIPTION pueden contener texto libre del canal origen). Hasta entonces, tratar cualquier campo de texto libre como PII potencial no saneada (ver RV19-R-06/R-07).

### F05 — Airbnb API Terms: programas, scopes, requisitos de aprobación
- **Título:** API Terms of Service
- **Editor:** Airbnb (Help Center / legal)
- **URL:** https://www.airbnb.com/help/article/3418
- **Fecha publicada/actualizada:** "Last Updated: October 15, 2025" (según extracción de la página)
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "Your organization will have access to Scopes that are appropriate to the API Program in which your organization participates." Programas mencionados: "connections to property management, channel management, operations management, connected device, and hospitality providers; the Preferred Software Partner Program; and activity and tour booking management software."
- **Alcance:** confirma que el acceso a "Scopes" (permisos de API) depende del Programa específico; NO se listan los nombres exactos de scopes individuales (p. ej. no aparece literalmente "listings", "reservations", "messaging", "pricing", "availability" como identificadores de scope en el texto revisado).
- **Confianza:** alta en la estructura general (programa → scopes variables); baja/sin evidencia en cuanto a nombres literales de scopes.
- **Laguna:** el listado detallado y literal de scopes por programa no está en este artículo (posiblemente vive en documentación técnica de developer.withairbnb.com detrás de acceso de partner aprobado, no accesible públicamente en esta sesión).

### F06 — Requisitos de aprobación/certificación de programas API
- **Título:** API Terms of Service
- **Editor:** Airbnb
- **URL:** https://www.airbnb.com/help/article/3418
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "signing Airbnb's standard mutual nondisclosure agreement"; "agreeing to these API Terms"; "signing any relevant Partner Specific Terms"; "successfully completing Airbnb's data security review"; "implementing all mandatory API features within 6 months"
- **Alcance:** condiciones contractuales/administrativas para participar en un Programa API. Es documentación de términos contractuales, no técnica.
- **Confianza:** alta.
- **Laguna:** no se detalla el proceso de "certificación" técnica (pruebas, sandbox, checklist) en este documento legal; ver F09 para lo que sí se vio en developer.withairbnb.com.

### F07 — Autoridad de cuenta y consentimiento
- **Título:** API Terms of Service
- **Editor:** Airbnb
- **URL:** https://www.airbnb.com/help/article/3418
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "Each individual who acts on behalf of your organization with respect to the API must also register for and maintain in good standing an Airbnb Account." También exige proveer "a free end-user account and log-in information for... your products or services" para revisión de Airbnb.
- **Alcance:** cada persona que actúa en nombre de la organización partner necesita cuenta propia en buen estado; se exige una cuenta demo para revisión. No es evidencia directa de "consentimiento del anfitrión" para conectar su cuenta (mecanismo OAuth de autorización por host no confirmado textualmente en esta sesión).
- **Confianza:** media — cubre autoridad de cuenta del partner, pero el consentimiento explícito del host conectando su propia cuenta vía OAuth no se confirmó con cita textual directa.
- **Laguna:** falta evidencia textual directa sobre el flujo de autorización/consentimiento del host (OAuth) hacia una app partner.

### F08 — Restricciones de uso de la API
- **Título:** API Terms of Service (vía síntesis de búsqueda, con apoyo del fetch directo)
- **Editor:** Airbnb
- **URL:** https://www.airbnb.com/help/article/3418
- **Fecha de consulta:** 2026-09-05
- **Cita/paráfrasis (de WebSearch, no verificado con cita literal en el fetch directo de esta sesión):** prohibición de usar APIs no documentadas, de ceder scopes/acceso a terceros sin permiso, de "crawling", de reempaquetar contenido o generar estadísticas comparativas de toda la plataforma, y de procesar pagos relacionados con Airbnb sin autorización expresa.
- **Alcance:** términos contractuales sobre límites de uso.
- **Confianza:** media (proviene de un resumen de búsqueda sobre el mismo documento oficial, no de una cita verbatim confirmada en el fetch directo); se recomienda re-verificación antes de citar textualmente en documentos externos.
- **Laguna:** no se obtuvo cita literal exacta línea por línea.

### F09 — Portal de desarrolladores: estructura pública vs acceso de partner
- **Título:** Airbnb Developer Platform (Homes API / Activities API)
- **Editor:** Airbnb
- **URL:** https://developer.withairbnb.com/ (developer.airbnb.com redirige aquí, 301)
- **Fecha de consulta:** 2026-09-05
- **Hallazgo (resumen de fetch, no cita verbatim exacta capturada):** la página describe "Homes API" (gestión de listados, sincronización de disponibilidad durante reserva, gestión de reservas) y "Activities API" (contenido de actividades, verificación de disponibilidad, Messages API con "QR codes for tickets" y comunicación con huéspedes). Se referencian "Partner Portal", "API Explorer", "Sandbox V2", "enumeraciones válidas" y "changelog", además de "Error Dashboard" — indicando acceso completo restringido a partners autenticados/aprobados.
- **Alcance:** confirma la EXISTENCIA de un entorno sandbox ("Sandbox V2") y de documentación técnica estructurada, pero el contenido detallado (endpoints, payloads, scopes exactos) está detrás de aprobación de partner, no accesible públicamente en esta sesión.
- **Confianza:** media (la estructura general de la página se confirmó, pero no se leyeron los documentos técnicos internos; herramienta de fetch resumió, no citó verbatim).
- **Laguna:** no se pudo confirmar el detalle de scopes exactos, límites de tasa (rate limits), ni especificación completa de webhooks desde una fuente primaria pública accesible; ver F10 (laguna sobre webhooks).

### F10 — Webhooks de Airbnb (NO confirmado con fuente primaria)
- **Título:** (resultados de búsqueda de terceros: apis.io, apievangelist.com, agregadores)
- **Editor:** terceros, NO Airbnb
- **URL:** https://apis.io/asyncapis/airbnb/airbnb-webhooks-asyncapi/ y similares (apis.apievangelist.com)
- **Fecha de consulta:** 2026-09-05
- **Cita/paráfrasis:** afirman que existe una "Airbnb Webhooks API" con eventos de reservas, mensajes, reseñas, calendario, entregados vía HTTP POST con verificación por firma y reintentos si no hay 200 OK.
- **Alcance:** **NO VERIFICADO EN FUENTE OFICIAL DE AIRBNB.** Estos son sitios agregadores/catálogos de APIs de terceros que documentan APIs de forma independiente y podrían estar desactualizados, ser especulativos o incorrectos.
- **Confianza:** baja — se registra como LAGUNA, no como hecho confirmado.
- **Laguna:** no se pudo confirmar la existencia, estructura ni cobertura de eventos de webhooks directamente en developer.withairbnb.com dentro de esta sesión (contenido técnico requiere acceso de partner aprobado). NO usar esta información para prometer soporte de webhooks en requisitos de producto sin validación adicional con acceso de partner real.

### F11 — Ecosistema de software partners
- **Título:** Software partners (Airbnb)
- **Editor:** Airbnb
- **URL:** https://www.airbnb.com/software-partners
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** describe partners que "synchronizes availability, rates, rules and listing content"; mensajería con "automate guest messaging"; gestión "full booking lifecycle from distribution to accounting"; conexión a "multiple booking platforms" / "online travel agents"; categoría "Preferred+" definida como "Airbnb's top performing software partners" que "provide the requisite functionality and software connections that meet or exceed all our technical and performance benchmarks."
- **Alcance:** página de marketing/ecosistema, no documentación técnica ni contractual. Confirma la existencia de niveles de partner (Preferred+) pero no detalla criterios técnicos exactos de certificación.
- **Confianza:** alta en cuanto a existencia de categorías y descripción funcional general; es contenido de MARKETING, no técnico ni contractual — debe tratarse como tal.
- **Laguna:** no se detallan criterios cuantitativos de certificación (SLA, tasa de error, latencia) para alcanzar el nivel Preferred+.

### F12 — Permisos de co-anfitrión (niveles de acceso)
- **Título:** Co-Host Additional Terms of Service
- **Editor:** Airbnb (Help Center / legal)
- **URL:** https://www.airbnb.com/help/article/3264
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "Full Access Co-Hosts have full access to the Host's messages, calendar, and transaction history, as well as the ability to manage the Listing and other Co-Hosts." Sobre gestión de otros co-hosts: "adding, removing, and changing permissions of other Co-Hosts." Sobre reclamos por daños: autorizado "to act as its agent for submitting, managing, and resolving any requests to Guests seeking compensation for a Damage Claim."
- **Alcance:** define el nivel "Full Access"; el host determina el nivel de permiso otorgado ("consistent with the level of permission granted").
- **Confianza:** alta (documento contractual propio de Airbnb).
- **Laguna:** este documento no detalla explícitamente los niveles intermedios (Calendar & Messaging / Calendar only) — ver F13 para esos niveles, confirmados en otro artículo del Help Center.

### F13 — Niveles de permiso de co-anfitrión (tres niveles)
- **Título:** (artículo de Help Center sobre roles de co-anfitrión)
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/1534
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** Full Access: "Message with guests and update your calendar"; "Manage your listing, including pricing and other details." Calendar & Messaging Access: "Message with guests and view but not edit the calendar." Calendar Access: "View but not edit the calendar." Y: "Only listing owners can set up or edit a co-host's payouts."
- **Alcance:** confirma tres niveles de permiso diferenciados de co-anfitrión y que solo el propietario del anuncio controla los pagos del co-anfitrión.
- **Confianza:** alta.
- **Laguna (CERRADA 2026-09-05, corrección C3):** ~~disponibilidad geográfica... no se confirmó si España está incluida~~. Releído directamente el artículo 3472 (no este mismo art. 1534) el 2026-09-05: lista completa confirmada — "The Co-Host Network is currently available in Australia, France, Germany, Italy, Japan, Mexico, Puerto Rico, South Korea, Spain, and the United Kingdom (powered by Airbnb Global Services); Canada, the United States (powered by Airbnb Living LLC); and Brazil (powered by Airbnb Plataforma Digital Ltda)." **España SÍ está incluida.** Ver entrada F13-bis abajo y `RV03-airbnb-capacidades.md` §4/§7/§8.

### F13-bis — Co-Host Network: lista completa de países confirmada, incluida España (corrección C3)
- **Título:** Find a co-host on the Co-Host Network
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/3472
- **Fecha de consulta:** 2026-09-05 (re-verificación dirigida específicamente a listar países y confirmar/descartar España)
- **Cita textual:** "The Co-Host Network is currently available in Australia, France, Germany, Italy, Japan, Mexico, Puerto Rico, South Korea, Spain, and the United Kingdom (powered by Airbnb Global Services); Canada, the United States (powered by Airbnb Living LLC); and Brazil (powered by Airbnb Plataforma Digital Ltda)."
- **Alcance:** resuelve la contradicción documentada entre RV01 (que ya tenía esta lista correcta) y la versión previa de RV03 (que decía "no confirmado"). España está confirmada.
- **Confianza:** alta (lectura directa dirigida a esta pregunta específica).
- **Laguna:** ninguna sobre el hecho en sí; la lista es una decisión de producto de Airbnb que puede cambiar sin aviso — re-verificar antes de campañas comerciales de largo plazo.

### F14 — Pagos a co-anfitriones
- **Título:** How co-host payouts work
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/3389
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "Only the host who is the listing owner can set up payouts for a co-host." Opciones: "Cleaning fee," "Cleaning fee plus percentage," "Percentage payouts," "Fixed amount payouts." Tiempo: "both host and co-host payouts will be sent by the end of the business day after the guest's scheduled check-in date." Confirmación: "the co-host has 14 days to confirm or decline."
- **Alcance:** mecanismo de reparto de pagos entre host y co-host; el co-host NO fija sus propios pagos.
- **Confianza:** alta.
- **Laguna:** ninguna relevante detectada.

### F15 — Reglas de disponibilidad: estancia mín/máx, anticipación, preparación
- **Título:** Customize booking settings
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/484
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "Set your minimum and maximum trip length"; si no se define, "a 31-night maximum will automatically be applied." Opciones de anticipación: "Same day (with a cut-off time)", "At least 1 day", "At least 2 days", "At least 3 days", "At least 7 days" — mismas opciones aplican a tiempo de preparación entre reservas: "set the following advance notice and preparation time between reservations, and we'll automatically block these days on your calendar."
- **Alcance:** confirma reglas configurables de disponibilidad que generan bloqueos automáticos de calendario.
- **Confianza:** alta.
- **Laguna:** no se confirmó el límite máximo de tiempo de preparación en días (ver F16, evidencia parcial/no verbatim).

### F16 — Tiempo de preparación / turnover — detalle incompleto
- **Título:** (artículo sobre preparation time) / (artículo 3612 sobre reglas de disponibilidad, referencia cruzada a artículo 2923)
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/3612 ; https://www.airbnb.com/help/article/2923
- **Fecha de consulta:** 2026-09-05
- **Cita textual (art. 3612):** "Your calendar will automatically block nights to fit your listing's availability settings such as availability window, minimum nights, preparation time, advance notice, and restricted check-in or checkout days." **Cita textual (art. 2923):** "Click Availability, then click Preparation time" / "Choose an option and click Save" / ejemplo de uso: "you may require a 48-hour window between guests for enhanced cleaning."
- **Alcance:** confirma que existe la función y que puede llegar al menos a 48 horas de ejemplo, pero NO se obtuvo el límite máximo exacto ni si aplica de forma distinta antes/después de la reserva.
- **Confianza:** media-baja para el límite máximo (afirmaciones de "máximo 2 días" encontradas solo en fuentes de terceros/blogs, NO confirmadas en el Help Center oficial en esta sesión).
- **Laguna:** LÍMITE MÁXIMO EXACTO DE PREPARACIÓN NO CONFIRMADO EN FUENTE PRIMARIA. No usar "máximo 2 días" como hecho de producto sin re-verificación directa.

### F17 — Bloqueos no editables por el host (reservas via calendario sincronizado)
- **Título:** Updating your host calendar
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/447
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "As a host, you can unblock any nights on your calendar—except for reservations you canceled, nights reserved through linked or synced calendars, or nights that are blocked for legal/regulatory reasons." También: "available nights on the calendar are white and blocked nights have a line through the date."
- **Alcance:** CONFIRMA que las noches bloqueadas por sincronización de calendario externo (iCal importado) NO pueden ser desbloqueadas manualmente por el host desde Airbnb — deben gestionarse desde el sistema origen.
- **Confianza:** alta.
- **Laguna:** no se confirmó el rango de meses de apertura de calendario (3/6/9/12/24) con cita directa (esa cifra provino de un snippet de búsqueda, no de fetch verbatim de este artículo).

### F18 — Cancelación por host: bloqueo de calendario y penalización económica
- **Título:** Host Cancellation Policy for homes
- **Editor:** Airbnb (Help Center / política)
- **URL:** https://www.airbnb.com/help/article/990
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "If a host cancels a confirmed reservation, or if the host is found to be responsible for a cancellation under this Policy, we will impose fees subject to a minimum cancellation fee of $50 USD." Escala: "canceled 48 hours or less before check-in, or after check-in" → 50% de las noches no alojadas; "between 48 hours and 30 days before check-in" → 25%; "more than 30 days before check-in" → 10%. Sobre calendario: "other consequences may apply, such as preventing the host from accepting another reservation for the Listing on the affected dates by blocking the Listing's calendar."
- **Alcance:** CONFIRMA explícitamente que Airbnb puede bloquear el calendario del host en las fechas afectadas tras una cancelación de host, además de imponer penalización monetaria — es una política oficial, con implicación directa para RV03/RV (nunca cancelar reservas confirmadas sin autorización, dado el costo).
- **Confianza:** alta.
- **Laguna:** no se confirmó la duración exacta del bloqueo de calendario post-cancelación (¿solo esas fechas, o periodo adicional?).

### F19 — Cancelación por huésped: liberación inmediata del calendario
- **Título:** (resultado de búsqueda sobre política de cancelación, no verificado con fetch directo de cita verbatim)
- **Editor:** presumiblemente Airbnb Help Center (a través de síntesis de WebSearch)
- **URL:** no confirmada con fetch directo en esta sesión (aparece asociado a artículos como /help/article/169 o /help/topic, no verificado individualmente)
- **Fecha de consulta:** 2026-09-05
- **Cita/paráfrasis:** "if your guest cancels, the platform will unblock the dates on your calendar right away so you're available to get another booking."
- **Alcance:** sugiere que cancelaciones de huésped liberan el calendario de inmediato, a diferencia de cancelaciones de host.
- **Confianza:** baja-media — no se verificó con fetch directo de cita verbatim en el artículo fuente exacto.
- **Laguna:** requiere verificación directa antes de usarse como hecho firme de producto.

### F20 — Cambio de fechas de reserva (alteration request / trip change request)
- **Título:** Change the dates of your home reservation
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/article/913
- **Fecha de consulta:** 2026-09-05
- **Cita textual:** "If you need to change the dates of a confirmed home reservation, you can submit a trip change request to your host." "Once you send the request, your host will receive a notification to approve or decline your request." "Modifying the dates of your reservation may alter the total cost of your trip, depending on your host's pricing." "If the host declines your trip change request, or doesn't respond, your reservation will stay the same."
- **Alcance:** confirma el flujo de aprobación/rechazo por el host para cambios de fecha; requiere acción explícita del host (no es automático).
- **Confianza:** alta.
- **Laguna:** el artículo NO detalla cómo se refleja el cambio en el calendario del host mientras la solicitud está pendiente (¿se bloquean ambas fechas, las originales y las nuevas, simultáneamente?) — sin evidencia.

### F21 — Herramientas de hosting profesional / multi-calendario
- **Título:** Managing multiple listings (topic overview)
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.com/help/topic/1561/managing-multiple-listings
- **Fecha de consulta:** 2026-09-05
- **Cita textual (parafraseada por la herramienta de extracción, revisar verbatim antes de citar externamente):** "Hosts with multiple listings can manage them with professional hosting tools, including multi-calendar, rule-sets, and tasks." Los rule-sets aplicados "override existing pricing and availability settings you've set for those dates."
- **Alcance:** confirma existencia de multi-calendario y "rule-sets" que pueden sobrescribir configuraciones de precio/disponibilidad por fecha, a nivel de múltiples anuncios.
- **Confianza:** media (resumen de página, no cita verbatim completa confirmada).
- **Laguna:** no se confirmó si "hosting teams" (equipos con múltiples usuarios operando sobre las mismas cuentas/anuncios) es un concepto distinto de "co-anfitriones", ni sus reglas de permisos específicas — no se encontró documentación oficial diferenciada de "equipos" separada del sistema de co-anfitriones.

### F22 — Ausencia de límites explícitos en número de calendarios importados
- **Título:** Sync your home host calendar to other websites
- **Editor:** Airbnb (Help Center)
- **URL:** https://www.airbnb.co.uk/help/article/99
- **Fecha de consulta:** 2026-09-05
- **Hallazgo:** no se encontró, en el texto extraído, ninguna cifra máxima de calendarios externos conectables por anuncio.
- **Alcance:** LAGUNA — ausencia de evidencia no equivale a "sin límite"; podría no estar documentado públicamente o requerir revisión manual de la interfaz real.
- **Confianza:** no aplica (laguna).
- **Laguna:** confirmar límite (si existe) accediendo a la interfaz de host real, no solo documentación.

---

## Resumen de lagunas críticas (no inventar sobre estos puntos)
1. Nombres literales exactos de "scopes" de API (listings/reservations/messaging/pricing/availability) — no confirmados en fuente pública.
2. Existencia y especificación exacta de webhooks — solo fuentes de terceros, no confirmado en developer.withairbnb.com público.
3. Flujo exacto de consentimiento OAuth del host hacia una app partner — no confirmado con cita textual.
4. Límite máximo de tiempo de preparación/turnover (días) — no confirmado en fuente primaria.
5. Duración exacta del bloqueo de calendario tras cancelación de host — no confirmado.
6. Si el feed iCal exportado por Airbnb incluye tarifas o datos de huésped — no confirmado (evidencia solo indica qué incluye en términos de bloqueos, no de tarifas/PII).
7. Diferencia formal entre "hosting teams" y "co-anfitriones" — no encontrada documentación separada.
8. Cobertura geográfica completa de la Co-Host Network (incluyendo si España está soportada).
9. Rango de meses de apertura de calendario (3/6/9/12/24) — visto solo en snippet de búsqueda, no verbatim confirmado.
10. Criterios cuantitativos de certificación "Preferred+" (SLA, latencia, tasa de error) — no publicados.
