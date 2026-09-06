# Correcciones aplicadas — Corrector B (RV02, RV06, RV08–RV18, RV20, RV21)

Fecha: 2026-09-05. Todas las correcciones se verificaron contra fuente primaria releída en vivo (WebFetch, mismo día) o se delimitaron explícitamente como laguna; ninguna cifra se inventó.

| Corrección | Archivo/sección | Qué cambió | Evidencia | Estado |
|---|---|---|---|---|
| C4 — cita Hospitable no reproducible | RV14 tabla de fichas, "Análisis de diferenciación", RV14-R-01 | Cita "you approve"/"fully automated" eliminada; sustituida por texto verbatim re-leído hoy (Essentials/Host/Professional/Mogul, hospitable.com/pricing/); RV14-R-01 reformulado sin depender de ella | WebFetch propio 2026-09-05 confirma ausencia de ambas frases; doble re-verificación (auditor + este corrector) | RESUELTA |
| Alta — RV17 sin fuentes nivel-1 | RV17 §0, §7, §13, Fuentes de este módulo | Ruta de ledger corregida (`docs/fuentes/rv17-18-20.md`); 3 fuentes nuevas releídas (SKIP LOCKED, advisory locks, ON CONFLICT); 12 citas etiquetadas `[DATO]`; aclaración de criterio nivel-1 vs. 00-PLAN §2.1 | RV17-F-10/11/12 en ledger, WebFetch en vivo | RESUELTA (9 URLs externas nivel-1; declarado bajo el mínimo de 25 con causa) |
| Alta — TripAdvisor/Holidu/LATAM sin investigar | RV14, RV08, RV15 | Holidu investigado con éxito (holidu.com/host/partners, cita real); TripAdvisor Rentals: 3 intentos 403 hoy, declarado laguna explícita; Rentalia bloqueado; DATATUR confirma laguna estructural México | WebFetch en vivo 2026-09-05 (todas las URLs) | DELIMITADA COMO LAGUNA (Holidu cerrado; TripAdvisor/LatAm siguen bloqueados, sin TAM inventado) |
| C12 — RV15 TAM/SAM/SOM sin `[E]`, CDMX sobre-confiado | RV15 §5, §4 | Cadena completa etiquetada `[E]`/`[DATO]`/`[R]`; párrafo de advertencia reforzada citando RV19/B-004 añadido | Verificado contra B-004 real | RESUELTA |
| C13 — RV12 tono resumen vs. riesgos | RV12 resumen ejecutivo | Punto 2 remite al matiz de vigencia/alcance de R3 | — | RESUELTA |
| C14 — RV16 catálogo IA desactualizado | RV16 §3b | Advertencia reforzada (subestimación 2–8x), precios re-etiquetados `[R]` | platform.openai.com/docs/pricing | RESUELTA |
| C15 — RV12×RV18 roles no reconciliados | RV12, RV18 | Nota de reconciliación cruzada en ambos, sin unificar unilateralmente | contradicciones.md #7 | DELIMITADA COMO LAGUNA (pendiente decisión de producto) |
| C16 — RV21 UID/SEQUENCE sin hash | RV21 casos 1, 3, 13; RV21-R-01/02 | Exige verificación por hash de contenido junto a UID/SEQUENCE/DTSTAMP | contradicciones.md #6 | RESUELTA |
| C18 — RV12×RV16 comisión host-only sin integrar | RV16 nueva §1.1 | Trade-off de comisión incorporado a pricing/propuesta de valor | contradicciones.md #12 | RESUELTA |
| C21 (parcial) — rate limits Booking en RV21 | RV21 | RV21 no citaba "75-700/min" literal; se precisó con los dos valores reales del ledger (700, 75) sin inventar el nivel 200 no verificado ahí | — | RESUELTA |
| Properly nunca investigado | RV11 Lagunas | Declarado explícitamente como vacío no cerrado (intento sin acceso en esta pasada), no silencio | matriz-canal.md | DELIMITADA COMO LAGUNA |
| Trazabilidad mínima (C5) | los 15 módulos de mi ámbito | Etiquetas `[DATO]`/`[R]`/`[E]` añadidas; sección "## Fuentes de este módulo" añadida al final de cada archivo con URLs y fecha 2026-09-05; módulos bajo 25 URLs lo declaran explícitamente en Lagunas (ninguno se infló) | ver cada archivo | RESUELTA (formato); volumen de fuentes sigue bajo el mínimo del plan en varios módulos, declarado |
| Regla de oro (no cancelar/no contactar sin autorización) | RV02, RV10, RV18 | Redacciones ambiguas corregidas para dejar la aprobación humana como único camino, nunca automatismo | 00-PLAN §1.1 | RESUELTA |

**No resuelto / limitación reconocida:** el volumen de fuentes por módulo sigue por debajo de las ≥25 URLs de `00-PLAN.md` §1.3 en la mayoría de mis 15 módulos (declarado explícitamente en cada uno, no relleno); TripAdvisor Rentals y agregadores LatAm/España distintos de Holidu siguen inaccesibles (403 confirmado hoy en 3+ intentos independientes) — requieren acceso autenticado o reintento futuro, no investigación adicional posible con las herramientas de esta sesión.

Verificación de integridad: sin marcadores de conflicto en `docs/LAGUNAS.md` ni en los archivos editados; las 15 secciones "Fuentes de este módulo" están presentes una sola vez cada una.
