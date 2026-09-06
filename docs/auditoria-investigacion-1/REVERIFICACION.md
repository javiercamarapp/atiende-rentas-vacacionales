# Reverificación independiente de las correcciones — Fase 1

**Reverificador:** Sonnet, independiente (no participó en la investigación de Fase 1 ni en la auditoría original ni en las correcciones aplicadas).
**Fecha:** 2026-09-05.
**Alcance:** todas las correcciones declaradas RESUELTA/DELIMITADA en `correcciones-A.md`, `correcciones-B.md` y `correcciones-blueprint.md` (C1–C5 críticas, C6–C10 altas, C11–C18 medias, C19–C21 bajas, BC1–BC12 del blueprint), más coherencia cruzada, búsqueda de regresiones y reevaluación de la barra de calidad.
**Método:** 6 subagentes Sonnet en paralelo, cada uno con lectura directa de los archivos corregidos y, para críticas/altas, re-lectura independiente de la fuente primaria vía WebFetch/curl (no se aceptó ninguna cita de `correcciones-A/B.md` sin comprobación directa).

**Nota metodológica relevante:** durante la verificación de C4, la primera llamada a WebFetch sobre `hospitable.com/pricing/` alucinó las frases "you approve"/"fully automated" como si estuvieran presentes en la página — pareciendo contradecir la corrección. Una segunda verificación con `curl` + inspección de HTML crudo confirmó que esas frases **no existen** en la página real, y que el corrector B tenía razón. Se recomienda que cualquier verificación futura de citas web de alto impacto en este proyecto use `curl`/HTML crudo como respaldo de WebFetch, no solo WebFetch.

---

## 1. Veredicto por corrección

### CRÍTICAS (C1–C5)

| # | Hallazgo | Veredicto | Evidencia |
|---|---|---|---|
| C1 | RV19 prompt injection tratado como hipotético | **VERIFICADA** | RV19 §1/§2.1/§5/§6/§7 ya tratan el riesgo como actual y bloqueante, mapeado a OWASP LLM01 (4 citas confirmadas verbatim en la página en vivo) y a arquitectura real y sustancial de RV18 §6/§8 (no una referencia vacía). |
| C2 | RV03 "Airbnb no transfiere datos de huésped" sin respaldo | **VERIFICADA** | Las 5 apariciones degradadas a NO CONFIRMADA; supuesto S8 añadido. Confirmado vía `curl` sobre airbnb.com/help/article/99: la única cifra verbatim es "We import up to 2 years of data", sin ninguna mención a huésped/PII. |
| C3 | Contradicción España en Co-Host Network | **VERIFICADA** | RV01 y RV03 coinciden ahora en que España SÍ está cubierta. Confirmado dos veces (WebFetch + curl) sobre airbnb.com/help/article/3472: "...Japan, Mexico, Puerto Rico, South Korea, **Spain**, and the United Kingdom...". |
| C4 | Cita Hospitable no reproducible | **VERIFICADA** | Cita eliminada de RV14; RV14-R-01 reformulado sin depender de ella. Confirmado vía `curl` sobre HTML crudo de hospitable.com/pricing/: las frases "you approve"/"fully automated" no existen en la página. |
| C5 | Incumplimiento sistemático de trazabilidad mecánica | **INCOMPLETA** | Los 21/21 módulos tienen ahora sección "Fuentes de este módulo" y `docs/LAGUNAS.md` fue actualizado sustancialmente (128 celdas con estado: 52 EVIDENCIA, 56 LAGUNA HONESTA, 14 PENDIENTE-EXTERNO, 6 NO APLICA). Pero el etiquetado `[DATO]/[R]/[E]` sigue siendo débil en 8 módulos (contenido preexistente no re-etiquetado retroactivamente, admitido explícitamente por los correctores). Ver §4 para el detalle módulo por módulo. |

### ALTAS (C6–C10)

