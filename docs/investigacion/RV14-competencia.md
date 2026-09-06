# RV14 — Competencia: channel managers y PMS de rentas vacacionales

**Fecha de consulta de todas las fuentes:** 2026-09-05.
**Ledger de citas:** ver `docs/fuentes/rv05-08-14.md` (sección RV14).

## Resumen ejecutivo

Se investigaron 10 productos con página oficial leída directamente (Guesty, Hostaway, OwnerRez, Smoobu, Uplisting, Beds24, Hospitable, Hostfully, iGMS, Rentals United) más una ficha parcial de Lodgify (bloqueo 403, datos vía snippets, confianza baja), más Holidu como canal/agregador adicional (ver sección "Holidu y TripAdvisor Rentals" más abajo). "Your Porter App" se descartó como producto independiente (absorbido por Guesty según fuentes de terceros). Casi todos los competidores ya comunican IA generativa (excepciones: Smoobu y Beds24, que se apoyan en automatización basada en reglas/triggers sin mencionar IA generativa). El hallazgo más relevante para la diferenciación de Atiende, **corregido en esta pasada** (ver nota bajo la tabla de fichas y "Riesgos/límites"): **ningún competidor investigado declara públicamente, hoy, un requisito de aprobación humana obligatorio y no-opcional para toda acción de IA, en todos sus tiers**. Hostaway sí muestra un flujo conversacional con paso de aprobación explícito ("approve the next step") re-confirmado en vivo el 2026-09-05, pero limitado a ese flujo puntual, no como principio transversal de producto. Hospitable usa "Automated guest messaging" / "AI auto reply" / "AI Copilot" en sus tiers de pago sin mencionar aprobación humana obligatoria en ningún tier vigente hoy (re-verificado en vivo el 2026-09-05; ver corrección más abajo — la cita anterior que sí mencionaba aprobación no pudo reproducirse). **Ningún competidor menciona públicamente un audit log/trazabilidad de acciones de IA**, ni permisos server-side granulares por agente. **Ningún competidor promociona un "estado de sync honesto"** que muestre fallos/conflictos en vez de solo verde. Estos puntos constituyen el hueco de mercado observado en el discurso público de estas empresas a 2026-09-05, no una garantía de que ningún competidor lo esté construyendo internamente.

## Contenido

### Fichas por producto (resumen; ver ledger para citas completas)

