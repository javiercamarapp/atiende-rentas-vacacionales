# RV15 — Investigación de mercado: Atiende Rentas Vacacionales

Fecha de consulta de todas las fuentes: 2026-09-05.
Ledger completo de esta investigación (fragmento, pendiente de fusión con el ledger compartido del proyecto): `ledger-RV15.md` (ver ruta de trabajo del investigador).

---

## Resumen ejecutivo

El mercado de alojamiento a corto plazo tipo Airbnb/Booking sigue creciendo a doble dígito en las dos plataformas dominantes a nivel global: Airbnb reporta en su 10-K de ejercicio fiscal 2025 (SEC EDGAR, presentado 2026-02-12) una comunidad global de **más de 5 millones de hosts** [DATO] que han recibido **más de 2,500 millones de llegadas de huéspedes** [DATO] en **más de 220 países y regiones** [DATO]; en su comunicado de resultados del Q2 2026 (agosto 2026) ya reporta **más de 5.5 millones de hosts** [DATO], con ingresos trimestrales de $3.6 mil millones USD (+17% interanual) [DATO] y Valor Bruto de Reservas (GBV) de $27.2 mil millones USD (+16% interanual) [DATO]. Booking Holdings, en su 10-K de ejercicio fiscal 2025, reporta **~4.4 millones de propiedades** [DATO] en más de 220 países y territorios, de las cuales **~3.9 millones son "alojamientos alternativos"** [DATO] (casas, departamentos y otros espacios únicos) y ~500,000 son hoteles/moteles/resorts tradicionales [DATO], al cierre de 2025.

Ninguna de las dos empresas desglosa estas cifras por país (México, España, LatAm), y Airbnb ya no reporta un número exacto de "listings activos" en sus filings recientes (dejó de hacerlo desde ~2022) — esto es una laguna importante para cualquier estimación de mercado direccionable por país.

En España, el INE (fuente oficial, vía su propia API de datos) reporta en su Estadística Experimental de Viviendas Turísticas, para el periodo mayo 2026: **341,001 viviendas turísticas** [DATO] con **1,714,702 plazas** [DATO] (5.03 plazas por vivienda en promedio [DATO]) a nivel nacional. Esta cifra viene cayendo interanualmente (aprox. -10.7% vs mayo 2025, según prensa especializada que cita al INE) [R], lo que puede reflejar tanto un endurecimiento regulatorio como cambios metodológicos.

En México, no existe un equivalente oficial al INE español que mida específicamente "viviendas de uso turístico" tipo Airbnb; el INEGI mide el sector turístico en su conjunto vía la Cuenta Satélite del Turismo de México (CSTM) y la Encuesta de Viajeros Internacionales (EVI). Para 2024, el PIB turístico total fue de 2,713,120 millones de pesos (8.7% del PIB nacional) [DATO], con "alojamiento para visitantes" (categoría que mezcla hospedaje hotelero y no hotelero) aportando 568,815 millones de pesos y 409,974 empleos [DATO]. Para 2025, INEGI reportó 47,786,706 turistas internacionales (entradas anuales, +6.1%) [DATO] y un ingreso de divisas por gasto de turistas internacionales de $31,715.4 millones de dólares (+4.9% anual) [DATO].

No se encontraron fuentes oficiales o públicas gratuitas y verificables sobre: (a) segmentación de anfitriones/property managers por número de unidades gestionadas, ni (b) tasa de adopción de channel managers/software PMS entre anfitriones profesionales, en ninguno de los mercados objetivo. Ambos puntos se marcan **PENDIENTE**.

Dada la falta de una cifra base oficial de "número de anfitriones profesionales/property managers" en México y en LatAm, las estimaciones de SAM/SOM de este documento solo pueden construirse con una base numérica sólida para **España** (usando el dato INE de viviendas turísticas), y quedan explícitamente marcadas como **estimación [E] con supuestos no verificados** en todos los factores de conversión (porcentaje dirigible, ticket promedio) — ver etiquetado inline completo en la sección 5.1. Para México y LatAm, la estimación se marca **PENDIENTE — supuestos no verificados** por falta de dato base oficial equivalente; el 2026-09-05 se intentó adicionalmente cerrar parte de esta laguna (Holidu, DATATUR, Rentalia — ver sección 1 y Riesgos/límites), sin poder construir ninguna cifra nueva de TAM/SAM/SOM para LatAm.

---

## Contenido

### 1. Tamaño y tendencia del mercado (cifras citadas)

