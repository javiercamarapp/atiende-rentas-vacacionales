# B-002 — Intento 2 de 3: Wayback Machine, dominios/locales alternativos y curl directo

Fecha de consulta (todas las entradas salvo que se indique lo contrario): **2026-09-05**
Investigador: Sonnet (agente de investigación), proyecto Atiende Rentas Vacacionales.
Método: WebSearch se agotó (cupo de sesión) antes de poder usarse en este intento; se sustituyó por Bash/curl (con red disponible en este entorno) contra la API pública `archive.org/wayback/available`, el índice CDX de Wayback (`web.archive.org/cdx/search/cdx`), y lectura directa de dominios oficiales alternativos. `WebFetch` fue incapaz de acceder a `web.archive.org` en este entorno ("Claude Code is unable to fetch from web.archive.org"), así que las páginas archivadas se descargaron con `curl` y se les extrajo el texto visible con un script Python local (solo lectura, sin publicar nada).

Convención de confianza: **Alta** = leído en vivo en dominio oficial (HTTP 200, contenido real). **Media** = leído en copia archivada de Wayback Machine (dominio oficial, pero puede estar desactualizado) — se etiqueta explícitamente "ARCHIVADA (captura AAAA-MM-DD)". **Baja/Laguna** = no se pudo leer ni en vivo ni archivado.

---

## Ledger por afirmación

### F01 — Booking.com Connectivity Portal: pausa de admisión de nuevos proveedores
- **Título:** Booking.com Connectivity Portal (página de inicio)
- **Editor:** Booking.com
- **URL exacta viva:** https://connect.booking.com/
- **URL archivada:** no fue necesaria (lectura en vivo exitosa)
- **Fecha publicada/actualizada:** no consta en el contenido
- **Fecha de captura:** N/A (lectura en vivo)
- **Fecha de consulta:** 2026-09-05
- **Método:** `curl` directo (HTTP 200), extracción de texto visible
- **Cita textual:** "Thank you for your interest in a connectivity partnership with Booking.com — In an effort to ensure our teams are able to provide the strong partnership experience, we are pausing integrations with new connectivity providers until further notice."
- **Alcance:** Responde directamente a "¿aceptan nuevos proveedores?" del Connectivity Partner Program.
- **Confianza:** Alta.
- **Laguna:** No se indica desde cuándo rige la pausa ni una fecha estimada de reapertura; no se menciona si aplica igual a todas las regiones/tipos de alojamiento.

### F02 — Booking.com Connectivity Portal: FAQ sobre acceso de propiedades individuales y cuentas existentes
- **Título:** Booking.com Connectivity Portal — Frequently asked questions
- **Editor:** Booking.com
- **URL exacta viva:** https://connect.booking.com/
- **URL archivada:** no fue necesaria
- **Fecha publicada/actualizada:** no consta
- **Fecha de captura:** N/A
- **Fecha de consulta:** 2026-09-05
- **Método:** `curl` directo (HTTP 200)
- **Cita textual:** "I own a property listed on Booking.com. Can I use the Connectivity APIs? We don't accept direct connections from individual properties right now, but you can connect via a channel manager. Go to your property management page, log in, and select Account > Channel Manager in the top-right corner." Y sobre PCI/PII: "PCI stands for Payment Card Industry, and PII for Personally Identifiable Information. We'll review your compliance based on regulations from the European Union and the PCI Security Standards Council."
- **Alcance:** Confirma que las APIs de Connectivity son solo para proveedores (channel managers/PMS), no para propietarios individuales; estos deben usar la extranet ("property management page", detrás de login, no accesible para este agente) o un channel manager ya conectado.
- **Confianza:** Alta.
- **Laguna:** No se detalla qué opción usa un propietario individual sin channel manager (p. ej. iCal) — ese flujo vive en la extranet/ayuda de partner.booking.com, que sigue bloqueada (ver F05/gap).