| Producto | Segmento | Canales declarados | Conexión declarada | IA declarada | Precio público |
|---|---|---|---|---|---|
| Guesty | Host pequeño (Lite 1–3) → PM (Pro 4–199) → Enterprise (200+) | 60+ [DATO] (Airbnb, Vrbo, Booking.com, Expedia, Google Travel, Marriott) | **"Direct API integrations — not iCal feeds"** (cita explícita, re-verificada en vivo 2026-09-05 en home) [DATO] | Fuerte: agentes que "act, decide, and execute" (re-verificado en vivo 2026-09-05 en home) [DATO]; aprobación humana solo en casos puntuales (reviews negativas) | Parcial: desde $9/listado/mes (Lite) [DATO]; resto "get a quote" |
| Hostaway | Todos los tamaños, segmentado por volumen | Airbnb, Vrbo, Booking.com, Expedia, Google, Marriott | No especificado | "AI CoHost" con flujo Ask→Analyze→Act y cita explícita: "approve the next step, and CoHost gets to work" (re-verificada en vivo 2026-09-05) [DATO] | No público (solo contacto) |
| OwnerRez | Homeowner individual y PM grande | Airbnb, Vrbo (+ "major channels" genérico) | No especificado | "Rezzy AI" mencionada, poco descrita | Desde $88/mes [DATO] (≤5 propiedades), luego contacto |
| Smoobu | First-time host → property manager | Airbnb, Booking.com, Expedia (+40 total) [DATO] | No especificado | Nula/no-generativa (dynamic pricing + mensajes programados por reglas) | $33.70–$57.53/mes [DATO] según tier |
| Uplisting | Operador multi-propiedad en crecimiento (no host de 1 propiedad) | Airbnb, Booking.com, Vrbo, directo | No especificado | "AI Messaging" con cuota explícita (100 acciones/mes en tiers bajos, unlimited en Manager) [DATO] | £40–£208/mes [DATO] |
| Beds24 | Propietario individual → agencia profesional | 60+ [DATO] (incl. Airbnb, Booking.com, Vrbo, Expedia, Agoda) | **Único que distingue explícitamente "Certified 2-way API" vs "iCal calendar sync" en la misma página** (re-verificado en vivo 2026-09-05) [DATO] | Nula (automatización basada en reglas/triggers) | Desde €15.50–15.90/mes [DATO] (inconsistencia entre fuentes, no resuelta) + add-ons granulares |
| Hospitable | Solo host, multi-propiedad, co-host, PM | Airbnb, Vrbo, Booking.com, directo | No especificado | Re-verificado en vivo 2026-09-05 (ver nota abajo): Essentials (free) "Automated messaging (limited)" + "10 AI suggested replies per week" [DATO]; Host "Automated guest messaging" + "Dynamic pricing included" ($5/propiedad tras 3 reservas gratis [DATO]); Professional = Host sin IA adicional explícita; Mogul "AI Copilot" + "AI auto reply" + "Inbox AI messaging assistant". **Ningún tier vigente hoy menciona un requisito de aprobación humana explícito** — ver nota de corrección abajo | No público (todos "from --/mo" excepto free) |
| Hostfully | Individual → PM → Enterprise (incl. boutique/MTR) | Airbnb, Vrbo, Booking.com, Marriott (60+) [DATO] | "Open API" explícito, iCal no mencionado | Ligera: solo "InboxAI" | No verificado (pricing no fetcheado) |
| iGMS | Host individual y PM pequeño/mediano (2–8 propiedades) | Airbnb, VRBO, Booking.com, Google | No especificado | Media, con **admisión propia** de features "SOON" (AI Agent, AI Property Knowledge, AI Upsells no disponibles aún) | $1/noche [DATO] o $38–56/propiedad/mes [DATO] |
| Rentals United | PM profesional/enterprise/proveedores de PMS (B2B) | 90+ canales, 60+ PMS partners [DATO] | API REST+XML explícita | Ligera: solo "AI-powered analytics/insights", sin agentes que actúan | No verificado (pricing no fetcheado) |
| Holidu | Agregador/canal + channel-manager para agencias 30+ propiedades | 25+ sitios de reserva internacionales [DATO]; red incluye Airbnb/Booking.com como canales de distribución downstream | Compatible con 75+ PMS/channel managers [DATO], o API propia de Holidu; Europa principalmente, sin cobertura LatAm confirmada — ver sección "Holidu y TripAdvisor Rentals" | No público en la página de partners |
| Lodgify* | Host individual → operador con reserva directa | Airbnb, Vrbo, Booking.com | API mencionada (no verificado directo) | No verificada (laguna) | $16–40+/mes [R] (snippets, no verificado directo) |

*Lodgify: fetch directo bloqueado (403) en 3 intentos; datos de menor confianza.

**Nota de corrección (2026-09-05) sobre Hospitable:** la versión anterior de esta ficha citaba textualmente `"AI drafts replies and sets the prices, you approve"` (tier Host) y `"Fully automated guest messaging with Inbox AI"` (tier Mogul) como si fueran citas verbatim vigentes de hospitable.com/pricing/. Una re-verificación en vivo de esa URL el mismo día (2026-09-05), hecha de forma independiente por una auditoría y repetida por este corrector, **no encontró ninguna de las dos frases** en la página actual. Se trata a partir de esta pasada como **cita NO CONFIRMADA** (posible redacción histórica ya reemplazada, error de transcripción del agente original, o contenido dinámico/test A-B) y se sustituye por el texto verbatim re-leído hoy (arriba, columna "IA declarada"), con URL https://www.hospitable.com/pricing/ y fecha de consulta 2026-09-05. Detalle completo en "Riesgos/límites".

### Análisis de diferenciación de Atiende

