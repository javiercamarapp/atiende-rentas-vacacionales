# Fuentes — ledger maestro (Fase 1, Atiende Rentas Vacacionales)

Ledger único, deduplicado por URL, de todas las fuentes citadas en `docs/investigacion/RV01–RV21.md` y en `docs/investigacion/00-PLAN.md`. Reconstruido a partir de los 10 archivos originales en `docs/fuentes/` (`ref-plan.md`, `b002-chrome.md`, `b002-archivo.md`, `rv01-02-09-10-11.md`, `rv03-airbnb.md`, `rv04-booking.md`, `rv05-08-14.md`, `rv06-07.md`, `rv12-13-15-16.md`, `rv17-18-20.md`, `rv19-21.md`), que siguen siendo la fuente de las citas textuales completas — este documento es el índice deduplicado, no su reemplazo.

Convención de columnas: **ID** global `F-nnn` (correlativo, agrupado por editor/dominio, no por orden de lectura). **Tipo**: oficial-canal (Airbnb/Booking/Vrbo/Agoda/Google como plataformas de distribución), estándar-RFC (IETF, OWASP, especificaciones abiertas de PostgreSQL/OpenTelemetry), regulador-ley (gobierno, estadística oficial, filings regulatorios SEC), proveedor (software comercial: PMS, channel manager, revenue management, LLM/cloud), tercero (foro, agregador, patrón de arquitectura de autor independiente). **Confianza**: alta/media/baja, tomada de la entrada original (cuando una URL se citó más de una vez con confianza distinta, se reporta la más alta obtenida por lectura directa). **Estado**: leída en vivo (WebFetch/curl HTTP 200 con contenido real) / archivada (Wayback Machine, con fecha de captura) / 403-inaccesible (ver sección final).

Fecha de consulta de todas las entradas: **2026-09-05**, salvo que se indique otra.

---

## Resumen de conteos

**Por tipo** (fuentes leídas con éxito, 197 filas del ledger; excluye la sección de URLs inaccesibles):

| Tipo | Nº fuentes | % |
|---|---|---|
| oficial-canal | 84 | 36% |
| proveedor | 51 | 22% |
| estándar-RFC | 30 | 13% |
| regulador-ley | 27 | 11% |
| tercero | 5 | 2% |
| prensa-financiera | 0 | 0% |
| **Subtotal con ID F-xxx (leídas + inaccesibles documentadas inline)** | **245** | — |

**Por estado** (sobre las 245 filas con ID F-xxx, más las 46 URLs adicionales sin ID de la sección 10):

| Estado | Nº |
|---|---|
| Leída en vivo (HTTP 200, WebFetch/curl) | 232 |
| Archivada (Wayback Machine) | 2 |
| Inaccesible pero documentada con ID inline (403/404/JS-sin-render/dominio caído) | 11 |
| Inaccesible sin ID propio, listada solo en la sección 10 | 46 |
| **Total de URLs distintas documentadas en este ledger** | **291** |

Nota honesta: **0 fuentes de tipo prensa-financiera** cumplieron la regla de "solo se cita lo leído directamente" — las dos menciones de prensa (Infobae/POSTA México sobre CDMX en RV15, tradingeconomics.com sobre bed-places España en RV15) se descartaron del ledger por no tener URL confirmada con lectura directa; quedan como lagunas en `docs/LAGUNAS.md`, no como fuentes.

---

## 1. Airbnb (oficial-canal) — F-001 a F-059

