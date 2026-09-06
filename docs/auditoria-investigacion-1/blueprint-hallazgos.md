# Hallazgos detallados por criterio — auditoría del blueprint

Referencia cruzada: ver `blueprint-00-RESUMEN.md` para el veredicto y la
lista priorizada BC1-BC12, y `blueprint-trazabilidad.md` para la tabla
completa de la muestra verificada. Este documento detalla la evidencia
por cada uno de los 7 criterios del encargo.

---

## Criterio 1 — Trazabilidad

**Método:** 4 agentes Sonnet independientes (incluido este auditor) abrieron
el módulo RVxx y la ficha de fuente citados por 90 REQ-nnn (de 179) y las 23
decisiones, comparando la cita real contra lo afirmado — no solo la
existencia de la sección.

**Resultado agregado:** 0 HUÉRFANO, 0 SIN_FUENTE, 15 PARCIAL, 98 VERIFICADO
sobre 113 ítems (90 REQ + 23 D). El corpus está sólidamente trazado: ningún
RVxx-R-nn citado resultó inexistente, y ningún hecho externo marcado
`[DATO]` carece de una fuente rastreable. Los defectos encontrados son de
tres tipos, ninguno de fabricación:

1. **Cita de sección/fuente incorrecta pero de contenido real** (REQ-005 cita
   RFC 5545 para "nunca liberar disponibilidad ante fallo" cuando la fuente
   correcta es OpenTelemetry F-143 vía LAGUNAS §5; REQ-008 cita documentación
   de RLS de PostgreSQL — dominio de autorización de filas — como si
   sustentara directamente la honestidad de estado de conexión de canal, un
   hecho de otro dominio; D-002 cita "RV17 §1.1" para un modelo de tabla
   única que en realidad describe dos tablas separadas, el modelo de tabla
   única vive en §2.3).
2. **Pérdida de matiz de confianza presente en la fuente** (REQ-058: el ciclo
   "Airbnb ~3h" se presenta como `[DATO]` puro para "cualquier conexión iCal
   con Airbnb", pero RV03 etiqueta esa generalización como confianza
   baja/media; REQ-025: la ficha F-02 dice explícitamente "composición
   razonada, no cita idéntica" y pide validación empírica antes de darse por
   comprobada — REQUISITOS.md lo hereda parcialmente).
3. **Inferencia de diseño presentada como hecho externo puro** (REQ-011/012:
   el art. 1534 de Airbnb describe lo que el producto de Airbnb permite a sus
   propios cohosts, no una obligación citada textualmente para Atiende; el
   "MUST" es una decisión de replicar ese modelo, razonable pero mal
   etiquetada como `[DATO]` sin ese matiz).

**Completitud de cobertura** (verificación propia, no pedida a los
sub-agentes): de 196 `RVxx-R-nn` numerados en los 21 módulos
(`docs/investigacion/00-INDICE.md` línea 39), **177 están citados** en
`docs/REQUISITOS.md` (conteo por `grep` módulo por módulo). De los 19 no
citados:
- **11 corresponden íntegramente a RV14 (6) y RV15 (5)** — módulos de
  competencia y mercado. RV15 (dimensionamiento de mercado, decisiones de
  ir-a-mercado) es razonable que no genere REQ-nnn de producto. **RV14 es más
  problemático**: RV14-R-01 a R-04 (aprobación humana no-opcional en todos
  los tiers, audit log de IA visible, permisos de agente limitados en
  servidor comunicados activamente, estado de sync honesto vs. binario) son
  literalmente la base que `BLUEPRINT.md` §11 usa para afirmar que esta
  combinación es "el diferencial más defendible de Atiende frente al
  mercado" — pero **ningún REQ-nnn cita explícitamente RV14-R-01/02/03/04**.
  La sustancia está cubierta indirectamente (REQ-002/104 aprobación, REQ-145
  audit log, REQ-004 permisos servidor, REQ-008/017 sync honesto), pero la
  trazabilidad de "por qué esto es un diferencial de mercado, no solo una
  regla de seguridad" depende de que el lector infiera la conexión, no de
  una cita.
- **RV06-R-04** (semántica de `STATUS:CANCELLED` ausente/presente como
  equivalentes, sujeto a la regla de no-reapertura) no tiene REQ dedicado;
  es un detalle de parsing ICS con implicaciones reales de overbooking si se
  omite.
