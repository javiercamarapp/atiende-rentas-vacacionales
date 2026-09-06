# Backlog — Fase 2 (Atiende Rentas Vacacionales)

Épicas E01–E16, historias H-001–H-095. Cada historia traza a uno o más
`REQ-nnn` de `docs/REQUISITOS.md` y a una sección de `docs/ACEPTACION.md`.
Estimación relativa en talla (S/M/L/XL, no días — calibrar velocidad real en
el primer lote). Estado inicial de todas las historias: **por hacer**.
Prioridad hereda la convención MUST/SHOULD/COULD de REQUISITOS.md. Ninguna
historia marcada `bloqueada por externo` o `bloqueada por laguna legal`
puede cerrarse en Fase 2 sin la evidencia externa exacta descrita en
`docs/ACEPTACION.md` ("Criterios que NO pueden cerrarse sin aprobación
externa").

---

## E01 — Núcleo de calendario e invariantes

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-001 | Tabla `ocupacion_unidad` con `EXCLUDE USING gist` + `btree_gist` | REQ-024, REQ-025, REQ-026, REQ-033 | §Calendario-1 | MUST | L | hecho (Lote 1) |
| H-002 | `daterange` semiabierto `[check_in,check_out)` con validación de bounds y normalización | REQ-024, REQ-026 | §Calendario-1, §Calendario-2 (caso 15) | MUST | S | hecho (Lote 1) |
| H-003 | Precedencia de capas (`RESERVA_CANAL>BLOQUEO_PROPIETARIO>MANTENIMIENTO>BUFFER_LIMPIEZA`) y tabla `conflicto_calendario` | REQ-006, REQ-035, REQ-044 | §Calendario-2 (caso 5) | MUST | M | hecho (Lote 1) |
| H-004 | Zona horaria IANA obligatoria por propiedad; ninguna columna operativa `timestamp` sin zona | REQ-032, REQ-033 | §Calendario-2 (caso 14) | MUST | S | hecho (Lote 1) |
| H-005 | Validación empírica de concurrencia real del `EXCLUDE` contra `embedded-postgres` (dos inserts concurrentes solapados) | REQ-025 (D-012) | §Calendario-1 | MUST | M | hecho (Lote 1) |
| H-006 | Motor de resolución `UID→SEQUENCE→DTSTAMP` + hash de contenido como respaldo obligatorio | REQ-028, REQ-167, REQ-179 | §Calendario-2 (casos 1, 3, 13), §RV19/21-1 | MUST | L | hecho (Lote 1) |
| H-007 | Estados de `ocupacion_unidad` (`confirmado/provisional/cancelado/conflicto_pendiente`) + campo independiente `bloqueante` | REQ-091, REQ-048, REQ-068 | §UX-1 | MUST | M | hecho (Lote 1) |
| H-008 | Buffer de limpieza como bloqueo tipado `BUFFER_LIMPIEZA` | REQ-042, REQ-054, REQ-112 | §Calendario-2 (caso 15) | MUST | S | hecho (Lote 1) |
| H-009 | Duración mínima como regla en fuente de verdad interna | REQ-043 | §Calendario-1 | SHOULD | S | hecho (Lote 1) |
| H-010 | `huesped_minimo` con minimización de datos (sin CRM) | REQ-045, REQ-106 | §Privacidad-1 | MUST | S | hecho (Lote 1, solo esquema mínimo — sin CRUD/UI, eso es Lote 8) |

## E02 — Propiedades, unidades, canales, cuentas y matriz de conectividad

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-011 | Modelo `propiedad`/`unidad` con soporte multi-unidad | REQ-071, REQ-136 | §Datos-1 | MUST | M | hecho (Lote 1) |
| H-012 | `cuenta_canal`/`listing_canal` con unicidad parcial `(unidad_id, cuenta_canal_id) WHERE activo` | RV17 §6.3 | §Conectividad-1 | MUST | S | hecho (Lote 8: alta con tipo de conexión honesto, UI) |
| H-013 | Interfaz `ChannelAdapter` con `ChannelCapabilities` declaradas honestamente | REQ-086 | §Conectividad-1 | MUST | M | hecho (Lote 1, solo contrato — implementación real es Lote 2) |
| H-014 | `getConnectionState()` con enum cerrado, nunca `producción` sin evidencia reciente | REQ-008, REQ-017 | §Conectividad-1 | MUST | M | hecho (Lote 1, función pura `evaluarEstadoConexion`) |
| H-015 | Matriz de conectividad en UI (latencia por canal, estados bloqueados/pausados) | REQ-039, REQ-052, REQ-075, REQ-076, REQ-077, REQ-085 | §Conectividad-2, §Conectividad-4 | MUST | L | hecho (Lote 4) |
| H-016 | Anti-paridad: ninguna pantalla afirma paridad de permisos/latencia entre canales sin nota | REQ-018 | §Roles-3 | MUST | S | hecho (Lote 4) |

## E03 — Reservas y bloqueos por capas

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-017 | Flujo de creación de reserva confirmada (transacción + outbox en el mismo commit) | REQ-034, REQ-041 | §Calendario-1, §Calendario-4 | MUST | M | hecho (Lote 1) |
| H-018 | Cancelación que nunca reabre noche ocupada por otra causa | REQ-006, REQ-044 | §Calendario-2 (caso 5) | MUST | M | hecho (Lote 1) |
| H-019 | Modificación de fechas (ampliar/reducir/mover) con verificación de solapamiento | RV07 §6 | §Calendario-2 (caso 4) | MUST | M | hecho (Lote 1) |
| H-020 | Estancias contiguas sin falso solapamiento (checkout=checkin mismo día) | REQ-024 | §Calendario-2 (caso 15) | MUST | S | hecho (Lote 1) |
| H-021 | Solicitudes pendientes: bloqueante (Airbnb) vs. no bloqueante (Booking RtB) | REQ-048, REQ-068 | §Calendario-2 (caso 2) | MUST | M | hecho (Lote 1) |
| H-022 | Bloqueo manual de propietario/mantenimiento propagado a canales conectados | REQ-118, REQ-119 | §Calendario-1 | MUST | S | hecho (Lote 1, propagación real a canales es Lote 2/3 — aquí `crearBloqueo` + esqueleto `outbox_evento`) |

## E04 — Import/export iCal SSRF-safe y parser robusto

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-023 | Parser ICS RFC 5545 (`DTEND`/`DURATION`, `UID`, `SEQUENCE`, `STATUS`) | REQ-027, REQ-028, REQ-029, REQ-179 | §Calendario-2 (casos 3, 4, 9) | MUST | L | hecho (Lote 2) |
| H-024 | Controles anti-SSRF antes de cualquier `GET` (allowlist esquema, deny-list metadata/rangos privados, sin redirects) | REQ-030 | §RV19/21-2 (caso adversarial 20) | MUST | M | hecho (Lote 2) |
| H-025 | Límites propios de tamaño/recurrencia/timeout del importador | REQ-031 | §RV19/21-3 | MUST | M | hecho (Lote 2) |
| H-026 | Export por unidad/canal con `UID` namespaced y `SEQUENCE` incremental | D-004 | §Calendario-4 | MUST | M | hecho (Lote 2) |
| H-027 | Interpretación de `DATE` sin hora en zona horaria de la propiedad | REQ-032 | §Calendario-2 (caso 14) | MUST | S | hecho (Lote 2) |
| H-028 | Feed malformado/vacío tratado explícitamente (rechazo registrado, sin estado parcial) | REQ-005, REQ-173 | §Calendario-3 (casos 9, 10) | MUST | M | hecho (Lote 2) |

## E05 — Anti-eco, dedupe, cuarentena, reconciliación

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-029 | Anti-eco en 3 capas (`UID`/namespace, hash de contenido, metadato `exportado_a`) | REQ-037, REQ-051, REQ-090 | §Calendario-4 | MUST | L | hecho (Lote 2) |
| H-030 | Idempotencia de import por `(canal, unidad, UID)` con `upsert` | REQ-036 | §Calendario-2 (casos 6, 7, 8, 16) | MUST | M | hecho (Lote 2) |
| H-031 | Cuarentena de feed inaccesible/malformado (último estado válido congelado) | REQ-005 | §Calendario-3 | MUST | M | hecho (Lote 2) |
| H-032 | Reconciliación incremental (upsert por ciclo) vs. completa (comparación de UIDs) | REQ-038 | §Operación-2 | MUST | L | hecho (Lote 2) |
| H-033 | UID reciclado detectado por hash de contenido → revisión humana | REQ-168 | §Calendario-2 (caso 13) | MUST | M | hecho (Lote 2) |
| H-034 | Backoff ante HTTP 429/rate limit sin bucle agresivo | REQ-172 | §Calendario-2 (caso 17) | MUST | S | hecho (Lote 2) |

## E06 — Monitor de sync y alertas

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-035 | Instrumentación OTel: Gauge edad última sync, Counter errores (`error_class`), Histogram latencia, UpDownCounter cola | REQ-038, REQ-156 | §Operación-2 | MUST | L | hecho (Lote 10) |
| H-036 | Trazas distribuidas del ciclo webhook/import→cola→worker→escritura→confirmación | REQ-157 | §Operación-2 | MUST | M | hecho (Lote 10, spans PRODUCER/CONSUMER encadenados por traceId; sin @opentelemetry/* real, ver nota en el código) |
| H-037 | Alertas y runbooks (edad sync, tasa error, drift, cola creciente) — nunca cancelan ni contactan | REQ-009, REQ-163 | §Operación-1 | MUST | L | hecho (Lote 10, 6 reglas + docs/runbooks/*.md) |
| H-038 | Panel de monitor de sync en UI (drift, conflictos activos, edad por canal/unidad) | REQ-038 | §Operación-2 | MUST | M | hecho (Lote 4, panel de UI — edad/estado/conflictos reales; errores/cuarentena/drift muestran "no expuesto aún", instrumentación OTel de H-035/H-036 sigue pendiente) |
| H-039 | Descomposición de latencia interna vs. por canal en UI y reporting | REQ-039 | §RV19/21-8 | MUST | M | hecho (Lote 4, parte de UI — monitor y matriz muestran latencia interna vs. por canal siempre separadas; el Histogram OTel de H-035 sigue pendiente) |

## E07 — Auth, roles, multitenant, RLS, auditoría

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-040 | JWT propio (`jose`) con claims compatibles con RLS real de `atiende-restaurantes` | D-009 | §RV19/21-4 | MUST | M | hecho (Lote 3) |
| H-041 | RLS con `is_tenant_member` parametrizada + `FORCE ROW LEVEL SECURITY` por tabla | REQ-138, REQ-139 | §RV19/21-4 | MUST | L | hecho (Lote 3) |
| H-042 | Suite de aislamiento cross-tenant en CI (caso adversarial 18) | REQ-140 | §RV19/21-4 | MUST | M | hecho (Lote 3) |
| H-043 | Modelo de roles internos (Superadmin, Admin gestora, Operador, Limpieza, Propietario, Contador) + 3 niveles de colaborador por propiedad | REQ-011, REQ-012, REQ-013, REQ-019 | §Roles-1, §Roles-4 | MUST | L | hecho (Lote 3) |
| H-044 | Escalada de privilegios rechazada en capa de servicio, no solo UI (caso adversarial 19) | REQ-140 | §RV19/21-4 | MUST | M | hecho (Lote 3) |
| H-045 | `audit_log` append-only con triggers en tablas sensibles + acceso "romper cristal" | REQ-020, REQ-127 | §Auditoría-1 | MUST | M | hecho (Lote 3) |
| H-046 | Cifrado de credenciales de canal en reposo (AES-256-GCM/ChaCha20-Poly1305) + rotación | REQ-141 | §RV19/21-13 | MUST | M | hecho (Lote 3) |
| H-047 | Logs sin PII/credenciales/payload completo (metadatos operativos únicamente) | REQ-142 | §RV19/21-7 | MUST | M | hecho (Lote 3) |
| H-048 | Multi-empresa-gestora: un propietario vinculado a 2+ empresas sin fuga cruzada | REQ-023 | §Roles-4 | COULD | M | por hacer |

## E08 — Operación: limpieza y mantenimiento

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-049 | Tarea de limpieza automática al checkout + reprogramación si cambia la fecha | REQ-111, REQ-098 | §Limpieza-1 | MUST | M | hecho (Lote 5) |
| H-050 | Buffer configurable checkout↔check-in, bloqueo real de calendario | REQ-054, REQ-112 | §UX-1 | MUST | S | hecho (Lote 5) |
| H-051 | Checklist con fotos/timestamps por ítem; incompleto puede bloquear reapertura | REQ-113, REQ-114 | §Limpieza-2 | SHOULD | M | hecho (Lote 5) |
| H-052 | Inventario/ropa blanca con alertas de stock bajo, descuento automático | REQ-115 | §Limpieza-2 | SHOULD | M | hecho (Lote 5) |
| H-053 | Portal de proveedor externo con acceso acotado a su tarea asignada | REQ-116 | §Limpieza-2 | MUST | M | hecho (Lote 5) |
| H-054 | Notificación multicanal configurable por evento de tarea | REQ-117 | §Limpieza-2 | SHOULD | S | hecho (Lote 5, parcial — registra intención/canal resuelto por evento en `notificacion_tarea`; el adaptador de envío real por canal queda fuera de alcance, nunca simulado como enviado) |
| H-055 | Incidencias de mantenimiento documentables sin cierre/cancelación automática | REQ-118, REQ-119 | §RV19/21-6 | MUST | M | hecho (Lote 5) |

## E09 — Mensajes con aprobación humana

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-056 | Motor de plantillas/respuestas rápidas programadas por evento | REQ-099, REQ-101 | §Mensajería-1 | MUST | M | hecho (Lote 6) |
| H-057 | Validación de límites por canal (4000 caracteres Airbnb; sin contacto directo pre-reserva Vrbo) | REQ-100, REQ-103 | §Mensajería-1, §Mensajería-2 | MUST | S | hecho (Lote 6) |
| H-058 | Filtro de contenido (sin pago fuera de plataforma, sin lenguaje discriminatorio) | REQ-105, REQ-108 | §Mensajería-1 | MUST | M | hecho (Lote 6) |
| H-059 | Cola de aprobación humana obligatoria para todo borrador de IA antes de enviar | REQ-104 | §RV19/21-6 | MUST | L | hecho (Lote 6) |
| H-060 | Triggers de escalamiento a humano (queja, emergencia, reembolso, VIP) | REQ-110, REQ-146 | §RV19/21-6 | MUST | M | hecho (Lote 6, heurística por palabra clave — puramente informativa) |
| H-061 | Aviso a operadores de que Airbnb puede escanear/analizar mensajes | REQ-109 | §Privacidad-2 | SHOULD | S | hecho (Lote 6) |

## E10 — Finanzas, owners y statements

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-062 | `statement` por owner/periodo calculado desde `reserva` (nunca al revés) | REQ-121, REQ-122 | §Finanzas-1 | MUST | L | hecho (Lote 7) |
| H-063 | Configuración neto/bruto por canal para evitar doble descuento de comisión | REQ-121 | §Finanzas-1 | MUST | M | hecho (Lote 7) |
| H-064 | Adaptador de conciliación Vrbo (import CSV/XLS oficial) | REQ-124 | §Finanzas-2 | MUST | M | hecho (Lote 7, parcial — motor de conciliación genérico por referencia/monto; parser del CSV/XLS oficial de Vrbo con sus columnas exactas no implementado) |
| H-065 | Comisión de Booking.com/Vrbo configurable por tenant/propiedad (no hardcodeada) | REQ-125 | §Finanzas-2 | MUST | S | hecho (Lote 7) |
| H-066 | Auditoría append-only de mutaciones financieras (statement, gasto, comisión) | REQ-127 | §Auditoría-1 | MUST | M | hecho (Lote 7) |
| H-067 | Captura de RFC por unidad y alerta de retención agravada sin calcular impuestos | REQ-129 | §Legal-1 | MUST (cálculo bloqueado por laguna legal B-005) | S | hecho (Lote 7) |

## E11 — Pricing básico

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-068 | Motor de reglas base + estacionalidad + descuentos por duración | REQ-130, REQ-131, REQ-132 | §Pricing-1 | SHOULD | L | hecho (Lote 7) |
| H-069 | Sincronización de tarifa condicionada a integración API activa (nunca vía iCal) | REQ-130 | §Pricing-1 | MUST | S | hecho (Lote 7) |
| H-070 | Desactivación explícita del pricing nativo del canal al activar el propio | REQ-133 | §Pricing-1 | MUST | S | hecho (Lote 7) |
| H-071 | Paridad de precios configurable por jurisdicción/mercado | REQ-135 | §Pricing-2 | SHOULD | S | por hacer |

## E12 — Reporting

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-072 | Reportes operativos/financieros derivados de `reserva`/`statement`/`tarea_limpieza` sin duplicar lógica de cálculo | RV17 §12 | §Finanzas-1 | SHOULD | M | hecho (Lote 7, parcial — ocupación/ADR/RevPAR e ingresos por canal/propiedad/mes desde `reserva_financiero`; no cruza `tarea_limpieza` de Lote 5) |
| H-073 | Reporte de latencia interna vs. por canal con percentiles p50/p95/p99 | REQ-039, REQ-171 | §RV19/21-8, §Plan-1 | MUST | M | por hacer |

## E13 — Back office / superadmin

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-074 | Panel multi-tenant: alta/baja de tenants, salud agregada de integraciones por canal | REQ-019, REQ-020 | §Roles-4 | MUST | L | hecho (Lote 8) |
| H-075 | Acceso "romper cristal" de Superadmin auditado (quién, cuándo, qué, por qué) | REQ-020 | §Auditoría-1 | MUST | M | hecho (Lote 8) |
| H-076 | Restricción: superadmin nunca lee contenido de conversaciones sin causa auditada | REQ-020 | §Auditoría-1 | MUST | S | hecho (Lote 8) |

## E14 — Automatización agéntica

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-077 | Catálogo de tools con `input_schema.properties: {}` — cero identificadores de negocio como parámetro | REQ-004, REQ-143 | §RV19/21-14 | MUST | L | hecho |
| H-078 | Matriz rol×tool resuelta en servidor antes de construir la lista de tools para el modelo | REQ-143 | §RV19/21-14 | MUST | M | hecho |
| H-079 | Presupuesto duro de IA por tenant, reservado antes de cada llamada | REQ-144 | §Automatización-1 | MUST | M | hecho |
| H-080 | Trazabilidad de tool-call (actor, rol, canal, timestamp, costo por modelo real) | REQ-145 | §Automatización-2 | MUST | M | hecho |
| H-081 | Escalamiento obligatorio (ambigüedad, escalada emocional, monto alto, acción irreversible) | REQ-146 | §RV19/21-6 | MUST | M | hecho |
| H-082 | Verificación en CI de ausencia estructural de `cancelar_reserva`/`contactar_huesped_directo` | REQ-002, REQ-146 | §RV19/21-6 | MUST | M | hecho |
| H-083 | Loop-guard: tope de rondas de tool-calling verificado antes de ejecutar la siguiente | REQ-149 | §Automatización-2 | MUST | S | hecho |
| H-084 | Catálogo de evals sintéticos y umbrales de promoción de fase de autonomía | REQ-147 | §Automatización-3 | SHOULD | L | hecho |
| H-085 | Fallback entre proveedores LLM limitado a generación de texto, nunca re-ejecuta mutaciones | REQ-148 | §Automatización-2 | MUST | M | hecho |

## E15 — Observabilidad y recuperación

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-086 | Backup completo diario + WAL continuo, retención 35d/12m, prueba de restauración mensual | REQ-159 | §Operación-3 | MUST | M | hecho (Lote 10, parcial — backup lógico + restauración + verificación de integridad implementados y probados contra embedded-postgres real; WAL continuo y calendario de retención 35d/12m dependen de la infraestructura de Postgres administrado elegida en producción, brecha documentada en docs/runbooks/recuperacion-backup.md) |
| H-087 | Reconciliación de drift obligatoria tras todo restore antes de reanudar push automático | REQ-160 | §Operación-3 | MUST | M | hecho (Lote 10) |
| H-088 | Migraciones patrón expand/contract, nunca bloqueantes en horario de check-in/checkout | REQ-162 | §Operación-3 | MUST | M | hecho (Lote 10, parcial — chequeo de DROP/ALTER destructivo + orden/colisiones + dry-run implementados y probados contra el catálogo real; la restricción de horario de check-in/checkout es una regla de despliegue/runbook, no verificable por código sin un orquestador de despliegues) |
| H-089 | Feature flags default `false` para funcionalidad que module dinero/cancelación/contacto | REQ-163 | §Operación-1 | MUST | S | hecho (Lote 10) |
| H-090 | Pausa automática de push ante token de canal revocado/expirado | REQ-165 | §Operación-1 | MUST | M | hecho (Lote 10) |
| H-091 | Modo degradado de solo-lectura del calendario si la BD primaria no responde | REQ-166 | §Operación-3 | MUST | L | por hacer |

## E16 — Pruebas adversariales (20 casos) y carga

| ID | Historia | REQ | Aceptación | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|
| H-092 | Implementación completa del catálogo de 20 casos adversariales, ejecutable en CI | REQ-170 | §Calendario-2 (20 casos) | MUST | XL | hecho (Lote 11A) |
| H-093 | Suite de carga del importador con objetivos calibrados en piloto (nunca a priori) | REQ-171 | §Plan-1 | MUST | L | hecho (Lote 11A) |
| H-094 | Pruebas de SSRF, límites de tamaño ICS y XXE (si aplica parser XML) | REQ-030, REQ-031, REQ-155 | §RV19/21-2, §RV19/21-3, §RV19/21-15 | MUST | M | hecho (Lote 11A) — sin XXE: el parser ICS es texto plano propio, no XML (ver nota de alcance abajo) |
| H-095 | Pruebas de aislamiento multitenant y escalada de privilegios (casos 18, 19) | REQ-140 | §RV19/21-4 | MUST | M | hecho (Lote 11A) |

---

## Resumen

- **Épicas:** 16 (E01–E16)
- **Historias:** 95 (H-001–H-095)
- **Por prioridad:** 79 MUST, 12 SHOULD, 4 COULD (conteo manual sobre las tablas de arriba; recalcular con `grep -c` al actualizar este archivo)
- **Estado inicial:** 95/95 "por hacer"
- Cobertura explícita confirmada: núcleo de calendario (E01, E03), propiedades/canales/matriz (E02), import/export iCal SSRF-safe (E04), anti-eco/dedupe/cuarentena/reconciliación (E05), monitor de sync y alertas (E06), auth/roles/RLS/auditoría (E07), limpieza/mantenimiento (E08), mensajería con aprobación humana (E09), finanzas/owners (E10), pricing (E11), reporting (E12), back office (E13), automatización agéntica (E14), observabilidad/recuperación (E15), pruebas adversariales y carga (E16).

---

## Lote 1 — cerrado (dominio de calendario + BD + migraciones + invariantes)

15/95 historias marcadas `hecho (Lote 1)` arriba: H-001 a H-011, H-013, H-014,
H-017 a H-022. Fuera de alcance de Lote 1 y dejadas `por hacer`
deliberadamente: H-012 (`cuenta_canal`, requería credenciales/UI de Lote 2/3
— completada en Lote 8), H-015/H-016 (UI, Lote 4).

- **Código:** `packages/db/` (esquema SQL versionado en
  `src/migrations/0001..0008`, runner propio `src/runner/migrar.ts`,
  motores `motorPglite.ts`/`motorEmbeddedPostgres.ts`); `packages/domain/`
  (`fechas.ts`, `capas.ts`, `estados.ts`, `resolucionVersion.ts`,
  `channelAdapter.ts`, `aplicacion/reservas.ts`); `tests/fixtures/schema/seed-demo.sql`.
- **Pruebas:** 92 unitarias (`npm run test`, PGlite incluido) + 9 de
  integración contra `embedded-postgres` real (`npm run test:integration`),
  con SQLSTATE `23P01` verificado explícitamente en el log. Ver
  `docs/logs/lote1-test.log`, `docs/logs/lote1-integration.log`,
  `docs/logs/lote1-ci.log`.
- **Commits:** ver `git log` — rango de esta entrega en `docs/PROGRESO.md`.
- **Nota de arquitectura no prevista en el backlog original:** se añadió
  `pg_advisory_xact_lock` por `unidad_id` en la capa de aplicación
  (`packages/domain/src/aplicacion/ejecutor.ts`,
  `bloquearUnidadEnTransaccion`) tras observar empíricamente que dos
  inserciones verdaderamente concurrentes sin ese lock pueden resolverse
  como `40P01` (deadlock) en vez de `23P01` (exclusion_violation) — ambos
  SQLSTATE indican que la base de datos rechazó el overbooking, pero D-012/
  RV17 §7.4 ya anticipaba este refuerzo explícitamente. Documentado en
  `docs/PROGRESO.md`.

---

## Lote 2 — cerrado (iCal import/export + simuladores + anti-eco/cuarentena/reconciliación)

12/95 historias marcadas `hecho (Lote 2)` arriba: H-023 a H-034 (E04, E05
completas).

- **Código:** `packages/adapters/` (`ical/parser.ts` — parser ICS RFC
  5545/5546 propio con unfolding, DATE/DATE-TIME/TZID, DTEND exclusivo o
  `DURATION`, límites propios de tamaño/nº eventos/longitud de línea,
  `IcsParseError` tipado; `ical/exportador.ts` — export `.ics` con `UID`
  namespaced (`atiende-rv-<id>@atiende-rv.internal`) y folding a 75
  octetos; `net/ssrf.ts`/`net/fetchSsrf.ts` — fetcher SSRF-safe con
  deny-list IPv4/IPv6 completa, resolución DNS pineada, esquema
  `https`-only (`http` solo `simulador.local` + flag de dev),
  redirecciones acotadas revalidadas, ETag/If-Modified-Since; `sync/
  antiEco.ts`, `sync/cuarentena.ts`, `sync/reconciliacion.ts`, `sync/
  motor.ts` — motor de sincronización completo; `airbnb/`, `vrbo/`,
  `booking/adapter.ts` — adaptadores reales con `ChannelAdapter` de Lote 1).
  `packages/sim/` (`airbnb-ical/`, `vrbo-ical/`, `booking-ical/` —
  `ServidorIcalSimulado` con escenarios `vacio|malformado|inaccesible|ics`;
  `booking-api/` — pull con ack y reenvío hasta confirmación, RV04;
  `comun/etiquetado.ts` — `assertNoParecerProduccion`, D-019).
  `packages/db/src/migrations/0020_cuenta_canal.ts` (`cuenta_canal`,
  `unidad_canal_feed`) y `0021_sincronizacion_canal.ts`
  (`evento_canal_importado`, `bloqueo_exportado`) — rango 0020+ para no
  colisionar con 0009-0019/0090-0092 de Lote 3, que además construyó RLS y
  cifrado sobre estas mismas tablas en paralelo. `tests/fixtures/canales/`
  (feeds `.ics` grabados por canal y por escenario adversarial + payload
  `booking-api-pull-payload.json`). `tests/adversarial/sync/` (suite nueva,
  subset del catálogo completo que Lote 11 consolidará) + `scripts/
  adversarial.mjs` + script raíz `npm run test:adversarial`.
- **Pruebas:** 63 unitarias en `packages/adapters` + 12 en `packages/sim`
  (parser, SSRF guard con IPs privadas/metadata reales, anti-eco 3 capas,
  cuarentena, reconciliación/backoff, exportador, fixtures grabados) —
  incluidas en el total de `npm run test` (168 pruebas en todo el
  monorepo). `npm run test:adversarial -- --filter=sync`: 12 pruebas
  contra `embedded-postgres` real + simuladores etiquetados, cubriendo los
  casos adversariales 1, 3, 6, 7, 8, 9, 10, 11, 13, 16, 17, 20 de
  `docs/ACEPTACION.md` §Calendario-2, más el entregable verificable
  explícito de §Calendario-4 (anti-eco de exportación). Ver
  `docs/logs/lote2-test.log`, `docs/logs/lote2-adversarial.log`,
  `docs/logs/lote2-ci.log`.
- **Entregable verificable (§Calendario-4) confirmado en log:**
  `[ANTI-ECO] ... bloqueos_activos_antes=0 bloqueos_activos_despues=0
  ecos_descartados=1 eventos_aplicados=0 capa=UID-namespace(1)` —
  exportar un bloqueo hacia el simulador y hacer que lo "reexporte" en su
  siguiente import no crea un segundo bloqueo `RESERVA_CANAL`.
- **Hallazgo de esta sesión, no previsto en el backlog original:** el hash
  de anti-eco `(unidad, DTSTART, DTEND, razón)` de `packages/domain`
  (D-004) no distingue un `CONFIRMED`/`TENTATIVE` de un `CANCELLED` sobre
  el mismo rango de fechas — un `CANCEL` importado sin cambio de fechas se
  leería como "hash idéntico" (`sin_cambio`) y nunca se aplicaría. Se
  corrigió en `packages/adapters/src/sync/motor.ts` calculando un hash de
  VERSIÓN separado (con distintivo `:CANCELLED` solo para esa comparación,
  nunca para el hash de anti-eco contra lo exportado, que sigue sin ese
  distintivo porque nuestro propio export siempre declara
  `STATUS:CONFIRMED`). Ninguna función de `packages/domain` se modificó.
- **Colisión de fusión no anticipada por LOTES.md:** `packages/db/src/
  migrations/index.ts` (registro del catálogo) y `packages/db/test/
  migraciones.test.ts` son tocados por cualquier lote que añada
  migraciones nuevas, no solo por rutas de "carpetas exclusivas" — el
  primer archivo se resolvió por edición aditiva coordinada con Lote 3 (sin
  pisar sus líneas); el segundo tenía una aserción de Lote 1 que asumía
  que `auditoria_mutacion` (migración 0008) sería siempre la última del
  catálogo — se generalizó para que el test siga siendo válido sin
  importar qué migración de qué lote termine siendo la última.
- **Commits:** ver `git log` — rango de esta entrega en `docs/PROGRESO.md`.

---

## Lote 3 — cerrado (API + auth/RLS/auditoría)

8/95 historias marcadas `hecho (Lote 3)` arriba: H-040 a H-047 (E07
completa salvo H-048, COULD, dejada `por hacer` deliberadamente — depende
de multi-empresa-gestora, no bloqueante para el resto de Fase 2).

- **Código:** `apps/api/openapi.yaml` + `apps/api/src/contrato/` (tipos
  TS/zod compartidos, exportables como `@atiende-rv/api/contrato`, primer
  commit del lote). `apps/api/src/seguridad/` (`jwt.ts` con `jose`,
  `contrasenas.ts` con `scrypt` nativo, `cifrado.ts` AES-256-GCM con
  keyring versionado, `rateLimit.ts`, `cabeceras.ts`). `apps/api/src/db/`
  (`contexto.ts` — sesión de RLS de alcance de sesión, no de transacción,
  compatible con las transacciones internas de `packages/domain`;
  `ejecutorPg.ts` adapta `pg.PoolClient` al contrato `EjecutorTransaccional`
  sin tocar `packages/domain`). `apps/api/src/middleware/` (autenticación,
  roles — H-044 en capa de servicio, tenant — H-045 romper cristal, logger
  sin PII — H-047). `apps/api/src/routes/` (auth, tenants, usuarios,
  propiedades, unidades + calendario resuelto, reservas directas,
  bloqueos, canales/cuentas de canal, conflictos, auditoria paginada).
  `packages/db/src/migrations/0010-0016` (usuario.rol/colaborador_nivel/
  password_hash, refresh_token, rol de BD `app_rv` sin BYPASSRLS, triggers
  de auditoría, funciones `SECURITY DEFINER` — `is_tenant_member` patrón
  verificado en `atiende-restaurantes`, políticas RLS `ENABLE`+`FORCE` en
  todas las tablas de tenant, funciones de autenticación pre-sesión) y
  `0090-0092` (extensión de cifrado+RLS sobre `cuenta_canal` y las tres
  tablas de canal que creó Lote 2 en 0020/0021 — numeradas fuera de rango
  por dependencia real de orden, ver cabecera de
  `0090_cuenta_canal_cifrado.ts`).
- **Pruebas:** 13 de aislamiento multitenant/escalada de privilegios
  contra `embedded-postgres` real con SQL directo vía el rol `app_rv`
  (`packages/db/test/integration/rls.test.ts` — casos adversariales 18 y
  19), 11 de contrato HTTP + logs sin PII + cifrado de credenciales
  (`apps/api/test/integration/api.test.ts`), 6 unitarias de cifrado
  (`apps/api/test/seguridad/cifrado.test.ts`), 1 de healthcheck (Lote 0,
  sigue verde). Total nuevas: 30. `npm run test`/`npm run typecheck`/
  `npm run lint` verdes en todo el monorepo (compartido con Lotes 1/2).
  Ver `docs/logs/lote3-rls.log`, `docs/logs/lote3-test.log`,
  `docs/logs/lote3-ci.log`.
- **Entregable verificable (LOTES.md):** un usuario de tenant A no puede
  leer/modificar el calendario/propiedad/owner del tenant B — confirmado
  con 0 filas (SELECT) y rechazo `42501 insufficient_privilege` (INSERT)
  directamente contra `app_rv`, sin pasar por `apps/api`. Ver la línea de
  log citada en `docs/PROGRESO.md`.
- **Nota de diseño no explícita en LOTES.md:** el acceso cross-tenant vía
  HTTP se resuelve como `404 recurso_no_encontrado` (RLS oculta la fila,
  la respuesta nunca confirma que el recurso existe en otro tenant) en vez
  de `403` — `403 tenant_forbidden`/`rol_forbidden` se reserva para los
  casos donde la API sí conoce el motivo exacto (rol insuficiente,
  superadmin operando sin tenant de contexto). Documentado en
  `apps/api/openapi.yaml`.
- **Brecha documentada, no un olvido:** las políticas RLS de
  `contador`/`limpieza` hoy son "sin acceso a tablas operativas de
  calendario" en vez de "solo lo que les corresponde" (finanzas/tareas
  asignadas), porque esas tablas todavía no existen (Lotes 7/5
  respectivamente) — fail-closed por diseño (D-020), a estrechar cuando
  esos lotes aterricen sus propias tablas.
- **Comando de aceptación reinterpretado:** `npm run test:integration --
  --filter=rls` de LOTES.md no corresponde a un flag real de Vitest 3;
  el comando equivalente verificado que sí se ejecutó y quedó en el log es
  `cd packages/db && npx vitest run --config vitest.integration.config.ts
  test/integration/rls.test.ts`.
- **Commits:** ver `git log` — rango de esta entrega en `docs/PROGRESO.md`.

## Lote 10 — cerrado (observabilidad y recuperación)

8/95 historias marcadas `hecho (Lote 10)` arriba: H-035 a H-037, H-086 a
H-090 (E15 casi completa — H-091, modo degradado de solo-lectura, queda
`por hacer` deliberadamente: requiere infraestructura de réplica de
lectura no disponible en este entorno de construcción, no un olvido).

- **Código:** `packages/domain/src/flags/` (registro tipado de feature
  flags, default-off forzado para riesgo dinero/cancelación/contacto,
  auditoría de cambios). `packages/db/migrations-tooling/` (expand/
  contract, orden/colisiones de numeración entre lotes, dry-run contra
  PGlite). `packages/db/backup/` (backup lógico propio, restauración con
  `session_replication_role=replica`, verificación de integridad incluido
  el EXCLUDE, reconciliación de drift obligatoria antes de reactivar
  `sync.push_automatico`). `packages/db/src/migrations/0080-0081` (ledger
  de idempotencia del worker de outbox, tabla de alertas). `apps/api/src/
  workers/observabilidad/` (trazador y métricas OTel-like propios sin
  dependencia nueva de `@opentelemetry/*`, exportadores consola/archivo/
  OTLP, middleware HTTP, envoltorio instrumentado de
  `ejecutarCicloImport` de Lote 2, worker de replay idempotente del
  outbox, motor de 6 reglas de alerta con la única acción reversible del
  catálogo — pausar push por token revocado —, rutas `/metrics`+
  `/health/detallado`+`/alertas`). `docs/runbooks/*.md` (una por alerta +
  recuperación de backup con supuestos de RPO/RTO declarados).
  `scripts/verificar-lotes.mjs` + `npm run verificar:lotes` + extensión de
  `npm run ci`/`.github/workflows/ci.yml` con `test:integration`/
  `test:adversarial`.
- **Pruebas:** 9 de flags, 16 de migrations-tooling, 11+3 de backup
  (PGlite + dos clusters `embedded-postgres` reales y aislados), 39 de
  observabilidad (sanitización de PII con email/teléfono sembrados
  reales, encadenamiento de spans por `traceId`, las 6 reglas de alerta
  con persistencia/ack, y el caso central: matar el worker de outbox a
  mitad de un lote de 6 eventos y reanudar sin duplicar ni perder ningún
  efecto). Total nuevo: 78 pruebas. `npm run lint`/`npm run typecheck`
  verdes en todos los paquetes que este lote toca. Ver
  `docs/logs/lote10-test.log`, `docs/logs/lote10-integration.log`,
  `docs/logs/lote10-restauracion.log`, `docs/logs/lote10-ci.log`.
- **Hallazgo de esta sesión, no previsto en el backlog:** el agregado de
  CI raíz (`npm run test --workspaces --if-present`) YA cubría
  correctamente todos los workspaces — el número de "12 tests" citado en
  el encargo era el estado de cierre de Lote 0 (`docs/AGENTES.md` #23),
  no el estado actual (verificado en esta sesión: 377 pruebas en 7
  workspaces). Este lote añadió la herramienta de verificación explícita
  (`verificar:lotes`) que faltaba, no una corrección del mecanismo de
  agregado en sí, que ya funcionaba.
- **Brecha documentada, no un olvido:** H-091 (modo degradado de
  solo-lectura si la BD primaria no responde) requiere una réplica de
  lectura real, infraestructura fuera del alcance de este entorno de
  construcción — queda `por hacer`. WAL continuo/retención 35d-12m de
  H-086 depende de la elección final de proveedor de Postgres
  administrado en producción — el backup lógico + restauración +
  verificación SÍ están implementados y probados. La restricción de
  horario de check-in/checkout de H-088 es una regla operativa de
  despliegue, documentada en el runbook, no verificable por código sin
  un orquestador de despliegues real.
- **Commits:** ver `git log` — rango de esta entrega en
  `docs/PROGRESO.md`.

## Lote 7 — cerrado, parcial (finanzas/owners/statements + pricing + reporting)

10/95 historias marcadas `hecho (Lote 7)` arriba: 8 completas (H-062,
H-063, H-065 a H-070) + 2 parciales (H-064, H-072). H-071 (paridad de
precios por jurisdicción) y H-073 (percentiles de latencia interna vs.
por canal, que depende de instrumentación de sync de Lote 2/10) quedan
`por hacer` — no se fingió esa capacidad.

- **Código:** `packages/domain/src/finanzas/` (redondeo determinista en
  centavos vía BigInt, `calcularMovimientoReserva` sin doble descuento de
  comisión cuando el canal ya entrega neto, `generarOwnerStatement`
  idempotente/versionado por hash sha256, `conciliarPayout`,
  `evaluarAlertaRetencionFiscal` sin calcular impuestos,
  `calcularMetricasPeriodo`). `packages/domain/src/pricing/`
  (`calcularCotizacion`, `evaluarViolacionesMinStay`,
  `evaluarPublicacionTarifa` restringida a `ratesPush:true`).
  `packages/db/src/migrations/0050-0055` (esquema de finanzas/pricing,
  RLS completa con propietario acotado a sus unidades y contador con
  acceso a finanzas pero nunca a `ocupacion_unidad`/`unidad`, auditoría
  append-only). `apps/api/src/routes/{finanzas,pricing,reportes}.ts`
  (endpoints tipados sobre el dominio puro, descarga HTML de statement en
  dev, exportación CSV real). `apps/web/src/pages/{finanzas,pricing,
  reportes}/` (vista por rol, formularios de configuración, cotizador,
  reportes con gráfica de barras propia sin CDN).
- **Pruebas:** 42 unitarias de dominio (`packages/domain/test/
  {finanzas,pricing}/`), 10 de integración RLS contra `embedded-postgres`
  real con rol `app_rv` (`packages/db/test/integration/
  finanzasPricingRls.test.ts` — propietario A nunca ve statements de B,
  contador ve finanzas pero no calendario), 13 de integración HTTP
  (`apps/api/test/integration/finanzasPricingReportes.test.ts` —
  entregable verificable de LOTES.md: reserva de Airbnb "ya neta de
  comisión" no vuelve a descontarla ni en el movimiento ni en el
  statement generado), 9 de componente web. Ver `docs/logs/lote7-test.log`,
  `docs/logs/lote7-integration.log`, `docs/logs/lote7-ci.log`.
- **Hallazgo de esta sesión, no previsto en el backlog:** un `JOIN`
  normal desde `reserva_financiero` hacia `ocupacion_unidad`/`unidad`
  para leer `rfc_propietario` quedaba vacío para el rol `contador` porque
  RLS excluye a ese rol de esas dos tablas por completo (0015) — mismo
  patrón de brecha que ya documentó Lote 5 para `limpieza`. Resuelto con
  una función `SECURITY DEFINER` puntual (`reserva_financiero_rfc_
  propietario`, migración 0054) que expone únicamente el RFC, nunca el
  resto de columnas.
- **Brechas documentadas, no un olvido:** H-064 se entregó como motor de
  conciliación genérico (referencia externa → monto exacto →
  pendiente/discrepancia), no como un parser del CSV/XLS oficial de Vrbo
  con sus columnas exactas (requiere un archivo de ejemplo real para
  verificar el formato, RV12 §4). H-072 no cruza `tarea_limpieza` de Lote
  5. H-071 y H-073 no se implementaron en este lote.
- **Commits:** 994805d (dominio), 037b2ce (migraciones 0050-0055),
  d3553a5 (endpoints HTTP), 2020dc3 (páginas web), 8ebd171 (capturas).

## Lote 5 — cerrado (operación: limpieza y mantenimiento)

7/95 historias marcadas `hecho (Lote 5)` arriba: H-049 a H-055 (E08 completa).

- **Código:** `packages/domain/src/limpieza/` (tipos, `calcularRangoBuffer`,
  `calcularVencimientoSla`/`tareaVencida`, `checklistCompleto`/plantillas,
  `aplicarConsumo`/`stockBajo`, `requiereConfirmacionHumanaParaBloqueo`, y
  `aplicacion/tareas.ts` — capa transaccional que consume `outbox_evento`
  de Lote 1 sin editar ninguno de sus archivos). `packages/db/src/
  migrations/0030-0039` (tarea_operativa/checklist/incidencia/inventario/
  configuración operativa/RLS/auditoría/función `unidad_nombre_operacion`
  SECURITY DEFINER, necesaria porque `limpieza` no tiene acceso a `unidad`
  ni siquiera vía JOIN — RLS se evalúa por tabla). `apps/api/src/routes/
  limpieza/` (tareas/incidencias/inventario, permisos propios sin tocar
  `middleware/roles.ts`) + extensión aditiva de `contrato/tipos.ts`/
  `openapi.yaml`. `apps/web/src/pages/limpieza/` (tablero de turnos
  responsive, detalle con checklist/incidencias, portal de proveedor
  externo H-053), reutilizando cliente HTTP/sesión/hooks de Lote 4.
- **Pruebas:** 34 unitarias de dominio (incluye el entregable verificable
  de LOTES.md: confirmar checkout crea la tarea y reprogramarla preserva
  el responsable), 14 de componentes web (Vitest+Testing Library+axe-core),
  6 de integración HTTP contra `embedded-postgres` real con rol `app_rv`
  (RLS de aislamiento de `limpieza`, checklist incompleto→409, incidencia
  grave→bloqueo con `capa_cruzada` sin cancelar la reserva), 2 E2E con
  Chrome real y capturas reales (`docs/capturas/lote5-turnos.png`,
  `lote5-movil-375.png`). Ver `docs/logs/lote5-{test,integration,e2e,ci}.log`.
- **Brecha documentada (H-054):** la notificación multicanal registra
  intención (evento+canales) en `notificacion_tarea`; el adaptador de
  envío real por canal concreto queda fuera de alcance, nunca simulado
  como "enviado".
- **Nota de entorno:** esta sesión sufrió commits concurrentes de otros
  lotes que en más de una ocasión sobrescribieron archivos compartidos
  (`packages/db/src/migrations/index.ts`, `apps/api/src/contrato/tipos.ts`,
  `docs/PROGRESO.md`, `docs/fase2/BACKLOG.md`) y un `amend` externo que
  descartó un commit ya hecho de este lote — el código se recuperó del
  commit huérfano y se re-commiteó; contenido final correcto, historial
  de commits no perfectamente lineal.
- **Commits:** ver `git log` (código bajo mensajes `feat(lote5)`/
  `docs(lote5)`, con al menos un tramo recuperado tras un `amend` externo).

## Lote 11A — cerrado (suite adversarial completa de 20 casos + carga; E16 completa)

4/95 historias marcadas `hecho (Lote 11A)` arriba: H-092 a H-095 (E16
completa). El código concurrente de Lote 11B (correcciones en
`apps/api`/`apps/web`/`scripts`) no forma parte de este cierre.

- **Código:** `tests/adversarial/calendario/casos.test.ts` (casos 2, 4, 5,
  12, 14, 15 de ACEPTACION §Calendario-2, contra `embedded-postgres` real
  + simuladores etiquetados, reutilizando `crearEntornoAdversarial`/
  `feedIcsDePrueba` de `tests/adversarial/sync/entorno.ts` de Lote 2 en
  vez de duplicarlos). `tests/adversarial/multitenant/casos.test.ts`
  (casos 18/19 verificados vía HTTP real contra `apps/api` —
  `crearApp`/`app.request` — complementando, no duplicando, la
  verificación con SQL directo de `packages/db/test/integration/
  rls.test.ts` de Lote 1/3: cubre además el camino de ESCRITURA
  cross-tenant, POST /bloqueos y POST /reservas, que la suite HTTP de
  Lote 3 no cubría). `tests/adversarial/outbox/casos.test.ts` (caso 16 a
  nivel del WORKER real de outbox de Lote 10,
  `apps/api/src/workers/observabilidad/outboxWorker.ts`, importado por
  ruta de archivo — complementa el caso 16 a nivel de motor de
  sincronización de Lote 2). `tests/adversarial/ssrf/casos.test.ts`
  (vectores adicionales del caso 20: RFC1918, loopback, esquema `file:`,
  redirección HTTP real hacia un destino interno con revalidación por
  salto; más una suite extra de H-094 fuera del catálogo de 20 —
  "ICS bomba"/límites de tamaño-eventos-longitud de línea del parser de
  Lote 2). `tests/adversarial/generar-reporte.mjs` (clasifica cada `it`
  por número de caso a partir de una corrida real de
  `vitest --reporter=json`, nunca a mano; produce
  `docs/logs/adversarial-reporte.{md,json}`). `tests/load/` (H-093): 3
  escenarios (`escenarioA-importacion.ts` — 50 unidades × 3 canales,
  latencia interna evento→noche cerrada con conexiones `pg`
  independientes reales, sin overbooking; `escenarioB-rafagaReservas.ts`
  — 30 conexiones concurrentes sobre la misma unidad, exactamente 1
  ganador, `23P01` limpio en el resto, cero deadlocks, extiende a escala
  el entregable de H-005/Lote 1; `escenarioC-reconciliacion.ts` — 500
  UIDs activos con 10% de drift sembrado deterministamente, invariante
  H-018 verificado a escala) + `comun.ts` (helpers de percentiles/
  hardware/wrapper de conexión) + `run.mjs` (orquestador de
  `npm run test:load`). Línea `"test:load"` añadida a `package.json`
  raíz; `scripts/adversarial.mjs` (Lote 2) y `npm run ci` quedan SIN
  tocar — la carga permanece manual/CI nocturno, según LOTES.md.
- **Pruebas:** 41 tests nuevos propios en `tests/adversarial/`
  (`calendario` 8, `multitenant` 8, `outbox` 2, `ssrf` 11, más 12 de
  `sync` de Lote 2 que ya vivían ahí) — 40 en verde, 1 en rojo A
  PROPÓSITO (defecto real documentado, ver abajo). Reporte consolidado:
  20/20 casos del catálogo de ACEPTACION §Calendario-2 en verde
  (`docs/logs/adversarial-reporte.md`). Carga: 3/3 escenarios ejecutados
  de punta a punta con números reales (`docs/logs/load-reporte.md`),
  explícitamente marcados como NO-SLO (§Plan-1).
- **Defecto real encontrado y documentado, NO maquillado (regla del
  lote):** D-ADV-01 — `POST /bloqueos` con un `unidadId` de otro tenant
  es rechazado correctamente por RLS (0 filas escritas, verificado), pero
  `traducirErrorDominio` (`apps/api/src/routes/reservas.ts`) no reconoce
  la violación de RLS de Postgres y cae al `catch-all` `error_interno`
  (HTTP 500) en vez de un error de autorización clasificado (403/404,
  como sí hace `POST /reservas` para el mismo escenario). El invariante
  de seguridad real (aislamiento de datos) se cumple siempre — es un
  defecto de clasificación de error, no una fuga. Reproducción exacta y
  corrección sugerida en `docs/auditoria-2/defectos-adversarial.md`; el
  `it` que lo reproduce se dejó en rojo a propósito en
  `tests/adversarial/multitenant/casos.test.ts` (caso 18). Corrección
  fuera del alcance de 11A (carpeta exclusiva `apps/api` de 11B).
- **Incidente de índice git compartido (mismo riesgo B-007 ya documentado
  por Lotes 5/6/7/8/10):** el commit de código de este lote
  (`feat(lote11a): ...`) absorbió, además de los archivos propios,
  cambios en vuelo de Lote 11B (`apps/api/openapi.yaml`,
  `apps/api/src/routes/exportIcal.ts`,
  `apps/api/test/integration/exportIcal.test.ts`) que estaban en el
  índice compartido en el momento del commit pese a que `git add` se
  ejecutó solo con rutas explícitas propias. Siguiendo la política ya
  establecida por este proyecto para B-007 (nunca reescribir historial —
  `--amend`/`reset`/`rebase`/`stash` prohibidos), no se corrigió con
  ninguna operación destructiva: el contenido de esos 3 archivos es
  correcto y no se perdió nada; solo queda atribuido al commit de Lote
  11A en vez de al de 11B. Documentado aquí para que 11B no intente
  re-commitear el mismo contenido como si faltara.
- **Commits:** ver `git log` (código bajo `feat(lote11a)`, defecto bajo
  `docs(lote11a)`, evidencia/reportes bajo `docs(lote11a)`).

## Lote 11B — cerrado (correcciones cruzadas + auditoría de atribución B-007)

No añade historias nuevas al backlog (correcciones sobre trabajo ya
`hecho` de Lotes 2–10, detectadas durante la construcción/verificación de
Fase 2, más la auditoría de atribución de commits de B-007).

- **#1 `useMutacionLigera` (closures obsoletos):** `ejecutar` memoizaba
  con deps `[]` capturando el `fn` del primer render; se aplica el mismo
  patrón de ref que ya usaba `useQueryLigero`. Prueba de regresión nueva
  (`queryLigero.test.ts`) que renderiza con un valor, re-renderiza con
  otro, y confirma que `ejecutar()` usa el segundo. Páginas de Lotes 4–8
  verificadas sin regresión (62→65 pruebas de `apps/web` en verde).
- **#2 `ocupacionId` en `GET /unidades/:id/calendario`:** el contrato
  (`NocheCalendario`) y el endpoint ahora exponen
  `ocupacionId`/`ocupacionInicio`/`ocupacionFin` de la fila dominante;
  `PanelSeleccion` los usa directamente y la caché de sessionStorage
  `cacheOcupaciones.ts` (obsoleta) se elimina. La regla "nunca cancelar
  una reserva de canal" (D-006/D-011) no cambió — sigue decidida por
  `capa`/`razon`/`esDirecta`.
- **#3 URL de exportación iCal propia:** `GET`/`POST .../rotar` en
  `/export-ical/:unidadId/:canalCodigo` (autenticado, token de 32 bytes
  aleatorios, nunca inventado por el cliente) + `GET /feed/ical/:token`
  (ruta pública, sin sesión, token opaco como única credencial, dos
  funciones `SECURITY DEFINER` nuevas en la migración `0100`). Botón
  "Copiar"/"Rotar" en la matriz de conectividad. Pruebas: token
  inválido → 404, feed válido parseable (sin PII), rotación invalida el
  anterior de inmediato — las 3 exigidas, verdes.
- **#4 Truncamiento del panel de detalle a 1440px:** layout corregido
  (ancho mínimo/wrap) y captura real regenerada con Chrome
  (`docs/capturas/lote4-calendario-timeline.png`).
- **#5 `verificar:lotes` reportaba "0 tests" con `npm -s`:** el parser
  dependía del banner de npm que `-s` suprime; ahora corre cada
  workspace por separado y suma las líneas de Vitest (con/sin color,
  con/sin `-s`). Prueba de regresión con salidas reales capturadas.
- **#6 `--filter=<lote>` de LOTES.md no es sintaxis real de npm
  workspaces:** `scripts/filtrar-tests.mjs` traduce cada nombre
  documentado (`rls`, `limpieza`, `mensajeria`, `finanzas`,
  `backoffice`, `agentes`, `recuperacion`; `sync` delega en
  `scripts/adversarial.mjs`, que ya funcionaba) a la invocación real de
  Vitest que aísla ese subconjunto — nunca toda la suite. Nota de
  equivalencia de una línea junto a cada comando afectado en LOTES.md.
  No se tocó `package.json` raíz (ámbito exclusivo de Lote 11A).
- **#7 Auditoría de atribución de commits (B-007):** `docs/auditoria-2/
  atribucion-commits.md` — 65 commits revisados, **0 archivos
  perdidos**, 1 mezcla real confirmada y sin impacto funcional (3
  archivos de esta corrección #3 quedaron atribuidos al commit de Lote
  11A por índice git compartido; contenido idéntico, verificado). Todos
  los demás cruces son extensiones aditivas de archivos de fusión
  declarados (rutas/menú/contrato/barriles/manifiestos) o el reemplazo
  documentado del placeholder de Lote 0 por el `AdminSidebar` real de
  Lote 4. No se reescribió historial.
- **Hallazgo adicional corregido (fuera de la lista original, detectado
  por la suite adversarial de Lote 11A mientras corría en paralelo):**
  D-ADV-01 — `POST /bloqueos` cross-tenant respondía 500 genérico en vez
  de un error de autorización clasificado; `traducirErrorDominio`
  ahora reconoce `42501`/"row-level security policy" y responde 404
  `recurso_no_encontrado` (mismo criterio que `POST /reservas`).
- **Verificación final:** `npm run typecheck`/`lint`/`test`/
  `test:integration` verdes en los 7 workspaces (0 errores, 0 fallos);
  logs en `docs/logs/lote11b-*.log` (no versionados, como el resto de
  logs de lote).
- **Commits:** `7e0bf66`, `3e650d5`, `a9f33de`, `d307336`, `35327f5`,
  `ca8252b`, `1742320`, `a707d50`, `2f3039c`, `f9f13ac`, `e976d99` (más
  la parte del commit `6d4f2ae` de Lote 11A que absorbió 3 archivos de la
  corrección #3, documentado en la auditoría).
