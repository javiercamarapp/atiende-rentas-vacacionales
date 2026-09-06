# Correcciones finales — cierre de Fase 1

**Corrector:** Sonnet, ronda final de cierre.
**Fecha:** 2026-09-05.
**Alcance:** las 8 condiciones exactas de `CIERRE-FASE1.md` §3, más C17/C19/C20/C21 y la propagación del matiz "Airbnb ~3h: confianza baja/media, latencia externa no controlada" señalada por `REVERIFICACION.md`. Sin reescrituras amplias ni hallazgos nuevos inventados.

| # | Condición | Archivo/sección | Cambio | Estado |
|---|---|---|---|---|
| 1 (C17) | Reconciliar "anfitrión profesional" RV01 vs RV15 | RV01 (Perfiles, Supuestos); RV15 §5.1 | Notas cruzadas: RV01 (10-200 u.) = perfil de producto, RV15 (2+ u.) = piso de mercado dirigible; vacío 4-9 unidades declarado explícitamente en ambos, sin fuente oficial | RESUELTA |
| 2 | Fila RtB "3 días" vs "48h" en LAGUNAS.md | `docs/LAGUNAS.md` §2.1 | Fila nueva "Umbral de anticipación de Request-to-Book (RtB)", LAGUNA HONESTA, referencia RV04 §4/§7 y BLUEPRINT §12 | RESUELTA |
| 3 | Declarar déficit <25 URLs | RV01, RV03, RV04, RV05, RV07, RV19 — sección Lagunas | Ítem añadido con conteo aproximado y causa del bloqueo en cada módulo | RESUELTA |
| 4 | RV01: enlaces a LAGUNAS.md + etiquetado | RV01 (d), Riesgos, Lagunas | Tags `[DATO]` añadidos a cifras clave (10 cohosts, 3 niveles); enlaces a filas concretas de `docs/LAGUNAS.md` §6 | RESUELTA |
| 5 | RV10,12,13,14,16,19,21: enlaces a LAGUNAS.md | Sección Lagunas de cada módulo | Enlaces a filas concretas existentes (comisiones, tarifas/mensajes, roles, agregadores, fiscal/legal) | RESUELTA |
| 6 | B-002 mal archivado bajo B-004 | `docs/BLOQUEOS.md` | Bloque "Intento 2" reubicado a B-002; método corregido a `curl` contra APIs de archive.org (no WebFetch) | RESUELTA |
| 7 | Rate limits Booking movidos de RV21 a RV04 | RV04 §7 y líneas 32/72/109; RV21 §2.3/§9 | Corrección (valores discretos 700/75, catálogo no confirmado) aplicada en RV04; RV21 dejado solo con referencia cruzada | RESUELTA |
| 8 | "149 MUST"→148; REQ-091 "liberado" | `docs/REQUISITOS.md` (resumen, REQ-091); `docs/DECISIONES.md` | Conteo corregido a 148 MUST/28 SHOULD/4 COULD (=180); REQ-091 usa "cancelado" (enum real de BLUEPRINT §3.2) | RESUELTA |
| C19 | (= condición 6) | — | — | RESUELTA (ver fila 6) |
| C20 | Vocabulario "capa" RV07×RV17 no mapeado | RV17 §2.3; RV07 §7 | Notas de vocabulario cruzadas (no bloqueantes): mismo comportamiento, tres nombres distintos | RESUELTA |
| C21 | (= condición 7) | — | — | RESUELTA (ver fila 7) |
| — | Propagación matiz "Airbnb ~3h" | `00-INDICE.md`, `LAGUNAS.md` §1.2, RV03-R-01, RV07, RV08, RV09, RV13, RV17, RV21 | Matiz de confianza baja/media (RV03 S1) y "latencia externa no controlada" añadido en cada aparición sin matiz | RESUELTA |

Ninguna condición quedó pendiente. No se reescribió contenido fuera del alcance de las condiciones listadas.
