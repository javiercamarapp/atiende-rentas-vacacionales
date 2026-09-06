# RV08 — Conectividad directa vs. channel manager/partner vs. iCal puro

**Fecha de consulta de todas las fuentes:** 2026-09-05.
**Ledger de citas:** ver `docs/fuentes/rv05-08-14.md` (sección RV08).

## Resumen ejecutivo

Ninguno de los tres canales grandes (Airbnb, Booking.com, Vrbo/Expedia Group) publica costos ni plazos oficiales de certificación como partner directo; solo documentan requisitos cualitativos (NDA, revisión de seguridad de datos, cumplimiento de estándares técnicos) y, en el caso de Airbnb, un plazo post-aprobación de 6 meses [DATO] para implementar features obligatorias. Los channel managers/PMS con API pública documentada (Guesty, Hostaway, Beds24 —parcial—, OwnerRez, Smoobu) ofrecen activación de su propia API en minutos/self-service, pero eso no equivale a certificación con los canales OTA subyacentes, que el channel manager ya resolvió por su cuenta; Lodgify y Uplisting no pudieron verificarse por bloqueo de acceso (403). El iCal puro es inmediato y gratuito pero tiene limitaciones documentadas explícitamente por los propios canales: Airbnb sincroniza cada 3 horas [DATO] (cita oficial; confianza baja/media específicamente para su aplicabilidad a conexiones producto-Airbnb, ver RV03 supuesto S1; latencia externa no controlada por Atiende), Vrbo cada 30 minutos nominal [DATO], Booking.com "minutos a horas" [R] (no verificado verbatim); ningún canal ofrece tiempo real vía iCal, y el riesgo de doble reserva es el más alto de las tres rutas. El fenómeno de "eco"/bucle de sincronización solo lo documenta explícitamente un proveedor de channel manager con interés comercial (Hosthub), no los canales OTA. La recomendación por etapas debe basarse en supuestos explícitos [E] dado que costos y plazos reales de certificación directa son PENDIENTE en fuente oficial. **Corrección de auditoría (2026-09-05):** esta versión incorpora un cuarto tipo de vía —agregadores— que no había sido investigado en el corpus RV05/RV08/RV14 pese a estar en el alcance original de 00-PLAN §5. Holidu sí pudo investigarse con éxito vía fuente oficial [DATO] (alcance confirmado solo en Europa); TripAdvisor Rentals y Rentalia.com se intentaron hoy y ambos quedaron bloqueados (HTTP 403), declarados como laguna honesta e intento fallido explícitos respectivamente (ver §1.4), en vez de dejarse como vacío silencioso.

## Contenido

### 1. Conectividad directa por canal

**Airbnb**: no hay API pública abierta; requiere NDA mutuo, revisión de seguridad de datos, y tras aprobación, "Implementing all mandatory API features within 6 months" [DATO] (único plazo oficial documentado, y es post-aprobación). Programa "Preferred Software Partners" (niveles Preferred y Preferred+) evalúa "integration, technical, foundational, and performance standards" más revisión de calidad de API. Costo: PENDIENTE.

**Booking.com**: Connectivity Partners gestionan disponibilidad, reservas y precios vía API; certificación específica por producto (ej. Key Collection API requiere estar "Content API certified" primero). Proceso de aplicación vía connect.booking.com para nuevos partners, sin plazo oficial documentado. Costo: PENDIENTE. Nota: afirmaciones de terceros sobre que el portal no acepta nuevas inscripciones no se confirmaron en fuente oficial.

**Vrbo/Expedia Group (Rapid API)**: proceso de 6 pasos [DATO] documentado (aplicar, revisar requisitos, preparar entorno, obtener credenciales, probar en sandbox `test.ean.com`, solicitar "site review"); tras aprobación, producción sin cambios de código. Programa "Certified Technology Partners" con niveles Elite/Preferred, evaluados de forma periódica ("on a defined cycle"). Sin plazo oficial documentado (estimaciones de 6–12 meses [R] circulantes en la industria no son oficiales). Costo: PENDIENTE.

### 1.4 Otros canales/agregadores (Holidu, TripAdvisor Rentals, Rentalia)

