# Síntesis y veredicto — Reverificación independiente de Auditoría 2

**Fuente completa:** `docs/auditoria-2/REVERIFICACION.md` (incluye §13
"Ronda final" con la verificación de los 2 puntos pendientes de la síntesis
original).

## VEREDICTO DEFINITIVO: CIERRE AUDITADO DE FASE 2 — APROBADO

No queda ningún defecto crítico o alto abierto. Los 2 puntos que bloqueaban
el cierre en la síntesis original de esta reverificación (`NODE_ENV=""` y
D-ADV-01) se corrigieron y se **VERIFICARON CERRADOS con ejecución real**
por este mismo reverificador (no por lectura de los commits de corrección):
19/19 + 9/9 + 1/1 pruebas específicas del fix de `NODE_ENV`, más 6/6
variantes adicionales propias (`NODE_ENV=" development "`,
`ATIENDE_ENTORNO=""` con `NODE_ENV=production`, ambas vacías, solo espacios,
mayúsculas+tilde) sin sobre-corrección del camino legítimo; y 8/8 + 1/1
pruebas para D-ADV-01 con HTTP 404 real observado en log. Todo lo demás
verificado en la ronda inicial (16/18 hallazgos de seguridad, 13/15 de
dominio, 14/14 de producto/calidad, 0 archivos perdidos en 119→124 commits,
gates completos) permanece VERIFICADO sin regresiones.

## Conteos finales

- **Commits en `main`:** 124 (119 al cierre de la ronda inicial + 5 de la
  ronda final: `6c665d6` reverificación, `8cfdbc3` fix NODE_ENV, `46015a1`
  cierre documental D-ADV-01, `50b1b6b` config de vitest, `1b323dd`
  progreso). **0 archivos perdidos** en todo el historial (forense
  independiente de B-007).
- **Pruebas (todas re-ejecutadas por el reverificador en la ronda final):**
  - Unit: **578 pruebas / 92 archivos**, 0 fallos.
  - Integración: **136 pruebas / 15 archivos**, 0 fallos.
  - Adversarial: **49 pruebas / 5 archivos**, 0 fallos, 0 en rojo (D-ADV-01
    cerrado; el catálogo completo de 20 casos + carga está verde).
  - Evals de agentes: **10/10**, 0 fallos adversariales.
  - Gates de forma (`typecheck`, `lint`): **VERDES** (lint: 0 errores, 11
    warnings preexistentes sin relación).
  - `db:verificar-migraciones`: no ejecutable en el entorno de
    reverificación por falta de `DATABASE_URL` desplegada (ambiental, no un
    defecto — el mecanismo que audita, D-DSD-14, se verificó por ejecución
    directa del runner en la ronda inicial).
- **Hallazgos de seguridad (S-nn):** 21 totales — 16 VERIFICADA (corregidos
  de raíz), 1 aceptado por diseño explícito preexistente (S-16, PII en
  auditoría de mensajería, mitigado por RLS), 2 aceptados
  informativos/fuera de alcance razonable (S-19 filtro léxico secundario,
  S-20 dependencias sin CVE). **+1 hallazgo nuevo** de esta reverificación
  (`NODE_ENV=""` no activaba fail-closed) — **corregido y verificado
  cerrado** en la ronda final.
- **Hallazgos de dominio (D-DSD-nn):** 15 totales — 13 VERIFICADA, 2
  GAP-ACEPTABLE (D-DSD-05, D-DSD-08 — ausencia real de código, no defecto
  activo, confirmado por grep independiente).
- **Hallazgos de producto/calidad (P-nn/Q-nn):** 14 VERIFICADA, 3 no
  resueltos con justificación aceptada como decisión de alcance razonable
  (Q-04 roles como literales — deuda de mantenibilidad, no hueco de
  seguridad; Q-06 cobertura sin umbral — deuda real de bajo impacto
  inmediato; P-08 pantallas de "sin acceso" apiladas — cosmético, sin
  fuga de datos).
