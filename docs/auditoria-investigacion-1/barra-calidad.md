# Cumplimiento de la barra de calidad (00-PLAN.md §1) — Auditoría independiente Fase 1

Auditor: Sonnet (independiente). Fecha: 2026-09-05. Evaluación de los 21 módulos contra los 8 criterios de `docs/investigacion/00-PLAN.md` §1 y la plantilla §3.

## Hallazgo transversal previo (léase antes de la tabla)

Los 21 módulos comparten un **mismo patrón sistémico**, verificado por grep literal en cada archivo (no por muestreo):

- **Ninguno de los 21 usa las etiquetas `[DATO]/[R]/[E]`** de forma sistemática. 19 módulos tienen **0 apariciones literales**; RV20 usa 9 (parcial); RV19/RV06 citan entre comillas pero sin la etiqueta de confianza. En su lugar, cada módulo usa un sistema de citación propio y distinto entre sí (`[Fuente, art. NNN]`, `F01…F22`, `L-RVxx-nn`, `RVxx-F-nn`, `A1…D18`), todos apuntando a ledgers externos en `docs/fuentes/*.md` que no forman parte del archivo auditado.
- **Ninguno tiene sección "Fuentes consultadas" (N+4) dentro del propio módulo** con URLs agrupadas por subtema — el conteo de URLs *dentro del archivo* va de 0 a 24, casi siempre 0, muy por debajo del mínimo de 25.
- **Ninguno usa la numeración de plantilla `0./1..N/N+1/N+2/N+3/N+4`.** Todos usan una estructura ad-hoc común: Resumen ejecutivo (prosa, no lista numerada) → Cuerpo → Riesgos/límites (sección no prevista) → Implicaciones (lista plana `RVxx-R-nn`, sin subsecciones) → Lagunas → Supuestos — **con Lagunas y Supuestos en orden invertido** respecto a lo exigido.
- **Ninguno tiene "Nota metodológica" como sección con ese título**, ni cabecera completa (Proyecto/Caso ancla/Fecha del informe/Autor/Informes relacionados), ni la línea de cierre "Fin del informe RVnn...".
- **Ninguno tiene la tabla de supuestos en el formato de 5 columnas de §3.1**, ni la tabla de lagunas de 4 columnas de §3.2 (excepciones parciales: RV03 y RV20).
- **Ninguno tiene las subsecciones N+1.1/N+1.2/N+1.3** en Implicaciones, ni una tabla riesgo·probabilidad·impacto·mitigación (0 apariciones de "probabilidad" en los 21 archivos).

**Conclusión de forma:** los 21 módulos fueron escritos contra una plantilla distinta a la vigente en `00-PLAN.md`, no por fallos aislados de un autor. El contenido de investigación subyacente en varios módulos (RV06 con el RFC 5545, RV18/RV21 en la regla de oro anti-cancelación, RV19 con textos legales primarios, RV20 con OpenTelemetry) es sustancialmente sólido — el problema dominante es de **forma/trazabilidad exigida por el plan**, no de ausencia de investigación real.

**Hallazgo positivo no anticipado:** los 21 módulos SÍ tienen requisitos numerados en formato `RVxx-R-nn` (rango: 5 en RV15 a 15 en RV19), consistentes y bien formados. Es el único requisito del encargo que el corpus cumple de manera universal. Sin embargo, esos bloques son listas planas, nunca integradas en las 3 subsecciones que exige la plantilla (criterio 7 falla en los 21 sin excepción).

**Segundo hallazgo transversal:** el mandato explícito de `00-PLAN.md` de que RV07, RV17 y RV20 "deben consumir directamente `docs/LAGUNAS.md`" solo se cumple en **uno de los tres (RV20)**. RV07 y RV17 tienen **0 menciones literales** de esa matriz pese a la instrucción explícita, y pese a que ambos generan hallazgos que deberían cerrar filas concretas de ella.

---

## Tabla módulo × criterio

Criterios: **C1** secciones/orden · **C2** resumen 8-10 hallazgos+etiqueta · **C3** ≥25 URLs/≥6 categorías/60% nivel 1-2 (≥3 nivel-1 estrictas en RV17/RV19) · **C4** etiqueta inline · **C5** tabla de supuestos completa · **C6** lagunas + referencia a LAGUNAS.md · **C7** implicaciones con subsecciones N+1.1-3 · **C8** nota metodológica.