**Corrección de auditoría independiente (Alta, cerrada 2026-09-05):** RV05/RV08/RV14 no habían investigado TripAdvisor Rentals ni otros canales/agregadores pese a estar nombrados explícitamente en el alcance de RV05 (00-PLAN.md §5) y en `docs/LAGUNAS.md` §4.1. Esta subsección documenta la investigación en vivo realizada hoy para cerrar esa corrección: un agregador sí investigado con éxito (Holidu), y dos intentos fallidos documentados explícitamente (TripAdvisor Rentals, Rentalia.com), en vez de dejarlos en silencio.

**Holidu** (agregador/OTA europeo — investigado con éxito). Según su página oficial para agencias con 30+ propiedades (`holidu.com/host/partners`), cita verbatim [DATO]: *"Holidu integrates with over 75 Property Management Systems and Channel Managers worldwide. Choose your preferred connection method: via Property Management System, Channel Manager, or directly through our Holidu API."* La página lista 75+ PMS/channel managers compatibles [DATO]. Una vez conectado, la cita oficial señala [DATO]: *"your listings go live across Holidu's high-performing platform and app network, and out to 25+ international booking sites."* Sobre el flujo de pago, cita oficial [DATO]: *"When a guest books through Holidu, we'll take care of the payment process securely on our platform whenever possible."* No se encontró información de comisión/precio en esa página — Costo: PENDIENTE. Presencia en LatAm: **no confirmada** [E] (ausencia de evidencia, no evidencia de ausencia); la página y el posicionamiento de partners sugieren un enfoque predominantemente europeo.

Modelo distinto al de un canal "directo": Holidu no es equivalente a Airbnb/Booking/Vrbo (no hay conectividad 1:1 canal↔anfitrión); es un agregador que recibe disponibilidad **vía** un PMS/channel manager ya conectado, o vía su propia API. Para el caso ancla de Atiende esto implica que Holidu se sumaría (a) como canal adicional detrás de la misma capa de channel manager si se elige esa ruta, o (b) como una cuarta forma de integración ("agregador vía API propia") si se optara por conectividad directa — no encaja limpiamente en ninguna de las tres rutas comparadas en la sección 5.

**TripAdvisor Rentals — LAGUNA HONESTA confirmada (reconfirmada hoy, no es una laguna nueva).** Se intentó acceder tres veces el 2026-09-05 vía fetch directo:
- `https://www.tripadvisor.com/Rentals` → HTTP 403 Forbidden.
- `https://www.tripadvisor.com/rental-owners-help` → HTTP 403 Forbidden.
- `https://www.tripadvisor.com/Rentals-g1-Reviews-Vacation_Rentals` → HTTP 403 Forbidden.

Con los tres intentos bloqueados, **no se puede confirmar ni negar** si TripAdvisor Rentals sigue operando como vertical activa de rentas vacacionales, ni si mantiene programa de partner/conectividad/iCal. Qué haría falta para cerrar esta laguna: (a) acceso autenticado o de partner aprobado a TripAdvisor; (b) reintento de fetch directo en otro momento/entorno (el bloqueo puede ser transitorio o por IP/user-agent); (c) verificación vía Wayback Machine — descartada en esta sesión porque el acceso a Wayback está confirmado bloqueado también para otros módulos del proyecto hoy, por lo que no sirvió como vía alterna.

**Rentalia.com — intento fallido explícito.** Fetch directo a `https://www.rentalia.com/` el 2026-09-05 devolvió HTTP 403 Forbidden. No se obtuvo ninguna información oficial sobre su modelo de conectividad, comisión o vigencia actual como agregador (histórico del grupo Expedia/HomeAway, enfoque España/LatAm). Se declara como bloqueo de acceso, no como ausencia de relevancia para el caso ancla.

### 2. Channel managers con API pública documentada