| # | Hallazgo | Veredicto | Evidencia |
|---|---|---|---|
| C6 | RtB 3 días vs 48h (RV04) | **VERIFICADA** | Delimitada honestamente como contradicción real entre dos páginas oficiales de Booking.com, sin forzar resolución. Ambas citas ("at least three days before the check-in date" y "more than 48 hours in the future") confirmadas verbatim en vivo. Bloqueado su uso en copy/SLA hasta aclaración oficial. |
| C7 | RV07 no cubría eje webhook/API ni consumía LAGUNAS.md | **VERIFICADA** | Nueva §0 con tabla consolidada por canal (Booking pull~20s sin webhook; Airbnb no confirmado; Vrbo sin especificación; Otros no abordado), 22 menciones a LAGUNAS.md, filas §1.1/§2.1/§3.1 coherentes. |
| C8 | RV17 sin fuentes nivel-1, ruta de ledger rota | **VERIFICADA** | Ruta corregida y verificada (`docs/fuentes/rv17-18-20.md` existe). 8 páginas oficiales distintas de postgresql.org (SKIP LOCKED y advisory locks confirmados verbatim). Déficit frente a 25 URLs declarado explícitamente con causa razonada. |
| C9 | UID/SEQUENCE/dedupe/anti-eco no investigado por canal a nivel API | **VERIFICADA** | RV03/RV04/RV05/RV07 documentan honestamente qué expone cada canal; convenciones sin respaldo oficial marcadas explícitamente como "decisión interna de Atiende". Los 2 escenarios pedidos por LAGUNAS.md siguen abiertos pero declarados, no silenciados. |
| C10 | TripAdvisor/agregadores LATAM sin investigar ni declarar | **VERIFICADA** | Holidu investigado con éxito (cita verbatim confirmada); TripAdvisor/Rentalia declarados como laguna explícita con 3 intentos 403 documentados; filas dedicadas en LAGUNAS.md §4.1 y §6. |

### MEDIAS (C11–C18)

| # | Hallazgo | Veredicto | Evidencia |
|---|---|---|---|
| C11 | RV07 supuestos huérfanos | **VERIFICADA** | Tabla de 5 columnas con lógica/fórmula para umbral de alerta y frecuencia de reconciliación. |
| C12 | RV15 TAM/SAM/SOM sin `[E]`, CDMX sobre-confiado | **VERIFICADA** | Cadena etiquetada `[E]`; advertencia reforzada citando fielmente B-004. |
| C13 | RV12 tono resumen vs. riesgos | **VERIFICADA** | Resumen ejecutivo ahora remite al matiz de R3. |
| C14 | RV16 catálogo de IA desactualizado | **VERIFICADA** | Advertencia de subestimación 2-8x; precios re-etiquetados `[R]`. |
| C15 | RV12×RV18 roles no reconciliados | **VERIFICADA** | Nota de reconciliación cruzada en ambos módulos y fila en LAGUNAS.md; correctamente no unificado unilateralmente. |
| C16 | RV21 UID/SEQUENCE sin hash | **VERIFICADA** | Casos 1, 3, 13 y RV21-R-01/02 exigen ahora verificación por hash de contenido. |
| C17 | RV01×RV15 "anfitrión profesional" inconsistente | **PENDIENTE — nunca abordada** | RV01 sigue usando "10-200 unidades", RV15 sigue usando "2+ unidades" para el mismo concepto. Sin nota cruzada, sin documentar el vacío 4-9 unidades. No aparece en correcciones-A.md ni correcciones-B.md como resuelta; es una omisión real de la pasada de correcciones. |
| C18 | RV12×RV16 comisión host-only no incorporada a pricing | **VERIFICADA** | Nueva §1.1 en RV16 incorpora el trade-off a la propuesta de valor. |

### BAJAS (C19–C21) — verificadas por completitud, fuera del alcance estrictamente exigido