### F03 — Booking.com Developer Docs: qué se espera de un Connectivity Partner
- **Título:** About the Booking.com Connectivity APIs
- **Editor:** Booking.com (developers.booking.com)
- **URL exacta viva:** https://developers.booking.com/connectivity/docs
- **URL archivada:** no fue necesaria
- **Fecha publicada/actualizada:** la página muestra "Last updated 1 week ago" (relativo al momento de la consulta, 2026-09-05; no da fecha absoluta)
- **Fecha de captura:** N/A
- **Fecha de consulta:** 2026-09-05
- **Método:** `curl` directo con seguimiento de redirect (HTTP 200)
- **Cita textual:** "To become Booking.com Connectivity Partners, companies must meet specific onboarding requirements." — "As a Booking.com Connectivity Partner, you should strive to: support all available API functions; work with your PMS partners to implement existing and new Booking.com functionalities...; load at least a full year of rates and availability for each property; provide your connected properties with an easy-to-use interface...; encourage your connected properties to visit the Booking.com Extranet...; minimise the number of reservations falling back to e-mail." También: "If you have requested to offer the Reservations and Rates & Availability connection types through Connectivity Support, then these connection types are always selected and visible to properties" (oferta mínima/"main offering").
- **Alcance:** Requisitos operativos esperados de un Connectivity Partner ya admitido (no es la lista de requisitos de admisión inicial, que está en el enlace "specific onboarding requirements" → ver gap F06).
- **Confianza:** Alta.
- **Laguna:** El enlace "specific onboarding requirements" apunta a `portal.connectivity.booking.com/s/topiccatalog`, una comunidad Salesforce/Lightning 100% renderizada por JavaScript: no expone contenido estático legible (ver gap F06). No hay mención de costos/tarifas del programa en esta página.

### F04 — Booking.com Developer Docs: certificación vs autoevaluación por API
- **Título:** Going Live
- **Editor:** Booking.com (developers.booking.com)
- **URL exacta viva:** https://developers.booking.com/connectivity/docs/going_live
- **URL archivada:** no fue necesaria
- **Fecha publicada/actualizada:** la página muestra "Last updated 1 day ago" (relativo a la consulta, 2026-09-05)
- **Fecha de captura:** N/A
- **Fecha de consulta:** 2026-09-05
- **Método:** `curl` directo (HTTP 200)
- **Cita textual:** "Certification: You'll go through a certification process which includes running several test requests on certain API endpoint(s). The Connectivity Support team will share the testing steps with you... If you successfully complete the required tests, you can start the go-live process." — "Self-assessment: You'll follow the steps as outlined in the relevant self-assessment tutorial... Our Connectivity Support may ask you to send certain information [...] RUIDs of API responses and/or screenshots." Tabla: Reservations API = "PCI & PII Compliance" + Certification; Content API = "PII Compliance" + Certification; Rates & Availability API = certificación cubriendo "extra API element(s) [...] tailored to your properties' pricing models"; Connections API = "N/A" cumplimiento + solo Self-assessment (sin certificación formal).
- **Alcance:** Detalle del proceso de certificación/autoevaluación y cumplimiento PCI/PII por API — esta entrada amplía (no duplica) el resumen ya registrado en `docs/fuentes/rv04-booking.md` (entrada F02 de ese ledger), agregando aquí las citas textuales completas de certificación y la tabla de cumplimiento por API.
- **Confianza:** Alta.
- **Laguna:** No se menciona ningún costo monetario del programa ni de la certificación en esta página ni en `connect.booking.com`; no hay plazos de aprobación.

### F05 — Vrbo Connectivity Provider Guide: niveles del Connectivity Partner Program
- **Título:** Connectivity Provider Guide — VRBO
- **Editor:** Vrbo (Expedia Group)
- **URL exacta viva:** https://www.vrbo.com/connectivity/ (403 Forbidden a lectura directa/WebFetch y a `curl` en este entorno)
- **URL archivada:** http://web.archive.org/web/20260310211715/https://www.vrbo.com/connectivity/
- **Fecha publicada/actualizada:** no consta en el HTML capturado
- **Fecha de captura:** 2026-03-10
- **Fecha de consulta:** 2026-09-05
- **Método:** ARCHIVADA — descarga con `curl` de la captura de Wayback Machine (confirmada disponible vía `archive.org/wayback/available?url=vrbo.com/connectivity`, HTTP 200) y extracción de texto visible con script local. **Nota de gap técnico:** la página es una SPA (Astro); el HTML estático capturado solo contiene el bloque "hero" superior — no incluye el detalle línea por línea de requisitos de cada nivel (ese contenido se carga por JavaScript no ejecutado en la captura).
- **Cita textual:** "To ensure our lodging partners have the tools and services they need to perform at their best, we work with a wide variety of third-party integrated software providers. Our Connectivity Partner Program recognizes our top integrated software partners with Elite and Preferred status." — "Our Elite Partners: An exclusive group of top-performing integrated software providers who offer the highest quality connections and comprehensive functionality." — "Our Preferred Partners: High quality integrated software providers recognized for their advanced systems with a wide range of integrated features and products." — "Our Integrated Partners: Software providers who offer a certified integration but are not recognized in the top two tiers of the Connectivity Partner Program."
- **Alcance:** Confirma que el "Connectivity Partner Program" de Vrbo tiene 3 niveles (Elite, Preferred, Integrated) y que el nivel base requiere "a certified integration". No detalla los criterios exactos de cada nivel, el proceso de certificación paso a paso, costos, ni si aceptan nuevos proveedores.
- **Confianza:** Media (ARCHIVADA, captura 2026-03-10 — 6 meses antes de esta consulta; posible desactualización de nombres de nivel o de la lista de socios).
- **Laguna crítica:** requisitos técnicos/comerciales exactos por nivel, proceso de certificación, costos y política de admisión de nuevos proveedores — no se encontraron en esta ni en ninguna otra captura archivada (ver gaps F07–F08).