| Proveedor | Documentación pública | Alcance | Costo | Confianza |
|---|---|---|---|---|
| Guesty | Sí (open-api-docs.guesty.com, actualizado 2025-09-17) | REST, OAuth2, reservas/listings/huéspedes/pagos/webhooks, hasta 15 req/s [DATO] | Desde $9/mes/listado (Lite) [DATO]; Pro/Enterprise "get a quote"; no confirmado si Open API requiere plan específico | Alta (doc) / Media (costo, inferencia) |
| Hostaway | Sí (api.hostaway.com/documentation) | OAuth2 client_credentials, CRUD de listings/reservas, calendarios | Sin mención de costo en la doc | Alta (doc) / PENDIENTE (costo) |
| Beds24 | Referenciada (wiki.beds24.com), fetch directo bloqueado (403) | API v2, self-service, 60 llamadas/5 min por defecto [R] | Sin costo mencionado | Media (no verificado verbatim) |
| Rentals United | XML pública (specification v1.20200106), fetch parcial bloqueado | Canal manager, reclama "50+ canales" [R] (no verificado por fetch directo) | Snippet indica "sin costo" y "~1 mes" [R]; fetch directo solo confirmó rango genérico "24h a varias semanas" [DATO] — discrepancia no resuelta | Media |
| OwnerRez | Sí (parcial) | Dos APIs: "API for Apps" (PAT/OAuth, webhooks, sandbox) y "API for Channel Integration" | Sin mención de costo en contenido accedido | Media |
| Lodgify | Bloqueada (403 en todos los intentos) | Info solo vía snippets de terceros no oficiales | No confirmado en fuente oficial | Baja |
| Smoobu | Sí (support.smoobu.com) | REST, HMAC recomendado, API key legacy (sunset 2026-09-25 [DATO]), OAuth2 solo partners, 1000 req/min [DATO] | Requiere contacto previo, sin tier explícito | Alta (doc) / PENDIENTE (costo) |
| Uplisting | Bloqueada (403), Postman público referenciado | Bookings, disponibilidad, tarifas, webhooks | Snippet indica "invite-only" — no confirmado | Baja |

### 3. iCal puro — limitaciones documentadas oficialmente

- **Airbnb** (cita oficial, Help Center artículo 99): "Your Airbnb calendar automatically updates every 3 hours" [DATO]. Import hasta 2 años de datos [DATO]; refrescos manuales limitados por tasa; enlaces deben terminar en `.ics`; no se puede pausar un calendario importado (hay que desconectar/reconectar).
- **Vrbo** (cita oficial): "Calendars sync every 30 minutes" [DATO]; máximo 5 calendarios por propiedad [DATO]; hasta 365 días de eventos visibles [DATO]; no funciona si la propiedad se gestiona vía PMS de terceros.
- **Booking.com** (vía snippet, fetch bloqueado, confianza media): sync "not meant to be real-time, often taking anywhere from a few minutes to a few hours" [R]; pensado para partners sin channel manager. Artículo oficial de dobles reservas cita "not syncing availability across channels" como causa común (no verificado verbatim).
- **Conclusión de consenso técnico**: ningún canal ofrece sincronización iCal en tiempo real; la ventana de exposición a doble reserva en una cadena multi-canal depende del canal más lento (Airbnb 3h [DATO] es el peor caso documentado explícitamente).

### 4. Riesgo de "eco"/bucle de sincronización

- Ningún canal OTA (Airbnb/Booking.com/Vrbo) documenta oficialmente el fenómeno de "eco" o bucle.
- Un proveedor de channel manager (Hosthub, fuente comercial con sesgo hacia vender su propio producto) sí lo describe explícitamente: combinar iCal con un channel manager puede generar "'looping' errors" donde una reserva sincronizada por el channel manager dispara un re-bloqueo vía iCal de las mismas fechas, y conectar N canales por iCal puro requiere N×(N-1) feeds bidireccionales [R] con riesgo de "circular reference errors". Confianza media-baja por el sesgo comercial de la fuente.
- Vrbo sí documenta un caso relacionado y verificado oficialmente: riesgo de "payment issues" al reimportar el propio calendario exportado (ver RV05).

### 5. Comparación de las tres rutas