| # | Hallazgo | Veredicto | Evidencia |
|---|---|---|---|
| C19 | B-002 "Intento 2 web.archive.org" sin evidencia trazable | **INCOMPLETA** | Existe evidencia real y sustantiva (`docs/fuentes/b002-archivo.md`), pero el bloque quedó mal archivado bajo el encabezado de **B-004** en `docs/BLOQUEOS.md` en vez de bajo B-002, y describe el método como "WebFetch" cuando el propio archivo de evidencia dice que el método real fue `curl` (WebFetch no pudo acceder). |
| C20 | Vocabulario de "capas" RV07×RV17 no mapeado | **PENDIENTE — correctamente declarado como tal** | RV17 documenta explícitamente que la decisión final está pendiente de la definición de `ocupacion_unidad`; no se fuerza una resolución prematura. Ver también hallazgo de coherencia en §2.A. |
| C21 | Omisiones menores | **PARCIAL (3/4)** | `roomstosell`>255→254, timeout configurable a 24h, y fecha RD 933/2021 (2 enero 2023): VERIFICADAS. Rate limits 75-700 con nivel intermedio 200: la corrección se aplicó por error en RV21 en vez de en RV04, que es donde vive la cita original imprecisa (RV04 líneas 32/72/109 siguen sin cambios). |

### BLUEPRINT (BC1–BC12)

| # | Corrección | Veredicto |
|---|---|---|
| BC1 (alto) | EXCLUDE re-scoped + 23P01→conflicto_pendiente | **VERIFICADA** — mecanismo coherente entre BLUEPRINT §3.1/§3.2, DECISIONES D-002, REQUISITOS REQ-048/068/091; regla de oro (nunca cancela automáticamente) intacta en todas las lecturas. Hallazgo menor nuevo: REQ-091 cita un estado "liberado" que **no existe** en el enum real de `estado` del SQL de BLUEPRINT §3.2 (`confirmado\|provisional\|cancelado\|conflicto_pendiente`). |
| BC2 (alto) | Nuevos criterios ACEPTACION 13/14/15 | **VERIFICADA** — criterios concretos y verificables, referencias a REQ-141/143/155 correctas. |
| BC3 (alto) | B-005 creado, D-023/BLUEPRINT ya no atribuyen laguna fiscal MX a B-003/B-004 | **VERIFICADA** — formato consistente con B-001..B-004; D-023 cita correctamente B-003 (España), B-004 (CDMX), B-005 (fiscal MX) sin mezclar. |
| BC4 (medio) | "~5x"→"~37.5x" | **VERIFICADA** — aritmética confirmada (0.0225/0.0006≈37.5; 0.0225/0.0045=5 solo para Haiku 4.5 vs Opus 5). |
| BC5 (medio) | Matiz "Airbnb ~3h confianza baja/media" en 7 ubicaciones | **VERIFICADA** en los 4 documentos normativos (BLUEPRINT, DECISIONES, REQUISITOS, ACEPTACION) — sin excepción encontrada ahí. Ver §2.E para propagación incompleta a módulos de investigación (no exigido explícitamente por BC5, pero relevante para el criterio 2 del encargo). |
| BC6 (medio) | REQ-179 nuevo, catálogo 179→180 filas | **VERIFICADA** — 180 filas confirmadas por conteo directo. Discrepancia aritmética menor no reportada por el corrector: el texto dice "149 MUST" pero el conteo real por columna es **148 MUST** + 28 SHOULD + 4 COULD = 180 (confirmado dos veces, incluyendo por este reverificador directamente). |
| BC7 (medio) | REQ-005/008 evidencia corregida | **VERIFICADA**. |
| BC8 (bajo) | Citas "RV18 §5.4"→"§5, punto 4"; "RV17 §1.1"→"§2.3" | **VERIFICADA**. |
| BC9 (bajo) | REQ-011/012 evidencia bajada a `[R]` | **VERIFICADA**. |
| BC10 (bajo) | Nueva fila de riesgo RtB en BLUEPRINT §12 | **VERIFICADA** — cifras "72h"="3 días" consistentes con RV04. |
| BC11 (bajo) | ACEPTACION casos 18/20 | **VERIFICADA**. |
| BC12 (bajo) | REQ-098 matiz restaurado | **VERIFICADA**, coherente con RV02 R-10. |

