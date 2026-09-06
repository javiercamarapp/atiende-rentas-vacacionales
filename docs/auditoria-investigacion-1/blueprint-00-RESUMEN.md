# Auditoría independiente del blueprint — Atiende Rentas Vacacionales

**Auditor:** Sonnet, independiente (no autor de BLUEPRINT.md/DECISIONES.md/REQUISITOS.md/ACEPTACION.md).
**Objeto auditado:** `docs/BLUEPRINT.md`, `docs/DECISIONES.md` (23 ADR), `docs/REQUISITOS.md` (179 REQ), `docs/ACEPTACION.md`.
**Base de contraste:** los 21 módulos `docs/investigacion/RV01-RV21.md`, `docs/FUENTES.md`, `docs/LAGUNAS.md`, `docs/BLOQUEOS.md`, `docs/fuentes/b002-archivo.md`.
**Método:** lectura íntegra de los 4 documentos auditados + 3 agentes Sonnet independientes que abrieron cada módulo/fuente citada de una muestra de 90 REQ-nnn (de 179) y las 23 decisiones, más verificación adicional propia (conteo RVxx-R-nn vs. citas, existencia de archivos externos citados, coherencia del constraint SQL central). Ningún archivo auditado fue modificado.

## Veredicto: **APTO CON CORRECCIONES**

El corpus es, en conjunto, notablemente disciplinado: de 90 requisitos y 23 decisiones verificados contra su fuente primaria real (no solo contra la existencia de una sección), **cero resultaron huérfanos** (RVxx-R-nn inexistente) y **cero afirmaron un hecho externo sin ninguna fuente rastreable**. Las reglas no negociables (nunca cancelar, nunca contactar sin autorización, ninguna decisión de inventario vía LLM, sin promesas de "tiempo real"/"cero overbooking") están verificadas de forma sólida y consistente en los tres documentos y en ACEPTACION.md. La honestidad de conectividad (Booking.com pausado, iCal Booking sin evidencia, Vrbo 3 niveles con confianza media) es fiel a `b002-archivo.md` y `LAGUNAS.md`, sin ninguna promesa no calificada de tiempo real encontrada en todo BLUEPRINT.md.

No obstante, se encontraron defectos concretos que deben corregirse antes de iniciar construcción, principalmente porque tocan **el invariante central del producto** (contradicción entre el modelo de capas con precedencia y el constraint SQL mostrado) y **la verificabilidad real de criterios de seguridad** (tres citas rotas en ACEPTACION.md dejan sin criterio verificable el cifrado de secretos y XXE). Ninguno de los hallazgos revierte una regla de negocio ya adoptada ni descubre una promesa falsa activa; son gaps de especificación y de trazabilidad, no fabricación de evidencia.

## Conteo por severidad

| Severidad | Nº | IDs |
|---|---|---|
| Crítico | 0 | — |
| Alto | 3 | BC1, BC2, BC3 |
| Medio | 4 | BC4, BC5, BC6, BC7 |
| Bajo | 5 | BC8, BC9, BC10, BC11, BC12 |
| **Total** | **12** | — |

## Las 5 correcciones más importantes

1. **BC1 [Alto]** — El constraint SQL único de `BLUEPRINT.md` §3.2 (`EXCLUDE USING gist (unidad_id, during)` sin partición por capa) impide estructuralmente que coexistan dos bloqueos activos solapados de distinta capa, lo que hace irrealizable el escenario que el propio `D-002`/`REQ-006`/`RV07 §7` (línea 124: "reserva confirmada + bloqueo de mantenimiento superpuesto creado por error") usa para justificar la regla de precedencia. `D-002` ya lo marca como "pendiente de cerrar detalle" y `RV17 §13` laguna #4 lo declara abierto, pero `BLUEPRINT` §3.1-3.2 presenta el SQL como si ya implementara el modelo. Falta especificar el mecanismo exacto (excepción de BD capturada y convertida en alerta, vs. coexistencia de filas) antes de construir — de esto depende directamente el caso adversarial #12 de `ACEPTACION.md`.
2. **BC2 [Alto]** — Tres citas de `ACEPTACION.md` están rotas: REQ-141 (secretos AES-256-GCM) apunta a "§RV19/21-5" (en realidad el catálogo de 20 casos), REQ-143 (routing de tools) apunta a "§RV19/21-6" (no cancelación), REQ-155 (XXE) apunta a "§RV19/21-3" (límites de tamaño ICS). Hoy no existe ningún criterio de aceptación verificable dedicado a cifrado de secretos ni a prevención de XXE.
3. **BC3 [Alto]** — `D-023` cita `docs/BLOQUEOS.md` B-003/B-004 como respaldo de la laguna de vigencia fiscal ISR/IVA México; B-003 es en realidad el registro español y B-004 la regulación de CDMX — la laguna fiscal real (RV19 §6) no tiene fila propia en `BLOQUEOS.md`, con riesgo de perderse del seguimiento operativo de bloqueos activos.
4. **BC4 [Medio]** — `REQ-177`/`RV16-R-06` afirman que el costo de IA varía "hasta ~5x" entre el modelo más barato y el más caro citando GPT-4o mini ($0.0006) vs. Claude Opus 5 ($0.0225) — la razón real con esas dos cifras es 37.5x, no 5x; el "5x" solo es exacto comparando dos modelos de Anthropic entre sí.
5. **BC5 [Medio]** — El ciclo "Airbnb ~3h" (la cifra de latencia más citada del documento: sustenta D-003, la matriz de conectividad de §2.3, REQ-039, REQ-058, REQ-087) se presenta como `[DATO]` puro, pero el propio módulo RV03 etiqueta como confianza **baja/media** la extrapolación de "un caso de sync entre calendarios" a "cualquier conexión iCal con Airbnb". Debe llevar ese matiz o confirmarse con segunda fuente.

Ver `blueprint-trazabilidad.md` para la tabla completa de la muestra (90 REQ + 23 D) y `blueprint-hallazgos.md` para el detalle por criterio 1–7, incluidas las correcciones BC6–BC12 (medio/bajo: 11 RVxx-R-nn sin cita en REQUISITOS —notablemente los 4 de RV14 que sustentan la propuesta de valor de §11—, dos evidencias mal atribuidas en REQ-005/REQ-008, imprecisiones de sección en "RV18 §5.4" y D-002/RV17§1.1, certeza inflada en REQ-011/012, discrepancia RtB de RV04 no propagada a Riesgos, amplificaciones menores en dos casos adversariales de ACEPTACION, y pérdida de matiz en REQ-098).

## Nota de contexto

El registro `docs/AGENTES.md` (líneas 20-23) muestra que, en paralelo a esta auditoría, otro auditor independiente está revisando `docs/investigacion/` (los 21 módulos RV) y ya encontró correcciones pendientes (C1-C5) en curso de aplicación por correctores separados al momento de este cierre. Los hallazgos de este informe se basan en el contenido de los módulos RV **tal como estaban al momento de la lectura** (2026-09-05); si esos módulos cambian por la otra auditoría, algunas de las citas aquí verificadas deberían re-confirmarse antes de cerrar Fase 1.
