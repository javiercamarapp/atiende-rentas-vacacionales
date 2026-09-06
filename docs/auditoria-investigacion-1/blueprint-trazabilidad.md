# Trazabilidad verificada — muestra de REQUISITOS.md y DECISIONES.md

Muestra de 90 REQ-nnn (de 179) y las 23 decisiones D-nnn (100%), verificadas
abriendo el módulo `docs/investigacion/RVxx-*.md` y la ficha de fuente
(`docs/FUENTES.md` / `docs/fuentes/*.md` / `docs/fuentes/b002-archivo.md`)
citados en cada uno — no solo confirmando que la sección existe, sino que
dice lo que el REQ/D afirma que dice. Veredictos: **VERIFICADO** (cita
correcta y sustenta el enunciado), **PARCIAL** (fuente real pero con matiz
perdido, cita de sección incorrecta, o co-origen impreciso), **HUÉRFANO**
(el RVxx-R-nn no existe), **SIN_FUENTE** (hecho externo sin fuente que lo
sostenga). Resultado agregado: **0 HUÉRFANO, 0 SIN_FUENTE, 12 PARCIAL, 78
VERIFICADO** sobre 90 REQ; **0/0/3/20** sobre 23 D.

## Requisitos — sección 0-3 (negativos, roles, calendario, UX)

| ID | Cita afirmada | Veredicto | Nota |
|---|---|---|---|
| REQ-000 | RV02-R-03/RV18-R-03/RV19-R-15; art.990/2022; RV18-F-06 | VERIFICADO | Penalización 10/25/50%/$50 y art. 2022 confirmados literales |
| REQ-001 | RV10-R-06, RV18-R-03, RV19-R-15; SUPUESTO | VERIFICADO | SUPUESTO honestamente etiquetado, no inflado a [DATO] |
| REQ-002 | RV18-R-03; RV18-F-06 | VERIFICADO | Coincide literal |
| REQ-003 | RV16-R-04, RV18-R-02 | VERIFICADO | Casi palabra por palabra |
| REQ-004 | RV18-R-01; RV18-F-02/F-07/F-08 | VERIFICADO | `properties: {}` de Likida confirmado |
| REQ-005 | RV07-R-05, RV21; [DATO] RFC 5545; LAGUNAS §5 | **PARCIAL** | RFC 5545 es la fuente equivocada (solo cubre límites de tamaño, tema de REQ-031); el respaldo real es OpenTelemetry F-143, no citado |
| REQ-006 | RV07-R-02; SUPUESTO (D-002) | VERIFICADO | Precedencia coincide; SUPUESTO honesto |
| REQ-007 | RV19-R-13/14; PENDIENTE-EXTERNO | VERIFICADO | RV19 §6 tiene 12 lagunas, 1-9 cubren lo citado |
| REQ-008 | RV17-R-09; RV17-F-05 (RLS, "análogo") | **PARCIAL** | RV17-F-05 es doc. de RLS (autorización de filas), dominio distinto al afirmado (honestidad de estado de canal); analogía, no evidencia directa |
| REQ-009 | RV20-R-04; SUPUESTO | VERIFICADO | Coincide literal |
| REQ-010 | RV19-R-09; ToS Airbnb §11.1/§16, Booking A15.2/A15.3 | VERIFICADO | Secciones exactas confirmadas |
| REQ-011 | RV01-R-01; Airbnb art. 1534 | **PARCIAL** | Art. describe producto de Airbnb, no impone obligación a Atiende; MUST es inferencia de diseño presentada como [DATO] |
| REQ-012 | RV01-R-02; Airbnb art. 1534 | **PARCIAL** | Mismo matiz que REQ-011; negación para niveles bajos es inferencia por omisión |
| REQ-018 | RV01-R-09; bloqueos 403/429 | VERIFICADO | RV01 §Riesgos confirma ambos códigos |
| REQ-020 | RV12 §1, RV12-R-08; SUPUESTO | **PARCIAL** | Detalle quién/cuándo/qué/por qué vive en §6, no citado |
| REQ-024 | RV06-R-01/RV17-R-02; RFC5545 §3.6.1/§3.8.2.2 | VERIFICADO | Cita verbatim |
| REQ-025 | RV17-R-01; RV17-F-01/F-02 | **PARCIAL** | La propia ficha F-02 dice "composición razonada, no cita idéntica" — matiz que REQUISITOS conserva parcialmente |
| REQ-026 | RV17-R-03; RV17-F-04 | VERIFICADO | — |
| REQ-028 | RV06-R-03/RV07-R-03 | VERIFICADO | Citas verbatim |
| REQ-030 | RV06-R-06, RV19-R-01/02/03; OWASP A10 | VERIFICADO | Coincide punto por punto |
| REQ-031 | RV06-R-07, RV19-R-04 | VERIFICADO | Ausencia de cifra en OWASP confirmada |
| REQ-032/033 | RV06-R-08, RV17-R-04 | VERIFICADO | — |
| REQ-034 | RV07-R-01; SUPUESTO (D-001) | VERIFICADO | — |
| REQ-036 | RV07-R-03/RV17-R-08 | VERIFICADO | — |
| REQ-037 | RV07-R-04; Vrbo "payment issues" | VERIFICADO | Confianza media-baja correctamente etiquetada |
| REQ-039 | RV07-R-07/RV21-R-04 | VERIFICADO | Cifras Airbnb/Vrbo/Booking coinciden |
| REQ-041 | RV07-R-09/RV17-R-05; microservices.io | VERIFICADO | Cita verbatim del patrón Outbox |
| REQ-046/047 | RV09-R-01/02; art. 447/484 | VERIFICADO | — |
| REQ-049/051 | RV09-R-04/06 | VERIFICADO | — |
| REQ-055 | RV09-R-10, RV21-R-06 | **PARCIAL** | RV21-R-06 trata de SLOs de carga/latencia, no de lenguaje de marketing — co-origen impreciso |
| REQ-057 | RV09-R-12 | VERIFICADO | — |
| REQ-058 | RV03-R-01; Airbnb art. 99, "3h" | **PARCIAL** | RV03 etiqueta la generalización a "cualquier conexión iCal" como supuesto de confianza baja/media; REQUISITOS lo presenta sin ese matiz — es la cifra más citada del corpus (ver BC5) |
| REQ-060 | RV03-R-03; F10 (terceros) | VERIFICADO | Correctamente marcado [R], no [DATO] |

