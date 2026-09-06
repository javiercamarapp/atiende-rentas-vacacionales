# Auditoría independiente de la investigación Fase 1 — Resumen ejecutivo

**Proyecto:** Atiende Rentas Vacacionales — calendario unificado multi-canal (Airbnb/Booking.com/Vrbo/otros) que **cierra disponibilidad entre canales** sin cancelar reservas ni contactar huéspedes sin autorización.
**Auditor:** Sonnet, independiente (no participó en la investigación de Fase 1).
**Fecha de auditoría:** 2026-09-05.
**Alcance:** los 21 módulos RV01–RV21, `docs/investigacion/00-PLAN.md`, los 10 ledgers de `docs/fuentes/`, `docs/LAGUNAS.md`, `docs/BLOQUEOS.md`. Metodología: 8 subagentes Sonnet en paralelo — 5 de verificación de afirmaciones (re-fetch en vivo de URLs primarias, 2026-09-05), 1 de contradicciones cruzadas (lectura completa de los 21 módulos), 1 de cumplimiento de barra de calidad, 1 de cobertura de la matriz canal×método.
**Documentos de detalle:** `verificacion-afirmaciones.md` (62 afirmaciones verificadas), `contradicciones.md` (12 contradicciones documentadas), `barra-calidad.md` (tabla módulo×criterio), `matriz-canal.md` (cobertura de ~88 celdas).

---

## Veredicto global

**La investigación NO está lista para pasar a blueprint tal como está, pero el problema dominante es de forma/trazabilidad y de un puñado de hallazgos puntuales de alto impacto — no de fabricación masiva de datos.**

Evidencia que sostiene este veredicto:

- **Disciplina factual real y verificable:** de 62 afirmaciones de alto impacto re-verificadas contra la fuente primaria en vivo (10-K de Airbnb/Booking, RFC 5545/5546, textos legales UE/España/México, precios de IA, permisos de cohost, políticas de cancelación, documentación de Booking.com Connectivity), **44 se confirmaron plenamente, 7 con matiz menor, y solo 2 resultaron no confirmadas** tras verificación adversarial. Los módulos abstienen sistemáticamente cifras sin fuente (comisión de Booking.com/Vrbo, costo de certificación, integraciones contables) en vez de inventarlas — el patrón dominante en toda la matriz canal×método es **"laguna honestamente declarada"**, no relleno.
- **Pero el cumplimiento formal es 0/21:** ningún módulo satisface los 8 criterios de la barra de calidad de `00-PLAN.md`. Los 21 fallan los tres criterios más críticos para credibilidad de datos (mínimo de fuentes con sección dedicada, etiqueta inline `[DATO]/[R]/[E]`, tabla de supuestos completa), y fueron escritos contra una plantilla distinta a la vigente en el plan. `docs/LAGUNAS.md` — la matriz de seguimiento central del encargo — nunca se actualizó pese a que la evidencia para cerrar ~29 de sus ~88 celdas ya existe dispersa en los módulos.
- **Hay 2 hallazgos de seguridad/producto que sí son bloqueantes de fondo**, no solo de forma (C1 y C2 abajo), y 2 contradicciones de alto impacto comercial que no deben pasar a materiales de venta/pitch sin resolverse (C3, C4).

**Recomendación:** no rehacer la investigación de fondo. Ejecutar una pasada de corrección dirigida sobre las correcciones C1–C10 (críticas y altas) antes de congelar arquitectura o hacer promesas de producto/comerciales basadas en estos módulos; las correcciones C11–C21 (medias/bajas) pueden resolverse en paralelo al blueprint sin bloquearlo.

---

## Verificación de afirmaciones — resumen cuantitativo

| Veredicto | Cantidad (de 62) |
|---|---|
| CONFIRMADA | 44 |
| PARCIAL | 7 |
| NO CONFIRMADA | 2 |
| INACCESIBLE | 2 |
| N/A (abstención correcta, sin invención) | 7 |

