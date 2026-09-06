# Reporte de pruebas de carga — Lote 11A (BACKLOG H-093)

Generado a partir de una corrida real de `npm run test:load`
(`tests/load/run.mjs` → `docs/logs/load-resultado.json` +
`docs/logs/lote11a-load.log`, ambos versionados junto a este reporte).
Corrida de referencia: 2026-09-06T10:46:16.858Z.

## ⚠️ Estos números NO son SLO publicables antes de piloto (§Plan-1)

`docs/ACEPTACION.md` §Plan-1 y `docs/investigacion/RV21-pruebas-aceptacion.md`
§2.3/§6.4/RV21-R-06 son explícitos: **ningún objetivo de carga/latencia se
publica como SLA/SLO comprometido antes de completar al menos un ciclo de
piloto con datos reales de al menos dos semanas**. Las cifras de este
documento son:

- Medidas en **una sola máquina de desarrollo** (ver "Hardware" abajo), no
  en la infraestructura de producción real.
- Medidas contra **simuladores locales** (`127.0.0.1`, mismo proceso), no
  contra los canales reales (Airbnb/Vrbo/Booking.com) — la latencia por
  canal real (Airbnb ~3h, Vrbo ~30min, ambas fuera del control del
  producto, RV21 §2.2/RV03) **no está incluida** en ninguna cifra de este
  reporte.
- Medidas con **volúmenes sintéticos moderados** (decenas/cientos de
  unidades y ciclos), no con el volumen real de ningún tenant de
  producción.
- Un **único corrida** por escenario, no una serie estadísticamente
  robusta de corridas a lo largo de días/semanas.