**Airbnb (global):**
- 10-K FY2025 (SEC EDGAR, presentado 2026-02-12): "a global community of over 5 million hosts who have welcomed over 2.5 billion guest arrivals in almost every country and region across the globe" [DATO]; opera "in over 220 countries and regions" [DATO]. [Fuente primaria — SEC EDGAR]
- Comunicado Q2 2026 (news.airbnb.com, ago. 2026): "over 5.5 million hosts who have welcomed over 2.5 billion guest arrivals" [DATO]; ingresos del trimestre $3.6 mil millones USD (+17% interanual) [DATO]; GBV $27.2 mil millones USD (+16% interanual) [DATO]; Nights and Seats Booked 148.3 millones (+10% interanual) [DATO]; utilidad neta $816 millones USD [DATO]; EBITDA ajustado $1.3 mil millones USD (+21%) [DATO]. [Fuente primaria — comunicado oficial de la empresa]
- **Laguna:** Airbnb no reporta cifra numérica de "listings activos" globales ni por país en estos documentos (dejó de hacerlo como métrica pública hace varios años). No se pudo verificar de forma independiente (vía fuente primaria) las cifras anuales completas de FY2025 (GBV anual, Nights and Seats Booked anual) — solo se verificaron cifras trimestrales de Q2 2026.

**Booking Holdings (global):**
- 10-K FY2025 (SEC EDGAR): al 31 de diciembre de 2025, "approximately 4.4 million properties in over 220 countries and territories" [DATO], de las cuales "approximately 500,000 hotels, motels, and resorts" [DATO] y "approximately 3.9 million homes, apartments, and other unique places to stay" (alojamiento alternativo) [DATO]. [Fuente primaria — SEC EDGAR]
- **Laguna:** Sin desglose por país o región de estos 3.9 millones de alojamientos alternativos.

**España (INE — fuente oficial):**
- Estadística Experimental "Viviendas Turísticas" (API oficial del INE, tabla 39364), dato de mayo 2026: **341,001 viviendas turísticas** [DATO], **1,714,702 plazas** [DATO], 5.03 plazas por vivienda (promedio nacional) [DATO]. [Fuente primaria — API del INE]
- Referencia de tendencia (fuente secundaria de prensa que cita al INE, confianza media, no verificada directamente en la tabla oficial): 381,837 viviendas turísticas en mayo 2025 y 368,295 en noviembre 2024 [R] — sugiere que la cifra de mayo 2026 representa una caída interanual sustancial (~-10.7%) [R], posiblemente asociada al Real Decreto 1312/2024 de registro único (ver sección 4).
- Eurostat, tabla tin00181 (número de establecimientos y plazas de alojamiento turístico colectivo, todos los tipos), año 2024, obtenida vía agregador eupublicdata.eu (confianza media, no verificada directamente en ec.europa.eu por limitaciones de renderizado): España = 3,847,619 plazas; UE-27 = 29,742,108 plazas [R]. Cifra distinta y no comparable directamente con la de "hoteles y similares" (2,043,972 plazas en España, diciembre 2024, según cita de tradingeconomics.com de datos Eurostat — confianza baja-media, no verificada de forma directa) [R].
- **Laguna:** La cifra INE de viviendas turísticas no distingue cuántas son gestionadas por administradores profesionales (potencial cliente de Atiende) vs. propietarios ocasionales que gestionan una sola unidad ellos mismos.