---

## 2. Coherencia cruzada tras las correcciones

**A) BC1 — EXCLUDE/23P01/conflicto_pendiente:** COHERENTE en comportamiento entre BLUEPRINT §3.2, DECISIONES D-002 y REQUISITOS (REQ-048/068/091); ACEPTACION exige el mismo comportamiento aunque sin vocabulario SQL literal (esperable, es un documento de criterios de prueba). **Hallazgo de terminología a vigilar (no bloqueante):** la palabra "capa" tiene tres significados distintos según el documento — BLUEPRINT/DECISIONES la usan como discriminador top-level (`reserva`|`bloqueo`); RV17 §1.1 la usa como subtipo de `bloqueo_manual`; RV17 §2.3 llama a ese mismo discriminador top-level "`tipo`", no "`capa`"; RV07 la usa para la jerarquía de precedencia de razones. El comportamiento es idéntico en todos, pero el vocabulario no está unificado — puede confundir a un implementador que lea RV17/RV07 antes que BLUEPRINT.

**B) C3 — España en Co-Host Network:** COHERENTE. RV01 y RV03 citan la misma frase verbatim, la misma lista de 13 países, y ambos afirman España confirmada sin matices distintos de confianza.

**C) RtB 3 días vs 48h como contradicción de canal:** **INCOHERENTE — falta en uno de los tres lugares exigidos.** RV04 §4/§7 y BLUEPRINT §12 la documentan de forma coherente (mismos valores, misma equivalencia 3 días=72h). Pero **`docs/LAGUNAS.md` no contiene esta discrepancia en ninguna fila** de sus secciones 2.1/2.2 (Booking.com), pese a que la matriz sí tiene secciones dedicadas a Booking.com y a que el criterio de reverificación la exige explícitamente ahí. Esto es un hallazgo real y accionable.

**D) B-005 referenciado desde D-023:** COHERENTE. D-023 cita correctamente B-003 (España), B-004 (CDMX) y B-005 (fiscal México), cada uno con el tema correcto.

**E) Airbnb ~3h con matiz de confianza:** **PARCIALMENTE COHERENTE.** El matiz "confianza baja/media (RV03 S1)" está aplicado sin excepción en los 4 documentos normativos (BLUEPRINT, DECISIONES, REQUISITOS, ACEPTACION). Pero está ausente en la mayoría de los módulos de investigación que citan la misma cifra, **incluyendo el propio RV03-R-01** (el requisito que nace directamente del supuesto S1 matizado en el mismo documento), y en `docs/LAGUNAS.md`, `00-INDICE.md`, RV07, RV08, RV09, RV13, RV17, RV21. Riesgo práctico moderado porque el material operativo (BLUEPRINT y derivados) sí está bien matizado, pero incumple la exigencia de "en TODAS sus apariciones".

---

## 3. Búsqueda de regresiones

**No se encontraron regresiones reales.** Se corrieron 7 greps sobre todo `docs/` cubriendo: "tiempo real"/"real-time", "cero overbooking", "instantáneo", integración directa con Booking presentada como disponible, webhooks de Airbnb asumidos, TAM/SAM/SOM sin matiz, y texto de asesoría legal/fiscal sin salvedad. De ~180 resultados brutos revisados, todos caen en usos correctos: negaciones explícitas de la capacidad, requisitos que prohíben ese lenguaje en el producto, citas de marketing de competidores marcadas `[R]`/confianza baja, citas de capacidades de los propios canales (no promesas de Atiende), la integración directa con Booking consistentemente descrita como pausada, webhooks de Airbnb consistentemente tratados como NO CONFIRMADOS (única excepción cosmética: un valor de ejemplo `'webhook_airbnb'` en un comentario SQL de RV17, ilustrativo, no una afirmación en prosa — se recomienda renombrarlo a algo como `'poll_airbnb'` para evitar cualquier lectura ambigua), y TAM/SAM/SOM/legal-fiscal consistentemente matizados o marcados PENDIENTE.

---