| Mód. | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | RVxx-R-nn |
|---|---|---|---|---|---|---|---|---|---|
| RV01 | FALLA | FALLA (3 párrafos, 0 etiq.) | FALLA (9 URL, 0 cat.) | FALLA | PARCIAL (lista, no tabla 5-col) | PARCIAL (sin cita a LAGUNAS.md) | FALLA | PARCIAL | SÍ (10) |
| RV02 | FALLA | FALLA (5 párrafos) | FALLA (~24 URL, 0 cat.) | FALLA | PARCIAL (lista) | PARCIAL | FALLA | PARCIAL | SÍ (10) |
| RV03 | FALLA | FALLA (4 párrafos) | FALLA (0 URL, solo códigos F) | FALLA | PARCIAL (tabla real, cols. distintas) | PARCIAL | FALLA | FALLA (casi ausente) | SÍ (10) |
| RV04 | FALLA | FALLA (5 párrafos) | FALLA (~3 URL) | FALLA | PARCIAL (lista) | PARCIAL | FALLA | PARCIAL | SÍ (8) |
| RV05 | FALLA | FALLA (0 hallazgos) | FALLA (0 URL) | FALLA | PARCIAL (2 bullets) | PARCIAL | FALLA | PARCIAL | SÍ (6) |
| RV06 | FALLA | FALLA | FALLA (0 URL) | FALLA | PARCIAL (mejor alineado) | PARCIAL | FALLA | PARCIAL | SÍ (8) |
| RV07 | FALLA | FALLA | FALLA (0 URL) | FALLA | **FALLA grave** (2 estimaciones huérfanas) | **FALLA grave** (0 refs a LAGUNAS.md pese a mandato explícito) | FALLA (sin eje webhook) | PARCIAL | SÍ (9) |
| RV08 | FALLA | FALLA | FALLA (0 URL) | FALLA | PARCIAL | PARCIAL | FALLA | PARCIAL | SÍ (6) |
| RV09 | FALLA | FALLA (4 párrafos) | FALLA (0 URL) | FALLA | FALLA (no existe tabla) | PARCIAL | FALLA | PARCIAL | SÍ (12) |
| RV10 | FALLA | FALLA (4 párrafos) | FALLA (18 URL, sin sección) | FALLA | FALLA | PARCIAL | FALLA | PARCIAL | SÍ (12) |
| RV11 | FALLA | FALLA (4 párrafos) | FALLA (0 URL, ledger externo) | FALLA | FALLA | PARCIAL | FALLA | PARCIAL | SÍ (10) |
| RV12 | FALLA | PARCIAL/FALLA (5 hallazgos, &lt;8) | FALLA (3 URL mal formateadas) | FALLA | FALLA | FALLA | FALLA | PARCIAL (mejor de 4) | SÍ (10) |
| RV13 | FALLA | FALLA (5 párrafos) | FALLA (12 URL, ~4 cat.) | FALLA | FALLA (formato) | FALLA | FALLA | PARCIAL | SÍ (8) |
| RV14 | FALLA | FALLA | **FALLA severa** (0 URL) | FALLA | FALLA (formato) | FALLA | FALLA | FALLA | SÍ (6) |
| RV15 | FALLA | FALLA (5 párrafos) | FALLA (0 URL) | **FALLA grave** (cadena TAM/SAM/SOM sin `[E]`) | **FALLA crítica** | FALLA | FALLA | FALLA | SÍ (5) |
| RV16 | PARCIAL (mejor de 21, aún falla) | FALLA (3-4 párrafos) | FALLA (0 URL) | **FALLA grave** (costos/margen sin `[E]`) | FALLA (formato, mejor trazabilidad) | FALLA | FALLA | PARCIAL | SÍ (7) |
| RV17 | FALLA | FALLA | **FALLA grave** (6 URL, 2 dominios, 0 nivel-1 estrictas) | FALLA (0 tags en 857 líneas) | FALLA (lista) | **FALLA** (0 refs pese a ser módulo responsable) | FALLA (sin tabla riesgo ni MVP) | FALLA | SÍ (11) |
| RV18 | FALLA | FALLA (2 párrafos) | FALLA (0 URL en módulo, 6 en ledger) | FALLA | PARCIAL/FALLA (lista) | FALLA | FALLA | FALLA | SÍ (10) |
| RV19 | FALLA | FALLA (2 párrafos) | **PARCIAL** (0 URL en módulo, pero 39 en ledger con 9 nivel-1 estrictas — sustancia fuerte, mal ubicada) | FALLA | PARCIAL/FALLA | FALLA | FALLA | FALLA | SÍ (15) |
| RV20 | FALLA | **FALLA grave** (sección no existe) | FALLA (6 URL, 1 cat.) | PARCIAL (9 usos reales, minoritario) | PARCIAL (tabla real correcta) | **PASA** (único genuino, cita `LAGUNAS.md:171`) | FALLA | **PASA** (único completo) | SÍ (13) |
| RV21 | FALLA | FALLA | FALLA (17 URL, 3 cat.) | FALLA | PARCIAL/FALLA | FALLA (pese a solapar con LAGUNAS.md) | FALLA | FALLA | SÍ (8) |

---

## Detalle de fallas más graves por módulo (con línea aproximada)

