# RV16 — Modelo de negocio y estructura de costos (Atiende Rentas Vacacionales)

Fecha de consulta de todas las fuentes primarias citadas en este documento: **2026-09-05**.

> Nota metodológica: este documento distingue explícitamente entre (a) **hechos de mercado** — precios publicados por terceros, citados con URL, cita textual y fecha de consulta — y (b) **propuestas de diseño interno** de Atiende, que se declaran como tales y NO tienen respaldo de mercado directo salvo que se indique lo contrario. Ningún precio de mercado fue inventado o estimado; donde no se pudo verificar una cifra en una fuente oficial, se marca **PENDIENTE**.

---

## Resumen ejecutivo

El mercado de software de gestión de rentas vacacionales (PMS/channel managers) usa mayoritariamente **suscripción por propiedad/listing/mes**, con escalones de precio que bajan por unidad a medida que crece el portafolio, y en algunos casos una opción alternativa de **comisión por reserva** en lugar de cuota fija. De los seis competidores investigados, cuatro publican precios exactos en su sitio (Lodgify, OwnerRez —parcial—, Uplisting, Hospitable) y dos NO publican precio fijo y requieren cotización comercial (Guesty Pro/Enterprise, Hostaway en todos sus planes) [DATO/R — ver tabla de la sección 2 con etiqueta por fila]. Los rangos verificados van desde aproximadamente **14 USD/mes** (plan de entrada, 1 propiedad) hasta más de **200 GBP/mes** en planes para operadores establecidos [DATO], sin contar planes Enterprise que son "a cotización".

Para Atiende Rentas Vacacionales se propone (diseño interno, no hecho de mercado) un modelo híbrido: suscripción base por unidad/mes con escalones por volumen (ancorado en los rangos observados en competidores), más un add-on opcional de IA conversacional facturado aparte, dado que el costo marginal de IA es variable y no debe subsidiarse silenciosamente dentro de la cuota base. Se calculó el costo de IA por conversación usando precios oficiales vigentes de Anthropic y OpenAI (por millón de tokens) [R — ver advertencia reforzada de desactualización del catálogo en la sección 3b] bajo un supuesto explícito de volumen de tokens [E] (no verificado con datos reales de producción). El costo de infraestructura por tenant se pudo verificar parcialmente: se obtuvo el precio oficial de AWS Lambda (cómputo serverless) [DATO], pero los precios de RDS (base de datos) y S3 (almacenamiento) están en tablas renderizadas por JavaScript que no pudieron extraerse literalmente en esta sesión — se marcan PENDIENTE y se recomienda usar la AWS Pricing Calculator para una cotización exacta. El costo de certificación/API con Airbnb y Booking.com no es público en las páginas de partner/desarrolladores revisadas — PENDIENTE. El margen objetivo y el costo de soporte humano se presentan como supuestos de diseño [E] típicos de SaaS B2B, sin fuente de mercado verificada específica para Atiende.

**Riesgo de diseño no resuelto (ver RV12):** este módulo diseña el pricing de Atiende sin incorporar, hasta la sección 1 más abajo, el hallazgo de RV12 de que Airbnb obligaría a los clientes de Atiende (por usar software de gestión de terceros) al esquema de comisión "host-only" más alto (14–16%, 16% en México) en vez del split-fee estándar (3–4%) — ver sección 1, subsección "Trade-off de comisión host-only de Airbnb (hallazgo de RV12)".

Se documenta también, como decisión de arquitectura explícita, que la sincronización de disponibilidad/precios con los canales (Airbnb, Booking, Vrbo) es **lógica determinista** y no debe generar costo de IA; los costos de IA/LLM aplican únicamente a funciones conversacionales/generativas (mensajería a huéspedes, resúmenes, redacción asistida, etc.).

---

## 1. Opciones de modelo de negocio para Atiende Rentas Vacacionales (propuesta de diseño interno)

**Declaración explícita: lo que sigue es una propuesta de diseño de Atiende, no un hecho de mercado.** Se ancla en cómo compiten los actores reales (sección 2) pero las combinaciones y porcentajes específicos son decisiones a validar por el equipo de producto/pricing, no datos observados.

Opciones evaluadas:

1. **Suscripción por unidad/mes** (patrón dominante en el mercado, ver sección 2: Lodgify, Hospitable, Uplisting y Guesty Lite usan variantes de este modelo). Ventaja: predecible para el anfitrión y para Atiende; es el modelo que la mayoría de competidores usa como base.
2. **Escalones (tiers) por número de unidades**, con precio marginal decreciente por unidad adicional a medida que crece el portafolio — patrón observado literalmente en Uplisting (ver L-RV16-03: tres bandas de precio por listing: £16/listing en Operator, £13/listing en Manager) y en Hospitable (costo de propiedad adicional decreciente/variable por plan: 10−15 USD por propiedad extra, ver L-RV16-05).
3. **% de reserva (comisión)** como alternativa u opción "pay-as-you-go" — patrón observado literalmente en Uplisting (3% en el plan de 1-4 propiedades, 1.5% en Operator, ver L-RV16-03) y en Guesty Lite (esquema "pay-as-you-grow" con 1% por reserva según resumen de búsqueda, no verificado literalmente en la página oficial de Guesty en esta sesión — usar con confianza baja si se cita ese 1% específico).
4. **Fee de setup**: observado en el mercado solo en Hostaway según reportes de terceros (300–1,000+ USD, NO verificado en la página oficial de Hostaway, que no publica precios en absoluto — ver L-RV16-06); la mayoría de los competidores con precio público (Lodgify, Uplisting, Hospitable) declaran explícitamente "no setup fees" o "free onboarding". Propuesta de diseño: Atiende podría NO cobrar fee de setup en los planes self-service (para igualar el estándar de mercado observado en jugadores con precio transparente) y sí evaluarlo solo para migraciones de portafolios grandes con datos legados — esto es una decisión de diseño, no un hecho de mercado.
5. **Add-ons de IA facturados aparte del plan base**: no se encontró un competidor que desglose explícitamente un cargo de IA separado en su página de precios pública (Uplisting tiene "AI Suite Unlimited: £49/month" como add-on, ver L-RV16-03 — este SÍ es un hecho de mercado verificado). Esto respalda parcialmente la idea de separar el costo de IA del plan base.

**Propuesta de diseño de Atiende (sin fuente de mercado directa, criterio interno)**:
- Cuota base por unidad/mes con escalones de volumen, ancorada en el rango observado (aprox. 15–60 USD/mes/unidad en planes de entrada/medios de los competidores con precio público, bajando a single digits USD por unidad en portafolios grandes — ver sección 2).
- Add-on de IA conversacional facturado por separado (por conversación o por paquete de conversaciones/mes), justificado porque el costo subyacente de tokens de LLM es variable y trazable (sección 3b), a diferencia de la infraestructura base que es más predecible.
- Sin fee de setup en el plan self-service; fee de setup opcional solo para migraciones asistidas de portafolios grandes.
- Sin modelo de % de reserva como opción principal (para diferenciarse de los PMS que dependen de comisión y por evitar fricción con el anfitrión en temporada alta), pero mantenerlo como opción "pay-as-you-go" de entrada para probar el producto con riesgo mínimo, replicando el patrón de Uplisting.

### 1.1 Trade-off de comisión host-only de Airbnb (hallazgo de RV12)