**México (INEGI/Sectur — fuentes oficiales, no hay equivalente al INE español para VUT):**
- Cuenta Satélite del Turismo de México (CSTM) 2024, Comunicado de Prensa 203/25 (INEGI, 2025-12-18): PIB turístico 2024 = 2,713,120 millones de pesos (8.7% del PIB total de la economía; +2.5% a precios de 2018 vs 2023) [DATO]; generó 2.9 millones de puestos de trabajo (7.4% del total nacional) [DATO]. Dentro de esto, "Alojamiento para visitantes" = 568,815 millones de pesos (1.8% del PIB total) y 409,974 empleos (14.0% del empleo turístico total, +5.0% vs 2023) [DATO]. [Fuente primaria — INEGI]
- Encuesta de Viajeros Internacionales (EVI), Boletín de Indicador 82/26 (INEGI, 2026-02-12), cifras anuales: en 2025, 47,786,706 turistas internacionales entraron a México (+6.1% vs 2024) [DATO], de los cuales 27,371,599 fueron "turistas de internación" [DATO]; el gasto total de turistas internacionales alcanzó $31,715.4 millones de dólares (+4.9%) [DATO]; el gasto total de todos los visitantes internacionales (incluye excursionistas) fue de $34,991.6 millones de dólares (+6.2%) [DATO]. [Fuente primaria — INEGI]
- **Laguna importante:** No existe en México una estadística oficial equivalente a la del INE español que mida específicamente el número de viviendas/departamentos ofrecidos como renta vacacional tipo Airbnb (DATATUR/Sectur mide predominantemente hotelería tradicional vía monitoreo de cuartos disponibles/ocupados en destinos turísticos, no viviendas particulares). Los intentos de descargar los reportes mensuales de "Turismo en Cifras" (RAT) de DATATUR para obtener cifras nacionales de cuartos disponibles/ocupados no tuvieron éxito (enlaces PDF devolvieron error 404 al momento de la consulta) — se marca como **PENDIENTE** obtener esta cifra específica de hotelería tradicional; no afecta las cifras de INEGI arriba citadas, que sí se verificaron directamente.
- **Confirmación adicional (2026-09-05):** se revisó hoy directamente el glosario oficial de DATATUR (Sectur México, `datatur.sectur.gob.mx/SitePages/Glosario.aspx`) [DATO — verificación negativa: consulta directa del glosario oficial]. El glosario **no contiene ningún indicador específico para "renta vacacional de corto plazo" tipo Airbnb**; solo existen categorías tradicionales pre-Airbnb como "Cabañas, villas y similares" (alojamiento temporal en cabañas/villas/bungalows). Esto es una **segunda fuente independiente que refuerza** (no resuelve) la laguna #3 de este documento: no existe en México un equivalente estructural al INE español para rentas vacacionales tipo Airbnb.

**LatAm (fuera de México):** No se realizó investigación país por país adicional dentro del alcance original de esta tarea; no se encontró de forma incidental ninguna fuente oficial equivalente (instituto de estadística nacional) para otro país de LatAm. Se marca **PENDIENTE**. El 2026-09-05 se hicieron tres intentos adicionales dirigidos específicamente a cerrar esta laguna, documentados aquí para que el vacío conste como **intento fallido declarado, no como silencio**:
  - **Holidu** (agregador europeo de rentas vacacionales, `holidu.com/host/partners`, WebFetch 2026-09-05) [DATO — leído en vivo]: "Holidu integrates with over 75 Property Management Systems and Channel Managers worldwide... via Property Management System, Channel Manager, or directly through our Holidu API." Holidu opera principalmente en Europa; **no se confirmó presencia específica en LatAm**. No es una fuente de TAM/mercado LatAm — se cita únicamente como dato de contexto de "otros canales"/distribución adicional en Europa (relevante para RV05), y explícitamente **no cierra la laguna de LatAm**.
  - **DATATUR** (Sectur México) — ver confirmación adicional arriba: refuerza la laguna #3, no aporta cifra de LatAm fuera de México.
  - **Rentalia.com** (agregador español/LatAm histórico del grupo Expedia/HomeAway, intento de WebFetch 2026-09-05): **HTTP 403 Forbidden** — bloqueo confirmado, no se pudo verificar ningún dato. Se declara aquí como intento fallido explícito, en la misma convención que otros bloqueos ya documentados del proyecto (ver `docs/BLOQUEOS.md`).
  - **Conclusión de estos tres intentos:** sigue sin poder construirse ninguna cifra nueva de TAM/SAM/SOM para LatAm fuera de España/México. La sección 5.3 permanece **PENDIENTE**, pero ahora con evidencia de búsqueda activa fechada, no como vacío silencioso.

### 2. Segmentación por número de unidades gestionadas

**PENDIENTE — no se encontró ninguna fuente oficial o pública gratuita y legible** (AirDNA, VRMA, European Holiday Home Association u otra asociación sectorial) que reporte la distribución de anfitriones/property managers por tamaño de cartera (1-5 unidades vs. medianos vs. grandes) para México, España o LatAm. Los informes de AirDNA localizados en la búsqueda (Outlook Reports, Property Manager Analysis) están detrás de muro de pago o no exponen esta segmentación en sus páginas públicas gratuitas. No se debe usar ninguna cifra de segmentación en este documento hasta encontrar una fuente verificable.

### 3. Adopción de channel managers / software PMS

**PENDIENTE — no se encontró ninguna cifra oficial citable** sobre la tasa de adopción de channel managers o software de gestión (PMS) entre anfitriones profesionales en México, España o LatAm. No se debe inventar ni estimar este dato sin fuente.

### 4. Regulaciones que afectan la demanda (referencia únicamente — detalle completo en RV19)