## 4. Barra de calidad revisada (21 módulos × 6 criterios)

Criterios: C1=etiquetas `[DATO]/[R]/[E]` sustanciales · C2=sección "Fuentes de este módulo" con fecha · C3=tabla/sección de Supuestos explícita · C4=lagunas enlazadas a `docs/LAGUNAS.md` · C5=formato `RVxx-R-nn` consistente · C6=≥25 URLs o declarado explícitamente si no.

| Mód. | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|
| RV01 | FALLA | PASA | PASA | **FALLA** | PASA | **FALLA** |
| RV02 | PASA | PASA | PASA | PASA | PASA | PASA |
| RV03 | FALLA | PASA | PASA | PASA | PASA | **FALLA** |
| RV04 | FALLA | PASA | PASA | PASA | PASA | **FALLA** |
| RV05 | FALLA | PASA | PASA | PASA | PASA | **FALLA** |
| RV06 | PASA | PASA | PASA | PASA | PASA | DECLARADO |
| RV07 | FALLA | PASA | PASA | PASA | PASA | **FALLA** |
| RV08 | PASA | PASA | PASA | PASA | PASA | DECLARADO |
| RV09 | PASA | PASA | PASA | PASA | PASA | DECLARADO |
| RV10 | PASA | PASA | PASA | **FALLA** | PASA | DECLARADO |
| RV11 | PASA | PASA | PASA | PASA | PASA | DECLARADO |
| RV12 | FALLA | PASA | PASA | **FALLA** | PASA | DECLARADO |
| RV13 | PASA | PASA | PASA | **FALLA** | PASA | DECLARADO |
| RV14 | PASA | PASA | PASA | **FALLA** | PASA | DECLARADO |
| RV15 | PASA | PASA | PASA | PASA | PASA | DECLARADO |
| RV16 | PASA | PASA | PASA | **FALLA** | PASA | DECLARADO |
| RV17 | PASA | PASA | PASA | PASA | PASA | DECLARADO |
| RV18 | FALLA | PASA | PASA | PASA | PASA | DECLARADO |
| RV19 | PASA (débil) | PASA | PASA | **FALLA** | PASA | **FALLA** |
| RV20 | PASA | PASA | PASA | PASA | PASA | DECLARADO |
| RV21 | FALLA | PASA | PASA | **FALLA** | PASA | DECLARADO |

**Resumen cuantitativo:** C2, C3 y C5 ahora PASAN en 21/21 módulos (mejora real y completa frente al 0/21 de la auditoría original en estos criterios). C1 falla sin declarar en 8 módulos (RV01,03,04,05,07,12,18,21). C4 falla sin declarar en 8 módulos (RV01,10,12,13,14,16,19,21). C6 falla sin declarar en 6 módulos — exactamente los 6 módulos de Corrector A (RV01,03,04,05,07,19), que resolvieron bien sus correcciones sustantivas puntuales pero no aplicaron la misma disciplina de "declarar el déficit de fuentes" que sí aplicó sistemáticamente Corrector B en sus 15 módulos.

**Módulo que más preocupa: RV01.** Es el único con 3/6 criterios en FALLA pura (C1, C4, C6), pese a ser el módulo fundacional de segmentación del que dependen RV09–RV16. Su corrección quedó limitada a añadir la sección de fuentes, sin tocar etiquetado, enlace a LAGUNAS.md ni declarar su déficit de fuentes.

Nota de formato: solo RV03, RV07 y RV20 usan la tabla literal de 5 columnas de Supuestos exigida por `00-PLAN.md` §3.1; los otros 18 tienen una sección "Supuestos" sustantiva en formato de lista — se contó como PASA en sentido amplio (existe y no está vacía), pero es un incumplimiento de forma que persiste.

---

## 5. Conclusión