## Requisitos — secciones 4-12 (conectividad, operación, mensajería, limpieza, finanzas, pricing)

| ID | Veredicto | Nota |
|---|---|---|
| REQ-063, 068, 069, 070, 072, 074 | VERIFICADO | Cifras exactas confirmadas (INQUIRY no bloquea, 20s polling literal "once per twenty seconds", 6 campos roomstosell/CTA/CTD/etc., matriz PCI/PII) |
| REQ-075/076/077/078 | VERIFICADO | Citas textuales exactas de `b002-archivo.md` F01/F02/F07 |
| REQ-079/080/082/085 | VERIFICADO | 3 niveles Vrbo y confianza media correctos |
| REQ-088/089 | VERIFICADO | — |
| REQ-091/093 | VERIFICADO | Cifra "72h" literal (art. 2868) |
| REQ-097/098 | VERIFICADO (matiz) | REQ-098 pierde el matiz que RV02-R-10 declara ("detalle exacto del disparador no confirmado verbatim, validar con proveedor elegido") — ver BC12 |
| REQ-100/102/103/105/106/109 | VERIFICADO | "4,000 characters" y arts. 3059/209/4155/2862/3175 literales |
| REQ-111/113/118 | VERIFICADO | REQ-118 confirma ausencia explícita de precedente de mercado |
| REQ-121/122/123 | VERIFICADO | "14-16%, 16% México" y "30min-7días/45días" literales |
| REQ-125/126/128 | VERIFICADO | — |
| REQ-130/133/134/135/137 | VERIFICADO | "EEA" (fuente) vs "EEE" (REQ) es traducción correcta, no distorsión |

## Requisitos — secciones 13-18 (arquitectura, agentes, seguridad, operación, pruebas, negocio)

| ID | Veredicto | Nota |
|---|---|---|
| REQ-138, 140 | VERIFICADO | — |
| REQ-139 | VERIFICADO | Confirmado con lectura de `20260904050000_enterprise_tenant_isolation.sql`: usa `is_restaurant_staff(_user_id, _restaurant_id)` security definer parametrizada — sustenta el patrón afirmado (el nombre `is_tenant_member` es adaptación declarada, no cita literal ni fabricación) |
| REQ-141 | VERIFICADO (evidencia) / **defecto en ACEPTACION** | Cita técnica correcta (AES-256-GCM/ChaCha20, OWASP A14); ver BC2 — `ACEPTACION §RV19/21-5` referenciado es el catálogo de 20 casos, no un criterio de cifrado |
| REQ-142 a 149 | VERIFICADO | — |
| REQ-143 | VERIFICADO (evidencia) / **defecto en ACEPTACION** | Ver BC2 — `§RV19/21-6` no corresponde |
| REQ-150 a 154 | VERIFICADO | Art. 4.2/7.1.b del Reglamento UE 2024/1028 confirmados exactos (E5) |
| REQ-155 | VERIFICADO (evidencia) / **defecto en ACEPTACION** | Ver BC2 — `§RV19/21-3` no corresponde (es límites de tamaño ICS, no XXE) |
| REQ-156 a 166 | VERIFICADO | — |
| REQ-167/168/169 | VERIFICADO | Secciones RFC 5546 §2.1.5 y RFC 5545 §3.3.5/§3.8.4.7 confirmadas exactas |
| REQ-170 a 176 | VERIFICADO | — |
| REQ-177 | **PARCIAL (error aritmético)** | Ver BC4 — "~5x" no corresponde a las cifras propias de RV16 §3b ($0.0006 vs $0.0225 = 37.5x) |
| REQ-178 | VERIFICADO | — |