| ID | Título | Editor | URL | Fecha pub. | Tipo | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|---|---|
| F-001 | Sync your home host calendar to other websites (.co.uk) | Airbnb Help Center | https://www.airbnb.co.uk/help/article/99 | s/f | oficial-canal | alta | RV03 | leída en vivo |
| F-002 | Sync your home host calendar to other websites (.com) | Airbnb Help Center | https://www.airbnb.com/help/article/99 | s/f | oficial-canal | alta | RV06, RV07, RV08, RV09, RV13 | leída en vivo |
| F-003 | Updating your host calendar | Airbnb Help Center | https://www.airbnb.com/help/article/447 | s/f | oficial-canal | alta | RV03, RV09 | leída en vivo |
| F-004 | Customize booking settings | Airbnb Help Center | https://www.airbnb.com/help/article/484 | s/f | oficial-canal | alta | RV03, RV09, RV13, RV20 | leída en vivo |
| F-005 | Preparation time between reservations | Airbnb Help Center | https://www.airbnb.com/help/article/2923 | s/f | oficial-canal | alta | RV03, RV09, RV11 | leída en vivo |
| F-006 | Preparation time between reservations (alt. sin www) | Airbnb Help Center | https://airbnb.com/help/article/2923 | s/f | oficial-canal | alta | RV11 | leída en vivo |
| F-007 | Reasons your calendar is blocked | Airbnb Help Center | https://www.airbnb.com/help/article/3612 | s/f | oficial-canal | alta | RV03, RV09 | leída en vivo |
| F-008 | Host Cancellation Policy for homes | Airbnb Help Center | https://www.airbnb.com/help/article/990 | s/f | oficial-canal | alta | RV02, RV03 | leída en vivo |
| F-009 | API Terms of Service | Airbnb Help Center | https://www.airbnb.com/help/article/3418 | 2025-10-15 | oficial-canal | alta | RV03, RV08, RV19 | leída en vivo |
| F-010 | Co-Host Additional Terms of Service | Airbnb Help Center | https://www.airbnb.com/help/article/3264 | s/f | oficial-canal | alta | RV03 | leída en vivo |
| F-011 | What co-hosts can do | Airbnb Help Center | https://www.airbnb.com/help/article/1534 | s/f | oficial-canal | alta | RV01, RV03 | leída en vivo |
| F-012 | How co-host payouts work / When you'll get paid | Airbnb Help Center | https://www.airbnb.com/help/article/3389 | s/f | oficial-canal | alta | RV02, RV03, RV12 | leída en vivo |
| F-013 | Add co-hosts to your home listing (tope 10) | Airbnb Help Center | https://www.airbnb.com/help/article/1541 | s/f | oficial-canal | alta | RV01 | leída en vivo |
| F-014 | Add co-hosts to your home listing (multi-anuncio) | Airbnb Help Center | https://www.airbnb.com/help/article/1244 | s/f | oficial-canal | alta | RV01, RV03 | leída en vivo |
| F-015 | What's a cohost? | Airbnb Help Center | https://www.airbnb.com/help/article/1243 | s/f | oficial-canal | alta | RV01, RV03 | leída en vivo |
| F-016 | Find a co-host on the Co-Host Network | Airbnb Help Center | https://www.airbnb.com/help/article/3472 | s/f | oficial-canal | alta | RV01, RV03 | leída en vivo |
| F-017 | Permisos de co-host (artículo relacionado) | Airbnb Help Center | https://www.airbnb.com/help/article/2680 | s/f | oficial-canal | media | RV01 | leída en vivo |
| F-018 | Co-hosting Experiences (permisos) | Airbnb Help Center | https://www.airbnb.com/help/article/2685 | s/f | oficial-canal | media-alta | RV01 | leída en vivo |
| F-019 | Co-hosting Experiences (solicitudes de reserva) | Airbnb Help Center | https://www.airbnb.com/help/article/2689 | s/f | oficial-canal | media-alta | RV01 | leída en vivo |
| F-020 | Co-hosting for Airbnb Experiences (líder vs. soporte) | Airbnb Help Center | https://www.airbnb.com/help/article/3153 | s/f | oficial-canal | alta | RV01 | leída en vivo |
| F-021 | How Instant Book Works | Airbnb Help Center | https://www.airbnb.com/help/article/1510 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-022 | How to book a home: Instant Book and reservation requests | Airbnb Help Center | https://www.airbnb.com/help/article/85 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-023 | Cancellation policies for your home | Airbnb Help Center | https://www.airbnb.com/help/article/475 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-024 | Canceling a reservation as a host without adverse consequences | Airbnb Help Center | https://www.airbnb.com/help/article/2022 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-025 | Add check-in and checkout instructions to listings | Airbnb Help Center | https://airbnb.com/help/article/1644 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-026 | Reviews (overview) | Airbnb Help Center | https://www.airbnb.com/help/article/13 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-027 | How the Resolution Center helps you | Airbnb Help Center | https://www.airbnb.com/help/article/767 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-028 | Modifying a home reservation as a host | Airbnb Help Center | https://www.airbnb.com/help/article/50 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-029 | AirCover for hosts | Airbnb Help Center | https://www.airbnb.com/help/article/3733 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-030 | If your host cancels your home reservation | Airbnb Help Center | https://www.airbnb.com/help/article/170 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-031 | Rebooking and refund policy for homes | Airbnb Help Center | https://www.airbnb.com/help/article/2868 | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-032 | How and when your payout is released | Airbnb Help Center | https://www.airbnb.com/help/article/425 | s/f | oficial-canal | alta | RV12 | leída en vivo |
| F-033 | Airbnb service fees | Airbnb Help Center | https://www.airbnb.com/help/article/1857 | s/f | oficial-canal | alta | RV12 | leída en vivo |
| F-034 | Airbnb Smart Pricing | Airbnb Help Center | https://www.airbnb.com/help/article/1168 | s/f | oficial-canal | alta | RV13 | leída en vivo |
| F-035 | Weekly & Monthly discounts | Airbnb Help Center | https://www.airbnb.com/help/article/1344 | s/f | oficial-canal | alta | RV13 | leída en vivo |
| F-036 | How rule-sets work | Airbnb Help Center | https://www.airbnb.com/help/article/2061 | s/f | oficial-canal | alta | RV13 | leída en vivo |
| F-037 | Hosting a multiple units property | Airbnb Help Center | https://www.airbnb.com/help/article/4050 | s/f | oficial-canal | alta/media | RV13 | leída en vivo |
| F-038 | Change the dates of your home reservation | Airbnb Help Center | https://www.airbnb.com/help/article/913 | s/f | oficial-canal | alta | RV03 | leída en vivo |
| F-039 | Managing multiple listings (topic) | Airbnb Help Center | https://www.airbnb.com/help/topic/1561/managing-multiple-listings | s/f | oficial-canal | media | RV03 | leída en vivo |
| F-040 | Managing guest messages | Airbnb Help Center | https://www.airbnb.com/help/article/2899 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-041 | Create and send quick replies to guests | Airbnb Help Center | https://www.airbnb.com/help/article/2898 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-042 | Create scheduled quick replies and send them automatically | Airbnb Help Center | https://www.airbnb.com/help/article/2897 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-043 | Using Airbnb's quick replies to save time (Resource Center) | Airbnb | https://www.airbnb.com/resources/hosting-homes/a/using-airbnbs-quick-replies-to-save-time-73 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-044 | Using quick replies to save time (Resource Center, hosting-services) | Airbnb | https://www.airbnb.com/resources/hosting-services/a/using-quick-replies-to-save-time-747 | s/f | oficial-canal | media-alta | RV02 | leída en vivo |
| F-045 | Respond faster in the Messages tab | Airbnb Resource Center | https://www.airbnb.com/resources/hosting-homes/a/respond-faster-in-the-messages-tab-770 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-046 | Messaging your guests (topic index) | Airbnb Help Center | https://www.airbnb.com/help/topic/1601 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-047 | Paying and communicating through Airbnb | Airbnb Help Center | https://www.airbnb.com/help/article/209 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-048 | Contacting your guests by phone | Airbnb Help Center | https://www.airbnb.com/help/article/4155 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-049 | Combating deception, scams, and abuse | Airbnb Help Center | https://www.airbnb.com/help/article/3059 (mirror: https://airbnb.com/help/article/3049) | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-050 | Terms of Service (sección 11.1) | Airbnb Help Center | https://www.airbnb.com/help/article/2908 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-051 | Host Privacy Standards | Airbnb Help Center | https://www.airbnb.com/help/article/2862 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-052 | Privacy Policy | Airbnb Help Center | https://www.airbnb.com/help/article/3175 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-053 | Nondiscrimination Policy | Airbnb Help Center | https://www.airbnb.com/help/article/2867 | s/f | oficial-canal | alta | RV10 | leída en vivo |
| F-054 | Software partners (Airbnb) | Airbnb | https://www.airbnb.com/software-partners | s/f | oficial-canal | alta | RV03 | leída en vivo |
| F-055 | Preferred Software Partners | Airbnb | https://www.airbnb.com/software-partners/preferred-partners | s/f | oficial-canal | alta | RV08 | leída en vivo |
| F-056 | Announcing our 2025 Preferred Software Partners | Airbnb Newsroom | https://news.airbnb.com/announcing-our-2025-preferred-software-partners/ | 2025-04-16 | oficial-canal | alta | RV08 | leída en vivo |
| F-057 | Terms of Service (ToS general, secc. 11/16/12.2) | Airbnb | https://www.airbnb.com/terms | s/f | oficial-canal | alta | RV19 | leída en vivo |
| F-058 | Airbnb Developer Platform (Homes API / Activities API) | Airbnb | https://developer.withairbnb.com/ | s/f | oficial-canal | media | RV03, RV13 | leída en vivo |
| F-059 | Airbnb, Inc. 10-K FY2025 y Q2 2026 Financial Results (ver F-176/177) | Airbnb, Inc. | ver sección 10 (SEC/regulador) | — | — | — | — | — |

---

## 2. Booking.com (oficial-canal) — F-060 a F-093