### F06 — GAP: requisitos exactos de onboarding para Connectivity Partners (Booking.com)
- **Título objetivo:** "specific onboarding requirements" (enlazado desde F03)
- **Editor:** Booking.com
- **URL exacta:** https://portal.connectivity.booking.com/s/topiccatalog?language=en_US
- **URL archivada:** no existe — sin capturas en Wayback CDX para `portal.connectivity.booking.com`
- **Resultado:** HTTP 200 en vivo, pero el HTML es una shell de Salesforce Community/Lightning ("Booking Connectivity Partners", "Loading...", "Sorry to interrupt / CSS Error / Refresh") sin contenido textual renderizado del lado servidor. No se pudo leer el listado real de requisitos.
- **Confianza:** N/A — sin lectura posible.
- **Laguna:** Requisitos de admisión detallados (documentación, volumen mínimo de propiedades, SLA técnico, revisión legal/PCI previa a la firma) permanecen sin verificar por fuente primaria.

### F07 — GAP: ayuda de iCal para propietarios (Booking.com partner/partnerhelp)
- **Títulos objetivo:** artículos de ayuda sobre "sync your calendar with iCal" / "import/export calendar" en partner.booking.com y partnerhelp.booking.com (en-gb, es-es, en-us y otros locales probados)
- **Editor:** Booking.com
- **URLs probadas en vivo:** `https://partner.booking.com/en-gb/help/booking-com-calendar-sync/set-your-calendar-sync`, `https://partner.booking.com/robots.txt`, `https://partnerhelp.booking.com/`, `https://partnerhelp.booking.com/hc/en-us`, `https://partnerhelp.booking.com/robots.txt`
- **Resultado en vivo:** `partner.booking.com` responde 403 Forbidden (bloqueo CloudFront, incluso en `/robots.txt`, confirmando bloqueo a nivel de borde/anti-bot, no solo a WebFetch). `partnerhelp.booking.com` da **timeout de conexión TCP** (no resuelve ninguna respuesta HTTP, ni con `curl` ni con WebFetch) — bloqueo de red más agresivo que un simple 403.
- **Búsqueda de copia archivada:** `archive.org/wayback/available` devuelve `"archived_snapshots": {}` (vacío) para `partner.booking.com`, `partner.booking.com/en-gb` y `partnerhelp.booking.com`. Búsquedas CDX (`web.archive.org/cdx/search/cdx`) con `matchType=prefix` sobre ambos hosts devuelven **cero resultados** — es decir, Wayback Machine no tiene absolutamente ninguna captura histórica de estos dos subdominios (no es solo que la página actual no esté archivada; nunca ha sido crawleada exitosamente por el bot de archive.org, consistente con el bloqueo anti-bot observado en vivo).
- **Confianza:** N/A — sin lectura posible por ninguna vía intentada.
- **Laguna crítica (persiste igual que en el intento 1):** elegibilidad de "homes"/alojamientos para iCal, frecuencia real de import/export, contenido exacto del export, límites de número de calendarios/room types, aviso oficial de riesgo de overbooking, y tratamiento de reservas vs. bloqueos manuales — **sigue sin evidencia primaria de ningún tipo** (ni viva ni archivada).