- **España:** Real Decreto 1312/2024, de 23 de diciembre (BOE-A-2024-26931), que regula el procedimiento de Registro Único de Arrendamientos y crea la Ventanilla Única Digital de Arrendamientos, en adaptación al Reglamento (UE) 2024/1028, para la recogida e intercambio de datos de servicios de alquiler de alojamientos de corta duración [R]. Las empresas y particulares que quieran comercializar alojamiento de corta duración en plataformas online deben contar con este número de registro único. [Fuente primaria oficial — BOE; contenido verificado solo vía snippet de búsqueda, no lectura directa completa del texto — confianza media]. Este marco regulatorio es plausiblemente relevante para explicar la caída de viviendas turísticas registradas observada en el INE entre 2025 y 2026 (sección 1). Nota: RV19 §6 (Lagunas, punto 2) y BLOQUEOS.md B-003 tampoco pudieron confirmar el número/fecha exacto de este Real Decreto ni de la Orden INT asociada por bloqueo técnico (cupo de búsqueda agotado, 403 en mivau.gob.es/interior.gob.es) — trátese con la misma cautela que la reforma de CDMX descrita abajo.
- **México / Ciudad de México:** Reforma a la Ley de Turismo de la CDMX (Gaceta Oficial, reformas de abril y octubre de 2024) que crea un "Padrón de Anfitriones" obligatorio, límite de 182 noches al año de renta por inmueble, seguro de responsabilidad civil obligatorio, y un sistema de registro digital de anfitriones y plataformas que —según fuentes de prensa— se implementó formalmente el 22 de mayo de 2026 [R]. **Esta información NO fue verificada directamente contra el texto de la Gaceta Oficial de la CDMX** (solo vía medios: Infobae, POSTA México, Xataka México) — confianza baja-media, se recomienda verificación directa antes de uso en documentos legales.

  **Advertencia reforzada:** RV19 §6 (Lagunas, punto 1) y `docs/BLOQUEOS.md` B-004 tratan la EXISTENCIA MISMA de esta normativa de CDMX (no solo su contenido específico) como **"no se pudo confirmar ni descartar"** — cita textual de B-004: *"no se pudo confirmar ni descartar la existencia de una 'Ley de Alojamiento Turístico de la Ciudad de México' o normativa local equivalente (registro, límites de noches, impuesto de hospedaje)"*, con causa técnica declarada de bloqueo total en las fuentes oficiales intentadas (`congresocdmx.gob.mx` y `data.consejeria.cdmx.gob.mx` con error de certificado TLS; `ordenjuridico.gob.mx` sin resultados accesibles vía WebFetch; `sat.gob.mx` y `gob.mx/sectur` son SPA sin contenido estático extraíble). La matriz de RV19 (sección 3) marca esta fila como **"No verificado — laguna total" (D19)**, y RV19 §6 (Lagunas, punto 1) concluye que esto "**bloquea cualquier afirmación de producto sobre esta jurisdicción**". Los detalles operativos citados en el párrafo anterior (Padrón de Anfitriones, 182 noches, seguro obligatorio, 22-mayo-2026) provienen ÚNICAMENTE de prensa secundaria (Infobae, POSTA México, Xataka México) y **NO deben tratarse con más certeza que la advertencia de RV19/B-004** — es decir, un lector no debe inferir de este párrafo que existe más certeza sobre el *contenido* de la norma que la que RV19/B-004 permite sostener sobre su *existencia misma*. No usar estos detalles en ningún documento legal, de cumplimiento o comercial sin verificación directa del texto oficial (Gaceta Oficial CDMX, SECTUR CDMX).
- **Unión Europea:** Reglamento (UE) 2024/1028 sobre recopilación y puesta en común de datos relativos a los servicios de alquiler de alojamiento de corta duración, que es la base de la implementación española del Registro Único [R].
- El detalle legal completo (requisitos, sanciones, calendario de implementación por comunidad autónoma o estado mexicano, jurisprudencia) **se remite al módulo RV19**, fuera del alcance de RV15.

### 5. Estimaciones SAM/SOM para Atiende Rentas Vacacionales

**Advertencia metodológica:** Debido a que no existe una fuente oficial de "número de anfitriones profesionales / property managers" (a diferencia del número de viviendas turísticas o de PIB turístico), toda estimación de SAM/SOM en esta sección combina un dato base verificado (sección 1) con supuestos de conversión **no verificados**, marcados explícitamente como tales. Los rangos son deliberadamente amplios para reflejar esta incertidumbre.

#### 5.1 España — único mercado con dato base oficial de unidades

**Fórmula:**

```
SAM_España (unidades potencialmente dirigibles)
    = Viviendas turísticas totales (INE, may-2026)
      × % dirigible a anfitriones profesionales/semi-profesionales (supuesto no verificado)

SAM_España (USD/año)
    = SAM_España (unidades) × Ticket promedio anual estimado por unidad (supuesto no verificado)

SOM_España (USD/año)
    = SAM_España (USD/año) × % de cuota de mercado alcanzable en horizonte de 3 años (supuesto no verificado)
```