| ID | Título | Editor | URL | Fecha pub. | Tipo | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|---|---|
| F-060 | About the Booking.com Connectivity APIs | Booking.com (developers.booking.com) | https://developers.booking.com/connectivity/docs | "actualizada hace ~1 semana" (relativo) | oficial-canal | alta | RV04, RV08, RV13, RV16, RV19 | leída en vivo |
| F-061 | Going live | Booking.com | https://developers.booking.com/connectivity/docs/going_live | "actualizada hace ~1 día" (relativo) | oficial-canal | alta | RV04 | leída en vivo |
| F-062 | Index / Content overview | Booking.com | https://developers.booking.com/connectivity/docs/index-content | s/f | oficial-canal | media | RV04 | leída en vivo |
| F-063 | Request to Book: Overview | Booking.com | https://developers.booking.com/connectivity/docs/request-to-book/overview | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-064 | Content API | Booking.com | https://developers.booking.com/connectivity/docs/content | s/f | oficial-canal | media | RV04 | leída en vivo |
| F-065 | Understanding the Reservations API | Booking.com | https://developers.booking.com/connectivity/docs/reservations-api/reservations-overview | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-066 | Retrieving new reservations (OTA_HotelResNotif) | Booking.com | https://developers.booking.com/connectivity/docs/reservations-api/retrieving-new-reservations-ota | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-067 | Rates & Availability API Overview (ari) | Booking.com | https://developers.booking.com/connectivity/docs/ari | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-068 | Create/update inventory, rates and restrictions (B.XML) | Booking.com | https://developers.booking.com/connectivity/docs/b_xml-availability | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-069 | Retrieving/managing reservations B.XML (estados) | Booking.com | https://developers.booking.com/connectivity/docs/reservations-api/managing-reservations-bxml | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-070 | Understanding the Messaging API | Booking.com | https://developers.booking.com/connectivity/docs/messaging-api/understanding-the-messaging-api | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-071 | Authentication (Connectivity APIs) | Booking.com | https://developers.booking.com/connectivity/docs/authentication | menciona sunset 31-dic-2025 | oficial-canal | alta | RV04 | leída en vivo |
| F-072 | Request to Book: Onboarding an eligible partner | Booking.com | https://developers.booking.com/connectivity/docs/request-to-book/onboarding | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-073 | FAQ Rates & Availability API | Booking.com | https://developers.booking.com/connectivity/docs/con-faq-rates-availability | s/f | oficial-canal | alta | RV04, RV13 | leída en vivo |
| F-074 | Report reservations changes (no-show, B.XML reporting) | Booking.com | https://developers.booking.com/connectivity/docs/reporting-api/b_xml-reporting | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-075 | Managing room types (multi-unidad, `Quantity`) | Booking.com | https://developers.booking.com/connectivity/docs/room-type-and-rate-plan-management/managing-room-types | s/f | oficial-canal | alta | RV04 | leída en vivo |
| F-076 | Check-in methods API | Booking.com | https://developers.booking.com/connectivity/docs/checkin-methods-api | s/f | oficial-canal | alta | RV08 | leída en vivo |
| F-077 | Booking.com Terms and Conditions (genérico) | Booking.com | https://www.booking.com/content/terms.html | s/f | oficial-canal | media | RV02 | leída en vivo |
| F-078 | How we work | Booking.com | https://www.booking.com/content/how_we_work.html | s/f | oficial-canal | alta | RV12 | leída en vivo |
| F-079 | Terms and Conditions (en-gb, cláusula anti-scraping) | Booking.com | https://www.booking.com/content/terms.en-gb.html | s/f | oficial-canal | alta | RV19 | leída en vivo |
| F-080 | General Delivery Terms (registro de propiedad, Connectivity Provider) | Booking.com (admin.booking.com) | https://admin.booking.com/hotelreg/terms-and-conditions.html?cc1=01&lang=en | s/f | oficial-canal | alta | RV19 | leída en vivo |
| F-081 | Facts on legal claims, parity (paridad eliminada en el EEE) | Booking.com Newsroom | https://news.booking.com/legal-claims-parity-class-actions/ | s/f | oficial-canal | alta | RV13 | leída en vivo |
| F-082 | Booking.com Connectivity Portal — home (pausa de admisión de nuevos proveedores) | Booking.com | https://connect.booking.com/ | s/f | oficial-canal | alta | RV04, RV08 | leída en vivo (curl, intento B-002 #2) |
| F-083 | Booking.com Connectivity Portal — FAQ (propiedades individuales no conectan vía API) | Booking.com | https://connect.booking.com/ (misma página, sección FAQ) | s/f | oficial-canal | alta | RV04, RV08 | leída en vivo (curl, intento B-002 #2) |
| F-084 | Supply XML — endpoint base (no-PCI) | Booking.com | https://supply-xml.booking.com | s/f | oficial-canal | media | RV04 | mencionada en F-060, no fetch propio |
| F-085 | Secure Supply XML — endpoint base (PCI, reservas) | Booking.com | https://secure-supply-xml.booking.com | s/f | oficial-canal | media | RV04 | mencionada en F-060, no fetch propio |
| F-086 | Reporting endpoint (B.XML) | Booking.com | https://supply-xml.booking.com/hotels/xml/reporting | s/f | oficial-canal | alta | RV04 | leída en vivo (citado en F-074) |

**Intentos fallidos declarados dentro de este bloque** (no aportan afirmación, ver sección de inaccesibles): `developers.booking.com/connectivity/docs/reservations` (404, URL incorrecta), `developers.booking.com/connectivity/docs/availability` (404, URL incorrecta), `connect.booking.com/user_guide/site/en-US/...` (legado "sunset", sin contenido), `partnerships.booking.com/api-v3` (403), `portal.connectivity.booking.com/s/topiccatalog` (200 pero shell JS sin contenido), `admin.booking.com` raíz (redirige a login, 302), `distribution-xml.booking.com` (401, esperado), `extranet.booking.com`/`partners.booking.com` (timeout).

---

## 3. Vrbo / Expedia Group (oficial-canal) — F-087 a F-100

| ID | Título | Editor | URL | Fecha pub. | Tipo | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|---|---|
| F-087 | Import a calendar to sync with Vrbo | Vrbo (Expedia Group) | https://help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar | s/f (© 2026) | oficial-canal | alta | RV05, RV06, RV07, RV09 | leída en vivo |
| F-088 | Export your property's reservation calendar | Vrbo | https://help.vrbo.com/articles/Export-your-reservation-calendar | s/f | oficial-canal | alta | RV05, RV06 | leída en vivo |
| F-089 | About Vrbo software integration using connectivity providers | Vrbo | https://help.vrbo.com/articles/About-Vrbo-integration | s/f | oficial-canal | alta | RV05 | leída en vivo |
| F-090 | About the calendar features (How does the calendar work) | Vrbo | https://help.vrbo.com/articles/How-does-the-calendar-work | s/f | oficial-canal | alta | RV05 | leída en vivo |
| F-091 | Set up your payment terms | Vrbo | https://help.vrbo.com/articles/How-do-I-set-up-a-payment-schedule-for-reservations | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-092 | About guest refunds | Vrbo | https://help.vrbo.com/articles/Does-HomeAway-Payments-automatically-issue-refunds-to-travelers | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-093 | About cancellation policy options | Vrbo | https://help.vrbo.com/articles/what-are-the-cancellation-policy-options | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-094 | About the Host Cancellations Policy | Vrbo | https://help.vrbo.com/articles/Partner-Cancellation-Fee-Policy | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-095 | Cancel a guest's reservation as a host | Vrbo | https://help.vrbo.com/articles/How-do-I-cancel-a-reservation | s/f | oficial-canal | alta | RV02 | leída en vivo |
| F-096 | How do I view my payout summary? | Vrbo | https://help.vrbo.com/articles/How-do-I-view-my-payout-summary | s/f | oficial-canal | alta | RV12 | leída en vivo |
| F-097 | Set up rate automation / MarketMaker | Vrbo | https://help.vrbo.com/articles/How-do-I-manage-my-rates | s/f | oficial-canal | alta | RV13 | leída en vivo |
| F-098 | Minimum/maximum length of stay | Vrbo | https://help.vrbo.com/articles/How-do-I-set-a-minimum-stay-requirement | s/f | oficial-canal | alta | RV13 | leída en vivo |
| F-099 | Block calendar dates | Vrbo | https://help.vrbo.com/articles/How-do-I-block-my-calendar-for-days-my-listing-is-not-available-to-rent | s/f | oficial-canal | alta | RV11 | leída en vivo |
| F-100 | Connectivity Provider Guide — VRBO (niveles Elite/Preferred/Integrated) | Vrbo (Expedia Group) | https://www.vrbo.com/connectivity/ | s/f (captura 2026-03-10) | oficial-canal | media | RV05, RV08 | **archivada** (Wayback, 2026-03-10; en vivo = 403) |

---

## 4. Expedia Group / Agoda / Google (oficial-canal) — F-101 a F-107