- **Aprobación humana obligatoria**: de los ~10-11 competidores investigados, **ninguno declara públicamente hoy (2026-09-05)** "aprobación humana obligatoria y no-opcional para toda acción de IA, en todos los tiers" como principio transversal de producto. Hostaway es el caso más cercano: su flujo "AI CoHost" (Ask→Analyze→Act) incluye un paso de aprobación explícito ("approve the next step, and CoHost gets to work", re-verificado en vivo hoy), pero limitado a ese flujo conversacional puntual, no comunicado como garantía transversal a todas las acciones de IA del producto. Hospitable usa "Automated guest messaging" / "AI auto reply" / "AI Copilot" en sus tiers de pago sin mencionar un requisito de aprobación en ningún tier vigente hoy (re-verificado en vivo; la cita que antes se atribuía a Hospitable sobre aprobación no pudo reproducirse — ver "Riesgos/límites"). Guesty, el competidor con el discurso de IA más agresivo, comunica agentes que "act, decide, and execute" con aprobación humana mencionada solo para casos puntuales (reviews mixtas o negativas).
- **Trazabilidad/audit log de acciones de IA**: no encontrada en ninguna página oficial de los 10-11 competidores. La única mención cercana (Guesty "Team access auditor") audita permisos de usuarios humanos, no acciones de agentes IA.
- **Permisos limitados en servidor por agente**: ninguna mención pública en ningún competidor.
- **Calendario con estado de sync honesto** (mostrar fallos/conflictos, no solo verde): ningún competidor lo promociona; todos enmarcan la sincronización como beneficio positivo ("real-time", "seamless", "certified").
- **Operación limpieza + owners integrada con aprobación/trazabilidad de IA**: existen funcionalidades de limpieza (Hostfully, iGMS, Guesty) y portales de propietarios por separado en el mercado, pero ninguna fuente conecta explícitamente ambas con un modelo de agentes de IA con aprobación y registro.

**Conclusión**: el hueco de mercado no está en "tener IA" (ya generalizado) sino en la combinación explícita y no-opcional de aprobación + trazabilidad + permisos server-side + honestidad de estado de sync, que ningún competidor investigado declara como conjunto a 2026-09-05.

## Riesgos/límites

- **Corrección de cita no reproducible — Hospitable (2026-09-05):** una pasada anterior de este documento citaba textualmente `"AI drafts replies and sets the prices, you approve"` (tier Host) y `"Fully automated guest messaging with Inbox AI"` (tier Mogul) como el argumento de diferenciación comercial más citado del módulo (antiguo RV14-R-01 y "Análisis de diferenciación"). El mismo día 2026-09-05, una auditoría independiente reabrió https://www.hospitable.com/pricing/ y no pudo reproducir ninguna de las dos frases; este corrector repitió el WebFetch en vivo a la misma URL, de forma independiente, y tampoco encontró ninguna de las dos frases en la página actual (contenido verbatim re-leído: "Automated messaging (limited)", "10 AI suggested replies per week", "Automated guest messaging", "Dynamic pricing included", "AI Copilot", "AI auto reply", "Inbox AI messaging assistant" — ninguna incluye "you approve" ni "fully automated"). Con dos re-verificaciones independientes coincidentes en el mismo día, la cita original se trata como **NO CONFIRMADA** (no se afirma que sea falsa ni que Hospitable haya cambiado su página hoy mismo — solo que no es reproducible con los medios disponibles). Se corrigió en esta pasada: tabla de fichas, "Análisis de diferenciación" y RV14-R-01 ya no dependen de esa cita.
- **Re-verificación positiva de otras citas (2026-09-05):** se repitió WebFetch en vivo sobre Guesty (home y pricing), Hostaway (AI CoHost) y Beds24 (home). Las tres citas siguientes SÍ se reprodujeron verbatim hoy: Guesty "Delegate your most demanding tasks to AI agents that act, decide, and execute on your behalf" (home) y "packages that start from $9/month per listing" (pricing); Hostaway "approve the next step, and CoHost gets to work"; Beds24 distinción "Certified 2-way API connections" vs. "iCal calendar sync". No se re-verificaron en esta pasada: Uplisting, Smoobu, OwnerRez, Hostfully, iGMS, Rentals United, Lodgify (sus cifras de precio ya confirmadas por la auditoría previa se mantienen sin cambios, salvo error evidente).
- Lodgify: toda la información proviene de snippets de búsqueda, no de lectura directa (403 bloqueado en home, pricing y página comparativa) — confianza baja, requiere verificación manual antes de uso externo.
- Hostfully y Rentals United: no se fetcheó su página de pricing específica; "precio público" queda como "no verificado", no como confirmado ausente.
- Beds24: inconsistencia no resuelta entre "€15.50" y "€15.90" como precio base en dos fuentes del mismo dominio.
- Hospitable: cifras de "AI replies per day" inconsistentes entre home (30,000) y pricing (55,000+), sin poder reconciliar; ninguna de las dos cifras se re-verificó en esta pasada (la página de pricing leída hoy ya no fue inspeccionada específicamente para esa cifra).
- El análisis se limitó a páginas de marketing/pricing/features-AI — no se auditó documentación técnica, ToS, ni comunicados de prensa; capacidades reales no comunicadas públicamente (ej. permisos server-side existentes pero no publicitados) no pueden descartarse.
- "Your Porter App" se asumió descontinuado/absorbido por Guesty según fuentes de terceros (no verificado con página oficial propia viva).
- Varios competidores (Hostaway, iGMS) muestran roadmap activo de IA ("SOON"), por lo que el hueco de mercado descrito podría cerrarse rápidamente.
- **TripAdvisor Rentals**: LAGUNA HONESTA — ver sección "Holidu y TripAdvisor Rentals" más abajo.
- **Cobertura de fuentes**: el total de URLs realmente leídas para este módulo (ver "Fuentes de este módulo") queda por debajo de 25; no se completó con URLs no leídas para inflar el conteo.