| Dimensión | Directa (Airbnb/Booking/Vrbo) | Channel manager | iCal puro |
|---|---|---|---|
| Tiempo de homologación | Airbnb: PENDIENTE (solo hay plazo post-aprobación de 6 meses [DATO]); Booking.com: PENDIENTE; Expedia/Vrbo: proceso de 6 pasos sin plazo oficial | Muy variable; activación de la API propia del CM es casi inmediata (self-service), pero eso no incluye la certificación del CM con cada OTA (ya resuelta por el CM) | Inmediato / self-service |
| Costo | PENDIENTE en los 3 canales | Costo del SaaS por plan (ej. Guesty desde $9/listado/mes [DATO]); sin fee adicional documentado por "usar la API" | Gratis (implícito, sin cita textual "es gratis") |
| Control de datos | Alto (acceso nativo a reservas/precios/huéspedes vía scopes) | Alto pero mediado por el CM (dependencia de su infraestructura y su propia certificación) | Muy bajo (solo fechas/estado; sin precio ni datos de huésped, por diseño del estándar VEVENT — no confirmado con cita textual explícita de los canales) |
| Dependencia de terceros | Alta pero directa (una capa) | Alta en dos capas (canal + CM) | Baja técnicamente, pero cada canal controla su propio motor de iCal sin SLA documentado |
| Riesgo de doble reserva | Bajo (diseño con tiempo real/webhooks) | Bajo-medio (sin cifras oficiales de latencia — PENDIENTE) | Alto (3h Airbnb [DATO], 30 min nominal Vrbo [DATO], minutos-horas Booking.com [R]; ninguno tiempo real) |
| Cobertura de canales | Una integración = un canal, hay que repetir por canal | Amplia con una integración (cifras de "50+"/"60+"/"90+" canales [R] no verificadas por fetch directo en todos los casos) | Universal en teoría, pero con límites por canal (ej. 5 calendarios máx. en Vrbo [DATO]) |

**Nota — agregadores (cuarto tipo, no encaja en las tres columnas de arriba):** Holidu (ver §1.4) no es "directo" (sin conectividad 1:1 canal↔anfitrión tipo Airbnb/Booking/Vrbo) ni un channel manager en sí mismo; se integra vía un PMS/channel manager ya existente o vía su propia API, y añade 25+ sitios de reserva [DATO] detrás de una sola conexión, con presencia confirmada solo en Europa. TripAdvisor Rentals y Rentalia.com quedan fuera de esta tabla por bloqueo de acceso (403) — ver §1.4 para el detalle de los intentos.

## Riesgos/límites

- Costos y plazos reales de certificación directa con Airbnb, Booking.com y Expedia/Vrbo son PENDIENTE en todas las fuentes oficiales revisadas — cualquier cifra de la industria (6–12 meses, "15 días") es de terceros, no oficial.
- Fetch directo bloqueado (403) en varias páginas clave: wiki.beds24.com (2 rutas), docs.rentalsunited.com, docs.lodgify.com (todas las rutas probadas), support.uplisting.io, y dos páginas de partner.booking.com — la información de estos proveedores descansa en resúmenes de búsqueda, no en lectura verbatim.
- Discrepancia no resuelta en Rentals United entre snippet de búsqueda ("sin costo", "~1 mes") y fetch directo de la misma URL (rango genérico "24h a varias semanas").
- La exclusión de precio/datos de huésped en el feed iCal de Airbnb/Vrbo es consenso de terceros (vendors), no cita textual oficial explícita.
- El fenómeno de eco/bucle solo está documentado por una fuente con interés comercial en desalentar iCal puro (venden channel manager); no hay confirmación neutral.
- La supuesta pausa de inscripciones nuevas en el portal de partners de Booking.com aparece solo en blogs de terceros, no en fuente oficial.
- TripAdvisor Rentals y Rentalia.com quedaron bloqueados (403) en los tres y un intentos respectivos del 2026-09-05 — ver §1.4 y la sección "Lagunas" para el detalle y qué haría falta para cerrarlos.

## Implicaciones para requisitos (RV08-R-nn)