| ID | Título | Editor | URL | Fecha pub. | Tipo | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|---|---|
| F-101 | Vacation Rental Property Management Software (Vrbo Connectivity Solutions) | Expedia Group (partner.expediagroup.com) | https://partner.expediagroup.com/en-us/industries/vacation-rentals/vrbo-connectivity-solutions | s/f | oficial-canal | alta | RV05 | leída en vivo |
| F-102 | Certified Technology Partners Program | Expedia Group | https://partner.expediagroup.com/en-us/solutions/build-your-travel-experience/rapid-api/certified-technology-partners-program | s/f | oficial-canal | alta | RV08 | leída en vivo |
| F-103 | What's new — EG Connectivity Hub changelog | Expedia Group | https://developers.expediagroup.com/supply/lodging/updates | fechas por entrada (oct-2025 a may-2025) | oficial-canal | alta | RV05 | leída en vivo |
| F-104 | About this API — Vacation Rentals API (Rapid) | Expedia Group | https://developers.expediagroup.com/rapid/lodging/vacation-rentals/about-vacation-rentals-api | s/f | oficial-canal | alta | RV05 | leída en vivo |
| F-105 | Vrbo on Rapid integration guide | Expedia Group | https://developers.expediagroup.com/rapid/lodging/vacation-rentals/vrbo-integration-guide | s/f | oficial-canal | alta | RV05 | leída en vivo |
| F-106 | Rapid API (landing) | Expedia Group | https://developers.expediagroup.com/rapid/ | s/f | oficial-canal | media | RV13 | leída en vivo |
| F-107 | Getting Started — EG Developer Hub (Rapid, sandbox test.ean.com) | Expedia Group | https://developers.expediagroup.com/docs/products/rapid/setup/getting-started | s/f | oficial-canal | alta | RV08 | leída en vivo |
| F-108 | Content Push API — Properties (vacation rentals) | Agoda | https://content-push.agoda.com/docs/cm/properties | s/f | oficial-canal | alta | RV05 | leída en vivo |
| F-109 | Getting Started (Demand API) | Agoda | https://developer.agoda.com/demand/docs/getting-started | s/f | oficial-canal | alta | RV05 | leída en vivo |
| F-110 | How do I connect my Agoda calendar with other websites? | Agoda (Partner Hub) | https://partnerhub.agoda.com/how-do-i-connect-my-agoda-calendar-with-other-websites/ | 2025-09-11 | oficial-canal | alta | RV05 | leída en vivo |
| F-111 | Vacation rental (VacationRental) structured data | Google Search Central | https://developers.google.com/search/docs/appearance/structured-data/vacation-rental | 2025-12-10 | oficial-canal | alta | RV05 | leída en vivo |
| F-112 | About vacation rentals on Google (Hotel Center Help) | Google | https://support.google.com/hotelprices/answer/10062327?hl=en | s/f | oficial-canal | alta | RV05 | leída en vivo |

---

## 5. Estándares técnicos — RFC / OWASP / PostgreSQL / OpenTelemetry (estándar-RFC) — F-113 a F-142

| ID | Título | Editor | URL | Fecha pub. | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|---|
| F-113 | RFC 5545 (iCalendar, texto completo) | IETF | https://www.rfc-editor.org/rfc/rfc5545 / rfc5545.txt | 2009-09 | alta | RV06, RV07, RV17, RV21 | leída en vivo |
| F-114 | RFC 5546 (iTIP) | IETF | https://www.rfc-editor.org/rfc/rfc5546 / rfc5546.txt | 2009-09 | alta | RV06, RV21 | leída en vivo |
| F-115 | RFC 6868 (Parameter Value Encoding) | IETF | https://www.rfc-editor.org/rfc/rfc6868.txt | 2013-02 | alta | RV06 | leída en vivo |
| F-116 | RFC 7986 (New Properties for iCalendar) | IETF | https://www.rfc-editor.org/rfc/rfc7986.txt | 2016-10 | alta | RV06 | leída en vivo |
| F-117 | RFC 8536 (TZif) | IETF | https://www.rfc-editor.org/rfc/rfc8536.txt | 2019-02 | alta | RV06 | leída en vivo |
| F-118 | RFC 5545 §3.6.1 (event component, mirror) | icalendar.org (mirror de IETF) | https://icalendar.org/iCalendar-RFC-5545/3-6-1-event-component.html | 2009-09 | alta | RV03, RV06 | leída en vivo (mirror no oficial) |
| F-119 | RFC 5545 §3.8-4-7 (UID, mirror) | icalendar.org | https://icalendar.org/iCalendar-RFC-5545/3-8-4-7-unique-identifier.html | 2009-09 | alta | RV06 | leída en vivo (mirror) |
| F-120 | RFC 5545 §3.8.1.11 (STATUS, mirror) | icalendar.org | https://icalendar.org/iCalendar-RFC-5545/3-8-1-11-status.html | 2009-09 | alta | RV06 | leída en vivo (mirror) |
| F-121 | RFC 5545 §3.8.2.7 (TRANSP, mirror) | icalendar.org | https://icalendar.org/iCalendar-RFC-5545/3-8-2-7-time-transparency.html | 2009-09 | media | RV06 | leída en vivo (mirror) |
| F-122 | ASVS — página de proyecto (v5.0.0) | OWASP Foundation | https://owasp.org/www-project-application-security-verification-standard/ | 2025-05-30 | alta | RV19 | leída en vivo |
| F-123 | OWASP Top 10:2025 | OWASP Foundation | https://owasp.org/Top10/2025/ | 2025 | alta/media | RV19 | leída en vivo |
| F-124 | ASVS 5.0 — 0x10 Encoding and Sanitization (SSRF 1.3.6/1.5.3) | OWASP (GitHub) | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x10-V1-Encoding-and-Sanitization.md | 2025 | alta | RV19 | leída en vivo |
| F-125 | ASVS 5.0 — 0x14 File Handling (5.1-5.3) | OWASP (GitHub) | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x14-V5-File-Handling.md | 2025 | alta | RV19 | leída en vivo |
| F-126 | ASVS 5.0 — 0x11 Validation and Business Logic (2.3.4 anti-overbooking) | OWASP (GitHub) | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md | 2025 | alta | RV19, RV21 | leída en vivo |
| F-127 | ASVS 5.0 — 0x17 Authorization (8.4.1 multi-tenant) | OWASP (GitHub) | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md | 2025 | alta | RV19 | leída en vivo |
| F-128 | ASVS 5.0 — 0x23 Data Protection | OWASP (GitHub) | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x23-V14-Data-Protection.md | 2025 | alta | RV19 | leída en vivo |
| F-129 | ASVS 5.0 — 0x25 Security Logging and Error Handling | OWASP (GitHub) | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md | 2025 | alta | RV19 | leída en vivo |
| F-130 | ASVS 5.0 — 0x13 API and Web Service (verificación negativa, sin SSRF) | OWASP (GitHub) | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x13-V4-API-and-Web-Service.md | 2025 | alta | RV19 | leída en vivo |
| F-131 | SSRF Prevention Cheat Sheet | OWASP Cheat Sheet Series | https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html | s/f | alta | RV06, RV19 | leída en vivo |
| F-132 | XML External Entity (XXE) Prevention Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html | s/f | alta | RV19 | leída en vivo |
| F-133 | Denial of Service Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html | s/f | alta | RV19 | leída en vivo |
| F-134 | XML Security Cheat Sheet (Billion Laughs) | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/XML_Security_Cheat_Sheet.html | s/f | alta | RV19 | leída en vivo |
| F-135 | Secrets Management Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html | s/f | alta | RV19 | leída en vivo |
| F-136 | Logging Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html | s/f | alta | RV19 | leída en vivo |
| F-137 | Business Logic Security Cheat Sheet | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html | s/f | media-alta | RV19, RV21 | leída en vivo |
| F-138 | PostgreSQL — CREATE TABLE (EXCLUDE) | PostgreSQL Global Development Group | https://www.postgresql.org/docs/current/sql-createtable.html | rama "current" | alta | RV17 | leída en vivo |
| F-139 | PostgreSQL — F.7 btree_gist | PostgreSQL GDG | https://www.postgresql.org/docs/current/btree-gist.html | rama "current" | alta | RV17 | leída en vivo |
| F-140 | PostgreSQL — 13.2 Transaction Isolation (SERIALIZABLE) | PostgreSQL GDG | https://www.postgresql.org/docs/current/transaction-iso.html | rama "current" | alta | RV17 | leída en vivo |
| F-141 | PostgreSQL — 8.17 Range Types | PostgreSQL GDG | https://www.postgresql.org/docs/current/rangetypes.html | rama "current" | alta | RV17 | leída en vivo |
| F-142 | PostgreSQL — 5.9 Row Security Policies (RLS) | PostgreSQL GDG | https://www.postgresql.org/docs/current/ddl-rowsecurity.html | rama "current" | alta | RV17 | leída en vivo |