**Datos base (verificados, sección 1):**
- Viviendas turísticas totales en España: 341,001 (INE, mayo 2026).

**Supuestos no verificados (deben validarse con investigación adicional o datos internos de Atiende antes de usarse en planeación financiera):**
- % dirigible a anfitriones profesionales/semi-profesionales (2+ unidades o alto volumen que justifique gestión asistida por software/IA): rango supuesto de **15%–35% [E]** del total de viviendas turísticas registradas. No existe fuente oficial de este porcentaje; es un supuesto de trabajo.

**⚠️ Nota de reconciliación cruzada (umbral "anfitrión profesional") — ver también RV01.** El umbral "2+ unidades" usado aquí es un piso de MERCADO dirigible (para no excluir del TAM/SAM/SOM a ningún anfitrión con más de una unidad que ya podría beneficiarse de software/IA asistida), distinto del umbral "10-200 unidades" que RV01 (sección "Perfiles y sus jobs-to-be-done") usa para el perfil de PRODUCTO "administrador profesional" (persona de diseño de features, pensada para volumen alto). Ninguno de los dos umbrales tiene fuente primaria oficial de ninguna plataforma o asociación del sector (ver `docs/LAGUNAS.md`, sección 6, fila "Segmentación de anfitriones por volumen de unidades"); el rango 4-9 unidades queda sin cubrir por ninguno de los dos y no se reconcilia en una sola cifra porque miden conceptos distintos (mercado dirigible vs. perfil de producto). Referencia cruzada añadida en RV01 (sección "Perfiles y sus jobs-to-be-done").
- Ticket promedio anual estimado por unidad gestionada: rango supuesto de **$150–$600 USD/año por unidad [E]** (orden de magnitud típico de herramientas de channel manager/PMS de mercado, pero **no verificado contra ningún catálogo de precios público de la competencia ni contra el pricing definitivo de Atiende**).
- % de cuota de mercado alcanzable en 3 años (SOM): rango supuesto de **1%–5% [E]** del SAM. No verificado.

**Cálculo (rango, no punto único — toda la cadena de resultado es una estimación [E] propia, no un dato publicado; solo el insumo base de 341,001 viviendas es [DATO]):**
- SAM_España (unidades) = 341,001 [DATO] × [0.15, 0.35] [E] = **51,150 – 119,350 unidades [E]** dirigibles.
- SAM_España (USD/año) = [51,150 – 119,350 unidades] × [$150 – $600/año] = **~$7.7 millones – ~$71.6 millones USD/año [E]** (rango muy amplio por la combinación de dos supuestos no verificados; los extremos del rango combinado son: mínimo 51,150 × $150 ≈ $7.67M; máximo 119,350 × $600 ≈ $71.6M).
- SOM_España (USD/año) = SAM_España × [0.01 – 0.05] = **~$77,000 – ~$3.58 millones USD/año [E]**.

**Nota de confianza (corrección 2026-09-05, hallazgo C12 de la auditoría independiente):** las cuatro cifras anteriores (15%–35%, $150–$600, 1%–5%, y los tres resultados calculados) son estimaciones **[E]** — cálculos propios sobre supuestos no verificados, no datos observados de mercado — y así deben citarse en cualquier documento derivado (pitch, plan de negocio, proyección financiera). No presentarlas sin repetir la etiqueta `[E]` y sin remitir a la tabla de supuestos (sección siguiente).

**Fecha de la estimación:** 2026-09-05, basada en dato INE de mayo 2026.

#### 5.2 México — PENDIENTE

**PENDIENTE — supuestos no verificados.** No se dispone de una cifra base oficial equivalente al INE español (número de viviendas turísticas o de anfitriones profesionales). Los datos oficiales disponibles (PIB turístico, empleo en alojamiento, llegadas de turistas — sección 1) miden el sector turístico/hotelero en su conjunto, no el universo específico de rentas vacacionales tipo Airbnb gestionadas por terceros. Cualquier intento de derivar un número de unidades o anfitriones a partir de estas cifras macro requeriría supuestos adicionales tan especulativos (p. ej., "% del PIB de alojamiento que corresponde a rentas vacacionales no hoteleras") que no cumplen con el estándar de evidencia de esta investigación. **No se construye una cifra de SAM/SOM para México en este documento.** Se recomienda como siguiente paso buscar específicamente estudios de mercado de consultoras de turismo mexicanas (p. ej. CBRE, JLL, o el propio Sectur) que puedan tener una estimación sectorial, o solicitar datos internos de Airbnb/Booking para México si existe relación comercial.

