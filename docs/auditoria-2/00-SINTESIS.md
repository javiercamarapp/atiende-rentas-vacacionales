# Síntesis y veredicto — Reverificación independiente de Auditoría 2

**Fuente completa:** `docs/auditoria-2/REVERIFICACION.md`.

## Veredicto

**NO está en condiciones de CIERRE AUDITADO pleno. Requiere UNA ronda
adicional, acotada, de 2 puntos.** Todo lo demás — 16/18 hallazgos de
seguridad, 13/15 de dominio (2 gaps de diseño aceptables), 14/14 de
producto/calidad, la integridad de atribución de 119 commits (B-007), y los
gates de prueba — se verificó de forma independiente con ejecución real
(no por lectura de logs) y quedó **VERIFICADA** sin regresiones ni
correcciones "maquilladas". El bloqueo es un hallazgo **nuevo** encontrado
por esta reverificación, no reportado por ningún auditor ni corrector
anterior.

### Lo que falta para el cierre (prioridad, 1 ronda)

1. **[Alto, nuevo]** `NODE_ENV=""` (cadena vacía explícita) no activa el
   fail-closed de S-02/S-03/S-04/S-11: `apps/api/src/config/env.ts` y
   `packages/sim/src/comun/etiquetado.ts` tratan `valor.trim() === ""` igual
   que ausencia total de la variable, contradiciendo su propio invariante
   documentado. Camino de producción real afectado:
   `apps/api/src/routes/mensajeria/borradores.ts:175`
   (`new SimuladorMensajeria(...)`, sin `entorno`/`ATIENDE_ENTORNO`). Fix
   acotado a esos 2 archivos: distinguir `undefined` de `""` y rechazar
   ambos en producción.
2. **[Medio, ya conocido, no cerrado en esta ronda]** D-ADV-01: `POST
   /bloqueos` cross-tenant responde 500 en vez de 403/404 clasificado
   (`apps/api/src/routes/reservas.ts:142-149`, `traducirErrorDominio` no
   reconoce violación RLS `42501`; `crearBloqueo` no hace el `SELECT`
   previo que sí hace `crearReservaConfirmada`). Sin fuga de datos —
   invariante de aislamiento intacto — pero incumple el contrato de error
   de ACEPTACION §Calendario-2 caso 18.

Ninguno de los dos representa fuga de datos, bypass de aislamiento ni
pérdida de trabajo. Ambos son correcciones acotadas (2 archivos cada uno)
con reproducción exacta ya documentada — estimable en una sola ronda corta.

## Conteos finales

- **Commits en `main`:** 119. **0 archivos perdidos** (forense
  independiente de B-007, verificado con `git show`/`git log`, no por
  confianza en los informes de origen). 1 mezcla real de índice compartido
  (`6d4f2ae`) confirmada sin impacto funcional.
- **Pruebas ejecutadas por el reverificador:** unit 568 (92 archivos),
  integración 135 (15 archivos), adversarial 49 (5 archivos, 1 caso
  intencionalmente en rojo — D-ADV-01), evals de agentes 10/10. Todos los
  gates (`typecheck`, `lint`, `test`, `test:integration`, `test:adversarial`,
  `evals:agentes`, `verificar:lotes`) **VERDES**. `db:verificar-migraciones`
  no ejecutable en este entorno por falta de `DATABASE_URL` (ambiental, no
  un defecto — el mecanismo que audita se verificó por ejecución directa
  del runner).
- **Hallazgos por severidad y estado:**
  - Seguridad: 21 totales — 16 VERIFICADA (corregidos de raíz), 1
    NO-CORREGIDO/aceptable por diseño (S-16), 2 NO-CORREGIDO/aceptable
    informativo (S-19, S-20), **+1 NUEVO** (gap `NODE_ENV=""`, Alto).
  - Dominio: 15 totales — 13 VERIFICADA, 2 GAP-ACEPTABLE (D-DSD-05, D-DSD-08,
    sin código activo).
  - Producto/Calidad: 14 VERIFICADA, 3 no resueltos con juicio de
    "aceptable" (Q-04, Q-06, P-08).
  - Adversarial: 1 defecto abierto conocido, no atendido en esta sesión de
    correcciones (D-ADV-01, Medio).
- **BACKLOG.md:** 95 historias — 91 hecho (7 marcadas "parcial" dentro de su
  propio estado), 4 por hacer (H-048, H-071, H-073, H-091), 0 bloqueada.
- **Criterios de ACEPTACION.md:** ~59 totales; muestra verificada de 18 con
  evidencia rastreable a archivo real — 12 CUMPLIDO, 3 PARCIAL
  (§Finanzas-2 Vrbo, §Operación-3 backup WAL, §Legal-1 fiscal), 1 NO CUMPLIDO
  (§UX-4 accesibilidad, sin axe-core), 1 NO APLICA (§XXE, sin parser XML),
  y 6+ PENDIENTE-EXTERNO explícitamente etiquetados como tales.

## Credenciales / homologaciones / revisiones pendientes (no cerrables por ingeniería)

- **B-002:** homologación Booking.com (Connectivity Partner, pausada por el
  propio canal) y Vrbo Connectivity Partner Program.
- **B-003:** revisión legal española (Registro Único de Arrendamientos,
  Orden INT parte de viajeros).
- **B-004:** verificación de regulación local CDMX.
- **B-005:** confirmación de un fiscalista mexicano sobre tasas de
  retención ISR/IVA vigentes (bloquea cualquier calculadora fiscal).
- Revisión legal/ARCO-RGPD firmada (§RV19/21-9) y confirmación de activación
  del régimen UE 2024/1028 por jurisdicción (§RV19/21-11).

Ninguno de estos es resoluble con más ingeniería dentro del repo; todos
están correctamente etiquetados como PENDIENTE-EXTERNO, sin ningún intento
de cerrarlos artificialmente.