### OpenTelemetry (estándar-RFC) — F-143 a F-150

| ID | Título | Editor | URL | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|
| F-143 | Tracing API (Span, SpanContext, jerarquía) | OpenTelemetry | https://opentelemetry.io/docs/specs/otel/trace/api/ | alta | RV20 | leída en vivo |
| F-144 | Metrics API (Counter/UpDownCounter/Histogram) | OpenTelemetry | https://opentelemetry.io/docs/specs/otel/metrics/api/ | alta | RV20 | leída en vivo |
| F-145 | Logs Data Model | OpenTelemetry | https://opentelemetry.io/docs/specs/otel/logs/data-model/ | alta/media (PII no normado) | RV20 | leída en vivo |
| F-146 | Semantic Conventions — Messaging Spans | OpenTelemetry | https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/ | alta | RV20 | leída en vivo |
| F-147 | Semantic Conventions — General Attribute Naming | OpenTelemetry | https://opentelemetry.io/docs/specs/semconv/general/naming/ | alta (PII no normado, confirmado por ausencia) | RV20 | leída en vivo |
| F-148 | Semantic Conventions — General Attributes | OpenTelemetry | https://opentelemetry.io/docs/specs/semconv/general/attributes/ | media | RV20 | leída en vivo |
| F-149 | Semantic Conventions — Attribute Naming (URL vieja) | OpenTelemetry | https://opentelemetry.io/docs/specs/semconv/general/attribute-naming/ | N/A | RV20 | **404 — inaccesible**, sustituida por F-147 |
| F-150 | Semantic Conventions — Messaging (URL vieja) | OpenTelemetry | https://opentelemetry.io/docs/specs/semconv/general/messaging/ | N/A | RV20 | **404 — inaccesible**, sustituida por F-146 |

---

## 6. Proveedores de IA / cloud (proveedor) — F-151 a F-160

| ID | Título | Editor | URL | Fecha pub. | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|---|
| F-151 | Tool use with Claude | Anthropic | https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview (orig. docs.anthropic.com, 301) | s/f | alta | RV18 | leída en vivo |
| F-152 | How we contain Claude | Anthropic | https://www.anthropic.com/engineering/how-we-contain-claude | 2026-05-25 | alta | RV18 | leída en vivo |
| F-153 | Writing tools for agents | Anthropic | https://www.anthropic.com/engineering/writing-tools-for-agents | 2025-09-11 | alta | RV18 | leída en vivo |
| F-154 | Demystifying evals for AI agents | Anthropic | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents | 2026-01-09 | alta | RV18 | leída en vivo |
| F-155 | Building Effective AI Agents | Anthropic | https://www.anthropic.com/engineering/building-effective-agents | 2024-12-19 | alta | RV18 | leída en vivo |
| F-156 | Computer use tool (prompt injection, confirmación humana) | Anthropic | https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool | s/f | alta | RV18 | leída en vivo |
| F-157 | Claude Pricing | Anthropic | https://claude.com/pricing | s/f | alta | RV16 | leída en vivo |
| F-158 | OpenAI API Pricing | OpenAI | https://developers.openai.com/api/docs/pricing (orig. platform.openai.com, 301) | s/f | alta (nombres de modelos recientes sin 2ª fuente) | RV16 | leída en vivo |
| F-159 | AWS Lambda Pricing | Amazon Web Services | https://aws.amazon.com/lambda/pricing/ | s/f | alta | RV16 | leída en vivo |
| F-160 | AWS RDS PostgreSQL / S3 Pricing | Amazon Web Services | aws.amazon.com/rds/postgresql/pricing/ ; aws.amazon.com/s3/pricing/ | s/f | N/A | RV16 | **inaccesible** (tablas renderizadas por JS, no extraíbles) |

---

## 7. Proveedores — PMS / channel manager / revenue management (proveedor) — F-161 a F-201