## Implicaciones para requisitos (RV14-R-nn)

- **RV14-R-01** *(reformulado 2026-09-05; ya no depende de la cita de Hospitable, que resultó no reproducible)*: Atiende debe comunicar la aprobación humana como principio de producto no-opcional y transversal a todos los tiers/planes. El hecho verificable que sostiene este argumento hoy es que, de los ~10-11 competidores investigados, **ninguno declara públicamente "aprobación humana obligatoria y no-opcional para toda acción de IA, en todos los tiers"** como principio transversal: Hospitable usa "Automated guest messaging"/"AI auto reply"/"AI Copilot" sin mencionar un requisito de aprobación explícito en ningún tier vigente; Hostaway sí muestra un paso de aprobación, pero acotado a su flujo conversacional "AI CoHost", no como garantía de producto en todas las superficies de IA. Esto es el diferenciador más defendible dado lo observado, sin apoyarse en ninguna cita puntual de un competidor específico que pueda dejar de ser reproducible.
- **RV14-R-02**: El producto debe incluir un audit log/trazabilidad de acciones de IA visible al usuario, dado que ningún competidor investigado lo ofrece públicamente — priorizar esto en el MVP como diferenciador verificable.
- **RV14-R-03**: El modelo de permisos de agentes IA debe ser explícito y limitado a nivel de servidor (scope por agente/acción), y debe comunicarse activamente en marketing, dado que ningún competidor lo hace.
- **RV14-R-04**: El calendario unificado debe exponer estado real de sincronización (incluyendo errores/conflictos/latencia) en vez de solo un estado "sincronizado" binario — esto contrasta directamente con el enmarcado positivo-only observado en todos los competidores.
- **RV14-R-05**: La estrategia de precios debe considerar que varios competidores directos (Smoobu, iGMS, Beds24, OwnerRez) publican precios detallados y bajos de entrada; Atiende debe decidir explícitamente si compite en transparencia de precio o en posicionamiento premium/enterprise (como Guesty Enterprise/Rentals United, que ocultan precio tras cotización).
- **RV14-R-06**: Verificar antes de publicar comparativas de mercado el estado real de Lodgify, Hostfully y Rentals United (pricing) dado que quedaron con confianza baja/no verificada.

## Holidu y TripAdvisor Rentals (canales/competidores adicionales, añadido 2026-09-05)

Esta sección cubre el ángulo de "competencia/canal adicional" de estos dos nombres para RV14; el análisis completo de conectividad técnica (API/iCal/certificación) para ambos, si aplica, corresponde a RV08/RV05 y no se duplica aquí.