#### 5.3 LatAm (fuera de México) — PENDIENTE

**PENDIENTE — supuestos no verificados.** No se investigó país por país dentro del alcance de esta tarea; no hay dato base oficial disponible de forma incidental.

---

## Riesgos / límites

- Airbnb y Booking Holdings no publican desgloses por país en sus filings públicos (10-K/10-Q), lo que impide construir un TAM "de abajo hacia arriba" a partir de sus propias cifras para México, España o LatAm específicamente.
- Airbnb dejó de reportar "active listings" como métrica pública explícita; cualquier cifra de "listings activos" de Airbnb que se encuentre en fuentes secundarias (blogs, medios) para años recientes probablemente no tiene respaldo en un filing oficial y no debe usarse sin verificación.
- La estadística de viviendas turísticas del INE es "experimental" (metodología en desarrollo, cambio de fechas de referencia reciente de agosto/febrero a mayo/noviembre), por lo que sus series históricas pueden no ser estrictamente comparables entre sí.
- No existe en México un equivalente al INE español para medir el universo de rentas vacacionales no hoteleras; esto es una laguna estructural de datos oficiales en el mercado mexicano, no solo de esta investigación.
- Las cifras de Eurostat (sección 1, España) se obtuvieron vía un agregador de terceros (eupublicdata.eu) por limitaciones técnicas para leer la base de datos oficial de Eurostat (renderizado JavaScript); se marcaron con confianza media y deben reverificarse directamente en ec.europa.eu/eurostat antes de usarse en cualquier documento externo o de decisión de inversión.
- La información sobre la regulación de la Ciudad de México se tomó de medios de prensa, no del texto oficial de la Gaceta Oficial; debe verificarse directamente antes de cualquier uso legal o de cumplimiento (tarea de RV19). **Más fuerte aún:** RV19 §6/B-004 no logran confirmar ni descartar la existencia misma de esta normativa (no solo su contenido) — ver advertencia reforzada en la sección 4 de este documento. Ningún hallazgo de esta sección debe presentarse con más certeza que esa advertencia.
- Todas las cifras de SAM/SOM de la sección 5 dependen de supuestos de conversión (% dirigible, ticket promedio, % de cuota alcanzable) que **no están verificados con ninguna fuente oficial** — son supuestos de trabajo explícitos, no datos de mercado confirmados, y por eso llevan etiqueta `[E]` inline. No deben presentarse a inversionistas o usarse en proyecciones financieras formales sin marcar claramente su naturaleza de estimación preliminar.
- **LatAm (corrección Alta, 2026-09-05):** antes de esta corrección no existía ningún research de mercado LatAm fuera de España/México/cifras globales — un vacío silencioso (señalado también por la auditoría en `docs/LAGUNAS.md` fila "Agregadores regionales LATAM/España" para RV05/RV14/RV15). Hoy se intentaron tres fuentes dirigidas específicamente a esa laguna (Holidu, DATATUR, Rentalia — detalle en sección 1); ninguna permite construir una cifra de TAM/SAM/SOM de LatAm. La laguna sigue abierta, pero ahora como **intento documentado y fechado**, no como omisión.

## Implicaciones para requisitos

- **RV15-R-01:** El producto debe estar preparado para operar en un mercado (España) donde el universo de viviendas turísticas registradas está en descenso interanual (~-10.7% may-2025 a may-2026 según prensa que cita al INE), posiblemente por presión regulatoria (Real Decreto 1312/2024) — el value proposition de Atiende debería incluir ayuda a los anfitriones a mantenerse en cumplimiento regulatorio (registro único, ventanilla digital) como parte de su oferta, no solo optimización operativa.
- **RV15-R-02:** Dado que Airbnb y Booking no exponen el número de listings por país, el sistema de inteligencia de mercado interno de Atiende (si existe, o si se construye) debería apoyarse en fuentes propias (scraping de plataformas, datos de clientes propios) en lugar de asumir que existen cifras oficiales públicas para dimensionar el mercado local con precisión — se debe presupuestar investigación de mercado primaria (encuestas, alianzas con asociaciones sectoriales) en vez de depender solo de fuentes gubernamentales para México/LatAm.
- **RV15-R-03:** El producto debe diseñarse pensando en el registro y cumplimiento normativo como una función central en México (CDMX: Padrón de Anfitriones, límite de 182 noches, seguro obligatorio) y España (Registro Único, Ventanilla Única Digital) — remitir especificación funcional detallada a RV19, pero marcar aquí que la demanda de "compliance-as-a-feature" es previsible en ambos mercados.
- **RV15-R-04:** No se debe construir un caso de negocio (business case) para México basado en una cifra de TAM/SAM numérica hasta que se resuelva la laguna de datos identificada en la sección 5.2; se recomienda priorizar investigación de mercado primaria o de pago (AirDNA Enterprise, informes de consultoras) antes de comprometer metas de ventas específicas para México.
- **RV15-R-05:** Dado que no hay datos de segmentación por tamaño de cartera ni de adopción de PMS/channel managers, cualquier estrategia de pricing o de segmentación de producto (ej. plan "hosts individuales" vs. "property managers") debe basarse inicialmente en hipótesis a validar con research cualitativa propia (entrevistas a anfitriones/administradores), no en datos de mercado ya existentes.