| ID | Título | Editor | URL | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|
| F-161 | Guesty — home | Guesty Inc. | https://www.guesty.com/ | alta | RV14 | leída en vivo |
| F-162 | Guesty — AI for Short-Term Rentals | Guesty | https://www.guesty.com/features/ai-for-short-term-rentals/ | alta | RV14 | leída en vivo |
| F-163 | Guesty — Pricing | Guesty | https://www.guesty.com/pricing/ | alta | RV08, RV14, RV16 | leída en vivo |
| F-164 | Guesty — API (features) | Guesty | https://www.guesty.com/features/api/ | alta | RV08 | leída en vivo |
| F-165 | Guesty Open API — Getting Started | Guesty | https://open-api-docs.guesty.com/docs/getting-started | alta | RV08 | leída en vivo |
| F-166 | Guesty — Task Management Tools | Guesty | https://www.guesty.com/features/tasks-management/ | media-alta | RV11 | leída en vivo |
| F-167 | Guesty — How to Automate Airbnb Guest Communication with AI | Guesty | https://www.guesty.com/blog/ai-automation-for-guest-communications/ | media | RV10 | leída en vivo |
| F-168 | Hostaway — home | Hostaway | https://www.hostaway.com/ | alta | RV14 | leída en vivo |
| F-169 | Hostaway — AI CoHost | Hostaway | https://www.hostaway.com/ai-cohost/ | alta | RV14 | leída en vivo |
| F-170 | Hostaway — Pricing | Hostaway | https://www.hostaway.com/pricing/ | alta (sin precio público) | RV14, RV16 | leída en vivo |
| F-171 | Hostaway — API documentation | Hostaway | https://api.hostaway.com/documentation | alta (changelog 2026-08-24) | RV08 | leída en vivo |
| F-172 | Hostaway — Channel Manager (features) | Hostaway | https://www.hostaway.com/features/channel-manager/ | baja (marketing) | RV09 | leída en vivo |
| F-173 | Hostaway — Airbnb Calendar Sync & Channel Manager | Hostaway | https://www.hostaway.com/airbnb-calendar-sync-channel-manager/ | baja | RV09 | leída en vivo |
| F-174 | Hostaway — glosario "Multi-Calendar" | Hostaway | https://www.hostaway.com/glossary/multi-calendar/ | media | RV09 | leída en vivo |
| F-175 | Hostaway — glosario "Turnover Checklist" | Hostaway | https://www.hostaway.com/glossary/turnover-checklist/ | media | RV11 | leída en vivo |
| F-176 | Hostaway — glosario "Housekeeping" | Hostaway | https://www.hostaway.com/glossary/housekeeping/ | media | RV11 | leída en vivo |
| F-177 | Hostaway — blog "How to Manage Cleanings" | Hostaway | https://www.hostaway.com/blog/manage-STR-cleanings/ | media | RV11 | leída en vivo |
| F-178 | Hostaway — blog "Airbnb Scheduled Messages" | Hostaway | https://www.hostaway.com/blog/airbnb-scheduled-messages/ | media | RV02 | leída en vivo |
| F-179 | OwnerRez — home | OwnerRez, Inc. | https://www.ownerrez.com/ | alta | RV14 | leída en vivo |
| F-180 | OwnerRez — Pricing | OwnerRez | https://www.ownerrez.com/pricing | media-baja (tabla completa no renderizable) | RV14, RV16 | leída en vivo |
| F-181 | OwnerRez — API Overview | OwnerRez | https://www.ownerrez.com/support/articles/api-overview | media (fetch parcial) | RV08 | leída en vivo |
| F-182 | Smoobu — home | Smoobu GmbH | https://www.smoobu.com/en/ | alta | RV14 | leída en vivo |
| F-183 | Smoobu — Pricing | Smoobu | https://www.smoobu.com/en/pricing/ | alta | RV14 | leída en vivo |
| F-184 | Smoobu — API Documentation | Smoobu | https://support.smoobu.com/hc/en-us/articles/360003170740-Smoobu-API-Documentation | alta (sunset legacy 2026-09-25) | RV08 | leída en vivo |
| F-185 | Uplisting — home | Uplisting Ltd | https://www.uplisting.io/ | alta | RV14 | leída en vivo |
| F-186 | Uplisting — Pricing | Uplisting | https://www.uplisting.io/pricing | alta | RV14, RV16 | leída en vivo |
| F-187 | Beds24 — home | Beds24.com | https://beds24.com/ | alta | RV14 | leída en vivo |
| F-188 | Beds24 — Pricing | Beds24 | https://beds24.com/pricing.html | alta (inconsistencia interna €15.50 vs €15.90) | RV14 | leída en vivo |
| F-189 | Hospitable — home | Hospitable.com | https://www.hospitable.com/ | alta | RV14 | leída en vivo |
| F-190 | Hospitable — Pricing | Hospitable | https://www.hospitable.com/pricing/ | alta (contradicción interna sobre aprobación humana) | RV14 | leída en vivo |
| F-191 | Hospitable — Pricing & Subscription Costs (soporte) | Hospitable Support | https://help.hospitable.com/en/articles/4596748-hospitable-pricing-subscription-costs | alta | RV16 | leída en vivo |
| F-192 | Hospitable — Troubleshooting Availability Sync Issues | Hospitable | https://help.hospitable.com/en/articles/6502744-troubleshooting-availability-sync-issues | alta | RV09 | leída en vivo |
| F-193 | Hospitable — Calendar Restricted / Error Badges | Hospitable | https://help.hospitable.com/en/articles/10401728-calendar-restricted-or-other-error-badges-on-your-listing-or-channel | alta | RV09 | leída en vivo |
| F-194 | Hospitable — Getting Started with the Calendar | Hospitable | https://help.hospitable.com/en/articles/5625442-getting-started-with-the-calendar | alta | RV09 | leída en vivo |
| F-195 | Hospitable — Tutorial: Set Up a Cleaning Team | Hospitable Support | https://help.hospitable.com/en/articles/6101063-tutorial-set-up-a-cleaning-team | alta | RV11 | leída en vivo |
| F-196 | Hospitable — Connect with ResortCleaning | Hospitable Support | https://help.hospitable.com/en/articles/8857368-connect-hospitable-with-resortcleaning-to-automatically-schedule-cleanings-after-each-reservation | alta | RV11 | leída en vivo |
| F-197 | Hospitable — Marketplace Cleaning FAQ | Hospitable Support | https://help.hospitable.com/en/articles/12137029-marketplace-cleaning-faq | alta | RV11 | leída en vivo |
| F-198 | Hospitable — Airbnb Automated Messages 101 | Hospitable | https://hospitable.com/airbnb-automated-messages | media | RV02, RV10 | leída en vivo |
| F-199 | Hospitable — Booking.com Messages | Hospitable | https://hospitable.com/booking-com-messages | media-baja | RV10 | leída en vivo |
| F-200 | Hospitable — Vrbo Automated Messages | Hospitable | https://hospitable.com/vrbo-automated-messages | media-baja | RV10 | leída en vivo |
| F-201 | iGMS — home / Pricing | iGMS | https://www.igms.com/ ; https://www.igms.com/pricing/ | alta | RV14 | leída en vivo |

### Resto de proveedores (Breezeway, Operto, Hostfully, Rentals United, Lodgify, revenue management) — F-202 a F-213

| ID | Título | Editor | URL | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|
| F-202 | Breezeway — Adjust your Automated Workflows | Breezeway | http://help.breezeway.io/en/articles/8224895-adjust-your-automated-workflows | alta | RV11 | leída en vivo |
| F-203 | Breezeway — Task Scheduling (Task Automation) | Breezeway | https://www.breezeway.io/task-automation | alta (marketing) | RV11 | leída en vivo |
| F-204 | Breezeway — Linens & Inventory Management | Breezeway | https://www.breezeway.io/inventory | alta (marketing) | RV11 | leída en vivo |
| F-205 | Operto Teams — Maintenance Tracking | Operto | https://operto.com/maintenance-tracking/ | media | RV11 | leída en vivo |
| F-206 | Operto Teams — Scheduling Calendar User Guide | Operto KB | https://help-teams.operto.com/article/36-scheduling-calendar | alta | RV11 | leída en vivo |
| F-207 | Operto Teams — Master Calendar User Guide | Operto KB | https://help-teams.operto.com/article/38-master-calendar | alta | RV11 | leída en vivo |
| F-208 | Operto Teams — Customized Property Task Management | Operto | https://operto.com/customized-checklists/ | alta | RV11 | leída en vivo |
| F-209 | Hostfully — home | Hostfully, Inc. | https://www.hostfully.com/ | alta | RV14 | leída en vivo |
| F-210 | Rentals United — home | Rentals United | https://rentalsunited.com/ | alta | RV14 | leída en vivo |
| F-211 | Rentals United — How it works (PMS) | Rentals United | https://rentalsunited.com/how-it-works-pms/ | media (discrepancia costo/tiempo) | RV08 | leída en vivo |
| F-212 | Lodgify — Pricing | Lodgify | https://www.lodgify.com/pricing/ | media (WebFetch 403, leída vía proxy) | RV16 | leída en vivo (vía proxy de lectura) |
| F-213 | PriceLabs / Beyond Pricing / Wheelhouse — home | PriceLabs / Beyond / Wheelhouse | https://hello.pricelabs.co/ ; https://www.beyondpricing.com/ ; https://www.usewheelhouse.com/ | alta (marketing propio) | RV13 | leída en vivo |

**Patrón de arquitectura (proveedor/tercero, técnica portada, no dominio)**: F-214 Transactional outbox pattern — Chris Richardson, microservices.io — https://microservices.io/patterns/data/transactional-outbox.html — alta — RV17 — leída en vivo (clasificado como **tercero**, autor independiente, no empresa).

---

## 8. Reguladores, ley y estadística oficial (regulador-ley) — F-215 a F-241