**Holidu — investigado con éxito (fuente oficial):**
- URL: https://www.holidu.com/host/partners (página oficial dirigida a agencias con 30+ propiedades), consultada en vivo 2026-09-05.
- Cita verbatim: *"Holidu integrates with over 75 Property Management Systems and Channel Managers worldwide. Choose your preferred connection method: via Property Management System, Channel Manager, or directly through our Holidu API."* [DATO]
- Cita verbatim sobre distribución: *"List your properties on 25+ international booking sites — including Holidu's own"* [DATO]. Su red de distribución incluye Airbnb/Booking.com como canales downstream, lo que sitúa a Holidu simultáneamente como (a) agregador/canal de distribución adicional y (b) competidor parcial de channel manager (por su compatibilidad con 75+ PMS/CM y API propia) — no es solo un canal pasivo.
- Cita verbatim sobre pagos: *"When a guest books through Holidu, we'll take care of the payment process securely on our platform whenever possible"*, con soporte alternativo de pagos directos cuando el procesamiento en plataforma no es viable [DATO].
- No se encontró información de comisión/precio en esta página — queda como laguna, no como "gratis" ni "sin comisión".
- **Cobertura geográfica**: Holidu opera principalmente en Europa. No se encontró evidencia de presencia o cobertura específica en LatAm en la página investigada; no debe asumirse cobertura LatAm sin evidencia adicional.
- Relevancia para RV14: si Atiende evalúa canales adicionales más allá de Airbnb/Booking.com/Vrbo, Holidu es un agregador europeo real con conectividad amplia (75+ PMS/CM), pero su relevancia para el caso ancla (presumiblemente LatAm) es incierta hasta confirmar cobertura regional.

**TripAdvisor Rentals — LAGUNA HONESTA (bloqueo confirmado, no silenciosa):**
- Intentos realizados en vivo el 2026-09-05: (1) https://www.tripadvisor.com/Rentals, (2) https://www.tripadvisor.com/rental-owners-help, (3) una tercera URL de listados de TripAdvisor Rentals probada por el orquestador de esta corrección. **Las tres devolvieron HTTP 403 Forbidden.**
- Esto es consistente con otros bloqueos ya documentados en el resto de la investigación de este módulo y del proyecto (Vrbo/connectivity, partner.booking.com, wiki.beds24.com, docs.rentalsunited.com, docs.lodgify.com, support.uplisting.io/docs/api).
- **No se puede confirmar ni negar** con los métodos disponibles hoy si TripAdvisor Rentals sigue operando como vertical activa de anuncios de rentas vacacionales, ni si mantiene un programa de partner/conectividad para channel managers.
- Qué haría falta para cerrar esta laguna: (a) acceso autenticado de partner/socio a TripAdvisor, (b) reintento en otro momento/desde otra IP o entorno sin el bloqueo actual, o (c) consulta a Wayback Machine / archive.org si en algún momento deja de estar bloqueado en este entorno (no intentado en esta pasada).
- Se intentó adicionalmente rentalia.com (agregador español/LatAm, históricamente parte del grupo Expedia/HomeAway) como posible agregador regional — también bloqueado con HTTP 403. Se mantiene como LAGUNA HONESTA, no investigado más allá de este intento fallido.

## Lagunas

- Ficha completa de Lodgify (fetch bloqueado, solo snippets).
- Precio público de Hostfully y Rentals United (páginas de pricing no fetcheadas).
- Confirmación oficial del estado de "Your Porter App" (absorción por Guesty).
- Resolución de discrepancias de precio (Beds24) y de cifras de uso de IA (Hospitable).
- Auditoría de documentación técnica/ToS de los competidores (fuera de alcance de esta investigación, limitada a marketing/pricing).
- **TripAdvisor Rentals**: LAGUNA HONESTA — 3 intentos de WebFetch en vivo el 2026-09-05 (tripadvisor.com/Rentals, tripadvisor.com/rental-owners-help, y una URL de listados) devolvieron HTTP 403 Forbidden. No se puede confirmar ni negar si la vertical sigue activa ni si tiene programa de partner. Ver sección "Holidu y TripAdvisor Rentals" para lo que haría falta para cerrarla.
- **Agregadores regionales LATAM/España**: LAGUNA HONESTA — solo se investigó Holidu (europeo, sin cobertura LatAm confirmada) y se intentó rentalia.com (403 Forbidden, sin éxito). No hay evidencia de agregadores nativos de LatAm/España más allá de estos dos intentos.
- Precio/comisión de Holidu para hosts/agencias: no encontrado en la página de partners investigada.
- Cobertura geográfica de Holidu en LatAm: no confirmada ni descartada; requiere investigación dedicada si es relevante para el caso ancla.
- Ver `docs/LAGUNAS.md`, sección 4.1: filas "TripAdvisor Rentals", "Agregadores regionales LATAM/España" y "Holidu (canal/agregador + channel manager)" (módulos RV05/RV08/RV14/RV15), y sección 5, fila "Todas las dimensiones (frecuencia, límites, dedupe, anti-eco por canal genérico)" (LAGUNA HONESTA — solo afirmaciones de marketing de channel managers, módulos RV06/RV07); sección 6, fila "Precio Guesty Pro/Enterprise, todos los planes de Hostaway" (módulos RV14/RV16).