- **RV01-R-10** (distinción de colaboradores "líder" vs. "soporte" en
  listados de Servicios/Experiencias), **RV08-R-06** (recomendación de
  fases, ya cubierta narrativamente en BLUEPRINT §5.3/§13) y **RV16-R-07**
  (pay-as-you-go, explícitamente diferido a decisión de negocio futura por
  el propio RV16) son omisiones defendibles — fuera de alcance o
  explícitamente marcadas como no-hallazgo en su fuente.

**Corrección recomendada:** BC6 (medio) — agregar citas explícitas de
RV14-R-01 a R-04 en los REQ que ya cubren su sustancia (REQ-002, REQ-104,
REQ-145, REQ-008), y evaluar si RV06-R-04 amerita un REQ propio de parsing.

---

## Criterio 2 — Honestidad de conectividad

**Resultado: sin defectos.** Se inspeccionó `BLUEPRINT.md` completo buscando
"tiempo real", "instantáneo", "cero overbooking", o cualquier promesa de
integración directa activa sin calificar. **Ninguna ocurrencia rompe la
regla** — todas están explícitamente negadas o acotadas:
- §0: "...no un bus de eventos en tiempo real (RV06, RV07)".
- §4.1 (paso 5): "...no como 'cierre instantáneo' (REQ-039)".
- §5.1 (D-003): "...sin promesa de tiempo real".
- §5.2 "Qué NO se puede prometer hoy": "Webhooks en tiempo real de Airbnb:
  solo confirmados por fuentes de terceros"; "Cero overbooking garantizado
  vía iCal: matemáticamente inviable mientras el transporte sea polling con
  ciclos de horas (RV07 §9, RV21 §1)".

**Matriz de conectividad por cuenta** (§2.3): cada celda verificada contra
`docs/fuentes/b002-archivo.md` y `docs/LAGUNAS.md` es fiel, ninguna más
optimista que su fuente:
- Booking.com iCal "SIN EVIDENCIA" ↔ `b002-archivo.md` F07 (cero capturas
  Wayback, 403/timeout en vivo) y `LAGUNAS.md` §2.2 (PENDIENTE-EXTERNO/LAGUNA
  HONESTA). Correcto.
- Booking.com partner directo "pausado por el canal" ↔ F01 (leído en vivo,
  HTTP 200, cita textual "pausing integrations... until further notice").
  Correcto, y con matiz honesto: BLUEPRINT no reporta "pendiente" genérico
  sino "pausa activa declarada por el canal" — más conservador de lo
  mínimamente exigible.
- Vrbo Connectivity Partner "confianza media" ↔ F05 (captura Wayback de 6
  meses). Correcto, con la calificación de antigüedad preservada.
- Airbnb ~3h / Vrbo ~30min+20min: marcados `[DATO]`; ver el matiz de
  confianza de Airbnb discutido en Criterio 1 (REQ-058, BC5) — es un defecto
  de trazabilidad/matiz, no de honestidad de la matriz en sí (la matriz no
  inventa el número, lo hereda de RV03 sin el calificador de confianza que
  RV03 mismo le asigna a la generalización).