- **RV08-R-01**: La arquitectura de Atiende debe soportar las tres rutas de conectividad (directa, channel manager, iCal) como módulos independientes y componibles por canal, dado que ningún canal impone una única vía y los plazos/costos de certificación directa son inciertos.
- **RV08-R-02**: El motor de "cierre" de disponibilidad debe modelar explícitamente la latencia máxima documentada por canal (Airbnb 3h, Vrbo 30 min nominal, Booking.com minutos-horas) como ventana de riesgo de doble reserva cuando se use iCal, y comunicarlo al usuario como estado "eventual", no "tiempo real".
- **RV08-R-03**: Antes de comprometerse con conectividad directa certificada, se requiere un descubrimiento activo con cada canal (formulario de partner) para obtener costos/plazos reales, dado que no existen públicamente — no se debe prometer fecha de aprobación al negocio sin esa validación.
- **RV08-R-04**: Si se evalúa integrar un channel manager como capa intermedia, priorizar los que documentan API pública verificable (Guesty, Hostaway, Smoobu, OwnerRez) sobre los que no se pudieron verificar (Lodgify, Uplisting) hasta confirmar acceso real.
- **RV08-R-05**: El sistema debe incluir detección de posibles bucles de sincronización (re-importación de export propio, doble bloqueo por combinación de iCal + channel manager) como caso de prueba explícito, dado que Vrbo ya advierte sobre ello oficialmente.
- **RV08-R-06**: La recomendación por etapas para el negocio: (1) iniciar con iCal puro para validar demanda con riesgo de doble reserva mitigado por buffers de tiempo; (2) evaluar un channel manager con API pública verificada para cobertura multi-canal más rápida; (3) perseguir conectividad directa certificada solo para canales de alto volumen, con supuestos explícitos de tiempo/costo hasta tener confirmación oficial. Esta recomendación NO garantiza aprobación de ningún partner.
- **RV08-R-07**: La arquitectura de conectores debe reservar un cuarto patrón de integración ("agregador vía PMS/channel manager o API propia", ejemplo Holidu) distinto de los tres anteriores, dado que un agregador no tiene conectividad 1:1 con el anfitrión y su disponibilidad depende de la capa que ya se elija para Airbnb/Booking/Vrbo. No se debe comprometer un canal agregador con presencia en LatAm sin verificación adicional, dado que Holidu solo confirma cobertura europea.

## Lagunas

- Costos y plazos oficiales de certificación directa (Airbnb, Booking.com, Expedia/Vrbo): PENDIENTE en todos los casos.
- Verificación directa (bloqueada por 403) de Beds24, Rentals United, Lodgify, Uplisting y dos páginas de partner.booking.com.
- Confirmación textual oficial de que el iCal excluye precio y datos de huésped (solo inferido del estándar, no citado literalmente por los canales).
- Confirmación neutral (no comercial) del fenómeno de eco/bucle de sincronización.
- Confirmación oficial de si Booking.com pausó nuevas inscripciones de partners.
- **TripAdvisor Rentals — LAGUNA HONESTA explícita (reconfirmada 2026-09-05):** tres intentos de fetch directo (`tripadvisor.com/Rentals`, `tripadvisor.com/rental-owners-help`, `tripadvisor.com/Rentals-g1-Reviews-Vacation_Rentals`) devolvieron HTTP 403. No se puede confirmar ni negar si sigue operando como vertical activa ni si tiene programa de partner/iCal. Para cerrarla hace falta acceso autenticado/partner, un reintento en otro entorno, o Wayback Machine (bloqueado también hoy para otros módulos, no disponible como vía alterna en esta sesión). Fila relacionada: `docs/LAGUNAS.md` §4.1, "TripAdvisor Rentals".
- **Rentalia.com — intento fallido explícito (2026-09-05):** fetch directo a `rentalia.com` devolvió HTTP 403. Sin información oficial de conectividad/comisión. Fila relacionada: `docs/LAGUNAS.md` §4.1, "Agregadores regionales LATAM/España".
- **Holidu — cobertura parcial:** confirmado con fuente oficial solo el modelo de conectividad y la existencia de 75+ integraciones y 25+ sitios de reserva destino; **no confirmado**: comisión/precio, y presencia o ausencia real en LatAm (solo ausencia de evidencia en la página revisada, no una negación oficial).
- **Conteo de fuentes de este módulo por debajo del mínimo del plan (§1 punto 3 de `00-PLAN.md`, ≥25 URLs):** contando solo fuentes con contenido leído con éxito (no los intentos bloqueados con 403), este módulo reúne 16 fuentes primarias/oficiales distintas (15 del cuerpo original + Holidu). Los bloqueos de hoy (TripAdvisor ×3, Rentalia ×1) y los 8 bloqueos previos ya documentados en el ledger se listan en "Fuentes de este módulo" como intentos fallidos, no se cuentan como fuentes evidenciales para no inflar el conteo. Cerrar esta laguna requiere acceso de partner/autenticado a los canales bloqueados (Beds24, Rentals United, Lodgify, Uplisting, Booking.com partner portal, TripAdvisor, Rentalia) para convertir intentos fallidos en fuentes primarias reales.

## Supuestos