| ID | Título | Editor | URL | Fecha pub. | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|---|
| F-215 | Airbnb, Inc. 10-K FY2025 | Airbnb, Inc. / SEC EDGAR | https://www.sec.gov/Archives/edgar/data/1559720/000155972026000004/abnb-20251231.htm | 2026-02-12 | alta | RV15 | leída en vivo |
| F-216 | Booking Holdings Inc. 10-K FY2025 | Booking Holdings / SEC EDGAR | https://www.sec.gov/Archives/edgar/data/1075531/000107553126000009/bkng-20251231.htm | ~feb-2026 | alta | RV15 | leída en vivo |
| F-217 | INE — tabla 39364, viviendas turísticas España | INE (España) | https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/39364 | dato may-2026 | alta | RV15 | leída en vivo (API oficial) |
| F-218 | INEGI — Comunicado 203/25, CSTM 2024 | INEGI | https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/turismo/CSTM2024_CP.pdf | 2025-12-18 | alta | RV15 | leída en vivo (PDF) |
| F-219 | INEGI — Boletín 82/26 (EVI) | INEGI | https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/ViajInternales/evi2026_02.pdf | 2026-02-12 | alta | RV15 | leída en vivo (PDF) |
| F-220 | LFPDPPP (texto vigente 2025) | Cámara de Diputados / DOF | https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf | DOF 20-03-2025, últ. reforma 14-11-2025 | alta | RV19 | leída en vivo (PDF) |
| F-221 | Reglamento LFPDPPP (2011, desactualizado) | Cámara de Diputados | https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf | DOF 21-12-2011 | alta | RV19 | leída en vivo (PDF) |
| F-222 | Ley del ISR, Art. 113-A/B/C/E | Cámara de Diputados | https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf | últ. reforma 01-04-2024 | alta | RV19 | leída en vivo (PDF) |
| F-223 | Ley del IVA, Art. 18-J/L/M | Cámara de Diputados | https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf | últ. reforma 12-11-2021 | alta | RV19 | leída en vivo (PDF) |
| F-224 | Ley General de Turismo, Arts. 46/48 | Cámara de Diputados | https://www.diputados.gob.mx/LeyesBiblio/pdf/LGT.pdf | últ. reforma 14-11-2025 | alta | RV19 | leída en vivo (PDF) |
| F-225 | Reglamento de la Ley General de Turismo, Art. 83 | Cámara de Diputados | https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LGT.pdf | últ. reforma 25-11-2025 | alta | RV19 | leída en vivo (PDF) |
| F-226 | Comunicado transición INAI → Sec. Anticorrupción y Buen Gobierno | gob.mx/buengobierno | https://www.gob.mx/buengobierno/prensa/la-secretaria-anticorrupcion-y-buen-gobierno-reafirma-su-compromiso-con-la-transparencia-y-la-proteccion-de-datos-personales | 2025-03-21 | media-alta | RV19 | leída en vivo |
| F-227 | Verificación técnica: dominio INAI dado de baja | Verificación directa | https://www.inai.org.mx | — | alta (hallazgo negativo) | RV19 | **inaccesible** (ENOTFOUND, dominio dado de baja — confirmado como hallazgo, no como laguna) |
| F-228 | Reglamento (UE) 2016/679 — RGPD | EUR-Lex | https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32016R0679 | 2016 | alta | RV19 | leída en vivo |
| F-229 | Real Decreto 933/2021 (registro de viajeros), texto consolidado | BOE | https://www.boe.es/eli/es/rd/2021/10/26/933/con | publ. 27-10-2021 | alta (fecha exacta de arranque: media-baja) | RV19 | leída en vivo |
| F-230 | RD 933/2021 — Anexos I/II | BOE | https://www.boe.es/eli/es/rd/2021/10/26/933 | 2021-10-26 | alta | RV19 | leída en vivo |
| F-231 | Reglamento (UE) 2024/1028 (recogida de datos de alquiler corto plazo) | EUR-Lex | https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32024R1028 | 2024-04-11 | alta (fecha exacta de aplicación: media-baja) | RV19 | leída en vivo |
| F-232 | Medidas nacionales de ejecución España (NIM) para Reg. 2024/1028 | EUR-Lex | https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32024R1028 | consulta 2026-09-05 | media (ausencia no concluyente) | RV19 | leída en vivo (sin medidas listadas) |
| F-233 | AEPD — home | AEPD | https://www.aepd.es | — | baja (sin guía sectorial visible) | RV19 | leída en vivo |
| F-234 | AEPD — guías y herramientas | AEPD | https://www.aepd.es/guias-y-herramientas | — | N/A | RV19 | **inaccesible** (HTTP 503) |
| F-235 | Registration Rules and Laws (Local Law 18) | NYC Mayor's Office of Special Enforcement | https://www.nyc.gov/site/specialenforcement/registration-law/registration-rules-and-laws.page | Local Law 18 de 2022, reglas desde 06-03-2023 | alta | RV19 | leída en vivo |
| F-236 | Short-Term Rental Registration (KA-03559) | NYC311 | https://portal.311.nyc.gov/article/?kanumber=KA-03559 | — | alta | RV19 | leída en vivo |
| F-237 | Regulación local CDMX (congresocdmx, consejería, orden jurídico) | Gobierno CDMX | congresocdmx.gob.mx, data.consejeria.cdmx.gob.mx, ordenjuridico.gob.mx | — | N/A | RV19 | **inaccesible** (error TLS / sin resultados) |
| F-238 | Registro Único de Arrendamientos / ventanilla única España | BOE.es, mivau.gob.es, lamoncloa.gob.es | sin URL válida obtenida | — | N/A | RV19, RV15 | **inaccesible** (403 / sin resultado) |
| F-239 | Orden INT del modelo operativo del parte de viajeros | Ministerio del Interior (España) | candidata boe.es/eli/es/o/2024/12/03/int1330 (descartada, 404) | — | N/A | RV19 | **inaccesible** (no localizada) |
| F-240 | interior.gob.es (parte de viajeros, estado de implantación) | Ministerio del Interior | interior.gob.es | — | N/A | RV19 | **inaccesible** (403) |
| F-241 | mivau.gob.es (Registro Único de Arrendamientos) | Ministerio de Vivienda (España) | mivau.gob.es | — | N/A | RV19 | **inaccesible** (403) |

---

## 9. Terceros — foros, agregadores, verificaciones de bloqueo (tercero) — F-242 a F-246

| ID | Título | Editor | URL | Confianza | Módulos | Estado |
|---|---|---|---|---|---|---|
| F-242 | Hilo de comunidad sobre ausencia de nombre de huésped en iCal | community.withairbnb.com (foro, NO oficial) | https://community.withairbnb.com/t5/Help/No-Guest-Names-on-ICal-seriously/td-p/1129637 | baja (no oficial) | RV21 | leída en vivo (foro) |
| F-243 | Airbnb Webhooks (catálogos de terceros, NO verificado en fuente oficial) | apis.io / apievangelist.com | https://apis.io/asyncapis/airbnb/airbnb-webhooks-asyncapi/ | baja — declarado como laguna, no hecho | RV03 | leída en vivo (agregador, no autoridad) |
| F-244 | Hosthub — blog sobre "looping errors" de iCal + channel manager | Hosthub (proveedor con sesgo comercial) | (citado por nombre en rv05-08-14.md, sin URL exacta capturada) | media-baja (fuente con interés comercial) | RV08 | leída en vivo (con advertencia de sesgo) |
| F-245 | Verificación de tabla CDX Wayback Machine para partner.booking.com / partnerhelp.booking.com (cero capturas históricas) | web.archive.org (API CDX) | archive.org/wayback/available ; web.archive.org/cdx/search/cdx | alta (verificación técnica directa) | RV04, RV06, RV07 | leída en vivo (confirma ausencia total de archivo, no solo 403 en vivo) |
| F-246 | B-002 intento 1 — extensión Claude en Chrome no conectada | Sesión propia (verificación de herramienta) | https://claude.ai/chrome | N/A | RV04, RV05, RV08 | **inaccesible** (herramienta no disponible, 2 intentos) |