Este reporte responde a BACKLOG H-093 ("suite de carga del importador con
objetivos calibrados en piloto, nunca a priori"): demuestra que la suite
existe, es ejecutable, y produce números reales y reproducibles — no fija
ningún compromiso de rendimiento. Los objetivos reales se calibrarán en
Fase 1 (piloto de un canal real, RV21 §5) con datos de al menos dos
semanas de operación.

## Hardware de la corrida de referencia

| Campo | Valor |
|---|---|
| Plataforma | darwin (macOS) |
| Arquitectura | arm64 |
| CPU | Apple M4 |
| Núcleos lógicos | 10 |
| Memoria total | 16 GiB |
| Node.js | v25.6.1 |
| PostgreSQL | 18.4 embebido (`embedded-postgres`, D-009) |

(Cada escenario reporta su propio bloque `hardware` en
`docs/logs/load-resultado.json` — coinciden porque las 3 corridas de
referencia se ejecutaron en la misma máquina en la misma sesión.)

---

## Escenario (a) — Importación concurrente de N feeds iCal

**Qué mide:** latencia INTERNA (RV21 §2.2: fetch del feed → `COMMIT` en
`ocupacion_unidad`, la única parte de la latencia total que el producto
controla — nunca la latencia por canal externo, que es un dato de
RV03/RV21 fuera del alcance de este script) bajo concurrencia real (una
conexión `pg` independiente por cada ciclo, no una sola conexión
serializando queries), y ausencia de overbooking bajo esa concurrencia.

**Parámetros:** 50 unidades × 3 canales = 150 ciclos de import
concurrentes (el tamaño de muestra sugerido por LOTES.md/el encargo del
lote).

| Métrica | Valor |
|---|---|
| Ciclos totales | 150 |
| Duración total (pared) | 2102 ms |
| Throughput | 71.36 ciclos/s |
| Latencia interna p50 | **5 ms** |
| Latencia interna p95 | **10 ms** |
| Latencia interna p99 | 16 ms |
| Latencia interna mínima / máxima | 4 ms / 17 ms |
| Ciclos fallidos | 0 |
| Overbooking detectado | **no** |
| Conflictos de calendario registrados | 0 (esperado: rangos disjuntos por diseño, ver supuestos) |

**Lectura honesta:** 5-10 ms de latencia interna es una cifra dominada
casi enteramente por la ida y vuelta de red loopback + el trabajo de
Postgres local (parseo ICS + `INSERT`/`SELECT` + `COMMIT`), no por ningún
cuello de botella algorítmico. RV21 §6.4 ya anticipaba esto: "el cuello
de botella dominante es la cadencia de refresco del canal externo
(horas), no el procesamiento interno" — este resultado es consistente
con esa hipótesis, pero **con una muestra de 150 ciclos en una sola
corrida**, no es evidencia suficiente para fijar un SLO.

---

## Escenario (b) — Ráfaga de reservas directas concurrentes sobre la misma unidad

**Qué mide:** el caso de contención más duro posible — N conexiones
reales compitiendo por EL MISMO rango de fechas de LA MISMA unidad
(extiende a escala el entregable verificable de H-005/Lote 1, que prueba
esto mismo con solo 2 conexiones). Verifica OWASP ASVS 2.3.4: exactamente
1 transacción gana, el resto falla limpiamente con `23P01`
(`exclusion_violation`), nunca `40P01` (deadlock).

**Parámetros:** 30 conexiones `pg` concurrentes.

| Métrica | Valor |
|---|---|
| Conexiones concurrentes | 30 |
| Duración total (pared) | 40 ms |
| Ganadores | **1** |
| Perdedores | **29** |
| Códigos SQLSTATE de los perdedores | `["23P01"]` (únicamente) |
| Deadlocks detectados (`40P01`) | **0** |
| Filas activas finales en la unidad | **1** |
| Latencia de transacción p50 / p95 | 24 ms / 38 ms |

**Lectura honesta:** el resultado es exactamente el esperado por diseño
(`pg_advisory_xact_lock` serializa las 30 transacciones que compiten por
la misma unidad, así que la única que llega primero al `INSERT` gana y
las 29 restantes ven una fila ya confirmada → `23P01` limpio, nunca
`40P01`). Esto confirma que el mecanismo de Lote 1 (D-012, corrección
BC1) escala de 2 a 30 conexiones sin cambiar de comportamiento — no es
una medición de "cuántas reservas por segundo soporta el sistema", que
requeriría un patrón de tráfico realista sobre MUCHAS unidades distintas
(ver escenario (a) para eso).

---

## Escenario (c) — Reconciliación completa con drift sembrado

**Qué mide:** corrección y costo de aplicar `reconciliarCompleto`
(H-032) sobre un volumen de 500 UIDs activos con 10% de drift sembrado
deterministamente, más el invariante H-018/caso adversarial 5 A ESCALA
(cancelar una reserva "a la deriva" nunca reabre una noche que un
bloqueo de propietario deliberadamente solapado sigue cubriendo, en 1 de
cada 3 de los casos de drift).

**Parámetros:** 50 unidades × 10 reservas = 500 activos internos, 10% de
drift sembrado (50 UIDs).

| Métrica | Valor |
|---|---|
| Total activos internos | 500 |
| Drift sembrado | 50 |
| Drift detectado por `reconciliarCompleto` | **50** (exacto, sin falsos positivos/negativos) |
| Duración de la siembra (IO real, 500 reservas) | 184 ms |
| Duración de `reconciliarCompleto` (CPU pura, sin IO) | 1 ms |
| Duración de aplicar 50 cancelaciones (IO real, transaccional) | 11 ms |
| Promedio por cancelación | 0.22 ms |
| Violaciones del invariante H-018 detectadas | **0** |

**Lectura honesta:** `reconciliarCompleto` es `Array.filter` + `Set.has`
— su costo es, por diseño, lineal y trivialmente rápido incluso a
volúmenes mucho mayores que 500; el número interesante de este escenario
no es "qué tan rápido" sino que el drift detectado coincide EXACTAMENTE
con el sembrado y que el invariante de no-reapertura (H-018) se mantiene
en el 100% de los casos verificados, incluyendo los que tenían un
bloqueo de propietario superpuesto.

---

## Resumen para el criterio de aceptación de Lote 11 (`npm run test:adversarial && npm run test:load`)

Los 3 escenarios de H-093 se ejecutan de punta a punta con
`npm run test:load` (orquestador `tests/load/run.mjs`), cada uno contra
su propio cluster `embedded-postgres` efímero, y producen este reporte +
`docs/logs/load-resultado.json` (datos crudos) +
`docs/logs/lote11a-load.log` (log de ejecución completo). Ningún
escenario reveló un defecto de producto — el único hallazgo de esta
sesión (D-ADV-01, clasificación de error HTTP en `POST /bloqueos`
cross-tenant) está documentado en `docs/auditoria-2/defectos-adversarial.md`
y proviene de la suite adversarial, no de la suite de carga.
