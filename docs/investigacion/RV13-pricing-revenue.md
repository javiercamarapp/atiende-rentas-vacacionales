# RV13 — Pricing dinámico y Revenue Management para Rentas Vacacionales

**Módulo:** RV13
**Fecha de consulta de todas las fuentes:** 2026-09-05
**Alcance:** Investigación de fuentes primarias (ayuda oficial de canales, documentación pública de APIs de partners, páginas oficiales de producto de PriceLabs/Beyond Pricing/Wheelhouse) para fundamentar los requisitos de pricing y revenue management de Atiende Rentas Vacacionales.

---

## Resumen ejecutivo

Airbnb y Vrbo documentan públicamente, en sus centros de ayuda, mecanismos nativos de pricing dinámico (Smart Pricing en Airbnb, MarketMaker/rate automation en Vrbo), descuentos por duración de estancia con umbrales idénticos entre ambos canales (7+ noches = semanal, 28+ noches = mensual), y control de estancia mínima/máxima configurable por fecha y día de check-in. Booking.com, en cambio, documenta su mecanismo de descuento principal (Genius) como un programa de visibilidad a cambio de un descuento al huésped, no como un motor de pricing dinámico propio equivalente a Smart Pricing; su API de Connectivity sí expone campos de pricing (incluyendo "derived pricing" y pricing por ocupación), pero la documentación técnica detallada de esos campos está actualmente detrás de un portal para partners aprobados (parte del contenido público consultado apareció "sunset"/redirigido).

Un hallazgo central para el diseño del producto: **ninguno de los artículos oficiales de sincronización de calendario (iCal/.ics) de Airbnb o Vrbo menciona la transmisión de precios** — solo disponibilidad, bloqueos, tiempos de preparación y anticipación mínima. Esto confirma, con fuentes primarias, que iCal es insuficiente para gestionar tarifas entre canales y que Atiende necesitará integraciones vía API (donde el canal las ofrezca y autorice) o gestión centralizada/manual de tarifas para canales que solo permitan iCal.

Sobre paridad de tarifas: Booking.com confirma oficialmente que eliminó las cláusulas de paridad de precio para partners en el Espacio Económico Europeo (EEE) por cumplimiento del Digital Markets Act de la UE, pero no está claro (PENDIENTE) si esto aplica igual en otras jurisdicciones relevantes para los clientes de Atiende.

Las tres herramientas de revenue management del mercado (PriceLabs, Beyond Pricing, Wheelhouse) confirman en sus propias páginas oficiales que ofrecen pricing dinámico basado en demanda/mercado, integraciones multi-canal (Airbnb, Booking.com, Vrbo) y, en el caso de Beyond y Wheelhouse, APIs propias para integraciones custom. Ninguna de las tres expone su modelo de precio/comisión en las páginas de producto consultadas (remiten a páginas de planes no cargadas en esta sesión) — se marca como PENDIENTE, sin inventar cifras.

La gestión de inventario multi-unidad y asignación de unidades es, como se indicó en el encargo, principalmente una decisión de diseño interno de Atiende; sin embargo, Airbnb documenta oficialmente un mecanismo nativo de agrupación de unidades con la misma dirección ("multiple units property", con listing "padre"), que es relevante como referencia de cómo los canales ya modelan el concepto de multi-unidad de cara al huésped.

---

## Contenido

### 1. Pricing dinámico, estacionalidad, orphan/gap nights, descuentos por duración y min-stay dinámico