**Riesgo de valor/pricing no incorporado hasta esta corrección (contradicción #12 de la auditoría independiente):** el módulo **RV12 — Roles, propietarios, contabilidad y pagos** identifica como hallazgo crítico, con fuente primaria oficial [DATO, airbnb.com/help/article/1857], que Airbnb obliga a los anfitriones que usan software de gestión (PMS) — el caso exacto de los clientes de Atiende — a operar bajo el esquema de comisión "host-only" (14–16%, 16% en México) en vez del split-fee estándar que pagaría un anfitrión sin PMS (3%, 4% en Brasil/México). Este módulo (RV16) había diseñado el pricing/valor de Atiende sin mencionar ni integrar ese hallazgo. Se incorpora aquí explícitamente:

- **Comunicación con el cliente:** Atiende debe comunicar claramente este trade-off como parte de la conversación de ventas — un anfitrión/administrador que adopta Atiende (o cualquier PMS de terceros) puede terminar pagando más comisión a Airbnb de la que pagaría gestionando manualmente sin software, y ese costo adicional debe compararse explícitamente contra el ahorro operativo/valor que Atiende aporta (menos overbooking, menos horas de gestión manual, consolidación de canales), no ocultarse ni asumirse como implícitamente compensado.
- **Pregunta de pricing pendiente de decisión de producto (no resuelta en esta investigación):** el equipo de pricing debe evaluar si la cuota de Atiende debe compensar parcialmente ese costo adicional de comisión para el cliente (p. ej. un descuento o nivel de precio más agresivo para clientes que migran desde split-fee a host-only por adoptar Atiende), en vez de fijar el precio de Atiende de forma independiente a este efecto.
- **Fuente:** RV12 (comisión host-only, hallazgo con fuente https://www.airbnb.com/help/article/1857); ver también el matiz de vigencia/alcance no confirmado que RV12 documenta en su sección de Riesgos (R3) — este trade-off no debe presentarse como permanente o universal sin esa salvedad.

---

## 2. Benchmarks de precios públicos de competidores

| Competidor | ¿Precio público? | Cifra exacta citada | Fuente | Confianza / Etiqueta |
|---|---|---|---|---|
| **Lodgify** | Sí | Basic: 18→14 USD/mes; Starter: 33→26 USD/mes; Professional: 53→42 USD/mes; Ultimate: 77→62 USD/mes (primer número = mensual, segundo = facturación anual); "0% booking fee" en las 4 categorías | lodgify.com/pricing/ | [R] Media (ver ledger L-RV16-01; acceso directo bloqueado por el sitio, texto obtenido vía proxy de lectura sobre la misma URL oficial) |
| **OwnerRez** | Parcial | "$88/month" (un punto de la escala móvil por número de propiedades); "Unlimited bookings • No setup fees, booking fees, or contracts"; SMS: fee de uso después de 500 segmentos salientes | ownerrez.com/pricing | [R] Media-baja (tabla completa por número de propiedades PENDIENTE — no se pudo extraer, ver L-RV16-02) |
| **Uplisting** | Sí | Independent Host: £40/mes (o £0 + 3% comisión); Operator: £90/mes o £16/listing (piso £90), o £0 + 1.5% comisión; Manager: £208/mes o £13/listing (piso £208); add-ons: Client Statements £8/listing/mes, Protect £4/listing/mes, Verificación de identidad £1.25/verificación, Direct Booking Site £30/mes, AI Suite Unlimited £49/mes, Smart Locks £10/mes | uplisting.io/pricing | [DATO] Alta (L-RV16-03) |
| **Guesty** | Parcial | Lite: "packages start from $9/month per listing" (para 1–3 listings); Pro (4–199 listings) y Enterprise (200+ listings): **PENDIENTE — precio no público**, requiere "Get a quote" / "Customized offer" | guesty.com/pricing/ | [DATO] Alta para el hecho "Pro/Enterprise no público"; alta para el piso "$9/mes/listing" de Lite (L-RV16-04) |
| **Hospitable** | Sí | Essentials: $0 (propiedades ilimitadas, $0 adicional); Host: $29 USD (1 propiedad incluida, +$10/propiedad adicional); Professional: $59 USD (2 propiedades incluidas, +$15/adicional); Mogul: $99 USD (3 propiedades incluidas, +$30/adicional); descuento anual 12% | help.hospitable.com/en/articles/4596748-hospitable-pricing-subscription-costs | [DATO] Alta (L-RV16-05) |
| **Hostaway** | No | **PENDIENTE — precio no público.** La página oficial (hostaway.com/pricing/) es un cuestionario de 3 pasos sin cifras; no muestra ningún precio, solo pide rango de listings (2-14, 15-49, 50+) y redirige a cotización | hostaway.com/pricing/ | [DATO] Alta (confirmación de ausencia de precio, L-RV16-06) |

**Lectura del benchmark**: los competidores que compiten por autoservicio/anfitriones individuales y pequeños operadores (Lodgify, Uplisting, Hospitable, Guesty Lite) publican precio exacto, típicamente en el rango de 9–60 USD (o GBP equivalente) por unidad/mes en los planes de entrada, con escalones que bajan el costo marginal por unidad en volumen. Los jugadores orientados a portafolios medianos/grandes o con venta consultiva (Hostaway en todos sus planes; Guesty desde el plan Pro) no publican precio y usan cotización personalizada — patrón a tener en cuenta si Atiende decide apuntar también a portafolios grandes: es común en el mercado no publicar precio en ese segmento.

---

## 3. Costos unitarios

### 3a. Infraestructura por tenant (AWS)

**Cifra oficial verificada:**
- AWS Lambda (cómputo serverless, x86, on-demand, tras la capa gratuita de 1M solicitudes/mes y 400,000 GB-segundos/mes): **"$0.20 per one million requests"** y **"$0.0000166667 per GB-s"** (aws.amazon.com/lambda/pricing/, consultado 2026-09-05; L-RV16-09).

**PENDIENTE — no verificado literalmente en esta sesión:**
- Costo por hora de instancia de base de datos administrada (Amazon RDS PostgreSQL, ej. db.t3.micro/db.t4g.micro) — la página oficial (aws.amazon.com/rds/postgresql/pricing/) presenta la tabla de precios mediante JavaScript y no se pudo extraer el valor exacto pese a múltiples intentos (WebFetch directo, vía proxy de lectura, vía documentación relacionada que redirige a la misma página). No se cita ninguna cifra de agregadores de terceros como si fuera oficial.
- Costo por GB-mes de almacenamiento Amazon S3 Standard (aws.amazon.com/s3/pricing/) — misma limitación técnica de renderizado.

**Recomendación operativa**: obtener estas dos cifras mediante la AWS Pricing Calculator (calculator.aws) en una sesión con navegador completo, o desde la consola de facturación de AWS, antes de fijar el costo unitario de infraestructura por tenant en el plan de negocio final.

**Supuestos de uso explícitos para cuando se completen las cifras PENDIENTE** (supuesto de diseño, no dato de mercado): un tenant pequeño (1–5 unidades) se modela provisionalmente con:
- 1 instancia de base de datos compartida multi-tenant tipo micro (a prorratear entre tenants, no 1:1).
- Almacenamiento estimado de 1–2 GB por tenant pequeño (fotos de propiedades, documentos, logs).
- Del orden de 50,000–200,000 invocaciones de función serverless al mes por tenant pequeño (sincronización de disponibilidad, webhooks de canal, generación de reportes) — **esto es un supuesto de diseño no verificado con datos reales de producción**, útil solo para dimensionar el orden de magnitud una vez que se complete el precio de Lambda: con el precio oficial de $0.20/millón de solicitudes, 200,000 solicitudes/mes costarían aproximadamente $0.04/mes en solicitudes (excluyendo GB-segundos de duración, que dependen del tiempo de ejecución real y no se estiman aquí por falta de dato de producción).

### 3b. Costo de IA por conversación/automatización

**⚠️ Advertencia reforzada — catálogo de modelos de IA incompleto y con alto riesgo de desactualización [R].** Los precios de esta sección se leyeron literalmente de las páginas oficiales de precios de Anthropic y OpenAI el 2026-09-05, por lo que son datos reales al momento de la consulta — se etiquetan **[R]** (no `[DATO]` puro) porque el propio catálogo de modelos usado aquí **ya está incompleto frente al catálogo vigente**: la página oficial de OpenAI (platform.openai.com/docs/pricing) lista hoy, además de GPT-4o mini/GPT-4o/GPT-5, del orden de **15 modelos adicionales más nuevos y sistemáticamente más caros** (líneas de razonamiento avanzado, variantes "pro"/frontier, tiers premium) que este documento no captura. Esto no es una imprecisión menor: **si Atiende migra su función conversacional a un modelo más nuevo/caro no incluido en este catálogo, el costo real por conversación puede subestimarse entre 2x y 8x** respecto a las cifras calculadas más abajo, invalidando silenciosamente cualquier proyección de margen (sección 4) que asuma estos precios como techo. Cualquier uso de estas cifras en un plan de negocio o proyección financiera de largo plazo debe re-verificar el catálogo completo y vigente de precios de ambos proveedores antes de fijar compromisos, no asumir que Haiku/Sonnet/Opus y GPT-4o mini/GPT-4o/GPT-5 siguen siendo el rango completo ni el techo de costo disponible.

**Precios oficiales verificados (vigentes a 2026-09-05, catálogo parcial — ver advertencia arriba):**

Anthropic (claude.com/pricing, redirect oficial desde anthropic.com/pricing; L-RV16-07):
- Claude Sonnet 5: Input **$2 / MTok** [R], Output **$10 / MTok** [R]
- Claude Haiku 4.5: Input **$1 / MTok** [R], Output **$5 / MTok** [R]
- Claude Opus 5: Input **$5 / MTok** [R], Output **$25 / MTok** [R]

OpenAI (developers.openai.com/api/docs/pricing, redirect oficial desde platform.openai.com/docs/pricing; L-RV16-08) — **subconjunto de un catálogo más amplio, ver advertencia arriba**:
- GPT-4o mini: Input **$0.15** / Output **$0.60** por 1M tokens [R]
- GPT-4o: Input **$2.50** / Output **$10.00** por 1M tokens [R]
- GPT-5: Input **$1.25** / Output **$10.00** por 1M tokens [R]

**Supuesto explícito de volumen (declarado como supuesto de diseño, SIN verificar con datos reales de producción de Atiende):**
> Supuesto: 2,000 tokens de entrada + 500 tokens de salida por conversación de atención a huésped (mensaje del huésped + contexto de la reserva/propiedad + historial reciente, más la respuesta generada). Este número NO proviene de medición real de producción; es un punto de partida razonable para modelar el orden de magnitud del costo y debe reemplazarse por telemetría real en cuanto exista.

**Fórmula de cálculo:**
```
Costo por conversación = (tokens_entrada / 1,000,000 × precio_input) + (tokens_salida / 1,000,000 × precio_output)
```

**Cálculo aplicado con el supuesto anterior (2,000 in / 500 out), usando precios oficiales exactos:**

| Modelo | Costo entrada (2,000 tok) | Costo salida (500 tok) | Costo total por conversación |
|---|---|---|---|
| Claude Haiku 4.5 | 2,000/1,000,000 × $1 = $0.0020 | 500/1,000,000 × $5 = $0.0025 | **$0.0045** |
| Claude Sonnet 5 | 2,000/1,000,000 × $2 = $0.0040 | 500/1,000,000 × $10 = $0.0050 | **$0.0090** |
| Claude Opus 5 | 2,000/1,000,000 × $5 = $0.0100 | 500/1,000,000 × $25 = $0.0125 | **$0.0225** |
| GPT-4o mini | 2,000/1,000,000 × $0.15 = $0.0003 | 500/1,000,000 × $0.60 = $0.0003 | **$0.0006** |
| GPT-4o | 2,000/1,000,000 × $2.50 = $0.0050 | 500/1,000,000 × $10.00 = $0.0050 | **$0.0100** |
| GPT-5 | 2,000/1,000,000 × $1.25 = $0.0025 | 500/1,000,000 × $10.00 = $0.0050 | **$0.0075** |

Estos costos son por token consumido en una sola llamada al modelo; **no incluyen** reintentos, llamadas a herramientas (tool calls) intermedias, ni el efecto de prompt caching (que puede reducir el costo de entrada si el contexto de la propiedad se reutiliza entre conversaciones — Anthropic documenta una política de caché de 5 minutos de TTL, pero no se verificaron cifras exactas de descuento por caché en esta sesión). El costo real de un flujo de automatización con múltiples pasos (p. ej. clasificar intención + generar respuesta + verificar contra reglas del anfitrión) sería un múltiplo de esta cifra base y debe modelarse por separado cuando se defina la arquitectura del agente conversacional.

### 3c. Costo de conectividad/partner (Airbnb, Booking, Vrbo)

**PENDIENTE — precio no público.** Se revisaron las páginas oficiales de partner/desarrolladores de Airbnb (airbnb.com/partner) y Booking.com (developers.booking.com/connectivity/docs); ninguna de las dos muestra costo, fee o precio de certificación de partner de conectividad/API (L-RV16-11). No se exploró Vrbo/Expedia Partner Central en esta sesión por agotamiento del presupuesto de búsqueda web; queda como laguna adicional.

Es conocido en la industria (sin cifra pública verificable) que el acceso a estas APIs típicamente pasa por un proceso de aprobación/certificación técnica sin un fee de licencia publicado, pero esto NO se cita como hecho verificado — se marca PENDIENTE en su totalidad.

### 3d. Soporte humano

**No hay fuente pública que cotice el costo de soporte humano para un PMS de rentas vacacionales.** Se declara como supuesto de diseño interno, sin fuente externa: el costo de soporte humano (agentes de soporte, éxito de cliente, onboarding asistido) debe modelarse con datos internos de costo laboral de Atiende (salario cargado por hora del equipo de soporte, tiempo promedio de atención por ticket, volumen de tickets por tenant) una vez que existan datos operativos reales. No se inventa una cifra de mercado para este rubro.

---

## 4. Margen objetivo (supuestos explícitos)

**Supuesto de diseño interno, sin fuente externa específica para Atiende:** se propone un margen bruto objetivo de referencia de **70–80%**, criterio típico citado de forma amplia en la industria de SaaS B2B para productos maduros. **Esta sesión de investigación no verificó una fuente pública primaria y actual (2026) que documente ese rango con cifra exacta y URL** — el presupuesto de búsqueda web se agotó antes de poder completar esa verificación (ver Lagunas). Por lo tanto, el rango 70–80% se declara explícitamente como **criterio de diseño / regla general de la industria sin cita verificada en esta investigación**, no como un hecho de mercado confirmado.

Implicación práctica: dado que el costo de IA por conversación calculado en 3b es del orden de fracciones de centavo de dólar por conversación (con los modelos más económicos) hasta ~2 centavos (con los modelos más caros), y que la infraestructura base (Lambda) también resulta de bajo costo unitario según el dato oficial verificado, el costo variable dominante por tenant probablemente sea el de IA en escenarios de alto volumen conversacional y/o el uso de modelos más caros (Opus, GPT-4o) — esto refuerza la propuesta de sección 1 de facturar el add-on de IA por separado, para proteger el margen objetivo sin tener que subir la cuota base para todos los tenants por igual.

---

## 5. Separación de cuotas/modelos de IA respecto a la lógica determinista de inventario (decisión de arquitectura)

**Se declara explícitamente como decisión de arquitectura de Atiende, no como hallazgo de mercado:**

- La **sincronización de disponibilidad y precios** entre Atiende y los canales (Airbnb, Booking.com, Vrbo, etc.) — incluyendo actualización de calendarios, bloqueo de fechas, ajuste de tarifas, prevención de overbooking — debe implementarse como **lógica determinista** (reglas de negocio, colas de sincronización, reconciliación de estado), **sin dependencia de un modelo de IA/LLM**. Esta función es crítica y debe ser predecible, auditable y reproducible; introducir un LLM en esta ruta añadiría latencia, costo variable y riesgo de comportamiento no determinista donde no se justifica.
- Los **costos de IA/LLM documentados en la sección 3b aplican exclusivamente a funciones de automatización conversacional y generativa**: mensajería automatizada a huéspedes, clasificación de intención de mensajes entrantes, generación de respuestas sugeridas, resúmenes de conversación para el anfitrión, redacción asistida de anuncios/descripciones, etc.
- Consecuencia para el modelo de negocio (sección 1): el costo de la lógica de inventario (determinista) debe absorberse dentro de la cuota base de suscripción, mientras que el costo de IA (variable, dependiente de uso conversacional) es candidato natural para el add-on facturado por separado o por paquete de conversaciones, dado que ambos tienen perfiles de costo estructuralmente distintos (uno es prácticamente fijo por tenant, el otro escala con el volumen de interacciones).

---

## Riesgos / límites

- **RV16-RG-01**: El presupuesto de búsqueda web (WebSearch) de la sesión se agotó antes de completar la verificación de benchmarks de margen SaaS B2B y de costos de partner de Vrbo/Expedia — ver Lagunas.
- **RV16-RG-02**: Los precios de mercado citados (sección 2) pueden cambiar sin aviso; varios competidores (Lodgify, Guesty, Hostaway) muestran evidencia de reestructuraciones de precio recientes según fuentes secundarias, aunque solo se citó como hecho lo verificado literalmente en la página oficial a la fecha de consulta.
- **RV16-RG-03**: Las cifras de infraestructura AWS (RDS, S3) quedaron PENDIENTE por limitación técnica de extracción (tablas JS), no por ausencia de dato público — deben completarse antes de fijar precios definitivos.
- **RV16-RG-04**: El supuesto de tokens por conversación (2,000 in / 500 out) es una hipótesis de diseño sin telemetría real; conversaciones con más contexto (historial largo, múltiples propiedades, tool calls) pueden costar varias veces más.
- **RV16-RG-05 (reforzado — ver también advertencia de la sección 3b)**: Los precios de IA (Anthropic, OpenAI) son altamente volátiles históricamente y el catálogo de modelos usado en la sección 3b ya está incompleto frente al catálogo vigente de OpenAI (~15 modelos adicionales más nuevos y más caros no incluidos aquí, según la propia página de precios consultada). Esto no es solo un riesgo de que "el precio cambie": es un riesgo activo de que **el costo real por conversación esté subestimado 2x–8x** si Atiende adopta un modelo más nuevo/caro no capturado en este documento. Cualquier modelo financiero debe re-verificar el catálogo completo (no solo los precios de los modelos ya listados) antes de usarse en proyecciones a largo plazo o compromisos de margen con inversionistas.
- **RV16-RG-06**: El nombre y las cifras de dos modelos de OpenAI vistos en la página oficial durante la sesión ("GPT-6 Astra", "GPT-5.6-sol") no se corroboraron con una segunda fuente de documentación de modelos y, precisamente por esa falta de corroboración, **no se incluyeron en la tabla de la sección 3b** — lo cual ilustra en vivo la advertencia de RG-05: el catálogo real de OpenAI ya tiene, al momento de esta consulta, modelos más nuevos que los tres usados en el cálculo, y "GPT-5" no es el techo de precio/capacidad disponible. La propia página indicaba "GPT-5.6 Sol's promotional pricing is available at least through November 21, 2026", lo que sugiere que su precio de lista fuera de esa ventana promocional podría ser mayor aún que el mostrado en el momento de la consulta.

---

## Implicaciones para requisitos

- **RV16-R-01**: El sistema de facturación de Atiende debe soportar un modelo de cuota base por unidad/mes con escalones de volumen (no solo un precio plano), replicando el patrón dominante observado en Lodgify, Uplisting y Hospitable.
- **RV16-R-02**: El sistema de facturación debe soportar un add-on de IA conversacional facturable por separado del plan base (por conversación o por paquete mensual de conversaciones), desacoplado del ciclo de facturación de unidades.
- **RV16-R-03**: La arquitectura debe registrar telemetría de consumo de tokens por conversación (entrada y salida, por modelo usado) desde el primer lanzamiento, para reemplazar el supuesto de 2,000/500 tokens por datos reales de producción lo antes posible.
- **RV16-R-04**: La sincronización de disponibilidad/precios con canales (Airbnb, Booking, Vrbo) debe implementarse y documentarse como lógica determinista, con pruebas automatizadas de reconciliación, y NUNCA debe invocar un LLM en su ruta crítica de decisión (bloqueo de fechas, prevención de overbooking).
- **RV16-R-05**: Antes de fijar el precio final por tenant, el equipo debe completar la cotización oficial de AWS (RDS + S3) vía AWS Pricing Calculator, dado que esta investigación no pudo extraer esas cifras literalmente de las páginas oficiales.
- **RV16-R-06**: El modelo de costos debe permitir seleccionar dinámicamente el modelo de IA (Haiku/Sonnet/Opus, o equivalentes de OpenAI) por tipo de tarea, dado que el costo por conversación varía hasta ~5x entre el modelo más económico y el más caro verificado (GPT-4o mini vs. Claude Opus 5 en los cálculos de la sección 3b).
- **RV16-R-07**: El equipo de pricing debe decidir explícitamente, como parte del diseño (no como hallazgo de esta investigación), si Atiende ofrecerá una opción de "pay-as-you-go" por % de reserva para reducir la fricción de adopción inicial, siguiendo el patrón observado en Uplisting y Guesty Lite.

---

## Lagunas

1. Tabla completa de precio por número de propiedades de OwnerRez (más allá del punto puntual de $88/mes verificado) — PENDIENTE, tabla renderizada por JavaScript no extraída.
2. Precio exacto de Guesty Pro y Enterprise — PENDIENTE, no público (requiere cotización).
3. Precio exacto de todos los planes de Hostaway — PENDIENTE, no público en ningún plan (requiere cotización).
4. Costo por hora de instancia RDS PostgreSQL (db.t3.micro/db.t4g.micro) en AWS — PENDIENTE, tabla renderizada por JavaScript no extraída pese a múltiples intentos.
5. Costo por GB-mes de almacenamiento S3 Standard en AWS — PENDIENTE, misma limitación técnica.
6. Costo de certificación/API de Vrbo/Expedia Partner Central — no explorado en esta sesión (agotamiento de presupuesto de búsqueda web).
7. Fuente pública primaria (2026) con cifra exacta de margen bruto típico de SaaS B2B — no verificada en esta sesión (agotamiento de presupuesto de búsqueda web); el rango 70-80% citado en sección 4 es criterio de diseño sin fuente confirmada.
8. Precios exactos de descuento por prompt caching de Anthropic (solo se confirmó la existencia de la política de TTL de 5 minutos, no las cifras de descuento).
9. Verificación independiente de los nombres/cifras de "GPT-6 Astra" y "GPT-5.6-sol" contra una segunda fuente oficial de OpenAI.
10. Costo real de soporte humano por tenant — no existe fuente pública aplicable; requiere datos operativos internos de Atiende una vez en producción.
11. **(Reforzada, ver sección 3b) Catálogo completo y vigente de modelos de IA de OpenAI.** Esta sesión solo verificó 3 modelos de OpenAI (GPT-4o mini, GPT-4o, GPT-5) de un catálogo que, según la propia página oficial consultada, incluye del orden de 15 modelos adicionales más nuevos y más caros. No se enumeraron ni se calculó el costo con esos modelos adicionales — el riesgo de subestimación de costo (2x–8x) queda declarado como advertencia activa en la sección 3b, no resuelto. Siguiente paso: releer platform.openai.com/docs/pricing en una sesión dedicada y recalcular la tabla de costo por conversación con el catálogo completo antes de fijar el precio del add-on de IA de Atiende.
12. **Modelo de roles no reconciliado con RV18 y RV12** — este módulo (RV16) no diseña roles, pero su sección de facturación por rol/tenant depende de que exista un modelo de roles único; ver "Nota de reconciliación pendiente" en RV12 y RV18 (contradicción #7 de `docs/auditoria-investigacion-1/contradicciones.md`), y `docs/LAGUNAS.md` sección 5, fila "Modelo de roles internos no reconciliado (RV12 vs. RV18)".
13. Ver `docs/LAGUNAS.md`, sección 6: filas "Costo/plazo de certificación directa Airbnb/Booking/Vrbo" (módulos RV08/RV16, relacionada con la laguna #6 de arriba), "Precio Guesty Pro/Enterprise, todos los planes de Hostaway" (módulos RV14/RV16, relacionada con las lagunas #2/#3 de arriba) y "Costo AWS RDS PostgreSQL / S3 por tenant" (módulo RV16, relacionada con las lagunas #4/#5 de arriba).

---

## Supuestos

1. **Supuesto de diseño**: cuota base ancorada en el rango 15–60 USD/mes/unidad para planes de entrada/medios, con escalones decrecientes en volumen — sin fuente de mercado que prescriba este rango específico para Atiende, solo ancorado en los benchmarks de la sección 2.
2. **Supuesto de diseño**: sin fee de setup en el plan self-service; fee de setup opcional solo para migraciones de portafolios grandes.
3. **Supuesto de uso de infraestructura** (para cuando se completen los precios PENDIENTE de RDS/S3): tenant pequeño con 1–2 GB de almacenamiento y 50,000–200,000 invocaciones serverless/mes — no verificado con datos reales de producción.
4. **Supuesto de volumen de tokens por conversación**: 2,000 tokens de entrada + 500 tokens de salida por conversación de atención a huésped — declarado explícitamente como no verificado con datos reales de producción; usado únicamente para ilustrar el orden de magnitud del costo de IA con precios oficiales exactos.
5. **Supuesto de margen bruto objetivo**: 70–80%, criterio típico de SaaS B2B citado de forma general en la industria, sin fuente externa específica verificada en esta investigación.
6. **Supuesto de costo de soporte humano**: debe modelarse con datos internos de Atiende (costo laboral cargado, tiempo por ticket, volumen por tenant); no existe cifra de mercado pública aplicable y no se inventa ninguna.
7. **Decisión de arquitectura (no supuesto de mercado)**: la lógica de sincronización de disponibilidad/precios con canales es determinista y no debe depender de IA/LLM; los costos de IA se acotan exclusivamente a funciones conversacionales/generativas.

---

## Fuentes de este módulo

Fecha de consulta de todas las URLs listadas: 2026-09-05. Total: 11 URLs distintas (por debajo del mínimo de 25 del plan — ver Riesgo RV16-RG-01 y Lagunas 1-2-6-7; la razón declarada es agotamiento del presupuesto de búsqueda web de la sesión y bloqueo técnico de tablas renderizadas por JavaScript, no falta de intento).

**Benchmarks de precio de competidores PMS/channel manager:**
- https://www.lodgify.com/pricing/ — L-RV16-01
- https://www.ownerrez.com/pricing — L-RV16-02
- https://www.uplisting.io/pricing — L-RV16-03
- https://www.guesty.com/pricing/ — L-RV16-04
- https://help.hospitable.com/en/articles/4596748-hospitable-pricing-subscription-costs — L-RV16-05
- https://www.hostaway.com/pricing/ — L-RV16-06

**Precios de modelos de IA (LLM):**
- https://claude.com/pricing (redirect desde anthropic.com/pricing) — L-RV16-07
- https://developers.openai.com/api/docs/pricing (redirect desde platform.openai.com/docs/pricing) — L-RV16-08

**Infraestructura y conectividad:**
- https://aws.amazon.com/lambda/pricing/ — L-RV16-09
- https://airbnb.com/partner — L-RV16-11
- https://developers.booking.com/connectivity/docs — L-RV16-11

**Intentadas y bloqueadas (no citadas como hecho, ver `docs/fuentes/rv12-13-15-16.md`):** aws.amazon.com/rds/postgresql/pricing/, aws.amazon.com/s3/pricing/ (tablas renderizadas por JS, L-RV16-10).