## Lagunas

1. Número exacto de "active listings" de Airbnb (global o por país) — no disponible en fuentes públicas recientes (Airbnb dejó de reportarlo).
2. Desglose por país (México, España, LatAm) de los ~3.9 millones de alojamientos alternativos de Booking Holdings — no disponible públicamente.
3. Cifra oficial mexicana equivalente al INE español para viviendas de uso turístico / rentas vacacionales — no existe (laguna estructural, no solo de esta investigación). **Reforzado 2026-09-05:** se revisó directamente el glosario oficial de DATATUR (`datatur.sectur.gob.mx/SitePages/Glosario.aspx`) y se confirmó que no contiene ningún indicador de renta vacacional de corto plazo tipo Airbnb, solo categorías tradicionales pre-Airbnb ("Cabañas, villas y similares") — segunda fuente independiente que confirma la laguna, no la cierra.
4. Cifras nacionales de "Turismo en Cifras" (DATATUR/Sectur) de cuartos disponibles/ocupados a nivel nacional — no se pudieron descargar los PDFs mensuales (error 404 en los enlaces intentados); pendiente reintento con URLs correctas o acceso directo al portal DATATUR.
5. Segmentación de anfitriones/property managers por número de unidades gestionadas (1-5, medianos, grandes) — PENDIENTE, no se encontró fuente oficial pública.
6. Tasa de adopción de channel managers/PMS entre anfitriones profesionales — PENDIENTE, no se encontró fuente oficial pública.
7. Verificación directa (no vía agregador) de las cifras de Eurostat tin00181 para España/UE-27 — pendiente de reverificación en ec.europa.eu/eurostat.
8. Verificación directa del texto de la Gaceta Oficial de la Ciudad de México sobre la reforma a la Ley de Turismo — pendiente (se usó solo prensa secundaria). **Nota crítica:** RV19 §6/B-004 no logran verificar ni siquiera si esta reforma existe (bloqueo técnico total en fuentes oficiales), no solo su contenido — ver advertencia reforzada en sección 4. Fila de LAGUNAS.md relacionada: "México — regulación local CDMX de alojamiento turístico" (sección 6).
9. Cifras oficiales de mercado (número de anfitriones, unidades, PIB turístico no-hotelero) para países de LatAm fuera de México — no investigado en el alcance original de esta tarea. **Actualizado 2026-09-05:** se intentaron tres fuentes dirigidas (Holidu, DATATUR, Rentalia — sección 1); ninguna aporta una cifra de mercado LatAm utilizable. Sigue PENDIENTE, ahora con intento fechado y declarado. Fila de LAGUNAS.md relacionada: "TAM/SAM/SOM México y LatAm" y "Agregadores regionales LATAM/España" (sección 6 y 4.1).
10. Ticket promedio anual real de software de gestión (channel manager/PMS) en México/España/LatAm — no verificado con ninguna fuente pública; usado como supuesto `[E]` en sección 5.1.
11. Rentalia.com (agregador histórico Expedia/HomeAway para España/LatAm) — bloqueado con HTTP 403 Forbidden en el intento de WebFetch del 2026-09-05; no se pudo verificar ningún dato sobre su cobertura o mercado.

## Supuestos