Detalle completo con URL, cita textual y ubicación exacta en `verificacion-afirmaciones.md`.

---

## Correcciones obligatorias priorizadas

### CRÍTICAS (bloquean blueprint o promesas al cliente hasta resolverse)

**C1 — [RV19 × RV18/RV16] Riesgo de seguridad mal clasificado: prompt injection en mensajería a huéspedes.**
RV19 (módulo de seguridad dedicado) trata el procesamiento de texto libre de huéspedes por LLM como capacidad **hipotética/futura** ("si el producto incorpora esto..."), pero RV18 y RV16 ya diseñan 3 agentes LLM que redactan respuestas a huéspedes como función central de v1. El análisis de mitigación de prompt injection queda marcado como no aplicable cuando, según el propio corpus, ya es bloqueante. **Cambiar:** RV19 §3/§7 debe tratar la mitigación de prompt injection como requisito de seguridad actual, incorporando la arquitectura anti-inyección ya diseñada en RV18 §6. Evidencia: `contradicciones.md` #5.

**C2 — [RV03] Afirmación de privacidad sin respaldo en la fuente citada, repetida 4 veces como hecho.**
"Airbnb no transfiere datos de huésped al importar calendarios externos" se presenta como hecho firme en RV03 (líneas 11, 39, 47, 77, incluida la sección de riesgos), pero tras dos búsquedas dirigidas en la fuente citada (airbnb.com/help/article/99, ambas versiones .com/.co.uk) **no se encontró ninguna mención a datos de huésped/PII/identidad**. Solo la cifra "2 años de datos importados" es verbatim confirmable, y probablemente se refiere a antigüedad de reservas, no a no-transferencia de PII. **Cambiar:** degradar la afirmación a NO CONFIRMADA hasta relectura manual; no usarla en material de privacidad/legal hacia clientes o reguladores. Evidencia: `verificacion-afirmaciones.md` #4.

**C3 — [RV01 × RV03] Contradicción sobre cobertura de España en Airbnb Co-Host Network.**
RV01 L69 afirma que España SÍ está en la lista oficial de países con Co-Host Network (citando el mismo artículo 3472 de Airbnb); RV03 L67, citando la misma fuente, dice explícitamente que **no se confirmó** si España está incluida. Alto impacto comercial directo para el mercado español. **Cambiar:** re-verificar el artículo 3472 con fetch directo antes de cualquier mensaje comercial que asuma cobertura de Co-Host Network en España. Evidencia: `contradicciones.md` #1.

**C4 — [RV14] Cita de diferenciación competitiva central no reproducible en la fuente en vivo.**
El argumento de venta más citado de RV14 (RV14-R-01: aprobación humana no-opcional como diferenciador frente a Hospitable) se apoya en una cita textual de `hospitable.com/pricing/` ("you approve" vs. "fully automated") que la re-verificación adversarial, realizada el mismo día declarado de consulta, **no pudo reproducir** en la página en vivo. Sin captura de pantalla fechada de respaldo. **Cambiar:** bloquear el uso de esta cita en pitch/comparativas de mercado hasta re-verificar con captura de pantalla fechada; si no se reproduce, reformular el diferenciador con evidencia verificable. Evidencia: `verificacion-afirmaciones.md` #40, `contradicciones.md` #3.

**C5 — [Proceso, todos los módulos] Incumplimiento sistemático de trazabilidad mecánica (0/21 módulos pasan la barra de calidad).**
Ningún módulo usa la etiqueta inline `[DATO]/[R]/[E]` de forma sistemática (19/21 con 0 apariciones), ninguno tiene sección de fuentes con ≥25 URLs dentro del propio archivo, y `docs/LAGUNAS.md` nunca fue actualizado pese al mandato explícito de que RV07/RV17/RV20 lo consuman y cierren filas. Esto rompe el mecanismo de verificabilidad en el que se apoya todo el resto de la investigación — sin él, cualquier lector externo no puede distinguir a simple vista un [DATO] de un [E] sin ir módulo por módulo al ledger externo. **Cambiar:** pasada de reformateo obligatoria antes de blueprint — añadir etiquetas inline, mover contenido relevante de ledgers a una sección "Fuentes consultadas" dentro de cada RVnn, y actualizar `docs/LAGUNAS.md` con las ~29 celdas que la evidencia real ya cierra (ver `matriz-canal.md`). Evidencia: `barra-calidad.md`.

