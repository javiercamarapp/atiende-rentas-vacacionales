# Defectos reales encontrados por la suite adversarial (Lote 11A)

Este documento registra defectos **reales del producto** detectados por
`tests/adversarial/` durante el Lote 11A, con reproducción exacta. Regla
del lote (LOTES.md/BACKLOG H-092): si un caso falla por un defecto real,
se deja el test en rojo — nunca se maquilla el resultado ni se relaja la
aserción para forzar verde.

---

## D-ADV-01 — POST /bloqueos cross-tenant responde 500 genérico en vez de un error de autorización clasificado

**Estado: CERRADO** (commit `e976d99`, "fix(api): D-ADV-01 — POST
/bloqueos cross-tenant ya no responde 500 genérico"). Verificado con
ejecución real por el corrector de la ronda final de auditoría-2 — ver
"Evidencia de cierre" al final de esta sección.

**Severidad:** media (no es una fuga de datos ni un bypass de aislamiento
— la escritura SIEMPRE es rechazada y 0 filas se crean — pero viola el
contrato de error de ACEPTACION §Calendario-2 caso 18: "rechazado con
error de autorización").

**Dónde:** `apps/api/src/routes/bloqueos.ts` (`POST /`) vía
`traducirErrorDominio` en `apps/api/src/routes/reservas.ts:142-149`.

**Test que lo reproduce (en rojo a propósito):**
`tests/adversarial/multitenant/casos.test.ts` → caso 18 → `"[DEFECTO] POST
/bloqueos cross-tenant debería responder con un error de autorización
clasificado (403/404), no 500 genérico"`.

**Reproducción exacta:**
1. Dos tenants A y B, cada uno con su propia unidad (`unidadA`,
   `unidadB`) y un `admin_gestora` autenticado en el tenant A.
2. Con el token de `admin_gestora` de A, `POST /bloqueos` con
   `unidadId = unidadB` (una unidad que pertenece al tenant B), un rango
   válido y `razon: "BLOQUEO_PROPIETARIO"`.
3. Resultado observado: **HTTP 500**, cuerpo
   `{"error":{"codigo":"error_interno","mensaje":"No se pudo completar la
   operación"}}`.
4. Resultado esperado por ACEPTACION §Calendario-2 caso 18: un código de
   error de autorización clasificado (403 `rol_forbidden`/
   `tenant_forbidden`, o 404 `recurso_no_encontrado` como sí hace `POST
   /reservas` para el mismo escenario — ver punto 6).
5. Verificación de que NO es una fuga de datos: `SELECT count(*) FROM
   ocupacion_unidad WHERE unidad_id = <unidadB>` devuelve `0` tanto antes
   como después de la petición — la escritura fue rechazada correctamente
   por RLS a nivel de base de datos (`packages/db` migración 0015, policy
   `ocupacion_unidad_escritura`). Este invariante de aislamiento de datos
   se verifica en un `it` separado que SÍ está en verde
   ("...invariante de datos (nunca hay fuga/escritura)").
6. Contraste con el camino que SÍ funciona bien: `POST /reservas` con el
   mismo `unidadId` de otro tenant devuelve **404
   `recurso_no_encontrado`** de forma limpia, porque
   `crearReservaConfirmada` (`packages/domain/src/aplicacion/reservas.ts`)
   hace un `SELECT ... FROM unidad WHERE id = $1` explícito antes de
   insertar, y ese `SELECT` no devuelve filas bajo RLS cross-tenant → el
   mensaje `"unidad ${id} no existe"` SÍ matchea el patrón `/no existe/`
   de `traducirErrorDominio` y se mapea a `recurso_no_encontrado`.
   `crearBloqueo` (mismo archivo) NO hace ese `SELECT` previo — inserta
   directo en `ocupacion_unidad`, así que el único rechazo posible es la
   violación de la política RLS de Postgres en el propio `INSERT`
   ("new row violates row-level security policy for table
   ocupacion_unidad", sin código SQLSTATE reconocido por ninguno de los 3
   patrones de `traducirErrorDominio`), y cae al `catch-all`
   `error_interno` (500).

**Causa raíz:** `traducirErrorDominio` (apps/api/src/routes/reservas.ts:
142-149) solo reconoce 3 patrones de mensaje (`/no existe/`, `/Rango
inválido|inicio < fin|duración mínima/`, `/no se puede cancelar/`) —
nunca aprendió a reconocer una violación de RLS de Postgres
(`error.code === "42501"` insufficient_privilege, o el texto "row-level
security policy"). `crearBloqueo` tampoco hace la verificación explícita
de existencia/pertenencia de la unidad que sí hace `crearReservaConfirmada`.

**Corrección sugerida (fuera del alcance de 11A — carpeta exclusiva de
11B/apps/api):** o bien (a) añadir un `SELECT unidad WHERE id = $1`
explícito al inicio de `crearBloqueo`, igual que
`crearReservaConfirmada`, para que el mismo camino de `"no existe"` →
`recurso_no_encontrado` se dispare de forma consistente; o (b) enseñar a
`traducirErrorDominio` a reconocer `error.code === "42501"` y mapearlo a
`tenant_forbidden`/`rol_forbidden` (403). Cualquiera de las dos cierra
D-ADV-01 sin tocar el comportamiento de aislamiento en sí, que ya es
correcto.

**Impacto en el reporte de Lote 11A:** el caso adversarial 18 se reporta
como **verde** en el catálogo consolidado porque su invariante de
seguridad real (aislamiento de datos: cero fugas, cero escrituras
cross-tenant exitosas, verificado con SQL directo en
`packages/db/test/integration/rls.test.ts` Y con HTTP en
`tests/adversarial/multitenant/casos.test.ts`) se cumple en todos los
caminos probados. D-ADV-01 es un defecto de clasificación de error
(observabilidad/contrato HTTP), documentado aquí y dejado en rojo en su
propio `it`, no una falla del invariante de aislamiento en sí.

---

**Corrección aplicada (commit `e976d99`):** `traducirErrorDominio`
(`apps/api/src/routes/reservas.ts:142-149`) ahora reconoce
`error.code === "42501"` (SQLSTATE insufficient_privilege) y el texto
"row-level security policy" y los mapea a `recurso_no_encontrado` (404) —
mismo criterio que ya usa `POST /reservas` para el idéntico escenario
cross-tenant (404 no confirma ni niega la existencia del recurso al
tenant ajeno). No se tocó `crearBloqueo` ni el invariante de aislamiento
de datos en sí, que ya era correcto (0 filas escritas).

**Evidencia de cierre (ejecución real, ronda final de auditoría-2):**

- `npx vitest run tests/adversarial/multitenant/casos.test.ts` →
  `✓ tests/adversarial/multitenant/casos.test.ts (8 tests)` — **8/8
  verde**, incluido el caso antes en rojo ("POST /bloqueos cross-tenant
  responde con un error de autorización clasificado (403/404), no 500
  genérico (D-ADV-01, cerrado)").
- `npx vitest run apps/api/test/integration/api.test.ts -t "D-ADV-01"` →
  **1/1 verde**, log HTTP real observado:
  `{"metodo":"POST","ruta":"/bloqueos","status":404,...}` (antes:
  `status":500`).
- Invariante de aislamiento de datos (cero filas cross-tenant) confirmado
  sin cambios en `packages/db/test/integration/rls.test.ts`.

## Resumen

| ID | Severidad | Caso adversarial afectado | Estado |
|---|---|---|---|
| D-ADV-01 | media | 18 (aislamiento multitenant, camino de escritura vía POST /bloqueos) | **CERRADO** (commit `e976d99`) — verificado en verde en `tests/adversarial/multitenant/casos.test.ts` y `apps/api/test/integration/api.test.ts` |