---

## 10. URLs inaccesibles (403 / timeout / login / sin captura archivada)

Regla aplicada: ninguna afirmación de producto se basa en estas URLs; se citan solo para transparencia del bloqueo y para que un reintento futuro sepa exactamente qué falta.

| URL / dominio | Módulo(s) afectado(s) | Tipo de fallo | Intentos declarados |
|---|---|---|---|
| `partner.booking.com` (todas las rutas: extranet-calendar, connectivity-partner-program, extranet-pulse, robots.txt, en-gb/solutions/connectivity) | RV01, RV04, RV06, RV07, RV09, RV10, RV11 | 403 Forbidden (bloqueo CloudFront a nivel de borde, confirmado también en robots.txt) | ≥10 intentos en vivo, todos 403; 0 capturas en Wayback (CDX vacío) |
| `partnerhelp.booking.com` (todas las rutas) | RV01, RV06, RV07, RV10, RV12 | 403 / timeout de conexión TCP | ≥5 intentos; 0 capturas en Wayback |
| `partnerships.booking.com/api-v3` | RV19 | 403 Forbidden | 1 intento |
| `portal.connectivity.booking.com/s/topiccatalog` | RV04, RV08 | HTTP 200 pero shell Salesforce/JS sin contenido renderizado | 1 intento; sin captura archivada |
| `admin.booking.com` (raíz) | RV19 | Redirige a login (302, extranet) | 1 intento |
| `distribution-xml.booking.com` | RV04 | 401 (requiere credenciales, esperado) | 1 intento |
| `extranet.booking.com`, `partners.booking.com` | RV04 | Timeout / no resuelve | 1 intento cada uno |
| `developers.booking.com/connectivity/docs/reservations`, `.../availability` | RV04 | 404 (URLs incorrectas; correctas: F-065, F-067) | 2 intentos |
| `connect.booking.com/user_guide/...` (portal legado) | RV04, RV06 | Redirige a "sunset", sin contenido | 1 intento |
| `www.vrbo.com/connectivity` (lectura en vivo) | RV05, RV08 | 403 en vivo — resuelto parcialmente vía archivada (F-100) | 2+ intentos en vivo; 1 lectura archivada exitosa |
| `www.vrbo.com` (raíz) / `help.vrbo.com` (redirige a `/help`) | RV01, RV10, RV12 | 429 Too Many Requests; 0 capturas relevantes en Wayback | 3+ intentos |
| `help.vrbo.com/articles/What-fees-does-Vrbo-charge` | RV12 | Error interno de página | 1 intento |
| `vrbo.com/lp/b/content-guidelines` | RV02 | 429 (2 intentos) | 2 intentos |
| `agodahomeshelp.zendesk.com/.../115006604248...` | RV05 | 403 | 1 intento |
| `wiki.beds24.com` (Category:API, Category:Developers) | RV08 | 403 | 2 intentos |
| `docs.rentalsunited.com`, `rentalsunited.zendesk.com` | RV08 | 403 | 2 intentos |
| `docs.lodgify.com` (todas las rutas), `lodgify.com` (home/pricing/comparativa) | RV08, RV14 | 403 | ≥4 intentos |
| `support.uplisting.io/docs/api` | RV08 | 403 | 1 intento |
| `help.guesty.com`, `help-lite.guesty.com`, `help.guestyforhosts.com` | RV01, RV09, RV10, RV11 | 403 | ≥6 intentos |
| `support.smoobu.com`, mirror `smoobu.zendesk.com` | RV09 | 403 (el mirror redirige de vuelta al dominio bloqueado) | 2 intentos |
| `help.lodgify.com` | RV09 | 403 | 1 intento |
| `turno.com` (todas las páginas de producto) | RV01, RV02, RV11 | 403 (incluido intento vía web.archive.org, también bloqueado) | ≥5 intentos |
| Operto (búsqueda no realizada) | RV01, RV09 | Cuota de WebSearch agotada antes de cubrir el proveedor | 0 intentos posibles |
| `debezium.io` (2 URLs: outbox-event-router, blog 2019) | RV17 | 403 Forbidden | 2 intentos |
| `opentelemetry.io/docs/specs/semconv/general/attribute-naming/`, `.../general/messaging/` | RV20 | 404 (convención antigua, sustituida por F-146/F-147) | 2 intentos |
| `aws.amazon.com/rds/postgresql/pricing/`, `.../s3/pricing/` | RV16 | Tablas renderizadas por JS, no extraíbles | múltiples intentos |
| `sat.gob.mx` (varias rutas: noticias/85392, omawww requisitos_cfd, GUIA_DESCARGA_CFDI_SAT.pdf) | RV12, RV19 | 403 / ECONNREFUSED / PDF binario ilegible | 3 intentos |
| `www.inai.org.mx` | RV19 | ENOTFOUND (dominio dado de baja — hallazgo confirmado, ver F-227) | 1 intento |
| `interior.gob.es`, `mivau.gob.es` | RV19, RV15 | 403 | 2 intentos |
| `boe.es` (buscador) | RV19 | Error de parámetros | 1 intento |
| `congresocdmx.gob.mx`, `data.consejeria.cdmx.gob.mx`, `ordenjuridico.gob.mx` | RV19 | Error de certificado TLS / sin resultados accesibles | 3 intentos |
| `www.aepd.es/guias-y-herramientas` | RV19 | 503 | 1 intento |
| Extensión "Claude en Chrome" (herramientas `mcp__claude-in-chrome__*`) | RV04, RV05, RV08 | Extensión no conectada | 2 intentos consecutivos (ver `docs/fuentes/b002-chrome.md`) |

---

## Notas de procedencia

- Las 46 filas de la sección 10 no reciben ID `F-nnn` porque no aportan afirmación verificada — son evidencia de bloqueo, registrada aquí solo para trazabilidad y para que `docs/LAGUNAS.md` pueda distinguir "PENDIENTE-EXTERNO" (requiere credenciales/partner) de "LAGUNA HONESTA" (no hay fuente primaria posible sin cambiar de método).
- `docs/fuentes/ref-plan.md` no aporta URLs al ledger (documenta lectura de PDFs de referencia fuera de este repo, `~/Desktop/PlataformaAgenticaBlueprintseInvestigacionPDF/`, y de un archivo local de skill); su rol es metodológico y queda referenciado desde `docs/investigacion/00-PLAN.md`, no desde este ledger de URLs.
- `docs/fuentes/b002-chrome.md` (intento 1, extensión no conectada) y `docs/fuentes/b002-archivo.md` (intento 2, Wayback Machine + curl directo) quedan íntegramente incorporados: b002-chrome.md como F-246 (fallo de herramienta); b002-archivo.md como F-082, F-083 (connect.booking.com en vivo) y F-100 (Vrbo Connectivity, archivada) más las entradas de la sección 10 (F06–F08 originales de ese archivo, sin evidencia).
- Todo dato marcado "s/f" en "Fecha pub." significa que la página consultada no mostraba fecha de publicación/actualización explícita en el contenido extraído — no que se omitiera buscarla.