### ALTAS

**C6 — [RV04] Contradicción sin resolver: ventana de anticipación de Request-to-Book (3 días vs. 48 horas), ambas de páginas oficiales de Booking.com.** No fijar un número en copy de producto/SLA hasta que Booking.com lo aclare por soporte oficial. Evidencia: `contradicciones.md` #2.

**C7 — [RV07] Módulo "corazón del producto" no consume `docs/LAGUNAS.md` (0 menciones) y no trata el eje webhook/API en absoluto (0 menciones de "webhook"), cubriendo solo la mitad del espacio de diseño de sincronización que el plan le asigna.** Completar el eje API/webhook por canal y sincronizar con LAGUNAS.md antes de que RV07 se use como base de arquitectura de sincronización. Evidencia: `barra-calidad.md`, `matriz-canal.md`.

**C8 — [RV17] Módulo de arquitectura falla la exigencia reforzada de ≥3 fuentes nivel-1 (solo 6 URLs en 2 dominios, 0 de nivel-1 estricta), y la ruta del ledger que cita no existe en el repo.** Corregir la ruta y añadir fuentes primarias (documentación oficial de canal, RFC) que sustenten las decisiones de modelo de datos. Evidencia: `barra-calidad.md`.

**C9 — [Matriz canal×método] UID/SEQUENCE/dedupe y anti-eco no están investigados a nivel API para Airbnb, Vrbo ni "Otros" (solo Booking.com API está bien cubierto); el escenario de "stop-sell propio releído como cambio externo" y el de "3+ feeds cruzados sobre la misma unidad" —ambos pedidos explícitamente por LAGUNAS.md— nunca se investigaron.** Estos son directamente los mecanismos que previenen overbooking silencioso; cerrarlos antes de diseñar el motor de reconciliación. Evidencia: `matriz-canal.md`.

**C10 — [RV05/RV14] TripAdvisor Rentals y agregadores LATAM/España, nombrados explícitamente en el alcance de RV05 (`00-PLAN.md` §5), tienen cobertura cero y el vacío no está señalado en ningún módulo como laguna reconocida.** Investigar o declarar explícitamente como laguna en LAGUNAS.md. Evidencia: `matriz-canal.md`.

### MEDIAS

**C11 — [RV07] Dos estimaciones de arquitectura (umbral de alerta de sync, frecuencia de reconciliación completa) se usan en el diseño anti-overbooking sin aparecer en la tabla de Supuestos, violando el criterio 5 de la barra de calidad.** Añadirlas a la tabla de Supuestos con su lógica explícita. Evidencia: `barra-calidad.md`.

**C12 — [RV15] Toda la cadena de estimación TAM/SAM/SOM carece de etiqueta `[E]` mecánica pese a ser una estimación declarada; y el nivel de detalle sobre la regulación de CDMX es más confiado que lo que RV19/BLOQUEOS B-004 (que declara no poder confirmar ni la existencia misma de la norma) sostiene.** Añadir etiquetas `[E]` y remitir explícitamente a la advertencia más fuerte de RV19/B-004. Evidencia: `verificacion-afirmaciones.md` #47, `contradicciones.md` #11.

**C13 — [RV12] Tono del resumen ejecutivo sobre el mandato "host-only" de Airbnb (14-16%) más categórico que lo que la propia sección de riesgos del módulo admite (incertidumbre de vigencia/alcance).** Alinear el lenguaje del resumen con el matiz de riesgos. Evidencia: `contradicciones.md` #10.