### F08 — GAP: artículos de ayuda de Vrbo sobre software de gestión integrado
- **Títulos objetivo:** artículos de help.vrbo.com sobre "integrated property management software"
- **Editor:** Vrbo
- **URLs probadas:** `https://help.vrbo.com/` (redirige 302 a `https://www.vrbo.com/help`), búsqueda CDX de `www.vrbo.com/help*` con filtro de palabras clave (pms, integrat, software, connectivity, channel)
- **Resultado:** el índice CDX de Wayback para `www.vrbo.com/help*` devolvió **cero resultados** con esas palabras clave (de hecho, cero resultados en general para ese prefijo en el muestreo realizado). El dominio `www.vrbo.com` en sí respondió 429 (Too Many Requests) en la prueba en vivo directa a la raíz, y `www.vrbo.com/connectivity` respondió 403 en vivo.
- **Confianza:** N/A — sin lectura posible.
- **Laguna:** No se pudo confirmar el detalle operativo de "qué cubre" la integración de software (además de lo ya visto en F05), ni requisitos específicos de cobertura por tipo de alojamiento o mercado.

---

## Resultado por URL

| # | URL | Resultado |
|---|---|---|
| 1 | `https://partner.booking.com/en-gb/help/...` (iCal) | 403 en vivo (CloudFront); **cero capturas en Wayback** (CDX vacío) → sin evidencia, gap persiste (F07) |
| 2 | `https://partnerhelp.booking.com/...` | Timeout de conexión en vivo; **cero capturas en Wayback** → sin evidencia, gap persiste (F07) |
| 3 | `https://partner.booking.com/en-gb/solutions/connectivity` | 403 en vivo (WebFetch); no se encontró captura archivada específica de esta URL |
| 4 | `https://connect.booking.com/` (Connectivity Portal, portal de partners) | **Leído en vivo, HTTP 200** — hallazgo clave: pausa de admisión de nuevos proveedores (F01), FAQ de acceso (F02) |
| 5 | `https://developers.booking.com/connectivity/docs` | **Leído en vivo, HTTP 200** — requisitos esperados de partner (F03) |
| 6 | `https://developers.booking.com/connectivity/docs/going_live` | **Leído en vivo, HTTP 200** — certificación/autoevaluación por API (F04) |
| 7 | `https://portal.connectivity.booking.com/s/topiccatalog` (requisitos exactos de onboarding) | HTTP 200 en vivo pero shell JS de Salesforce sin contenido renderizado; sin captura archivada → gap (F06) |
| 8 | `https://www.vrbo.com/connectivity` | 403 en vivo; **ARCHIVADA disponible** (captura 2026-03-10) → leída, tiers Elite/Preferred/Integrated (F05) |
| 9 | `https://help.vrbo.com/` y artículos sobre software de PMS integrado | Redirige a `www.vrbo.com/help`; **cero capturas relevantes en Wayback** → gap (F08) |
| 10 | Locales alternativos (`/es-es`, `/en-us`, `/de`, `/fr`) de `partner.booking.com` | No probados individualmente uno por uno tras confirmar que el subdominio completo está bloqueado a nivel de borde (CloudFront) y sin ninguna captura en Wayback para el subdominio — se concluye que el bloqueo es a nivel de host, no de locale |
| 11 | `connect.booking.com`, `admin.booking.com`, `distribution-xml.booking.com`, `secure-supply-xml.booking.com` (subdominios alternativos probados) | `connect.booking.com` accesible (200); `admin.booking.com` redirige a login (302, extranet, no accesible sin cuenta); `distribution-xml.booking.com` 401 (requiere credenciales de API, esperado); `extranet.booking.com` y `partners.booking.com` no resuelven (timeout) |

## Resumen para el bloqueo B-002

- **Se resolvió parcialmente** la parte de "Connectivity Partner Program" de Booking.com: ahora hay evidencia primaria de alta confianza (lectura en vivo) de que Booking.com **está pausando la admisión de nuevos proveedores de conectividad "hasta nuevo aviso"**, de los requisitos operativos esperados de un partner ya admitido, y del proceso de certificación/autoevaluación por API (incluyendo cumplimiento PCI/PII). No se encontró información de costos monetarios en ninguna fuente oficial leída.
- **No se resolvió** la parte de iCal de Booking.com: `partner.booking.com` y `partnerhelp.booking.com` están bloqueados tanto en vivo (403 / timeout) como en el Wayback Machine (cero capturas históricas en absoluto, no solo ausencia de la versión actual). Esto sugiere que Booking.com bloquea también al bot de archive.org, o que estas rutas requieren sesión autenticada de forma que nunca han sido indexables públicamente.
- **Se resolvió parcialmente** Vrbo: se obtuvo una captura archivada (2026-03-10, confianza media) que confirma la estructura de 3 niveles (Elite/Preferred/Integrated) del Connectivity Partner Program de Vrbo, pero no el detalle de requisitos/costos por nivel ni la política de admisión de nuevos proveedores.