## Decisiones (D-001 a D-023) — 23/23 verificadas

| ID | Veredicto | Nota |
|---|---|---|
| D-001 | VERIFICADO | — |
| D-002 | **PARCIAL** | Evidencia cita "RV17 §1.1" para tabla única `ocupacion_unidad`, pero esa sección modela dos tablas separadas; la tabla única solo se propone en §2.3, marcada ahí como decisión abierta. Ver BC1 y BC8 |
| D-003 | VERIFICADO (matiz menor) | "20min" de propagación Vrbo es paráfrasis, no cita verbatim, aunque repetida de forma independiente en RV09 |
| D-004 | VERIFICADO | — |
| D-005 | VERIFICADO | Cita literal "Unset/Error, nunca Ok por omisión" confirmada |
| D-006 | VERIFICADO (matiz menor) | "RV18 §5.4" no existe como encabezado real (RV18 tiene una lista plana); heredado de RV18 mismo, no inventado. Ver BC8 |
| D-007 | VERIFICADO | — |
| D-008 | VERIFICADO | — |
| D-009 | VERIFICADO | "1344ms vs 302ms", ausencia de Docker/Supabase/psql, Rosetta 2 — literales en RV17 §10 |
| D-010 | VERIFICADO | Cita microservices.io exacta |
| D-011 | VERIFICADO | Citas textuales F01/F02/F05/F07 de b002-archivo.md exactas |
| D-012 | VERIFICADO | — |
| D-013 | VERIFICADO | — |
| D-014 | VERIFICADO | — |
| D-015 | VERIFICADO (adicional a la muestra) | El archivo citado (`atiende-hoteles-staging/docs/referencia/05-frontend-restaurantes.md`) SÍ existe — confirmado por este auditor con `find` directo sobre el filesystem, fuera de lo que un agente sin acceso al directorio hermano pudo verificar |
| D-016 | VERIFICADO | Tabla de costos $0.0006-$0.0225 y supuesto 2000/500 tokens coinciden exacto |
| D-017 | VERIFICADO | — |
| D-018 | VERIFICADO | Cifra Uplisting "£49/month" literal |
| D-019 | VERIFICADO | — |
| D-020 | VERIFICADO | Confirmado con código real: función security definer parametrizada existe (`is_restaurant_staff`); `FORCE ROW LEVEL SECURITY` NO aparece en el código de `atiende-restaurantes` — esa parte se atribuye correctamente a documentación de PostgreSQL (RV17-F-05), no al código, sin error de atribución |
| D-021 | VERIFICADO | — |
| D-022 | **PARCIAL (atribución)** | Las cifras 1344ms/302ms provienen de `atiende-hoteles-staging/docs/referencia/07-stack-viabilidad.md` (otro proyecto/investigador), no de una medición fresca de esta sesión; la frase "Verificado en esta máquina" sugiere medición propia cuando es heredada. Imprecisión de atribución, no fabricación |
| D-023 | **PARCIAL** | Cita `BLOQUEOS.md B-003/B-004` para la laguna fiscal ISR/IVA México; B-003 es en realidad el registro español y B-004 la regulación CDMX. Ver BC3 |

## Verificación cruzada adicional (no pedida por REQ/D individual, hecha por este auditor)

- **Cobertura RVxx-R-nn → REQUISITOS.md**: 177 de 196 RVxx-R-nn distintos citados (verificado por conteo `grep` módulo por módulo). Los 19 no citados: 6 de RV14 (íntegro), 5 de RV15 (íntegro), y uno cada uno de RV01 (R-10), RV06 (R-04), RV08 (R-06), RV16 (R-07), más los 2 de RV19 (R-02/R-03) que en realidad SÍ están cubiertos vía la notación abreviada "RV19-R-01/02/03" en REQ-030 (falso positivo de mi primer conteo, descartado). Ver BC6.
- **Catálogo de 20 casos adversariales** (`ACEPTACION.md` §Calendario-2 vs. `RV21-pruebas-aceptacion.md` §3): reproducido fielmente, mismo orden, sin omisiones. Dos amplificaciones/pérdidas de precisión menores (casos 18 y 20) — ver BC11.