**Airbnb — Smart Pricing.** El Centro de Ayuda oficial de Airbnb describe Smart Pricing como un ajuste automático diario del precio nocturno en función de la demanda: el sistema analiza "hundreds of factors about your listing and your area to adjust your nightly price based on demand" [DATO, art. 1168], dentro de un rango mínimo/máximo definido por el host. Reglas de precedencia documentadas explícitamente:
- Los descuentos semanales, mensuales y por duración de viaje **anulan** Smart Pricing por completo.
- El pricing de fin de semana no puede usarse simultáneamente con Smart Pricing activo.
- Un precio personalizado en una fecha específica anula Smart Pricing para esa fecha.
- Airbnb puede desactivar Smart Pricing temporalmente en desastres naturales, emergencias, disturbios políticos o por cumplimiento regulatorio local.
(Fuente: https://www.airbnb.com/help/article/1168)

**Airbnb — descuentos por duración de estancia.** Umbrales oficiales: descuento semanal para estancias de **7+ noches** [DATO], descuento mensual para **28+ noches** [DATO]. Tras aplicar el descuento, el precio diario mínimo debe ser de al menos **$10/noche** [DATO]. Descuentos de **10% o más** [DATO] se muestran destacados en resultados de búsqueda. Para estancias de 28+ noches, Airbnb puede aplicar un ahorro adicional ("Monthly Stay Savings") que es subsidiado por la propia Airbnb (no se descuenta del payout del host) [DATO] y es acumulable con otros descuentos. (Fuente: https://www.airbnb.com/help/article/1344)

**Airbnb — min/max stay y orphan/gap nights.** El artículo de configuración de reservas confirma: "Avoid reservations that are too long or short by setting your minimum and maximum trip length" [DATO] y que, si no se configura, se aplica automáticamente un máximo de **31 noches** [DATO]. También documenta ventanas de aviso previo (mismo día con hora de corte, 1, 2, 3 o 7 días) [DATO] que bloquean automáticamente el calendario — mecanismo directamente relacionado con la prevención de "orphan nights" cortas e inaprovechables. (Fuente: https://www.airbnb.com/help/article/484)

**Airbnb — min-stay dinámico y reglas granulares (rule-sets).** Para reglas más finas (min-stay dinámico por día de la semana, descuentos por rangos de duración de 2 a 6 noches y hasta 12 semanas, descuentos last-minute y early-bird, restricciones de día de check-in/checkout), Airbnb documenta "rule-sets" en sus herramientas de hosting profesional, solo editables en escritorio (no en app/móvil). El orden de aplicación documentado es: 1) precio nocturno y de fin de semana, 2) descuentos por duración de estancia, 3) descuentos early-bird/last-minute; dentro de una misma categoría, solo se aplica el descuento mayor (no se acumulan). Importante: **Smart Pricing anula rule-sets**, por lo que un host debe elegir uno u otro mecanismo, no ambos. (Fuente: https://www.airbnb.com/help/article/2061)

**Vrbo — rate automation (MarketMaker) y descuentos.** Vrbo documenta su propio motor de pricing dinámico nativo, "MarketMaker™", que da "data-based suggestions to help you price competitively" dentro de límites mínimo/máximo fijados por el host; revisa ajustes cada **24 horas** [DATO], proyecta hasta **90/180/365 días** de anticipación [DATO], admite hasta **10 reglas estacionales** [DATO], y los cambios pueden tardar hasta **48 horas** en reflejarse [DATO]. Si la automatización está activa, "the service will override rate updates made in the Calendar" [DATO] (comportamiento análogo a la precedencia de Smart Pricing sobre reglas manuales en Airbnb). Los descuentos por estancia extendida en Vrbo usan exactamente los mismos umbrales que Airbnb: **7+ noches** (semanal) y **28+ noches** (mensual) [DATO]. (Fuentes: https://help.vrbo.com/category/undefined/articles/Set-up-rate-automation, https://help.vrbo.com/articles/How-do-I-manage-my-rates)

**Vrbo — min/max stay con reglas por día de check-in.** Vrbo permite fijar noches mínimas y máximas, con la particularidad documentada de que "the minimum night stay requirement is based on the check-in date" — el propio Help Center pone como ejemplo 1 noche mínima de lunes a jueves y 3 noches para llegadas de viernes a domingo. Los overrides de mínimo de noches por fecha específica no pueden superar el máximo de noches de la propiedad. Los cambios de min/max solo aplican a disponibilidad futura, nunca a reservas ya confirmadas o solicitudes pendientes. (Fuente: https://help.vrbo.com/articles/How-do-I-set-a-minimum-stay-requirement)

**Booking.com.** No se encontró, dentro del alcance de esta investigación (bloqueada por HTTP 403 en las páginas del Partner Hub sobre Genius), un artículo de ayuda oficial de Booking.com equivalente y directamente accesible que documente un "Smart Pricing" propio de Booking.com para hosts/partners individuales. La API de Connectivity de Booking.com sí confirma soporte de "derived pricing" (tarifas derivadas de una tarifa maestra) y "occupancy-based pricing" a nivel de documentación técnica (ver sección 3), lo cual es funcionalmente relacionado con pricing dinámico, pero orientado a cómo un channel manager/PMS actualiza tarifas vía API, no a una herramienta de recomendación de precio nativa de Booking.com para el host. **Esto queda marcado como PENDIENTE de verificación adicional** — no se debe asumir que Booking.com carece de herramientas de pricing dinámico, solo que no se pudo confirmar/leer una fuente primaria propia sobre ello en esta sesión.

---

### 2. Reglas por canal, comisiones diferenciadas y paridad de precios (rate parity)

**Booking.com — Genius (descuento por visibilidad).** Los intentos de lectura directa de las páginas oficiales del Partner Hub de Booking.com sobre Genius (`partner.booking.com/.../becoming-genius-partner` y `partner.booking.com/en-us/solutions/genius-0`) devolvieron **HTTP 403 Forbidden** en ambos casos — no se pudo verificar el contenido línea por línea contra el HTML oficial. La única evidencia disponible proviene de un resumen agregado por la herramienta de búsqueda (que mezcla fuentes, incluyendo posiblemente terceros no oficiales), y reporta que el programa Genius ofrece mejor visibilidad/ranking a cambio de que el host ofrezca "10% off your least expensive and most popular room type(s)" a los viajeros Genius [R, confianza media-baja, no leído en fuente oficial], con posibilidad de bloquear el descuento hasta 30 días al año (no consecutivos) [R]. **Esta cifra del 10% y las estadísticas de impacto asociadas (aumento de vistas/reservas) se marcan como de confianza media-baja y PENDIENTE de verificación directa**, precisamente porque no se pudo leer la página oficial sin bloqueo.

**Comisiones diferenciadas por canal.** No se encontró, dentro de las fuentes públicamente accesibles en esta sesión, una tabla oficial y comparable de tasas de comisión de Airbnb vs. Booking.com vs. Vrbo por tipo de host/plan. Esto se marca explícitamente como **PENDIENTE / no público de forma comparable** — las comisiones varían por acuerdo, país, tipo de anfitrión (individual vs. profesional/PMS) y suelen requerir sesión autenticada en el extranet o el dashboard del canal para consultarse con precisión. No se debe inventar ningún porcentaje de comisión.

**Paridad de tarifas (rate parity).** Fuente oficial corporativa de Booking.com (news.booking.com) confirma:
- Definición de cláusula de paridad: exigir que "sellers of services or products (e.g. a hotel on Booking.com) offer the same price on our platform as they do on other platforms or sales channels."
- "Booking.com no longer use[s] parity clauses with its partners in the European Economic Area (EEA)", cambio enmarcado como cumplimiento del Digital Markets Act de la UE ("a policy decision that applies to large companies meeting designated thresholds, regardless of their industry").
- Booking.com sostiene que su uso histórico de estas cláusulas "did not breach competition law or cause partners or consumers any loss or harm" (posición corporativa, no una admisión de infracción).
- La fuente **no** enumera de forma exhaustiva en qué otras regiones/países fuera del EEE siguen vigentes cláusulas de paridad — esto se marca como **PENDIENTE**, relevante porque el estado de paridad puede variar según el mercado donde opere cada cliente de Atiende.
(Fuente: https://news.booking.com/legal-claims-parity-class-actions/)

No se encontró en esta sesión una declaración pública equivalente y explícita de Airbnb o Vrbo sobre cláusulas de paridad de tarifas contractuales con sus hosts — se marca como **PENDIENTE**.

---

### 3. Qué expone cada canal para gestionar tarifas: API vs. iCal

**Hallazgo clave confirmado con fuentes primarias: iCal transmite disponibilidad, no precios.**

- El artículo oficial de Airbnb sobre sincronización de calendario ("Sync your home host calendar to other websites") documenta en detalle qué bloquea el calendario exportado — reservas, bloqueos manuales, tiempo de preparación, aviso previo y estancias mínimas — pero **en ningún momento menciona la sincronización de precios/tarifas**. La actualización es automática cada 3 horas (confianza baja/media específicamente para su aplicabilidad a conexiones producto-Airbnb, ver RV03 supuesto S1; latencia externa no controlada por Atiende), importa hasta 2 años de datos, y requiere URLs con extensión `.ics`. (Fuente: https://www.airbnb.com/help/article/99)
- Los artículos oficiales de Vrbo sobre gestión de tarifas ("Manage your rates and discounts") tratan el pricing en una sección completamente separada de la sincronización de calendario, reforzando que son mecanismos independientes.
- Por diseño, esto es consistente con el hecho de que iCal (formato .ics) está pensado únicamente para bloqueo de fechas/eventos, no para transportar campos de tarifa — dato de contexto técnico general que no se verificó directamente contra el estándar RFC 5545 en esta sesión (marcado como PENDIENTE si se requiere esa cita exacta).

**Conclusión de diseño:** para cualquier canal con el que Atiende solo pueda integrarse vía iCal, el pricing (base, descuentos, min-stay) **debe gestionarse de forma centralizada dentro de Atiende y/o manualmente en el canal**, nunca asumiendo que se sincronizará automáticamente. Solo mediante una integración API real (y autorizada) puede Atiende leer o escribir tarifas de forma sincronizada con el canal.

**Airbnb — Homes API (developer.withairbnb.com).** La página pública del portal de desarrolladores de Airbnb confirma la existencia de una "Homes API" oficial para partners, con áreas funcionales documentadas en la página de inicio: "Sync Availability Checks" (confirmar disponibilidad en tiempo real), "Manage Listings" y "Reservations". Requiere configurar app/usuarios, pasar por el Partner Portal y probar en un entorno "Sandbox V2" antes de producción. **La documentación de referencia detallada (qué campos de precio exactos —base price, descuentos, min-stay— expone la API en JSON) no fue accesible en esta sesión sin credenciales de partner aprobado** — se marca como PENDIENTE / no público sin acceso de partner. (Fuente: https://developer.withairbnb.com)

**Booking.com — Connectivity API (Rates & Availability).** La documentación pública de preguntas frecuentes de la API confirma que sí expone campos de pricing, no solo disponibilidad:
- "Standard pricing, occupancy-based pricing, derived pricing, and single-use pricing."
- Modelos de ocupación: adultos hasta la capacidad máxima de la habitación, niños como add-on.
- "Rate Level Occupancy pricing (RLO)" y funcionalidad de "rate rewrite".
- Límites documentados: los precios no pueden exceder **€50,000** ni ser inferiores a **€5** en la moneda de la propiedad [DATO]; existe un error específico `INVALID_USE_OF_SINGLE_OCCUPANCY`; la ocupación de niños "doesn't follow any rules, constraints or logic that relies on the number of persons"; no se puede modificar el valor de una tarifa hija tipo "XML Res Rate".
(Fuente: https://developers.booking.com/connectivity/docs/con-faq-rates-availability)

Sin embargo, la documentación de referencia más profunda del esquema técnico (por ejemplo, la página específica de `PricingType`) apareció como **"sunset"** (redirigida, sin contenido sustantivo accesible) en el momento de esta consulta, y el portal más nuevo de Booking/Expedia Group (`developers.booking.com` / `connectivityportal.expediagroup.com`) requiere navegación adicional o credenciales de partner para ver el detalle campo por campo. Esto se marca como **PENDIENTE / no público sin acceso de partner**.

**Expedia Group / Vrbo — Rapid API y Availability and Rates API.** La página pública de introducción a Rapid API (developers.expediagroup.com/rapid/) confirma la existencia de cuatro líneas de producto (Lodging, Cars, Flights, Activities) y remite a documentación completa, un API explorer y SDKs, pero **no detalla públicamente en la landing page** estructuras de tarifa, parámetros de disponibilidad ni capacidades de restricción de largo de estancia. El enlace directo al glosario de la "Availability and Rates API" redirige (HTTP 302) a un portal (`connectivityportal.expediagroup.com/documentation/expedia`) que, sin autenticación, solo muestra la palabra "Documentation" sin contenido accesible. Esto se marca como **PENDIENTE / no público sin acceso de partner aprobado**.

Por el lado del propietario/host (no API), Vrbo sí documenta públicamente y en detalle su propia herramienta de pricing (MarketMaker, ver sección 1) y sus reglas de descuento/min-stay — es decir, la funcionalidad existe y está bien documentada para el host final, aunque el acceso programático (API) para terceros como Atiende requiere aprobación de partner no verificable públicamente.

**Resumen para diseño de producto (RV13):**

| Canal | Pricing vía iCal | Pricing vía API pública documentada | Detalle técnico de campos verificado en esta sesión |
|---|---|---|---|
| Airbnb | No (solo disponibilidad, confirmado por fuente primaria) | Sí existe Homes API, pero campos de precio no verificables sin acceso de partner | PENDIENTE |
| Booking.com | No hay fuente propia de Booking.com confirmada en esta sesión (evidencia indirecta vía terceros); Booking.com generalmente no ofrece iCal como su método principal de conectividad, prioriza XML/Connectivity API | Sí — API de Rates & Availability confirma pricing estándar, derivado y por ocupación | Parcial (FAQ sí, esquema detallado no) |
| Vrbo/Expedia | No hay fuente propia confirmada explícitamente en esta sesión, pero la separación entre secciones de "rates" y "calendar sync" en su Help Center es consistente con el patrón de Airbnb | Sí existen Rapid API y Availability and Rates API mencionadas, pero contenido técnico gated | PENDIENTE |

---

### 4. Herramientas del mercado: PriceLabs, Beyond Pricing, Wheelhouse

**PriceLabs** (hello.pricelabs.co, página oficial): motor propio llamado "Hyper Local Pulse (HLP)", descrito como "a smart pricing algorithm that uses hyper local market data to make accurate pricing decisions." [R, marketing propio del proveedor]. Incluye "Advanced Minimum Stay Intelligence" para "optimize booking duration with helpful recommendations specific to each property" (es decir, min-stay dinámico como producto). Declara sincronización directa con "Airbnb, Booking.com, VRBO and **160+ PMSs**" [R] y ofrece un "**30-day** Free Trial, no credit card required" [R]. El modelo de precio/comisión exacto **no se verificó** en esta sesión (remitido a página `/plans/` no cargada) — **PENDIENTE**, no inventar cifras.

**Beyond Pricing** (beyondpricing.com, página oficial): se autodescribe como "the only revenue management system built with real-time customer demand data" (Search-Powered Pricing) [R, marketing propio del proveedor]. Funciones declaradas: ajuste automático de tarifas, análisis de mercado en tiempo real ("Insights"), reportes para propietarios ("Owner Reports"), asistente de IA ("Neyoba"). Declara integraciones PMS bidireccionales y "API & MCP (Model Context Protocol) for custom tech stack connections" con soporte a "**30+** property management platforms" [R]. Menciona un plan gratuito con "**$50** Credit" [R] y niveles "Growth"/"Pro" sin cifra de precio explícita en la página consultada — **PENDIENTE** el modelo de comisión exacto (frecuentemente reportado como % de ingresos por fuentes de terceros, pero eso no se verificó contra la página oficial de precios).

**Wheelhouse** (usewheelhouse.com, página oficial): declara un "5th-generation engine" que analiza "**21M** listings nightly" [R] en Airbnb, Booking, VRBO y TripAdvisor, con una cifra propia de "**20.6% revenue uplift**" promedio [R, afirmación de marketing del proveedor, no verificada independientemente]. Ofrece "**15+** customizable settings" [R], agrupación de portafolios ("Dynamic Sets"), y "fully-featured APIs" que exponen recomendaciones de precio, booking scores, reportes de mercado y comp sets, con conexiones declaradas a "**40+** softwares" [R]. El modelo de precio no fue extraído (remitido a `/pricing`, no cargado) — **PENDIENTE**.

Ninguna de las tres herramientas publicó, en las páginas oficiales consultadas, cifras concretas de comisión o suscripción verificables — cualquier porcentaje que circule en fuentes de terceros (blogs comparativos, reseñas) no debe usarse como base de requisitos sin verificación directa contra la página de precios oficial del proveedor.

---

### 5. Inventario multi-unidad y asignación de unidades

**Supuesto de diseño declarado:** la lógica de inventario multi-unidad, asignación automática de unidades a reservas, y optimización de ocupación entre unidades de un mismo edificio/propiedad es, en su mayor parte, **diseño interno de Atiende** — no existe una API pública de un canal que resuelva esto por Atiende; es responsabilidad del PMS/agencia orquestar qué unidad física se asigna a cada reserva cuando hay equivalencia entre unidades.

Dicho esto, hay documentación oficial relevante como referencia de cómo los canales ya modelan el concepto de multi-unidad de cara al huésped:

- **Airbnb — "multiple units property".** Airbnb agrupa automáticamente unidades que comparten la misma dirección en un único listing "representativo": "Units with the same address are automatically grouped into a multiple units property listing to simplify management." El grupo tiene un listing "padre" (elegido por historial de reseñas, según fuentes secundarias) y los huéspedes ven "one property in their search results rather than multiple room listings." Ciertas subfunciones (p. ej. "bed and breakfast", "multiple apartments") tienen disponibilidad regional limitada (Brasil/Italia y Japón/España respectivamente, según el artículo). El artículo **no** documenta cómo se gestiona el pricing diferenciado por unidad dentro del grupo — eso queda como PENDIENTE y, en la práctica, como diseño interno de Atiende si se requiere pricing por unidad. (Fuente: https://www.airbnb.com/help/article/4050)
- **Booking.com — cuentas multi-propiedad.** No se encontró en esta sesión documentación oficial de Booking.com, directamente accesible, sobre un mecanismo equivalente a "listing groups" a nivel de unidad individual (más allá de la gestión de múltiples propiedades bajo una cuenta de partner, que es una noción distinta de "unidades intercambiables dentro de una misma propiedad"). Se marca como **PENDIENTE**.
- **Vrbo/Expedia.** No se encontró en esta sesión un artículo oficial equivalente sobre agrupación de unidades idénticas bajo un mismo listing. **PENDIENTE**.

**Implicación de diseño:** Atiende debe tratar la asignación de unidades específicas como una capa propia por encima de los canales, sincronizando disponibilidad/precio hacia el "listing representativo" de cada canal (cuando exista, como en Airbnb) y resolviendo internamente a qué unidad física corresponde cada reserva entrante.

---

## Riesgos / límites

- **Documentación gated:** las especificaciones técnicas completas de las APIs de pricing de Airbnb (Homes API), Booking.com (Connectivity API, esquema `PricingType`) y Expedia/Vrbo (Rapid API, Availability and Rates API) están detrás de portales que requieren aprobación de partner. La investigación de hoy solo pudo confirmar la **existencia** de capacidades de pricing vía API (especialmente en Booking.com, vía su FAQ pública), no el detalle exacto de payloads/campos.
- **Bloqueo de acceso (403):** las páginas oficiales de Booking.com sobre el programa Genius no pudieron leerse directamente (HTTP 403 en dos intentos); la evidencia sobre el 10% de descuento Genius proviene de un resumen de búsqueda de menor confiabilidad, no de lectura directa del HTML oficial.
- **Variabilidad geográfica:** la eliminación de cláusulas de paridad de Booking.com aplica confirmadamente al EEE; el estado en otras jurisdicciones (relevante si Atiende opera fuera de la UE) no está confirmado por la fuente leída.
- **Vigencia temporal:** varias URLs de documentación técnica (Booking.com Connectivity, Expedia Developer Hub) mostraron mensajes de "sunset"/redirección durante esta consulta (2026-09-05), lo que sugiere que estos portales están en migración activa; el contenido y las URLs pueden volver a cambiar y deberán revalidarse antes de construir integraciones reales.
- **Fuentes de proveedores de pricing (PriceLabs/Beyond/Wheelhouse):** las cifras de impacto ("20.6% revenue uplift", etc.) son afirmaciones de marketing del propio proveedor, no auditadas independientemente; no deben tratarse como garantías de resultado para clientes de Atiende.
- **No hay fuente primaria propia de Booking.com sobre pricing dinámico tipo "Smart Pricing"** confirmada en esta sesión — no se debe asumir ausencia total de esa funcionalidad, solo que no fue verificable hoy.

---

## Implicaciones para requisitos

- **RV13-R-01.** Atiende debe implementar un motor propio de reglas de pricing (precio base + estacionalidad + descuentos por duración) que pueda **exportarse/sincronizarse hacia cada canal solo cuando exista integración API activa**; para canales conectados únicamente vía iCal, el pricing debe gestionarse y aplicarse desde Atiende (o manualmente en el canal), nunca asumiendo sincronización automática de tarifas por iCal (evidencia: Airbnb art. 99, Vrbo "Manage your rates").
- **RV13-R-02.** El motor de descuentos por duración de estancia debe soportar, como mínimo, los umbrales estándar de la industria confirmados en dos canales (7+ noches = semanal, 28+ noches = mensual), permitiendo overrides por canal si en el futuro se confirman umbrales distintos en Booking.com (evidencia: Airbnb art. 1344, Vrbo "Manage your rates").
- **RV13-R-03.** El motor de min-stay debe soportar reglas dinámicas por fecha de check-in y por día de la semana (no solo un mínimo global), replicando el patrón ya soportado nativamente por Airbnb (rule-sets) y Vrbo (min-stay basado en check-in date) (evidencia: Airbnb art. 2061 y 484, Vrbo "How-do-I-set-a-minimum-stay-requirement").
- **RV13-R-04.** Cuando Atiende active un pricing dinámico propio (o de un proveedor tercero como PriceLabs/Beyond/Wheelhouse) sobre un listing de Airbnb o Vrbo, debe **desactivar explícitamente Smart Pricing / rate automation nativos del canal**, ya que ambos anulan reglas externas/manuales si quedan activos simultáneamente (evidencia: Airbnb art. 1168 y 2061 sobre precedencia de Smart Pricing; Vrbo sobre MarketMaker anulando cambios manuales de calendario).
- **RV13-R-05.** Antes de construir cualquier integración de escritura de tarifas vía API con Airbnb, Booking.com o Vrbo/Expedia, el equipo de ingeniería debe solicitar y validar acceso de partner aprobado, dado que la documentación técnica detallada de campos de precio no es pública sin esa aprobación (evidencia: developer.withairbnb.com, developers.booking.com FAQ + PricingType sunset, developers.expediagroup.com/rapid).
- **RV13-R-06.** El módulo de paridad de precios debe ser configurable por jurisdicción/mercado, dado que Booking.com solo confirma oficialmente la eliminación de cláusulas de paridad en el EEE; no debe asumirse el mismo régimen en otros países sin verificación adicional (evidencia: news.booking.com).
- **RV13-R-07.** El diseño de inventario multi-unidad debe incluir un mapeo explícito entre "unidad física interna de Atiende" y "listing representativo/padre" del canal, replicando (al menos para Airbnb) el modelo de "multiple units property" que el canal ya expone al huésped (evidencia: Airbnb art. 4050); para Booking.com y Vrbo, este mapeo debe tratarse como decisión de diseño interno hasta encontrar documentación oficial equivalente.
- **RV13-R-08.** Si Atiende evalúa integrarse con PriceLabs, Beyond Pricing o Wheelhouse en lugar de (o además de) construir un motor propio, debe solicitar directamente a cada proveedor su modelo de precio/comisión actualizado antes de incluirlo en cualquier propuesta comercial, ya que ninguno lo publica de forma explícita en la página de producto consultada.

---

## Lagunas

1. **PENDIENTE — Esquema técnico detallado de campos de precio en Airbnb Homes API** (requiere acceso de partner aprobado; solo se verificó la existencia de la API y sus áreas funcionales de alto nivel).
2. **PENDIENTE — Esquema técnico detallado (`PricingType` y afines) de la API de Booking.com Connectivity**: la URL específica apareció "sunset"/redirigida sin contenido accesible en esta sesión.
3. **PENDIENTE — Campos exactos de la Availability and Rates API y Promotions API de Expedia/Vrbo**: el enlace público redirige a un portal que exige más navegación o credenciales.
4. **PENDIENTE — Verificación directa (sin bloqueo 403) del contenido oficial del programa Genius de Booking.com**, incluyendo el porcentaje exacto de descuento y las estadísticas de impacto citadas por agregadores de búsqueda.
5. **PENDIENTE — Existencia y documentación pública de un mecanismo de pricing dinámico nativo tipo "Smart Pricing" propio de Booking.com** para hosts individuales (no se encontró ni se pudo descartar con fuente primaria en esta sesión).
6. **PENDIENTE — Comparación oficial de tasas de comisión** entre Airbnb, Booking.com y Vrbo por tipo de host/plan; no se encontró una fuente pública comparable y verificable.
7. **PENDIENTE — Alcance geográfico completo de la eliminación de cláusulas de paridad de Booking.com** fuera del EEE.
8. **PENDIENTE — Modelo de precio/comisión público de PriceLabs, Beyond Pricing y Wheelhouse** (ninguna página de producto oficial consultada lo detalla; se remite a páginas de planes no cargadas en esta sesión).
9. **PENDIENTE — Documentación oficial de Booking.com y Vrbo sobre agrupación de unidades idénticas bajo un mismo listing** (equivalente a "multiple units property" de Airbnb); no se encontró en esta sesión.
10. **PENDIENTE — Texto explícito del estándar iCalendar (RFC 5545)** confirmando la ausencia de un campo de tarifa/precio; la conclusión de esta investigación se basa en evidencia indirecta (ausencia de mención en artículos oficiales de Airbnb/Vrbo sobre sincronización de calendario), no en una lectura directa del RFC.
11. **Cobertura de fuentes por debajo del mínimo del plan.** Este módulo cita ~16 URLs de fuente primaria distintas (ver sección "Fuentes de este módulo" al final), por debajo del mínimo de 25 exigido por `docs/investigacion/00-PLAN.md` §1.3. La razón declarada: varias páginas técnicas detalladas (Booking.com `PricingType`, Expedia/Vrbo Rapid API, Genius de Booking.com) están bloqueadas por HTTP 403/sunset o requieren acceso de partner aprobado, y el modelo de precio de PriceLabs/Beyond/Wheelhouse no se cargó en esta sesión (páginas `/plans`/`/pricing` no exploradas) — no por falta de intento, sino por bloqueo real o agotamiento del alcance definido para esta ronda.
12. Ver `docs/LAGUNAS.md`: fila "Cobertura tarifas/restricciones/datos huésped/mensajes" en secciones 1.1/2.1/3.1 (módulos RV10/RV13, relacionada con las lagunas #1-#3 de arriba), y sección 6, filas "Comisión exacta de Booking.com" y "Comisión exacta de Vrbo" (LAGUNA HONESTA, módulos RV12/RV13, relacionada con la laguna #6 de arriba sobre comparación de tasas de comisión).

---

## Supuestos

- Se asume que los umbrales de 7 noches (semanal) y 28 noches (mensual) documentados por Airbnb y Vrbo son un estándar razonable de referencia para el motor de descuentos por duración de Atiende, aplicable también como default para Booking.com hasta que se confirme lo contrario con fuente oficial.
- Se asume que, para cualquier canal donde Atiende no tenga (o no pueda obtener) acceso de partner API, la única vía de sincronización será iCal limitado a disponibilidad, requiriendo gestión de tarifas separada (manual o mediante panel propio de Atiende) para ese canal.
- Se asume que la lógica de asignación de unidades dentro de un inventario multi-unidad es responsabilidad de diseño interno de Atiende, y que la integración con cada canal se hará a nivel de "listing representativo" cuando el canal soporte ese concepto (confirmado hoy solo para Airbnb).
- Se asume que ningún dato de comisión, precio de suscripción de PriceLabs/Beyond/Wheelhouse, ni porcentaje de descuento Genius de Booking.com debe usarse en documentos comerciales o de producto sin una verificación adicional posterior contra la fuente oficial primaria (dado el estado PENDIENTE señalado arriba).

---

## Fuentes de este módulo

Fecha de consulta de todas las URLs listadas: 2026-09-05. Total: 16 URLs distintas (por debajo del mínimo de 25 del plan — ver Laguna 11).

**Pricing dinámico y descuentos (Airbnb):**
- https://www.airbnb.com/help/article/1168 (Smart Pricing)
- https://www.airbnb.com/help/article/1344 (Weekly & monthly discounts)
- https://www.airbnb.com/help/article/484 (Trip length / booking settings)
- https://www.airbnb.com/help/article/2061 (Rule-sets)
- https://www.airbnb.com/help/article/4050 (Multiple units property)

**Pricing dinámico (Vrbo):**
- https://help.vrbo.com/category/undefined/articles/Set-up-rate-automation (MarketMaker / rate automation)
- https://help.vrbo.com/articles/How-do-I-manage-my-rates (Manage rates and discounts)
- https://help.vrbo.com/articles/How-do-I-set-a-minimum-stay-requirement (Minimum stay)

**Sincronización de calendario / iCal (ausencia de precio):**
- https://www.airbnb.com/help/article/99 (Sync your calendar to other websites)

**APIs de conectividad y pricing:**
- https://developer.withairbnb.com (Airbnb Homes API, landing pública)
- https://developers.booking.com/connectivity/docs/con-faq-rates-availability (Rates & Availability FAQ)
- https://developers.expediagroup.com/rapid/ (Rapid API / Availability and Rates API)

**Paridad de tarifas y programa Genius (Booking.com):**
- https://news.booking.com/legal-claims-parity-class-actions/ (eliminación de cláusulas de paridad en el EEE)

**Herramientas de revenue management (terceros):**
- https://hello.pricelabs.co/ (PriceLabs)
- https://www.beyondpricing.com/ (Beyond Pricing)
- https://www.usewheelhouse.com/ (Wheelhouse)