- Se asume que el costo de certificación directa con Airbnb/Booking/Expedia es no trivial en tiempo de ingeniería y soporte operativo (mencionado cualitativamente por fuentes secundarias sobre exigencia de "madurez operativa"), sin cifra oficial que lo confirme.
- Se asume que las cifras de cobertura de canales publicitadas por channel managers ("50+", "60+", "90+") son representativas del pedido de marketing, sin verificación independiente canal por canal.
- Se asume que un enfoque por etapas (iCal → channel manager → directa) reduce el riesgo de compromiso temprano sin confirmación de aprobación, dado que ningún canal garantiza aceptación como partner.

## Fuentes de este módulo

Todas las fuentes de esta lista fueron consultadas el **2026-09-05**. Ledger detallado con citas verbatim completas en `docs/fuentes/rv05-08-14.md` (sección RV08). Fuentes leídas con éxito (evidenciales) marcadas con ✓; intentos bloqueados (403) marcados con ✗ — no cuentan para el mínimo de fuentes del plan (ver "Lagunas").

**Conectividad directa — Airbnb**
- ✓ Adding calendar sync (import) — Airbnb Help Center, artículo 99 — https://www.airbnb.com/help/article/99
- ✓ API Terms of Service — Airbnb — https://www.airbnb.com/help/article/3418
- ✓ Preferred Software Partners — Airbnb — https://www.airbnb.com/software-partners/preferred-partners
- ✓ Announcing our 2025 Preferred Software Partners — Airbnb Newsroom — https://news.airbnb.com/announcing-our-2025-preferred-software-partners/

**Conectividad directa — Booking.com**
- ✓ Connectivity docs — Booking.com Developers — https://developers.booking.com/connectivity/docs
- ✓ Check-in methods API — Booking.com Developers — https://developers.booking.com/connectivity/docs/checkin-methods-api
- ✗ partner.booking.com — sync calendar feature (403)
- ✗ partner.booking.com — double bookings (403)

**Conectividad directa — Vrbo/Expedia Group**
- ✓ Certified Technology Partners Program — Expedia Group — https://partner.expediagroup.com/en-us/solutions/build-your-travel-experience/rapid-api/certified-technology-partners-program
- ✓ Getting Started — Expedia Group Developer Hub (Rapid) — https://developers.expediagroup.com/docs/products/rapid/setup/getting-started

**Channel managers con API pública**
- ✓ Getting Started — Guesty Open API — https://open-api-docs.guesty.com/docs/getting-started
- ✓ Guesty API (features) — https://www.guesty.com/features/api/
- ✓ Guesty Pricing — https://www.guesty.com/pricing/
- ✓ Hostaway API documentation — https://api.hostaway.com/documentation
- ✓ How it works (PMS) — Rentals United — https://rentalsunited.com/how-it-works-pms/
- ✓ API Overview — OwnerRez — https://www.ownerrez.com/support/articles/api-overview
- ✓ Smoobu API Documentation — https://support.smoobu.com/hc/en-us/articles/360003170740-Smoobu-API-Documentation
- ✗ wiki.beds24.com/index.php/Category:API (403)
- ✗ wiki.beds24.com/index.php/Category:Developers (403)
- ✗ docs.rentalsunited.com/hc/... (403)
- ✗ docs.lodgify.com — todas las rutas probadas (403)
- ✗ support.uplisting.io/docs/api (403)

**Otros canales/agregadores (corrección de auditoría, 2026-09-05)**
- ✓ Host Partners — Holidu — https://www.holidu.com/host/partners
- ✗ tripadvisor.com/Rentals (403)
- ✗ tripadvisor.com/rental-owners-help (403)
- ✗ tripadvisor.com/Rentals-g1-Reviews-Vacation_Rentals (403)
- ✗ rentalia.com (403)

**Fuente comercial citada con advertencia de sesgo (no cuenta como fuente de nivel 1-2)**
- Hosthub (blog de proveedor de channel manager) — fenómeno de "looping"/"circular reference errors" en combinaciones iCal + channel manager. URL exacta no registrada en el ledger original — pendiente de completar si se requiere re-verificación (no se inventa la URL aquí).

**Conteo:** 16 fuentes leídas con éxito (evidenciales) + 12 intentos bloqueados documentados explícitamente = 28 URLs distintas mencionadas en este módulo. Por debajo del mínimo de 25 fuentes *evidenciales* que exige `00-PLAN.md` §1 punto 3 si se cuentan solo las leídas con éxito (16). Declarado explícitamente aquí y en "Lagunas" en vez de inflar el conteo incluyendo los bloqueos como si fueran fuentes primarias verificadas.
