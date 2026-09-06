# Correcciones aplicadas al blueprint (BC1–BC12)

Corrector: Sonnet, sobre `docs/BLUEPRINT.md`, `docs/DECISIONES.md`,
`docs/REQUISITOS.md`, `docs/ACEPTACION.md`, `docs/BLOQUEOS.md` (solo B-005).
No se tocaron `docs/investigacion/RV*.md` ni B-001..B-004.

| BC | Archivo/sección | Qué cambió | Estado |
|---|---|---|---|
| BC1 (alto) | BLUEPRINT §3.1/§3.2; DECISIONES D-002; REQUISITOS REQ-068/091 | `EXCLUDE` re-scoped a `capa='reserva' AND bloqueante`; bloqueos de propietario/mantenimiento/buffer nunca participan del constraint. Nueva tabla `conflicto_calendario` + mecanismo: reserva-vs-reserva → excepción `23P01` capturada → fila `conflicto_pendiente` + alerta crítica (nunca cancela); capa cruzada → `INSERT` aceptado + alerta `capa_cruzada`, precedencia decide en lectura. Nuevo campo `bloqueante` reconcilia REQ-091 (3 estados) con REQ-068 (Booking `INQUIRY` no bloquea) vs. REQ-048 (Airbnb pendiente sí bloquea). | RESUELTA |
| BC2 (alto) | ACEPTACION.md (nuevos ítems 13/14/15 en §RV19/RV21); REQUISITOS REQ-141/143/155 | Se crearon tres criterios verificables dedicados (cifrado de secretos con comando de inspección de BD; routing de tools por rol con inspección del payload al LLM; XXE con payload de entidad externa) y se corrigieron las referencias rotas (antes apuntaban a catálogo adversarial, "no cancelación" y límites de tamaño ICS respectivamente). | RESUELTA |
| BC3 (alto) | BLOQUEOS.md (nuevo B-005); DECISIONES D-023; BLUEPRINT §7/§14 | B-005 creado con mismo formato que B-001..B-004 (impacto, causa técnica, qué necesita el usuario). D-023 y BLUEPRINT ya no atribuyen la laguna fiscal MX a B-003 (España)/B-004 (CDMX); citan B-005. | RESUELTA |
| BC4 (medio) | DECISIONES D-018; REQUISITOS REQ-177 | Corregido "~5x" → ~37.5x para el par citado (GPT-4o mini $0.0006 vs. Claude Opus 5 $0.0225); se aclara que 5x solo aplica comparando Haiku 4.5 vs. Opus 5. Punto cualitativo preservado. | RESUELTA |
| BC5 (medio) | BLUEPRINT (matriz §2.3, §4.1, §5.1); DECISIONES D-003; REQUISITOS REQ-039/058/087; ACEPTACION §Conectividad-2 | Toda mención de "Airbnb ~3h" ahora lleva "confianza baja/media (RV03 S1)" y nota de latencia externa no controlada, en las 7 ubicaciones donde aparecía la cifra. | RESUELTA |
| BC6 (medio) | REQUISITOS REQ-002/004/104/145/008; nuevo REQ-179 | Se citó explícitamente RV14-R-01..04 en los REQ que ya cubrían su sustancia. Se añadió REQ-179 (antes sin REQ dedicado) para RV06-R-04 (semántica STATUS:CANCELLED ausente/presente). Catálogo pasa de 179 a 180 filas (149 MUST). | RESUELTA |
| BC7 (medio) | REQUISITOS REQ-005/008 | REQ-005: evidencia corregida de RFC 5545 (fuente equivocada) a OpenTelemetry/LAGUNAS §5 vía F-143. REQ-008: etiqueta bajada de `[DATO]` a `[R]` con nota explícita de que RLS es un dominio distinto aplicado por analogía. | RESUELTA |
| BC8 (bajo) | DECISIONES D-006; BLUEPRINT §3.1 | "RV18 §5.4" → "RV18 §5, punto 4" (único caso real encontrado, en D-006; REQ-002/BLUEPRINT no lo citaban tal cual). D-002 ya no cita "RV17 §1.1" para el modelo de tabla única; ahora cita §2.3 correctamente y aclara que §1.1 describe dos tablas. | RESUELTA |
| BC9 (bajo) | REQUISITOS REQ-011/012 | Evidencia bajada de `[DATO]` a `[R]` con nota de que el art. 1534 describe permisos nativos de Airbnb para sus cohosts, no una obligación para Atiende; el MUST es decisión de diseño que replica ese modelo. | RESUELTA |
| BC10 (bajo) | BLUEPRINT §12 (Riesgos); REQUISITOS REQ-068 | Nueva fila de riesgo: discrepancia RtB de RV04 §7 (72h F04 vs. 48h F13, no reconciliada) y su efecto en el diseño del bloqueo blando interno (RV04-R-01). Nota cruzada añadida en REQ-068. | RESUELTA |
| BC11 (bajo) | ACEPTACION §Calendario-2 (casos 18 y 20) | Caso 18: se quitó el cuantificador "100%" no trazable a RV21 §3, alineado a "toda petición... es rechazada". Caso 20: se restauró la exigencia de verificar contra la lista completa de rangos de RV19-R-01/02. | RESUELTA |
| BC12 (bajo) | REQUISITOS REQ-098 | Restaurado el matiz de RV02-R-10 ("detalle exacto del disparador no confirmado verbatim, validar con proveedor elegido"); evidencia bajada de `[DATO]` a `[R]`. | RESUELTA |

Nota: los módulos `docs/investigacion/RV*.md` citados (RV03 S1, RV04 §7,
RV14-R-01..04, RV16 §3b, RV17 §1.1/§2.3/§13, RV19 §6, RV21 §3) están siendo
editados en paralelo por otro corrector; las citas aquí reflejan su
contenido al momento de esta corrección (2026-09-05) y deben reconfirmarse
si esos módulos cambian antes de cerrar Fase 1.