**Separación de latencia interna vs. externa**: presente y consistente
(D-003, REQ-039, §8 SLO interno p95<5s explícitamente scoped al "camino que
el sistema controla", nunca como SLA de canal).

**Sin corrección obligatoria en este criterio** más allá de BC5 (ya contado
en Criterio 1, con impacto directo aquí por ser la cifra base de la matriz).

---

## Criterio 3 — Invariantes del calendario

Todos los invariantes pedidos están **presentes en los tres documentos**:
fuente de verdad interna (D-001/REQ-034), `[check-in, check-out)` con DTEND
exclusivo (D-012/REQ-024/026), `ocupado = OR de capas` formalizado como
existencial (D-002), cancelación que no reabre por otra capa (REQ-006/035),
anti-eco en 3 capas (D-004/REQ-037), cuarentena de feed inaccesible/vacío/
malformado nunca "libre" (D-005/REQ-005, BLUEPRINT §4.3), dedupe por
`(canal,unidad,UID)`+hash+SEQUENCE (D-010/REQ-036/028), TZ IANA por
propiedad y DST (D-013/REQ-032/033), buffers y estancias contiguas
(REQ-042/043, §4.5), multi-unidad (REQ-071/136, §4.6), constraint de
exclusión en BD (D-012, §3.2 SQL).

### BC1 [Alto] — Contradicción entre el modelo de capas y el constraint SQL mostrado

**El hallazgo central de este criterio.** `BLUEPRINT.md` §3.2 muestra:

```sql
EXCLUDE USING gist (
    unidad_id WITH =,
    during    WITH &&
) WHERE (estado <> 'cancelado')
```

Este constraint excluye **cualquier** solapamiento de rango para la misma
`unidad_id`, sin partición por `capa` ni `razon`. Sin embargo, `D-002`
describe un modelo donde una noche puede estar reclamada simultáneamente por
más de una capa activa (reserva, bloqueo de dueño, mantenimiento, buffer), y
donde "cancelar un bloqueo `b` solo remueve su propio término del
existencial; nunca fuerza `ocupado=false` si otro término lo cubre" — esto
presupone que **dos filas activas con rangos solapados pueden coexistir** en
la tabla. El propio `RV07 §7` (línea 124) da el ejemplo motivador
explícito: *"una reserva confirmada y un bloqueo de mantenimiento superpuesto
creado por error [...] la noche permanece ocupada por la reserva [...] se
alerta el solapamiento [...] sin tocar la reserva."*

Bajo el constraint tal como está escrito, **ese estado nunca puede llegar a
existir**: el segundo `INSERT` (el bloqueo de mantenimiento superpuesto)
sería rechazado por Postgres con una violación de exclusión en el momento de
la escritura, no una fila que coexiste para resolverse en lectura. Esto no
es necesariamente incorrecto como diseño — de hecho, es la forma más segura
de prevenir doble-reserva — pero significa que:

1. El mecanismo real para "conflicto entre capas → alerta a humano, sin
   tocar la reserva" (ACEPTACION.md caso adversarial #12: "bloqueo manual
   superpuesto con import... alerta explícita, nunca sobrescritura
   silenciosa") debe ser: **la aplicación captura la excepción de exclusión
   en el INSERT y la convierte en una fila de alerta separada**, en vez de
   dejar que ambas ocupaciones persistan. Este mecanismo es plausible pero
   **no está descrito en ningún lugar de BLUEPRINT/DECISIONES/REQUISITOS** —
   el texto actual (`D-002`, `BLUEPRINT §4.2/§4.4`) da a entender que la
   resolución ocurre sobre filas ya coexistentes, lo cual el esquema no
   permite.
2. `RV17 §13` laguna #4 declara explícitamente que la elección entre "tabla
   única con discriminador" y "dos tablas + verificación cruzada" **no está
   resuelta**; `D-002` lo reconoce en su campo Estado ("Adoptada como
   principio; pendiente de cerrar el detalle físico"). Pero `BLUEPRINT`
   §3.1-3.2 presenta el SQL concreto como si el detalle ya estuviera
   cerrado, sin repetir esa advertencia en el propio bloque de código —un
   lector que llegue solo a §3.2 no ve la laguna.
3. El campo `estado` del ejemplo SQL (`text NOT NULL DEFAULT 'activo'`, con
   la única distinción relevante para el `EXCLUDE` siendo `'cancelado'`) no
   modela el estado "provisional/pendiente" que `REQ-091` exige (tres
   estados: confirmado, provisional, liberado) ni la excepción de `REQ-068`
   (una solicitud `INQUIRY` de Booking.com pendiente **no debe cerrar
   disponibilidad**, a diferencia de una reserva confirmada de Airbnb que
   **sí bloquea mientras está pendiente**, `REQ-048`). Si ambos casos usan
   `estado='activo'` por defecto, el `EXCLUDE` los trataría igual, pero el
   negocio exige tratamiento distinto. El esquema de ejemplo no muestra cómo
   se resuelve esto.

**Corrección obligatoria:** antes de construir, especificar en
`BLUEPRINT.md` §3.1-3.2 y `DECISIONES.md` D-002 (a) el mecanismo exacto de
detección/alerta de conflicto entre capas (excepción de BD capturada vs.
otro mecanismo), y (b) cómo el modelo de estados de `ocupacion_unidad`
distingue "provisional que sí bloquea" (Airbnb) de "provisional que no debe
bloquear" (Booking INQUIRY) dentro del mismo `EXCLUDE`.

### Otras observaciones de criterio 3

- La discrepancia de RV04 sobre el umbral de elegibilidad de Request-to-Book
  ("al menos 3 días" F04 vs. "más de 48 horas" F13, declarada como no
  reconciliada en el propio RV04 §7) no se propaga como fila de riesgo en
  `BLUEPRINT §12` ni en `LAGUNAS.md` — bajo impacto, pero afecta directamente
  el diseño de `REQ-068`. (BC10, bajo.)
- No se encontraron contradicciones adicionales entre BLUEPRINT, DECISIONES
  y REQUISITOS para el resto de invariantes (TZ/DST, dedupe, anti-eco,
  cuarentena, multi-unidad) — están alineados en los tres documentos con
  redacción consistente.

---

## Criterio 4 — Requisitos negativos y seguridad

Todos los controles pedidos por el encargo existen y tienen cita rastreable:

| Control | Estado |
|---|---|
| No cancelar reservas (REQ-000/002) | VERIFICADO — RV18 y D-006 dicen literalmente "no es un caso de 'requiere aprobación', es un caso de 'no existe la tool'" |
| No contactar huésped sin autorización (REQ-001/104/154) | VERIFICADO |
| No actuar sobre cuentas / no enviar mensajes sin aprobación | VERIFICADO |
| Herramientas de agentes sin capacidad de cancelar (REQ-002/146) | VERIFICADO — con imprecisión de cita menor (ver abajo) |
| SSRF en URLs iCal (REQ-030/031) | VERIFICADO — OWASP SSRF Prevention Cheat Sheet citado con URL y deny-list real |
| Parsing ICS seguro / XXE (REQ-155) | VERIFICADO en evidencia técnica — **defecto en el criterio de aceptación asociado** (ver BC2) |
| Secretos (REQ-141, AES-256-GCM/ChaCha20) | VERIFICADO en evidencia técnica — **defecto en el criterio de aceptación asociado** (ver BC2) |
| RLS (REQ-138/139/140) | VERIFICADO, incluida confirmación contra código real de `atiende-restaurantes` |
| Prompt injection (D-007/D-008/REQ-004) | VERIFICADO — cita de Anthropic ("How we contain Claude") real y usada correctamente |
| Logs sin PII (REQ-142) y auditoría de mutaciones (REQ-020/127) | VERIFICADO, declarado correctamente como SUPUESTO/decisión de producto, no mandato externo |

### BC2 [Alto] — Citas rotas en ACEPTACION.md para tres controles de seguridad

`docs/ACEPTACION.md` §"RV19/RV21" es una lista numerada 1-12 sin encabezados
literales `§RV19/21-N` — varios REQ le asignan un número que no corresponde
al contenido real de esa posición:
- **REQ-141** (cifrado de secretos, AES-256-GCM/ChaCha20-Poly1305, rotación)
  cita `ACEPTACION §RV19/21-5`, que es en realidad el ítem 5: "Catálogo
  adversarial completo (20 casos)" — no tiene relación con cifrado.
- **REQ-143** (resolución server-side de qué tools están disponibles por
  rol) cita `§RV19/21-6`, que es "No cancelación automática de reservas" —
  sin relación con el routing de tools.
- **REQ-155** (deshabilitar DTD/XXE en cualquier parser XML) cita
  `§RV19/21-3`, que es "Límites de tamaño del importador ICS" — un control
  relacionado pero distinto (tamaño vs. XXE).

**Consecuencia:** hoy no existe en `ACEPTACION.md` ningún criterio
verificable, con comando/evidencia esperada, específico para (a) cifrado de
secretos en reposo con rotación, ni (b) deshabilitación de DTD/entidades
externas. Ambos son controles de seguridad con impacto real (fuga de
credenciales de canal; XXE en cualquier parser XML que se añada más allá del
parser ICS de texto plano) que actualmente solo tienen evidencia de
*diseño*, no un gate de aceptación verificable como el resto del catálogo sí
exige para todo lo demás.

**Corrección obligatoria:** añadir dos criterios de aceptación dedicados
(uno para REQ-141, uno para REQ-155) y corregir la referencia de REQ-143 a
un ítem real o crear uno nuevo.

### BC8 [Bajo] — "RV18 §5.4" no existe como encabezado

`D-006`, `REQ-002` y `BLUEPRINT.md` (línea ~738) citan "RV18 §5.4" para el
punto de que las tools de cancelación/contacto directo no existen en el
catálogo. `RV18-agentes-automatizacion.md` §5 es una lista plana sin
subsecciones numeradas; el contenido citado es el punto 4 de esa lista, no
un encabezado "§5.4". El contenido en sí es correcto y real — es una
imprecisión de numeración heredada del propio módulo RV18 (que en su texto
interno se autorreferencia así en al menos un lugar), no una invención del
blueprint. Corregir a "RV18 §5, punto 4" en las tres citas.

---

## Criterio 5 — Aceptación

**Catálogo de 20 casos adversariales**: `ACEPTACION.md` §Calendario-2
reproduce fielmente, en el mismo orden y sin omisiones, los 20 casos de
`RV21-pruebas-aceptacion.md` §3. Los 16 conceptos exigidos por el encargo
(doble evento, reserva simultánea, eventos desordenados, modificación de
fechas, cancelación, timeout tras éxito remoto, reintento, ACK perdido, feed
malformado/vacío/inaccesible como 3 casos separados, bloqueo manual
superpuesto, UID reciclado, DST, estancias contiguas, crash/replay, límites
API, aislamiento multitenant, privilegios) están todos presentes y con
criterio verificable — más el caso 20 (SSRF), añadido sin ser exigido
explícitamente por el encargo.

### BC11 [Bajo] — Dos discrepancias menores entre ACEPTACION y RV21

- **Caso 18 (multitenant)**: ACEPTACION añade el cuantificador "100% de los
  intentos cross-tenant rechazados", más fuerte de lo que RV21 formula
  ("toda petición... es rechazada") — amplificación no trazable palabra por
  palabra, aunque compatible en espíritu y no exagerada en la práctica.
- **Caso 20 (SSRF)**: ACEPTACION dice solo "rechazada antes de cualquier
  conexión saliente"; RV21 exige explícitamente verificar contra la lista
  completa de rangos de RV19-R-01/02 (169.254.169.254, RFC1918, loopback).
  ACEPTACION pierde esa exigencia concreta — el criterio queda *menos*
  verificable que su fuente, no más.

**Separación de lo que no puede cerrarse sin aprobación externa**:
`ACEPTACION.md` tiene una sección dedicada ("Criterios que NO pueden
cerrarse sin aprobación externa", 10 ítems) que enumera con dueño
identificable (Booking.com, Airbnb, Vrbo/Expedia, contador mexicano, abogado
español) y evidencia exacta requerida para cerrar cada uno — cumple
plenamente lo pedido por el encargo, sin fecha estimada inventada en ningún
caso.

**Verificabilidad general**: los 462 líneas de `ACEPTACION.md` dan comando o
método concreto y evidencia esperada por criterio en prácticamente todos los
casos (excepción: los tres desalineados de BC2). El documento se declara a
sí mismo como "borrador" que no sustituye revisión legal/técnica humana —
calificador honesto, presente en el encabezado y repetido en la sección
Legal-1.

---

## Criterio 6 — Coherencia con Atiende

- **Reutilización de identidad visual/frontend de Restaurantes** (D-015):
  el archivo citado
  `atiende-hoteles-staging/docs/referencia/05-frontend-restaurantes.md`
  **existe realmente** en el filesystem (confirmado por este auditor con
  `find` directo, fuera del alcance de un sub-agente limitado al repo
  auditado). No se pudo leer su contenido línea por línea para confirmar
  cada token de color citado (`224 76% 48%`, etc.) dentro del tiempo de esta
  auditoría, pero la existencia del documento fuente descarta la hipótesis
  de fabricación.
- **Stack compatible con el toolchain local sin Docker** (D-009/D-022):
  verificado — RV17 §10 reporta explícitamente los comandos ejecutados en
  esta máquina (`which docker supabase psql` → no encontrado) y las
  mediciones PGlite/`embedded-postgres`. Único matiz: las cifras
  1344ms/302ms provienen de una medición hecha en `atiende-hoteles-staging`
  (otro proyecto/sesión), no de una re-ejecución fresca en esta
  investigación — `D-022` dice "verificado en esta máquina" de forma que
  sugiere medición propia. Imprecisión de atribución, no de sustancia (la
  máquina es la misma, la medición es real, solo no se repitió). Bajo
  impacto, vale la pena aclarar la fuente exacta en D-022.
- **Simuladores etiquetados explícitamente como tales** (D-019): el diseño
  (nombre inequívoco, URL `simulador.local`, rechazo de arranque con
  credenciales sospechosas de producción, banner en staging, ausencia total
  en producción) está bien especificado y no se encontró ningún lugar donde
  un simulador se presente como conexión productiva real.
- **Nada de mocks presentados como conexiones productivas**: consistente con
  D-017 (estado de conexión honesto, nunca "producción" sin evidencia
  verificable) — el mecanismo de verificación (`getConnectionState()` con
  enum cerrado) aplicaría igual a un simulador mal configurado.

Sin correcciones obligatorias en este criterio más allá de la aclaración
menor de atribución en D-022 (ya contada en Criterio 1 como parte de la
verificación de D-022).

---

## Criterio 7 — Legal/fiscal

Todo lo legal está correctamente tratado como "requisito de revisión" con
fuente oficial o laguna explícita, nunca como asesoría inventada:
- `BLUEPRINT.md` §7 se titula explícitamente "requisitos de revisión" y
  declara que "ninguna se trata como cerrada por esta investigación".
- `REQUISITOS.md` marca 9 requisitos como `bloqueado por laguna legal`
  (CFDI, registro de viajeros España, número de registro UE, retenciones
  ISR/IVA, etc.), cada uno con evidencia parcial + laguna explícita, nunca
  con una cifra o obligación inventada.
- `ACEPTACION.md` §Legal-1 exige explícitamente feature flag en `false` +
  documento de aprobación legal fechado antes de activar cualquier función
  fiscal/legal — mecanismo concreto, no solo una declaración de intención.
- `D-023` formaliza esta regla como decisión de arquitectura no negociable.

### BC3 [Alto] — Cita cruzada incorrecta en D-023

El Contexto de `D-023` dice: *"vigencia post-2024 de las tasas de retención
ISR/IVA en México (`docs/BLOQUEOS.md` B-003/B-004, RV19 §6)"*. Se verificó
`docs/BLOQUEOS.md` directamente:
- **B-003** es "Normativa española de registro no confirmable" (Registro
  Único de Arrendamientos / Orden INT del parte de viajeros) — jurisdicción
  española, no mexicana.
- **B-004** es "Regulación local CDMX de alojamiento turístico no
  verificable" — es sobre CDMX, no sobre tasas fiscales ISR/IVA
  específicamente (aunque están relacionadas por ser México, no es la misma
  laguna).

La laguna fiscal real (vigencia de retención ISR 4%/20% e IVA 50%/100% tras
reformas de 2024/2021, bloqueada por inaccesibilidad de sat.gob.mx como SPA)
sí existe y está bien documentada en `RV19 §6` y en `docs/LAGUNAS.md`
sección 6, pero **no tiene una fila propia en `docs/BLOQUEOS.md`** — el
registro que específicamente hace seguimiento operativo de "bloqueos
activos con intentos documentados y siguiente acción". Como consecuencia,
esta laguna fiscal específica (que bloquea `REQ-126`/CFDI y afecta el
cálculo de neto en owner statements) corre el riesgo de no recibir el mismo
seguimiento activo que B-001 a B-004 sí reciben (reintentos numerados,
"necesita del usuario", fecha de próximo intento).

**Corrección obligatoria:** (a) añadir una entrada B-005 en
`docs/BLOQUEOS.md` dedicada a la vigencia fiscal ISR/IVA México, con el
mismo formato de seguimiento que B-001 a B-004; (b) corregir la cita en
`D-023` para no atribuir esta laguna a B-003/B-004, que tratan de otras dos
jurisdicciones/temas.

### BC4 [Medio] — Error aritmético en REQ-177/RV16-R-06

No es un hallazgo legal/fiscal pero se registra aquí por completitud de
severidad Medio: `RV16-R-06` (heredado literalmente por `REQ-177`) afirma
que el costo de IA por conversación "varía hasta ~5x entre el modelo más
económico y el más caro verificado (GPT-4o mini vs. Claude Opus 5)". La
propia tabla de RV16 §3b da $0.0006 (GPT-4o mini) y $0.0225 (Claude Opus 5)
— la razón real es **37.5x**, no 5x. La cifra "5x" es exacta solo si se
compara Claude Haiku 4.5 ($0.0045) contra Claude Opus 5 ($0.0225), ambos de
Anthropic — un par distinto al citado en el texto. Es un error aritmético
simple, de bajo impacto en el diseño (el punto cualitativo — "el costo varía
mucho entre modelos, por eso se separa el add-on de IA" — sigue siendo
válido con la cifra correcta), pero es una cifra cuantitativa incorrecta
presentada como verificada. Corregir la cifra o la base de comparación en
`RV16-R-06` y `REQ-177`.