## Supuestos

- Se asume que la ausencia de una cita explícita sobre un tema (ej. API vs iCal en Hostaway, Smoobu, OwnerRez, Uplisting) refleja que esas páginas no lo comunican públicamente, no que el producto carezca de esa capacidad técnica.
- Se asume que el hueco de mercado descrito (aprobación + trazabilidad + permisos + sync honesto) es válido únicamente respecto al discurso público de estas empresas a 2026-09-05, y podría no reflejar capacidades internas no publicitadas ni desarrollos futuros anunciados.
- Se asume que "Your Porter App" ya no es un competidor independiente vigente, pendiente de confirmación con fuente oficial propia.
- Se asume que un bloqueo HTTP 403 reproducido en 3 intentos distintos a TripAdvisor Rentals el mismo día refleja una política de bloqueo del sitio hacia el método de acceso usado (no autenticado), no evidencia de que la vertical haya dejado de operar; se trata como laguna de acceso, no como señal sobre el estado del producto.
- Se asume que Holidu, por operar principalmente en Europa según la evidencia leída, no tiene cobertura confirmada en LatAm; no se asume lo contrario sin evidencia adicional.

## Fuentes de este módulo

Todas las fechas de consulta: 2026-09-05 (fetch en vivo, salvo indicación de bloqueo). Solo se listan URLs efectivamente leídas por este módulo o por esta pasada de corrección; ver `docs/fuentes/rv05-08-14.md` (sección RV14) para el detalle completo de cada cita.

**Guesty**
- https://www.guesty.com/ (home; re-verificada en esta pasada)
- https://www.guesty.com/features/ai-for-short-term-rentals/
- https://www.guesty.com/pricing/ (re-verificada en esta pasada)

**Hostaway**
- https://www.hostaway.com/ (home)
- https://www.hostaway.com/ai-cohost/ (re-verificada en esta pasada)
- https://www.hostaway.com/pricing/

**OwnerRez**
- https://www.ownerrez.com/ (home)
- https://www.ownerrez.com/pricing

**Smoobu**
- https://www.smoobu.com/en/ (home)
- https://www.smoobu.com/en/pricing/

**Uplisting**
- https://www.uplisting.io/ (home)
- https://www.uplisting.io/pricing

**Beds24**
- https://beds24.com/ (home; re-verificada en esta pasada)
- https://beds24.com/pricing.html

**Hospitable**
- https://www.hospitable.com/ (home)
- https://www.hospitable.com/pricing/ (re-verificada en esta pasada — cita corregida, ver "Riesgos/límites")

**Hostfully**
- https://www.hostfully.com/ (home)

**iGMS**
- https://www.igms.com/ (home)
- https://www.igms.com/pricing/

**Rentals United**
- https://rentalsunited.com/ (home)

**Holidu (nuevo, esta pasada)**
- https://www.holidu.com/host/partners

**TripAdvisor Rentals (intentos fallidos, nuevo, esta pasada — HTTP 403 en las tres)**
- https://www.tripadvisor.com/Rentals
- https://www.tripadvisor.com/rental-owners-help
- una tercera URL de listados de TripAdvisor Rentals (probada por el orquestador de esta corrección)

**Agregador regional adicional intentado (fallido, esta pasada)**
- rentalia.com (HTTP 403)

**Lodgify** — sin URL leída con éxito (403 en 3 intentos: home, /pricing/, /comparisons/lodgify-vs-guesty/); ficha basada en snippets, confianza baja.

**Nota de honestidad sobre el conteo**: el total de URLs efectivamente leídas para este módulo (≈20, contando home+pricing por producto más las 2 nuevas de Holidu/TripAdvisor) queda por debajo de 25. No se completó la lista con URLs no leídas para alcanzar un número mayor — ver también "Riesgos/límites".