1. **[E]** Se asume que el "% dirigible a anfitriones profesionales/semi-profesionales" del total de viviendas turísticas registradas en España se encuentra en el rango 15%–35% — supuesto de trabajo, no verificado, usado únicamente para acotar el cálculo de SAM en la sección 5.1.
2. **[E]** Se asume un ticket promedio anual por unidad gestionada de $150–$600 USD — supuesto de trabajo basado en órdenes de magnitud típicos de la categoría de software (channel manager/PMS), no verificado contra ningún catálogo de precios público específico.
3. **[E]** Se asume una cuota de mercado alcanzable en un horizonte de 3 años (SOM) de 1%–5% del SAM estimado — supuesto de trabajo estándar de planeación, no verificado con ningún benchmark de la industria.
4. **[E]** Se asume que la caída interanual de viviendas turísticas registradas en España (may-2025 a may-2026, según prensa que cita al INE) está al menos parcialmente asociada a la entrada en vigor del Real Decreto 1312/2024 — esto es una interpretación razonable pero no confirmada por ninguna fuente oficial que establezca causalidad explícita.
5. **[E]** Se asume que la categoría "Alojamiento para visitantes" de la Cuenta Satélite del Turismo de México (INEGI) mezcla hospedaje hotelero tradicional y no hotelero sin distinguirlos — esto se infiere de la metodología general de las Cuentas Satélite (no se encontró una nota metodológica explícita que lo confirme en el documento leído), por lo que se marca como supuesto, no como hecho verificado.

---

## Fuentes de este módulo

Fecha de consulta: 2026-09-05 para todas las URLs siguientes, salvo que se indique otra fecha. Ledger completo con cita textual por entrada: `docs/fuentes/rv12-13-15-16.md` (sección "RV15 — Mercado", entradas L-RV15-01 a L-RV15-12).

**Airbnb (global):**
- SEC EDGAR — Airbnb, Inc. 10-K FY2025: https://www.sec.gov/Archives/edgar/data/1559720/000155972026000004/abnb-20251231.htm (presentado 2026-02-12)
- news.airbnb.com — Comunicado de resultados Q2 2026 (agosto 2026)

**Booking Holdings (global):**
- SEC EDGAR — Booking Holdings Inc. 10-K FY2025: https://www.sec.gov/Archives/edgar/data/1075531/000107553126000009/bkng-20251231.htm

**España (fuentes oficiales y regulación):**
- API INE — tabla 39364 (Estadística Experimental de Viviendas Turísticas): https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/39364
- Eurostat, tabla tin00181, vía agregador eupublicdata.eu [marcada confianza media — no verificada directamente en ec.europa.eu]
- tradingeconomics.com — bed-places hoteles España, dato Eurostat vía snippet [confianza baja-media]
- BOE — Real Decreto 1312/2024, de 23 de diciembre (BOE-A-2024-26931) [confianza media, verificado solo vía snippet de búsqueda]

**México (fuentes oficiales y complementarias):**
- INEGI — Comunicado de Prensa 203/25, Cuenta Satélite del Turismo de México (CSTM) 2024: https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/turismo/CSTM2024_CP.pdf (2025-12-18)
- INEGI — Boletín de Indicador 82/26, Encuesta de Viajeros Internacionales (EVI): https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/ViajInternales/evi2026_02.pdf (2026-02-12)
- DATATUR (Sectur México) — Glosario oficial: https://datatur.sectur.gob.mx/SitePages/Glosario.aspx (consultado 2026-09-05, confirma laguna estructural — sección "Lagunas" punto 3)
- Prensa sobre reforma CDMX (confianza baja-media, NO verificado contra texto oficial — ver advertencia reforzada, sección 4): Infobae, POSTA México, Xataka México

**Otros canales / agregadores (contexto LatAm/España, intentos 2026-09-05):**
- Holidu — https://www.holidu.com/host/partners (leído en vivo; opera en Europa, sin presencia LatAm confirmada, no cierra laguna de mercado LatAm)
- Rentalia.com — intento de WebFetch, HTTP 403 Forbidden (bloqueo confirmado, sin datos verificables)

**Nota sobre el mínimo de fuentes (§1 punto 3 de `00-PLAN.md`):** este módulo cita explícitamente **10 URLs/fuentes distintas** agrupadas en 5 categorías temáticas (Airbnb, Booking, España, México, Otros/LatAm), por debajo del mínimo de 25 fuentes exigido por la barra de calidad. Se declara aquí en vez de inflar el conteo: la causa es que los datos base de mercado para este dominio (TAM/SAM/SOM de rentas vacacionales) están concentrados en un número reducido de fuentes primarias oficiales (2 filings SEC, 2 fuentes INE/Eurostat, 2 boletines INEGI, 1 texto regulatorio), y el resto de la investigación (segmentación por tamaño de cartera, adopción de PMS, TAM LatAm) resultó en búsquedas sin resultado citable (ver sección "Lagunas") en vez de fuentes adicionales válidas. Ampliar este número requeriría estudios de mercado de pago (AirDNA Enterprise, consultoras) fuera del alcance actual, no más búsqueda gratuita en las mismas categorías ya agotadas.