El patrón que ya detectó la auditoría original se confirma en esta reverificación: **no hay fabricación ni regresión de fondo**, y el equipo de corrección resolvió con evidencia primaria verificable las 5 críticas (salvo el componente formal de C5), las 5 altas y 7 de 8 medias, más las 12 correcciones del blueprint sin romper la regla de oro del producto (nunca cancela reservas automáticamente, nunca contacta huéspedes sin autorización). Lo que persiste es exactamente lo que la auditoría original diagnosticó como el riesgo real: **una pasada de forma/trazabilidad incompleta**, ahora concentrada en un subconjunto más pequeño y localizado (los 6 módulos de Corrector A para C6, un total de 8 módulos para C4, la definición de "anfitrión profesional" sin reconciliar, un registro de bloqueo mal archivado, y dos discrepancias aritméticas menores en el blueprint) — no un problema sistémico de 0/21 como antes.

Veredicto de cierre y condiciones exactas en `CIERRE-FASE1.md` (versión previa a la ronda final; ver §6 abajo para el resultado tras la ronda final).

---

## 6. Ronda final (2026-09-05, tras `docs/auditoria-investigacion-1/correcciones-final.md`)

Se aplicó una ronda final de correcciones dirigida exactamente a las 8 condiciones de cierre listadas en la versión previa de `CIERRE-FASE1.md` §3, más C17/C19/C20/C21 (ya cubiertos por esas mismas 8 condiciones) y la propagación del matiz "Airbnb ~3h: confianza baja/media, latencia externa no controlada". Se verificó cada una abriendo los archivos reales (3 subagentes Sonnet en paralelo, sin confiar en la tabla de `correcciones-final.md`), y se repitió el grep completo de regresiones sobre todo `docs/`.

| Condición | Veredicto | Evidencia |
|---|---|---|
| 1 (=C17) — reconciliar "anfitrión profesional" RV01 vs RV15 | **VERIFICADA** | Notas cruzadas coherentes en RV01 (línea 33) y RV15 §5.1 (línea 98): RV01=perfil de producto (10-200 u.), RV15=piso de mercado dirigible (2+ u.); vacío 4-9 unidades declarado explícitamente en ambos; ambas enlazan a la misma fila real de `docs/LAGUNAS.md` línea 193. |
| 2 — fila RtB en `docs/LAGUNAS.md` §2.1 | **VERIFICADA** | Fila "Umbral de anticipación de Request-to-Book (RtB)" (línea 86), estado LAGUNA HONESTA, cita "al menos tres días" [F04] vs "más de 48 horas" [F13], remite a RV04 §4/§7 y BLUEPRINT §12; valores consistentes en los tres documentos. |
| 3 — declarar déficit <25 URLs en RV01/03/04/05/07/19 | **VERIFICADA** | Los 6 módulos tienen ahora un ítem explícito en su sección de Lagunas con conteo aproximado (9 a 22 URLs) y causa concreta del bloqueo (403/429, cuota de WebSearch, priorización de fuentes nivel-1 sobre volumen). |
| 4 — RV01: enlaces a LAGUNAS.md + etiquetado | **VERIFICADA (alcance literal, con observación)** | 3 enlaces nuevos a la fila real de `docs/LAGUNAS.md` línea 193 (antes 0). Las dos cifras pedidas ("10 cohosts", "3 niveles") quedaron etiquetadas `[DATO]`. Observación no bloqueante: el etiquetado total de RV01 pasó de 4 a solo 6 apariciones — resuelve lo pedido puntualmente, pero el criterio C1 de barra de calidad ("etiquetado sustancial") probablemente sigue en FALLA para este módulo en términos absolutos frente a los demás 20. |
| 5 — enlaces a LAGUNAS.md en RV10/12/13/14/16/19/21 | **VERIFICADA (imprecisión menor no bloqueante)** | Los 7 módulos enlazan ahora a filas reales y temáticamente coherentes de `docs/LAGUNAS.md` (confirmado cruzando 3+ de ellas). Único defecto: RV14 (línea 97) cita "sección 5" para la fila de agregadores/iCal genérico, que en realidad está en la sección 4.2 de LAGUNAS.md — el contenido referenciado es correcto, solo el número de sección está mal. |
| 6 (=C19) — B-002 reubicado desde B-004, método corregido a `curl` | **VERIFICADA** | Bloque "Intento 2" ahora bajo B-002 en `docs/BLOQUEOS.md`, con nota explícita de reubicación; método corregido a "curl directo contra las APIs públicas de archive.org — no WebFetch", consistente con `docs/fuentes/b002-archivo.md`. |
| 7 (=C21) — rate limits de Booking movidos de RV21 a RV04 | **VERIFICADA** | RV04 §7 (líneas 32/72/109) ahora tiene los valores discretos correctos (700/min y 75/min, con nota de que no se confirmó el nivel intermedio 200 ni un rango continuo); RV21 §2.3/§9 quedó solo con referencia cruzada, sin duplicar la corrección. |
| 8 — "149 MUST"→148; REQ-091 "liberado"→"cancelado" | **VERIFICADA** | Confirmado por grep independiente: 148 MUST + 28 SHOULD + 4 COULD = 180 (coincide con la tabla corregida de REQUISITOS.md). REQ-091 ya cita "cancelado", que sí es un valor real del enum `estado` en `docs/BLUEPRINT.md` §3.2. DECISIONES.md también actualizado de forma coherente. |
| C20 — vocabulario "capa" RV07×RV17 | **VERIFICADA** | Notas de vocabulario cruzadas y mutuamente consistentes en RV17 §2.3 (línea 208) y RV07 §7 (línea 86): reconocen explícitamente que "capa"/"tipo"/"capas de precedencia" son nombres distintos para conceptos relacionados pero no idénticos, con comportamiento coherente entre todos. |
| Propagación matiz "Airbnb ~3h" | **INCOMPLETA (parcial, no bloqueante)** | Completa en 6/9 ubicaciones pedidas (00-INDICE.md, LAGUNAS.md §1.2, RV03-R-01, RV13, RV17, RV21). Incompleta en RV07, RV08 y RV09: el matiz se añadió solo en una sección de cada archivo (resumen o riesgos), dejando 3 apariciones sin matiz en cada uno de esos tres módulos de investigación. No afecta a los 4 documentos normativos (BLUEPRINT/DECISIONES/REQUISITOS/ACEPTACION), que ya llevaban el matiz completo desde la ronda anterior — el riesgo práctico es bajo porque el material operativo está bien matizado; el residual está solo en material de investigación de referencia. |