- **RV07** ("corazón del producto"): 0 menciones literales de "LAGUNAS" en todo el archivo pese al mandato explícito de `00-PLAN.md`. Dos estimaciones de arquitectura usadas de facto como `[E]` sin aparecer en la tabla de Supuestos: umbral de alerta de edad de sync (L64) y frecuencia de reconciliación completa (L131), ambas admitidas como "decisión de producto, no un hecho de ninguna fuente citada". **0 menciones de "webhook"** en todo el documento — cubre solo el eje iCal/polling e ignora el eje API/webhook pese a que LAGUNAS.md se lo asigna como responsable en las filas 1.1/2.1/3.1/4.1. No menciona backoff en absoluto.
- **RV17** (arquitectura/datos, con exigencia reforzada de ≥3 fuentes nivel-1): solo 6 URLs reales en 2 dominios (postgresql.org, microservices.io) — 0 fuentes de nivel-1 estrictas (API oficial de canal/RFC/ley) pese al requisito explícito del plan. La ruta del ledger que el propio documento cita (L5) **no existe** (la ruta real es `docs/fuentes/rv17-18-20.md`). 0 etiquetas `[DATO]/[R]/[E]` en 857 líneas muestreadas. 0 menciones de `docs/LAGUNAS.md` pese a ser módulo responsable designado.
- **RV15**: la cadena completa de TAM/SAM/SOM (L89-96: "15%-35%", "$150-$600/año", "1%-5%" → "51.150-119.350 unidades", "$7,7M-$71,6M USD/año") son estimaciones `[E]` por definición del propio texto pero **ninguna lleva la etiqueta `[E]`**, rompiendo la verificabilidad mecánica del criterio 5. Cifras de alto impacto sin etiqueta pese a sonar a fuente primaria: "5 millones de hosts... 2.500 millones de llegadas" (L10), "341.001 viviendas turísticas" (L14).
- **RV14**: caso más severo de C3 — **0 URLs en todo el archivo**, toda evidencia remite a "ver ledger". Discrepancia interna sin resolver: "30.000" vs "55.000+" respuestas IA de Hospitable (L45).
- **RV12**: solo 3 URLs en todo el documento (L118-120, todas sat.gob.mx) y **mal formateadas** (comilla invertida pegada al final que rompería el enlace). Cifras de negocio sensibles sin etiqueta: "14-16%, 16% en México" (L20), "hasta 45 días" retraso antifraude (L83).
- **RV20**: único módulo que **cumple genuinamente C6** (cita textual `docs/LAGUNAS.md:171` dos veces) y C8 (nota metodológica real: cuota WebSearch agotada 200/200, 2 URLs con 404, cómo se compensó). Pero **no tiene sección de Resumen ejecutivo en absoluto** — falla más grave que en cualquier otro módulo para C2.
- **RV19**: caso particular — el módulo en sí tiene 0 URLs, pero su ledger de respaldo (`docs/fuentes/rv19-21.md`) contiene 39 URLs y 9 fuentes nivel-1 estrictas genuinas (LFPDPPP, Reglamento LFPDPPP, LISR Art.113, LIVA Art.18-J, Ley General de Turismo, RGPD/EUR-Lex, RD 933/2021/BOE, Reglamento UE 2024/1028) — muy por encima del mínimo de 3 exigido específicamente para RV19. El problema es exclusivamente de ubicación: esas fuentes nunca se materializan dentro del archivo.
- **RV02**: renuncia explícita a tener sección de fuentes (L3: "el ledger se entrega en el mensaje de respuesta del investigador, no en un archivo separado").
- **RV11**: cita explícitamente "el detalle completo está en la lista de ledger entregada en la respuesta final del investigador" (L3) — un artefacto ni siquiera incluido en el repo. Cifra de marketing de vendor sin marca `[R]`: "30% cost savings" de Breezeway (L44).

---

## Resumen final

**Módulos que pasan los 8 criterios completos: 0 de 21.** Ningún informe alcanza hoy el estado "completo" según `00-PLAN.md` §1.

**Módulos con al menos 1 falla crítica (criterios 3, 4 o 5 — los más críticos para credibilidad de datos): 21 de 21, sin excepción.**
- Criterio 4 (etiqueta inline `[DATO]/[R]/[E]`): FALLA total (0 apariciones) en 19 de 21 módulos; uso parcial/minoritario solo en RV20 (9 casos) — ninguno lo cumple plenamente.
- Criterio 3 (≥25 URLs/≥6 categorías/60% nivel 1-2): falla en los 21 medido dentro del propio archivo del módulo (rango real: 0-24 URLs inline). RV19 es la única atenuante real por sustancia (su ledger sí satisface el criterio con holgura), solo que mal ubicada.
- Criterio 5 (tabla de supuestos): dos fallas especialmente graves — RV07 (2 estimaciones de arquitectura usadas en diseño de anti-overbooking sin aparecer en Supuestos) y RV15 (cadena TAM/SAM/SOM completa sin una sola marca `[E]`).

**Conclusión práctica:** el problema dominante no es la fabricación de datos (ver `verificacion-afirmaciones.md`: 44/62 afirmaciones CONFIRMADA plenamente) sino un **incumplimiento sistemático de forma y trazabilidad mecánica** exigido por `00-PLAN.md`. Esto es corregible con una pasada de reformateo dirigida (añadir etiquetas inline, mover ledgers de fuentes a sección N+4 dentro de cada módulo, actualizar `docs/LAGUNAS.md` con las filas que la evidencia real ya cierra, añadir subsecciones N+1.1-3) sin necesidad de rehacer la investigación de fondo — excepto en RV07 y RV17, que además de la forma tienen vacíos sustantivos de cobertura (ver `matriz-canal.md`).