- **Defecto adversarial D-ADV-01:** **CERRADO** (era el único defecto
  abierto fuera del catálogo S/D/P/Q; verificado con HTTP 404 real).
- **Historias BACKLOG.md:** 95 totales — 91 hecho (7 marcadas "parcial"
  dentro de su propio estado: H-054, H-064, H-072, H-086, H-088 y 2 más),
  4 por hacer (H-048 COULD, H-071 SHOULD, H-073 MUST percentiles de
  latencia, H-091 MUST modo degradado solo-lectura), 0 bloqueada
  formalmente.
- **Criterios de ACEPTACION.md:** ~59 totales; muestra verificada de 18 con
  evidencia rastreable a archivo real — 12 CUMPLIDO, 3 PARCIAL (§Finanzas-2
  conciliación Vrbo sin parser real, §Operación-3 backup WAL depende de
  infraestructura administrada, §Legal-1 fiscal sin documento de aprobación
  fechado), 1 NO CUMPLIDO (§UX-4 accesibilidad, sin axe-core, reconocido
  como limitación por ambas auditorías), 1 NO APLICA (§XXE, sin parser
  XML), y 6+ PENDIENTE-EXTERNO correctamente etiquetados como tales, sin
  ningún intento de cerrarlos artificialmente.

## Credenciales / homologaciones / revisiones legales pendientes (no cerrables por ingeniería — impiden marcar "integración real" con canales/jurisdicciones)

- **B-002:** homologación Booking.com (Connectivity Partner — el propio
  canal declara en vivo "pausing integrations with new connectivity
  providers until further notice") y Vrbo Connectivity Partner Program
  (solo evidencia archivada de 6 meses); iCal de Booking.com sin fuente
  primaria de ningún tipo.
- **B-003:** revisión legal española — Registro Único de Arrendamientos
  (transposición Reglamento UE 2024/1028) y Orden INT del parte de
  viajeros (RD 933/2021), norma no localizable en fuentes oficiales.
- **B-004:** verificación de regulación local de alojamiento turístico de
  Ciudad de México, no verificable (fuentes oficiales con TLS roto / SPA
  sin contenido estático).
- **B-005:** confirmación de un fiscalista mexicano sobre la vigencia
  post-reforma de tasas de retención ISR (4%/20%) e IVA (50%/100%) sobre
  plataformas digitales — bloquea cualquier calculadora fiscal (REQ-007,
  REQ-126, REQ-129); flag fiscal permanece en `false`.
- Revisión legal/ARCO-RGPD firmada (§RV19/21-9) y confirmación de
  activación del régimen UE 2024/1028 por jurisdicción de destino
  (§RV19/21-11) antes de habilitar el campo de registro en UI.

Ninguno de estos 5 puntos es resoluble con más ingeniería dentro del
repo — todos están correctamente etiquetados PENDIENTE-EXTERNO en
ACEPTACION.md/BLOQUEOS.md, y **no bloquean** el veredicto de "CIERRE
AUDITADO" del código/producto en sí, porque nunca se marcaron como
cerrados sin esa evidencia externa: la propia documentación los declara
explícitamente fuera del alcance de una auditoría de ingeniería.

## Resumen ejecutivo

Fase 2 de Atiende Rentas Vacacionales queda **CERRADA con auditoría
independiente aprobada**: 124 commits sin pérdida de contenido, 763
pruebas automatizadas verdes (578 unit + 136 integración + 49 adversarial),
0 defectos críticos/altos abiertos, y toda corrección de auditoría-2
verificada con ejecución real por un reverificador que no participó en
ninguna de las auditorías ni correcciones previas. Las únicas piezas que
no pueden cerrarse son, por diseño, externas a la ingeniería (homologación
de canales y revisión legal/fiscal por jurisdicción) y están declaradas
como tales sin excepción.