**C14 — [RV16] Catálogo de precios de IA usado para el cálculo de costo por conversación ya está incompleto frente al catálogo actual (faltan ~15 modelos más nuevos y más caros de OpenAI).** Actualizar el cálculo o documentar explícitamente el riesgo de desactualización con mayor peso que el actual. Evidencia: `verificacion-afirmaciones.md` #49.

**C15 — [RV12 × RV18] Dos modelos de roles internos del producto no reconciliados (6 roles en RV12 vs. 4 roles con cohost de 3 niveles en RV18).** Unificar en un solo esquema de roles antes de congelar el modelo de datos en RV17. Evidencia: `contradicciones.md` #7.

**C16 — [RV21 × RV06/RV07] Los criterios de aceptación de RV21 tratan UID/SEQUENCE como "algoritmo normativo confiable" sin el respaldo de hash de contenido que RV06/RV07 exigen explícitamente como obligatorio.** Añadir verificación por hash de contenido a los casos adversariales 1, 3 y 13 de RV21. Evidencia: `contradicciones.md` #6.

**C17 — [RV01 × RV15] Definición de "anfitrión profesional" inconsistente (10-200 unidades vs. 2+ unidades) usada para fines distintos (producto vs. mercado) sin reconciliar.** Fijar una única definición y documentar el vacío 4-9 unidades. Evidencia: `contradicciones.md` #8.

**C18 — [RV12 × RV16] El hallazgo de que Atiende forzaría a sus clientes al esquema de comisión más alto de Airbnb no está incorporado al diseño de pricing/valor de RV16.** Integrar este riesgo en la propuesta de valor. Evidencia: `contradicciones.md` #12.

### BAJAS

**C19 — [BLOQUEOS.md B-002] "Intento 2: copias archivadas vía web.archive.org" se declara completado sin archivo de evidencia trazable, y `web.archive.org` está confirmado bloqueado a nivel de herramienta en este entorno.** Verificar con el usuario si ese intento realmente ocurrió o corregir el registro de BLOQUEOS.md. Evidencia: `verificacion-afirmaciones.md`, bloque 2.

**C20 — [RV07 × RV17] Vocabulario de "capas" de bloqueo de calendario no mapeado entre ambos módulos (4 categorías distintas en cada uno).** Resolver al definir la tabla única `ocupacion_unidad` pendiente en RV17, usando el vocabulario de RV07. Evidencia: `contradicciones.md` #9.

**C21 — Omisiones menores que no invalidan las cifras pero deberían añadirse:** el timeout de 30 min de Booking.com es configurable hasta 24h contactando soporte; `roomstosell` >255 se resetea automáticamente a 254; la fecha de efectos de RD 933/2021 es "2 de enero de 2023" (no "1 de enero", ya resuelto por esta auditoría); Booking.com rate limits "75-700/min" es un resumen de valores discretos (75/100/200/700), falta el nivel intermedio 200. Evidencia: `verificacion-afirmaciones.md`, bloques 2 y 4.

---

## Nota final sobre proceso

Esta auditoría encontró que el equipo de investigación de Fase 1 tiene una disciplina factual notablemente alta cuando se le compara con el patrón típico de "relleno adversarial" que este tipo de ejercicio suele detectar: de 62 afirmaciones de alto impacto, ninguna resultó ser una invención flagrante, y el patrón dominante ante la incertidumbre es declarar la laguna, no rellenarla. El riesgo real para el proyecto no es que la investigación esté fabricada, sino que **el formato de verificabilidad exigido por el propio plan (etiquetas, fuentes, matriz de lagunas sincronizada) no se aplicó**, lo que hace que un tercero (como este auditor, o el equipo de blueprint) tenga que reconstruir la cadena de evidencia desde cero para confiar en cada cifra — exactamente el trabajo que esta auditoría tuvo que hacer. Se recomienda resolver C1–C10 y aplicar la pasada de reformateo de C5 antes de iniciar el blueprint de arquitectura.