**Regresiones (segunda pasada, ronda final):** se repitieron los 7 greps sobre todo `docs/`, con atención especial a los archivos tocados por la ronda final (RV01, RV03, RV04, RV05, RV07, RV10, RV12, RV13, RV14, RV16, RV17, RV19, RV21, LAGUNAS.md, BLOQUEOS.md, REQUISITOS.md, DECISIONES.md, 00-INDICE.md). **No se encontró ninguna regresión nueva.** Los ~330 resultados brutos revisados caen todos en usos correctos (negaciones explícitas, requisitos que prohíben el lenguaje, citas de canal/competidor marcadas como tales, integración con Booking consistentemente pausada, webhooks de Airbnb consistentemente no confirmados, TAM/SAM/SOM y contenido legal/fiscal consistentemente matizados). Única nota cosmética preexistente (no introducida por esta ronda): el valor de ejemplo `'webhook_airbnb'` en un comentario SQL de RV17 línea 351 — ilustrativo de un enum de columna, no una afirmación en prosa.

**Conclusión de la ronda final:** de las 10 verificaciones (8 condiciones + C20 + propagación de matiz), **9 quedan VERIFICADAS** (una con una observación menor no bloqueante sobre profundidad de etiquetado en RV01, y otra con una imprecisión de numeración de sección en RV14) y **1 queda INCOMPLETA de forma parcial y no bloqueante** (propagación del matiz Airbnb ~3h en 3 módulos de investigación). Cero regresiones. Ninguno de los residuales afecta afirmaciones críticas, cifras de negocio, ni la regla de oro del producto. Veredicto definitivo en `CIERRE-FASE1.md`.
