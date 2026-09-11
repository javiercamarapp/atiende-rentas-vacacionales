# Catálogo de requisitos — Atiende Rentas Vacacionales

Catálogo trazable REQ-nnn. Cada fila: enunciado verificable, prioridad
(**MUST**/**SHOULD**/**COULD**), origen (RVxx-R-nn), evidencia (`[DATO]`
primaria, `[R]` secundaria reverificable, `SUPUESTO` de diseño, o
`PENDIENTE-EXTERNO` cuando depende de un tercero), criterio de aceptación
(sección de `docs/ACEPTACION.md`), módulo de producto, y estado (`por
construir` / `construido` / `bloqueado por externo` / `bloqueado por laguna
legal`). Agrupado por dominio. La sección 0 recoge los requisitos negativos
(lo que el sistema NUNCA hace) porque aplican transversalmente a todo lo
demás.

Convención de estado:
- **por construir** — no depende de un tercero ni de una laguna legal abierta.
- **construido** — el criterio de aceptación citado se verificó con comando +
  resultado real adjuntos en la propia fila (evidencia inline en la columna
  Evidencia); no reemplaza revisión legal/técnica humana ni gate de release.
- **bloqueado por externo** — depende de aprobación/certificación de un canal
  (Airbnb, Booking.com, Vrbo) fuera del control del proyecto.
- **bloqueado por laguna legal** — depende de verificación normativa aún no
  confirmada (ver `docs/LAGUNAS.md`, `docs/BLOQUEOS.md`).

---

## 0. Requisitos negativos transversales — lo que el sistema NUNCA hace

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-000 | El sistema NUNCA cancela una reserva confirmada de forma automática, bajo ninguna condición de rol, umbral de autonomía o presión conversacional del huésped. | MUST | RV02-R-03, RV18-R-03, RV19-R-15 | [DATO] RV02 art.990/2022; RV18-F-06 | ACEPTACION §RV19/21-6 | Automatización agéntica / Reservas | por construir |
| REQ-001 | El sistema NUNCA contacta a un huésped por iniciativa propia sin autorización humana explícita y registrada del anfitrión/administrador. | MUST | RV10-R-06, RV18-R-03, RV19-R-15 | SUPUESTO (decisión de producto reforzada por RV10 §c) | ACEPTACION §RV19/21-6 | Mensajería / Automatización agéntica | por construir |
| REQ-002 | Las herramientas de cancelación de reserva y de envío directo de mensaje a huésped NO existen en el catálogo de `tools` accesible a ningún agente LLM, bajo ninguna condición — no es un caso de "requiere aprobación", es un caso de "la función no existe". | MUST | RV18-R-03; RV14-R-01 (diferencial de mercado: aprobación humana no-opcional y transversal, ningún competidor investigado la declara — BC6) | [DATO] RV18-F-06 (Anthropic, computer-use) | ACEPTACION §RV19/21-6; verificación CI (RV18 §8 mecanismo 3) | Automatización agéntica | por construir |
| REQ-003 | Ninguna decisión de disponibilidad/solapamiento de calendario (`¿está disponible?`, `¿hay conflicto?`, `¿se cierra tras esta reserva?`) pasa por un LLM en ningún punto del flujo, ni como paso intermedio validado después. | MUST | RV16-R-04, RV18-R-02 | SUPUESTO (decisión de arquitectura); RV18-F-02 | ACEPTACION §RV19/21-6; verificación CI (RV18 §8 mecanismo 2) | Calendario / Automatización agéntica | por construir |
| REQ-004 | Ninguna tool expuesta a un agente LLM declara en su `input_schema` un identificador de tenant, propiedad, huésped o reserva; esos valores se resuelven siempre en servidor a partir de la sesión/canal autenticado. | MUST | RV18-R-01; RV14-R-03 (diferencial de mercado: permisos de agente limitados en servidor, comunicados activamente — BC6) | [DATO] RV18-F-02, F-07, F-08 | Verificación CI (RV18 §8 mecanismo 1) | Automatización agéntica | por construir |
| REQ-005 | Un fallo de fetch, un cuerpo vacío o un feed malformado NUNCA se traduce en "liberar disponibilidad"; siempre activa cuarentena del último estado válido conocido. | MUST | RV07-R-05, RV21 (caso adversarial 9-11) | [DATO] OpenTelemetry, estados de span Ok/Error/Unset, adoptado como "Unset/Error, nunca Ok por omisión" (`docs/LAGUNAS.md` §5 fila "Feed inaccesible ≠ calendario vacío" [F-143]; RV07 §8, RV20 §1.2) — corrección BC7: la cita anterior a RFC 5545 era la fuente equivocada (RFC 5545 solo sustenta límites de tamaño, tema de REQ-031, no la semántica de cuarentena) | ACEPTACION §Calendario-3 | Calendario / Sincronización | por construir |
| REQ-006 | El sistema nunca reabre una noche ocupada por una razón de mayor precedencia al cancelar o modificar una razón de menor precedencia (RESERVA_CANAL > BLOQUEO_PROPIETARIO > MANTENIMIENTO > BUFFER_LIMPIEZA). | MUST | RV07-R-02 | SUPUESTO (D-002, derivado de la regla de negocio) | ACEPTACION §Calendario-2 (caso adversarial 5) | Calendario | por construir |
| REQ-007 | Ninguna funcionalidad de cálculo/declaración fiscal, registro de viajeros o número de registro de anuncio se activa en UI sin verificación de la normativa vigente y revisión de un fiscalista/abogado local. | MUST | RV19-R-13, RV19-R-14 | PENDIENTE-EXTERNO (RV19 §6, lagunas 1-9) | ACEPTACION §Legal-1 | Legal/Compliance | bloqueado por laguna legal |
| REQ-008 | El estado de conexión de una cuenta de canal nunca se reporta como "producción" sin evidencia verificable reciente de sincronización real exitosa. | MUST | RV17-R-09; RV14-R-04 (diferencial de mercado: estado de sincronización honesto, ningún competidor investigado lo ofrece — BC6) | [R] RV17-F-05 (RLS fail-closed, documentación de PostgreSQL sobre autorización de filas — dominio distinto al de honestidad de estado de canal; aplicado por analogía de principio, no como evidencia directa del mismo dominio — corrección BC7, antes etiquetado [DATO]) | ACEPTACION §Conectividad-1 | Cuentas de canal | por construir |
| REQ-009 | Ninguna alerta operativa dispara, directa o indirectamente, la cancelación de una reserva o el contacto a un huésped; el único efecto automatizable de una alerta es pausar el push de disponibilidad hacia un canal (acción reversible). | MUST | RV20-R-04 | SUPUESTO (RV20 §2, runbooks) | ACEPTACION §Operación-1 | Observabilidad | por construir |
| REQ-010 | El sistema no usa scraping de HTML ni automatización de sesión con credenciales personales del anfitrión contra ningún canal; solo feeds iCal públicos, APIs oficiales certificadas o programas de partner reconocidos. | MUST | RV19-R-09 | [DATO] RV19 (Airbnb ToS §11.1/§16, Booking.com T&C A15.2/A15.3) | ACEPTACION §Legal-2 | Conectividad | por construir |

---

## 1. Segmentación, roles y permisos (RV01, RV12)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-011 | El sistema modela como mínimo tres niveles de permiso de colaborador por propiedad: acceso total; calendario+mensajería; solo calendario. | MUST | RV01-R-01 | [R] Airbnb art. 1534 describe los tres niveles que Airbnb ofrece a sus propios cohosts; no es una obligación impuesta a Atiende — el MUST es una decisión de diseño que replica ese modelo por ser la única evidencia primaria fuerte de segmentación de permisos, no una cita textual de un requisito para terceros (corrección BC9, antes etiquetado [DATO] sin este matiz) | ACEPTACION §Roles-1 | Propiedades/Roles | por construir |
| REQ-012 | Un colaborador con rol "solo calendario" o "calendario+mensajería" no puede cancelar reservas, aceptar/rechazar solicitudes ni modificar precios, ni siquiera técnicamente. | MUST | RV01-R-02 | [R] Airbnb art. 1534 (mismo matiz que REQ-011: describe el límite real de los niveles inferiores de cohost en Airbnb; la negación para roles internos equivalentes de Atiende es una inferencia por analogía de diseño, no una cita textual — corrección BC9) | ACEPTACION §Roles-1 | Propiedades/Roles | por construir |
| REQ-013 | El acceso y edición de métodos de pago/datos fiscales de cualquier usuario se restringe exclusivamente al propietario de la propiedad. | MUST | RV01-R-03 | [DATO] Airbnb art. 1534 | ACEPTACION §Roles-1 | Propiedades/Roles | por construir |
| REQ-014 | El sistema permite asignar permisos distintos por propiedad a un mismo colaborador, y advierte si se le invita a varias propiedades simultáneamente con permisos distintos. | SHOULD | RV01-R-04 | [DATO] Airbnb art. 1244/2680 | ACEPTACION §Roles-1 | Propiedades/Roles | por construir |
| REQ-015 | El sistema soporta múltiples colaboradores por propiedad (límite configurable/informativo alineado al máximo de 10 de Airbnb) y jerarquía de invitación por un colaborador de acceso total. | SHOULD | RV01-R-05, RV01-R-06 | [DATO] Airbnb art. 1541/1244 | ACEPTACION §Roles-1 | Propiedades/Roles | por construir |
| REQ-016 | El sistema permite gestionar, por propiedad, jobs-to-be-done operativos del cohost profesional: anuncio, precios, mensajería, soporte in situ, limpieza/mantenimiento, fotografía. | SHOULD | RV01-R-07 | [DATO] Airbnb art. 3472 | ACEPTACION §Roles-2 | Propiedades/Roles | por construir |
| REQ-017 | La UI señala explícitamente cuándo un permiso configurado en Atiende no tiene equivalente exacto en el canal de destino. | SHOULD | RV01-R-08, RV17-R-09 (honestidad de estado) | SUPUESTO | ACEPTACION §Conectividad-1 | Propiedades/Roles | por construir |
| REQ-018 | El modelo de roles se diseña agnóstico de canal; no se asume paridad de permisos con Booking.com ni Vrbo hasta validación directa con cuenta real. | MUST | RV01-R-09 | [R] bloqueos 403/429 en Booking.com/Vrbo (RV01 §Riesgos) | ACEPTACION §Roles-3 | Propiedades/Roles | bloqueado por externo |
| REQ-019 | El sistema modela roles internos: Superadmin Atiende, Administrador de empresa gestora, Operador, Limpieza, Propietario (solo lectura), Contador. | MUST | RV12 §1 | SUPUESTO (diseño de producto) | ACEPTACION §Roles-4 | Back office / Roles | por construir |
| REQ-020 | El acceso "romper cristal" de Superadmin Atiende a datos de un tenant queda siempre auditado (quién, cuándo, qué, por qué). | MUST | RV12 §1, RV12-R-08 | SUPUESTO | ACEPTACION §Auditoría-1 | Back office | por construir |
| REQ-021 | El rol Propietario tiene acceso de solo lectura acotado a sus propias propiedades: reservas, ocupación, ingresos, comisión, gastos, neto, descarga de statement. | MUST | RV12-R-09 | SUPUESTO | ACEPTACION §Roles-4 | Finanzas/Owners | por construir |
| REQ-022 | El rol Contador tiene acceso a datos financieros consolidados sin permisos operativos, con exportación para uso contable/fiscal externo. | SHOULD | RV12-R-10 | SUPUESTO | ACEPTACION §Roles-4 | Finanzas/Owners | por construir |
| REQ-023 | El modelo de datos permite que un mismo propietario esté vinculado a más de una empresa gestora (relación N:M, no jerarquía estricta tenant→propietario). | COULD | RV12-R-08 (extensión), RV17 §14 | SUPUESTO | ACEPTACION §Roles-4 | Multitenancy | por construir |

---

## 2. Calendario unificado — invariantes de disponibilidad (RV06, RV07, RV17)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-024 | Toda estancia (reserva o bloqueo) se modela con rango semiabierto `[check_in, check_out)`; ningún día de checkout se marca ocupado por esa estancia. | MUST | RV06-R-01, RV17-R-02 | [DATO] RFC 5545 §3.6.1/§3.8.2.2; RV17-F-04 | ACEPTACION §Calendario-2 (caso 15) | Calendario/Datos | por construir |
| REQ-025 | El invariante de no solapamiento por unidad se implementa como `EXCLUDE USING gist (unidad_id WITH =, during WITH &&)` con `btree_gist`, validado con pruebas de concurrencia real (no solo PGlite). | MUST | RV17-R-01 | [DATO] RV17-F-01, F-02 (composición razonada, no cita idéntica) | ACEPTACION §Calendario-1 | Datos/Arquitectura | por construir |
| REQ-026 | Si se usa `tstzrange`, toda construcción del rango especifica explícitamente `'[)'`, dado que PostgreSQL no normaliza automáticamente ese tipo continuo. | MUST | RV17-R-03 | [DATO] RV17-F-04 | ACEPTACION §Calendario-1 | Datos/Arquitectura | por construir |
| REQ-027 | El sistema soporta tanto `DTEND` explícito como `DTSTART+DURATION` en feeds importados, normalizando a la misma representación interna. | MUST | RV06-R-02 | [DATO] RFC 5545 §3.3.6 | ACEPTACION §Calendario-2 (caso 4) | Sincronización | por construir |
| REQ-028 | El sistema trata `UID` como clave de identidad del evento de canal y `SEQUENCE`/`LAST-MODIFIED`/hash de contenido como señales de versión, sin asumir incremento fiable de `SEQUENCE`. | MUST | RV06-R-03, RV07-R-03 | [DATO] RFC 5545 §3.8.4.7/§3.8.7.4; RV07 §4 | ACEPTACION §Calendario-2 (caso 1, 3) | Sincronización | por construir |
| REQ-029 | El sistema no deriva tarifas, restricciones de estancia, datos de huésped ni estado de pago de un feed iCal; esos campos provienen de la fuente de verdad interna o de integraciones API dedicadas. | MUST | RV06-R-05 | [DATO] RV06 §"Qué NO transporta iCal" | ACEPTACION §Calendario-2 | Sincronización/Pricing | por construir |
| REQ-030 | El importador de feeds `.ics` por URL aplica controles anti-SSRF (allowlist de esquema, deny-list de rangos privados/metadata, sin redirecciones automáticas) antes de cualquier `GET`. | MUST | RV06-R-06, RV19-R-01/02/03 | [DATO] OWASP SSRF Prevention Cheat Sheet (RV19 A10) | ACEPTACION §RV19/21-2 (caso adversarial 20) | Seguridad/Importador | por construir |
| REQ-031 | El importador impone límites propios de tamaño de descarga, número de líneas/eventos y timeout, dado que RFC 5545 no define ninguno. | MUST | RV06-R-07, RV19-R-04 | [DATO] confirmado por ausencia en RFC 5545; OWASP A12/A13 | ACEPTACION §RV19/21-3 | Seguridad/Importador | por construir |
| REQ-032 | Toda fecha `DATE` sin hora de un evento importado se interpreta en la zona horaria local de la propiedad, documentado como tal ante el usuario. | MUST | RV06-R-08, RV17-R-04 | SUPUESTO de diseño (no cita textual de canal); RV17-F-04 | ACEPTACION §Calendario-2 (caso 14) | Calendario/Datos | por construir |
| REQ-033 | `propiedad` almacena obligatoriamente una zona horaria IANA; ninguna columna de fecha/hora operativa usa `timestamp without time zone`. | MUST | RV17-R-04 | SUPUESTO de diseño, justificado técnicamente en RV17 §4 | ACEPTACION §Calendario-2 (caso 14) | Datos/Arquitectura | por construir |
| REQ-034 | La fuente de verdad de ocupación por noche/unidad es interna al sistema; ningún feed iCal (import o export) la sustituye. | MUST | RV07-R-01 | SUPUESTO (D-001) | ACEPTACION §Calendario-1 | Datos/Arquitectura | por construir |
| REQ-035 | Todo bloqueo interno lleva razón tipada con precedencia total y determinística, usada para resolver cancelaciones sin reabrir noches ocupadas por otra causa. | MUST | RV07-R-02 | SUPUESTO (D-002) | ACEPTACION §Calendario-2 (caso 5) | Datos/Arquitectura | por construir |
| REQ-036 | Todo import es idempotente por `(canal, unidad, UID)`, con desempate por `SEQUENCE`/hash cuando `SEQUENCE` no sea confiable. | MUST | RV07-R-03, RV17-R-08 | [DATO] RV06 §3; RV07 §4 | ACEPTACION §Calendario-2 (casos 6,7,8,16) | Sincronización | por construir |
| REQ-037 | El sistema implementa anti-eco por al menos dos mecanismos independientes (UID/namespace propio + hash de contenido contra lo exportado). | MUST | RV07-R-04 | [R] Vrbo advertencia oficial de reimportar propio export; RV08 §4 (confianza media-baja para "looping") | ACEPTACION §Calendario-4 | Sincronización | por construir |
| REQ-038 | El sistema expone, por canal y unidad, edad del último sync exitoso, drift detectado en la última reconciliación completa, y conteo de conflictos activos. | MUST | RV07-R-06, RV20-R-01 | [DATO] OTel Metrics API (RV20-F-04/F-05) | ACEPTACION §Operación-2 | Observabilidad | por construir |
| REQ-039 | Toda comunicación de "disponibilidad cerrada" distingue "cerrada en la fuente de verdad" (instantáneo) de "reflejada en el canal remoto" (sujeta a latencia documentada o declarada no documentada). | MUST | RV07-R-07, RV21-R-04 | [DATO] Airbnb ~3h (confianza baja/media para generalizar a cualquier conexión iCal producto-Airbnb, RV03 S1 — BC5), Vrbo ~30min; Booking.com sin evidencia (RV07 §9); ambas cifras son latencia externa no controlada por el sistema | ACEPTACION §RV19/21-8 | Calendario/UX | por construir |
| REQ-040 | Ninguna operación de sincronización cancela una reserva ni contacta al huésped; todo conflicto se resuelve por alerta a un humano. | MUST | RV07-R-08 | SUPUESTO (regla de negocio) | ACEPTACION §RV19/21-6 | Sincronización | por construir |
| REQ-041 | Toda generación/aplicación de eventos de sync es recuperable ante crash mediante outbox transaccional, convergiendo al mismo estado final vía upsert idempotente. | MUST | RV07-R-09, RV17-R-05 | [DATO] RV17-F-06 (microservices.io) | ACEPTACION §Calendario-2 (caso 16); §Operación-3 | Datos/Arquitectura | por construir |
| REQ-042 | Un buffer de limpieza se modela como su propio tipo de bloqueo (`BUFFER_LIMPIEZA`) ocupando `[checkout, checkout+N)`, coexistiendo con el invariante `[in,out)` sin contradecirlo. | MUST | RV07 §12 | SUPUESTO de diseño | ACEPTACION §Calendario-2 (caso 15) | Calendario/Limpieza | por construir |
| REQ-043 | La duración mínima de estancia vive como regla en la fuente de verdad interna, aplicada al aceptar/exportar bloqueos, independiente del parseo de eventos. | SHOULD | RV07 §13 | SUPUESTO de diseño | ACEPTACION §Calendario-1 | Calendario/Pricing | por construir |
| REQ-044 | Toda transición de `reserva.estado` hacia cancelación solo refleja un estado ya reportado por el canal de origen o una acción humana explícita registrada en auditoría; nunca se origina en lógica interna. | MUST | RV17-R-11 | SUPUESTO (D-006) | ACEPTACION §RV19/21-6 | Datos/Arquitectura | por construir |
| REQ-045 | `huesped_minimo` no se amplía con perfil enriquecido, historial de marketing o segmentación cross-reserva sin decisión de producto explícita. | MUST | RV17-R-10 | SUPUESTO (D-014) | ACEPTACION §Privacidad-1 | Datos/Privacidad | por construir |

---

## 3. Calendario — UX y visibilidad (RV09)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-046 | El calendario distingue visualmente, por fecha y unidad, al menos: reserva confirmada, bloqueo manual, bloqueo automático por regla, bloqueo por sincronización externa; y muestra la razón exacta al seleccionar la fecha. | MUST | RV09-R-01 | [DATO] Airbnb art. 447, 484 | ACEPTACION §UX-1 | Calendario/UX | por construir |
| REQ-047 | El sistema nunca permite desbloquear desde el calendario maestro una fecha originada en reserva cancelada, calendario sincronizado externo, o restricción legal/regulatoria; redirige al sistema de origen. | MUST | RV09-R-02 | [DATO] Airbnb art. 447 | ACEPTACION §UX-1 | Calendario/UX | por construir |
| REQ-048 | Toda noche con solicitud pendiente se bloquea automáticamente mientras esté pendiente y se libera solo por rechazo o expiración por inacción, nunca por cancelación automática del sistema. | MUST | RV09-R-03, RV02-R-01 | [DATO] Airbnb art. 3612, art. 85 | ACEPTACION §UX-1 | Calendario/Reservas | por construir |
| REQ-049 | El calendario muestra, por canal y unidad, un indicador de estado de conexión con al menos tres niveles: conectado/normal, retrasado por rate-limit, desconectado/restringido. | MUST | RV09-R-04 | [DATO] Hospitable (banner amarillo, badge "Calendar Restricted") | ACEPTACION §UX-2 | Calendario/UX | por construir |
| REQ-050 | Cuando un canal está restringido/desconectado, el sistema no intenta empujar cambios de disponibilidad ni precio hacia él, e indica la acción de reconexión requerida. | MUST | RV09-R-05 | [DATO] Hospitable Badges | ACEPTACION §UX-2 | Calendario/UX | por construir |
| REQ-051 | El sistema impide o advierte explícitamente contra bucles de sincronización cruzada (exportar y reimportar el mismo feed). | MUST | RV09-R-06 | [DATO] Vrbo, advertencia oficial de "payment issues" | ACEPTACION §Calendario-4 | Sincronización | por construir |
| REQ-052 | La UI declara visiblemente la ventana de latencia real de cada tipo de sincronización ("última sincronización hace X, próxima en Y") en vez de implicar tiempo real. | MUST | RV09-R-07 | [DATO] Airbnb art. 99, Vrbo | ACEPTACION §RV19/21-8 | Calendario/UX | por construir |
| REQ-053 | Las acciones de bloqueo/desbloqueo soportan selección múltiple de fechas (rango y semana) en escritorio y gestos táctiles equivalentes en móvil. | SHOULD | RV09-R-08 | [DATO] Airbnb art. 447 (gesto móvil) | ACEPTACION §UX-3 | Calendario/UX | por construir |
| REQ-054 | El tiempo de preparación/buffer entre reservas es configurable por unidad, bloquea automáticamente el calendario antes/después de cada reserva, y se visualiza como categoría distinta. | MUST | RV09-R-09, RV11-R-02 | [DATO] Airbnb art. 484/2923 (ejemplo 48h) | ACEPTACION §UX-1 | Calendario/Limpieza | por construir |
| REQ-055 | El producto no usa lenguaje de "sincronización en tiempo real" o "cero overbooking garantizado" sin un mecanismo técnico propio verificado. | MUST | RV09-R-10, RV21-R-06 | [R] confianza baja de marketing de terceros (Hostaway) | ACEPTACION §RV19/21-8 | Comunicación/Producto | por construir |
| REQ-056 | El calendario ofrece al menos una vista de línea de tiempo multi-propiedad y una vista mensual de una sola unidad, separando modo "ocupación" de modo "tareas operativas". | SHOULD | RV09-R-11 | [DATO] Hospitable (Single-property / Multi-calendar / Occupancy / Task) | ACEPTACION §UX-3 | Calendario/UX | por construir |
| REQ-057 | Antes de comprometer soporte de accesibilidad (lector de pantalla, contraste, teclado) o lógica de zona horaria por propiedad como "paridad de mercado", el equipo valida directamente — ninguna fuente primaria del sector la confirma para ningún competidor. | SHOULD | RV09-R-12 | [R] laguna declarada (RV09 Lagunas) | ACEPTACION §UX-4 | Calendario/UX | por construir |

---

## 4. Conectividad — Airbnb (RV03)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-058 | El motor de sincronización trata cualquier conexión iCal con Airbnb como asíncrona, con latencia mínima documentada de horas (ciclo de 3h), nunca instantánea. | MUST | RV03-R-01 | [DATO] Airbnb art. 99 confirma el ciclo de 3h para calendarios de terceros; su extrapolación a "cualquier conexión iCal producto-Airbnb" (lo que enuncia este REQ) es un supuesto que RV03 §Supuestos S1 etiqueta con confianza **baja/media**, no un hecho adicional verificado — corrección BC5 | ACEPTACION §Conectividad-2 | Adaptador Airbnb | por construir |
| REQ-059 | Cuando el bloqueo de una fecha en Airbnb provenga de un calendario externo sincronizado, la UI indica que la edición debe hacerse en el sistema origen. | MUST | RV03-R-02 | [DATO] Airbnb art. 447 (F17) | ACEPTACION §UX-1 | Adaptador Airbnb | por construir |
| REQ-060 | El producto no promete ni implementa notificaciones push (webhooks) desde Airbnb sin confirmación directa vía acceso de partner aprobado. | MUST | RV03-R-03 | [R] solo fuentes de terceros confirman webhooks (F10) | ACEPTACION §Conectividad-2 | Adaptador Airbnb | bloqueado por externo |
| REQ-061 | Cualquier función de cancelación incluye advertencia explícita y requiere autorización humana confirmada, dado el costo económico documentado de la cancelación de host en Airbnb. | MUST | RV03-R-04 | [DATO] Airbnb F18 (10/25/50%, mín. $50 USD) | ACEPTACION §RV19/21-6 | Reservas | por construir |
| REQ-062 | El modelo de permisos de cohost refleja los tres niveles nativos de Airbnb (Full Access / Calendar+Messaging / Calendar) para consistencia con lo que un cohost puede hacer directamente en Airbnb. | MUST | RV03-R-05 | [DATO] Airbnb F12, F13 | ACEPTACION §Roles-1 | Propiedades/Roles | por construir |
| REQ-063 | El producto no representa en UI que puede sincronizar tarifas o datos de huésped vía iCal con Airbnb. | MUST | RV03-R-06 | [DATO] ausencia confirmada en F03/F04 | ACEPTACION §Conectividad-2 | Adaptador Airbnb | por construir |
| REQ-064 | Todo cambio de fechas de una reserva Airbnb se modela como solicitud sujeta a aprobación explícita del host, nunca automática. | MUST | RV03-R-07, RV02-R-07 | [DATO] Airbnb F20 | ACEPTACION §RV19/21-6 | Reservas | por construir |
| REQ-065 | Antes de comprometer soporte de "Co-Host Network" en España o mercados no listados, se verifica cobertura geográfica exacta con Airbnb. | SHOULD | RV03-R-08 | [DATO] lista de países F13 (España no confirmada) | ACEPTACION §Conectividad-3 | Propiedades/Roles | bloqueado por externo |
| REQ-066 | Ninguna alegación comercial de "integración certificada"/"Preferred+" con Airbnb promete criterios cuantitativos (SLA, latencia) no publicados. | MUST | RV03-R-09 | [R] F11 (página de marketing, no técnica) | ACEPTACION §Comercial-1 | Marketing/Legal | por construir |
| REQ-067 | El diseño de reglas de buffer/preparación no asume un máximo específico de días para Airbnb sin verificación directa adicional. | SHOULD | RV03-R-10 | [R] contradicción entre fuentes, F16 | ACEPTACION §Conectividad-2 | Adaptador Airbnb | por construir |

---

## 5. Conectividad — Booking.com (RV04, actualizado con evidencia B-002)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-068 | El calendario unificado NO trata una solicitud Request-to-Book (`INQUIRY`) pendiente de Booking.com como reserva confirmada a efectos de cerrar el inventario de origen, dado que Booking.com mismo no la bloquea. Internamente se modela como `ocupacion_unidad.estado='provisional', bloqueante=false` (§3.2 de BLUEPRINT), a diferencia de una solicitud pendiente de Airbnb (REQ-048, `bloqueante=true`). | MUST | RV04-R-01 | [DATO] RV04 F04; nota de riesgo (BC10): el umbral exacto de elegibilidad de RtB no está reconciliado entre dos páginas oficiales ("al menos 3 días" F04 vs. "más de 48 horas" F13, RV04 §7) — no afecta la regla de no-bloqueo en sí, sí el diseño de si/cuándo aplicar un bloqueo blando interno (RV04-R-01, BLUEPRINT §12) | ACEPTACION §Calendario-2 (caso 2) | Adaptador Booking | por construir |
| REQ-069 | La sincronización de reservas de Booking.com se implementa como polling continuo (recomendado 20s) con ack y deduplicación por `reservationId`, nunca como webhook. | MUST | RV04-R-02 | [DATO] RV04 F06, F07 | ACEPTACION §Calendario-2 (caso 6,7) | Adaptador Booking | bloqueado por externo (requiere certificación) |
| REQ-070 | El motor de cierre de disponibilidad soporta, como mínimo, `roomstosell`, `closedonarrival`, `closedondeparture`, `minimumstay(_arrival)`, `maximumstay(_arrival)` y `closed` para reflejar la semántica de Booking.com. | MUST | RV04-R-03 | [DATO] RV04 F09 | ACEPTACION §Calendario-1 | Adaptador Booking | bloqueado por externo |
| REQ-071 | El modelo de propiedad soporta `Quantity` (multi-unidad) a nivel de room type, distinto de habitación física individual. | SHOULD | RV04-R-04 | [DATO] RV04 F16 | ACEPTACION §Datos-1 | Propiedades/Unidades | por construir |
| REQ-072 | El manejo de cancelaciones diferencia explícitamente "cancelled" de "no-show" (endpoint y ventana temporal distintos); no se asume que un no-show libera inventario sin confirmarlo. | MUST | RV04-R-05 | [DATO]/[laguna] RV04 F10, F15 | ACEPTACION §Calendario-2 | Adaptador Booking | bloqueado por externo |
| REQ-073 | Todo mensaje saliente hacia huéspedes de Booking.com pasa por la Messaging API dentro de sus ventanas válidas documentadas. | MUST | RV04-R-06 | [DATO] RV04 F11 | ACEPTACION §RV19/21-6 | Mensajería | bloqueado por externo |
| REQ-074 | El proceso de certificación/going-live con Booking.com se planifica por API de forma independiente (Reservations/Content/Messaging con PCI/PII; Rates&Availability sin PCI/PII; Payments autoevaluación). | MUST | RV04-R-07 | [DATO] RV04 F02; b002-archivo F04 (certificación vs. autoevaluación confirmado en vivo) | ACEPTACION §Conectividad-4 | Plan enterprise | bloqueado por externo |
| REQ-075 | El estado de "partner directo de Booking.com" se reporta en toda superficie de producto como **PENDIENTE-EXTERNO con pausa activa declarada por el canal** ("pausing integrations with new connectivity providers until further notice"), no como "pendiente de aprobación" genérico. | MUST | Nuevo (D-011 actualizado) | [DATO] `docs/fuentes/b002-archivo.md` F01, lectura en vivo 2026-09-05 | ACEPTACION §Conectividad-4 | Cuentas de canal / Comercial | bloqueado por externo |
| REQ-076 | El sistema no ofrece conexión directa vía API de Connectivity de Booking.com a un anfitrión/propiedad individual; solo a través de un channel manager ya certificado o mediante la extranet manual del anfitrión. | MUST | Nuevo (D-011 actualizado) | [DATO] `docs/fuentes/b002-archivo.md` F02 ("We don't accept direct connections from individual properties") | ACEPTACION §Conectividad-4 | Cuentas de canal | por construir (vía channel manager) |
| REQ-077 | Ninguna cifra de frecuencia, elegibilidad o contenido del feed iCal de Booking.com se presenta como verificada en producto o en material comercial; se marca "SIN EVIDENCIA" hasta obtener fuente primaria (ni en vivo ni archivada disponible a la fecha). | MUST | RV04-R-08 (actualizado) | [DATO] `docs/fuentes/b002-archivo.md` F07 (cero capturas en Wayback, timeout/403 en vivo) | ACEPTACION §Conectividad-4 | Adaptador Booking (iCal) | bloqueado por externo |
| REQ-078 | Si Atiende se integra con Booking.com a través de un channel manager tercero certificado, esa dependencia adicional (dos capas: canal + channel manager) se declara explícitamente en cualquier SLA o contrato ofrecido al cliente. | MUST | Nuevo (D-011 actualizado) | [DATO] `docs/fuentes/b002-archivo.md` F02 | ACEPTACION §Conectividad-4 | Comercial/Legal | por construir |

---

## 6. Conectividad — Vrbo y otros canales (RV05, actualizado con evidencia B-002)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-079 | El calendario unificado trata iCal de Vrbo como canal de solo disponibilidad (sin tarifas ni datos de huésped), sin asumir paridad de datos con canales certificados. | MUST | RV05-R-01 | [DATO] RV05 (Vrbo Help, import/export) | ACEPTACION §Calendario-1 | Adaptador Vrbo | por construir |
| REQ-080 | El sistema soporta dos modos de integración con Vrbo, mutuamente excluyentes: Owner Dashboard (iCal) o software certificado (PMS). | MUST | RV05-R-02 | [DATO] RV05 | ACEPTACION §Conectividad-2 | Adaptador Vrbo | por construir |
| REQ-081 | El sistema modela explícitamente la latencia de propagación por canal (30 min–horas) en su lógica de "cierre", sin presentar el estado como sincronizado en tiempo real. | MUST | RV05-R-03 | [DATO] RV05 (30 min app, hasta 20 min propagación) | ACEPTACION §RV19/21-8 | Calendario/UX | por construir |
| REQ-082 | Antes de diseñar integración supply-side con Vrbo/Expedia, se valida directamente con Expedia Group Partner Central el nivel de certificación requerido (Elite/Preferred/Integrated) y su especificación técnica real. | MUST | RV05-R-04 (ampliado) | [DATO] `docs/fuentes/b002-archivo.md` F05 (Wayback 2026-03-10, confianza media): 3 niveles confirmados; requisitos exactos por nivel no confirmados | ACEPTACION §Conectividad-4 | Adaptador Vrbo | bloqueado por externo |
| REQ-083 | La integración con Google Vacation Rentals se trata como roadmap condicionado a invitación/Technical Account Manager de Google, no como feature de autoservicio inmediata. | COULD | RV05-R-05 | [DATO] RV05 | ACEPTACION §Conectividad-4 | Extensibilidad de canales | bloqueado por externo |
| REQ-084 | Cualquier integración de disponibilidad vía "calendar link" de Agoda advierte al usuario que no sincroniza tarifas y se desactiva si la propiedad pasa a multi-habitación. | COULD | RV05-R-06 | [R] confianza media-baja (Agoda) | ACEPTACION §Conectividad-4 | Extensibilidad de canales | por construir |
| REQ-085 | Ninguna afirmación de "Vrbo Connectivity Partner Program" en materiales comerciales cita costos o requisitos exactos por nivel (Elite/Preferred/Integrated) sin verificación adicional, dado que la única fuente es una captura archivada de 6 meses de antigüedad. | MUST | Nuevo | [R, confianza media] `docs/fuentes/b002-archivo.md` F05 | ACEPTACION §Comercial-1 | Comercial/Legal | bloqueado por externo |

---

## 7. Estrategia de conectividad por etapas (RV08)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-086 | La arquitectura soporta las tres rutas de conectividad (directa, channel manager, iCal) como módulos independientes y componibles por canal. | MUST | RV08-R-01 | SUPUESTO de diseño, coherente con RV17 §6 (adaptadores con capabilities) | ACEPTACION §Conectividad-1 | Arquitectura/Adaptadores | por construir |
| REQ-087 | El motor de cierre modela explícitamente la latencia máxima documentada por canal como ventana de riesgo cuando se use iCal, comunicándola como estado "eventual". | MUST | RV08-R-02 | [DATO] Airbnb 3h (confianza baja/media al generalizar más allá de calendarios de terceros, RV03 S1 — BC5), Vrbo 30min; Booking.com sin evidencia | ACEPTACION §RV19/21-8 | Calendario/UX | por construir |
| REQ-088 | Antes de comprometerse con conectividad directa certificada de cualquier canal, se realiza descubrimiento activo (formulario de partner) para costos/plazos reales; no se promete fecha de aprobación sin esa validación. | MUST | RV08-R-03 | [DATO/PENDIENTE] costos no públicos en ningún canal (RV08 §1) | ACEPTACION §Conectividad-4 | Plan enterprise | bloqueado por externo |
| REQ-089 | Si se evalúa un channel manager como capa intermedia, se prioriza a los que documentan API pública verificable (Guesty, Hostaway, Smoobu, OwnerRez) sobre los no verificados (Lodgify, Uplisting). | SHOULD | RV08-R-04 | [DATO/R] RV08 §2 | ACEPTACION §Conectividad-4 | Plan enterprise | por construir |
| REQ-090 | El sistema incluye detección de bucles de sincronización (reimportación de export propio, doble bloqueo iCal+channel manager) como caso de prueba explícito. | MUST | RV08-R-05, REQ-037 | [DATO] Vrbo advertencia oficial | ACEPTACION §Calendario-4 | Sincronización | por construir |

---

## 8. Operación reserva → salida (RV02)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-091 | El calendario distingue al menos tres estados de bloqueo: confirmado, provisional/pendiente, cancelado (corrección 2026-09-05: este REQ citaba "liberado", un estado que no existe en el enum real de la columna `estado` de `ocupacion_unidad` — BLUEPRINT §3.2 define `confirmado\|provisional\|cancelado\|conflicto_pendiente`; "cancelado" es el estado del enum que representa una noche que deja de estar ocupada por esa fila). El estado `provisional` se combina con un indicador independiente `bloqueante` (true/false) que decide si participa del `EXCLUDE` de BD (BLUEPRINT §3.2) — resuelve la reconciliación exigida por BC1 entre este REQ y la excepción de REQ-068 vs. REQ-048. | MUST | RV02-R-01, REQ-048 | [DATO] Airbnb art. 85 | ACEPTACION §UX-1 | Calendario/Reservas | por construir |
| REQ-092 | El sistema registra el timestamp exacto de confirmación de cada reserva, del cual dependen periodos de gracia y políticas de cancelación. | MUST | RV02-R-02 | [DATO] Airbnb art. 475 | ACEPTACION §Datos-1 | Reservas | por construir |
| REQ-093 | Ningún flujo del producto simula o sustituye la resolución humana de disputas/incidencias (Resolution Center); a lo sumo ayuda a recopilar evidencia para que un humano decida, respetando ventanas de reporte documentadas (72h). | MUST | RV02-R-04 | [DATO] Airbnb art. 767, 2868 | ACEPTACION §RV19/21-6 | Reservas/Incidencias | por construir |
| REQ-094 | Los mensajes puramente informativos/bajo riesgo pueden programarse por triggers de calendario sin revisión previa; cualquier mensaje con negociación, disculpa, oferta o respuesta a queja pasa por aprobación humana. | MUST | RV02-R-05 | [R] Hospitable (patrón de industria, no política de plataforma) | ACEPTACION §RV19/21-6 | Mensajería | por construir |
| REQ-095 | El motor de calendario genera el evento de liberación de instrucciones de acceso anclado a T-48h antes del check-in, sin depender de marca de cerradura específica. | SHOULD | RV02-R-06 | [DATO] Airbnb art. 1644 | ACEPTACION §UX-1 | Mensajería/Check-in | por construir |
| REQ-096 | El motor de reseñas (si se construye) se ancla a la fecha real de checkout y a la ventana de 14 días de Airbnb, con publicación conjunta; no se replica igual para Vrbo/Booking sin verificación adicional. | COULD | RV02-R-08 | [DATO] Airbnb art. 13; [laguna] Vrbo/Booking | ACEPTACION §Reputación-1 | Reputación | bloqueado por externo |
| REQ-097 | El producto no representa en UI/comercial cifras específicas de comisión, plazos de payout o condiciones de pago de Booking.com como verificadas. | MUST | RV02-R-09 | [DATO] bloqueo 403 sistemático en partner.booking.com | ACEPTACION §Comercial-1 | Finanzas/Comercial | bloqueado por externo |
| REQ-098 | Los eventos de checkout disparan automáticamente el cierre de "estancia activa" y la creación de una tarea de limpieza/turnover; el detalle exacto del disparador no está confirmado verbatim por ningún proveedor y debe validarse con el proveedor de limpieza elegido antes de construir la integración (nuance restaurado — corrección BC12). Esta automatización se limita a tareas operativas internas; no implica ni habilita cancelación de reserva ni contacto al huésped. | MUST | RV02-R-10, RV11-R-01 | [R] Breezeway (patrón de automatización por reglas y atributos de reserva, RV11) — no una cita verbatim del disparador exacto | ACEPTACION §Limpieza-1 | Limpieza | por construir |

---

## 9. Mensajería y experiencia del huésped (RV10)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-099 | El motor de mensajería soporta respuestas rápidas reutilizables y programadas por evento (nueva reserva, check-in, checkout). | MUST | RV10-R-01 | [DATO] Airbnb art. 2897-2899 | ACEPTACION §Mensajería-1 | Mensajería | por construir |
| REQ-100 | Todo mensaje saliente hacia Airbnb se valida contra el límite de 4,000 caracteres antes del envío. | MUST | RV10-R-02 | [DATO] Airbnb art. 2898 | ACEPTACION §Mensajería-1 | Mensajería | por construir |
| REQ-101 | El motor permite desactivar/omitir mensajes programados en reservas de última hora/estadías cortas por defecto, con opción de activarlos. | SHOULD | RV10-R-03 | [DATO] Airbnb art. 2897 | ACEPTACION §Mensajería-1 | Mensajería | por construir |
| REQ-102 | Para Booking.com, la automatización se limita por defecto a eventos post-reserva (confirmación, cancelación) hasta verificación primaria adicional. | MUST | RV10-R-04 | [R, confianza media-baja] Hospitable | ACEPTACION §Mensajería-2 | Mensajería | bloqueado por externo |
| REQ-103 | Para Vrbo, las plantillas no incluyen correo, teléfono, imágenes, logos ni HTML antes de confirmar reserva (el canal los redacta y puede penalizar). | MUST | RV10-R-05 | [R, confianza media-baja] Hospitable | ACEPTACION §Mensajería-2 | Mensajería | por construir |
| REQ-104 | Ninguna respuesta generada por IA se envía a un huésped sin aprobación humana explícita previa. | MUST | RV10-R-06, REQ-001; RV14-R-01 (diferencial de mercado: aprobación humana no-opcional y transversal — BC6) | SUPUESTO (decisión de producto) | ACEPTACION §RV19/21-6 | Mensajería/Automatización | por construir |
| REQ-105 | El sistema no genera, sugiere ni permite enviar mensajes que soliciten pago fuera de plataforma o compartan datos de contacto directo antes de confirmar reserva en el canal. | MUST | RV10-R-07 | [DATO] Airbnb art. 3059/209/4155 | ACEPTACION §Mensajería-1 | Mensajería | por construir |
| REQ-106 | Los datos personales del huésped se usan únicamente para la gestión operativa de la reserva vigente, con retención limitada y controles de seguridad equivalentes a cifrado; nunca para mensajes comerciales sin consentimiento expreso. | MUST | RV10-R-08 | [DATO] Airbnb art. 2862; RGPD | ACEPTACION §Privacidad-1 | Privacidad | por construir |
| REQ-107 | El sistema no presiona ni automatiza solicitudes a huéspedes para abrir cuentas, dejar reseñas o interactuar con terceros, salvo necesidad genuina del servicio. | MUST | RV10-R-09 | [DATO] Airbnb art. 2862 | ACEPTACION §Mensajería-1 | Mensajería | por construir |
| REQ-108 | El motor de plantillas/sugerencias de IA filtra lenguaje que excluya, discrimine o menosprecie por características protegidas. | MUST | RV10-R-10 | [DATO] Airbnb art. 2867 | ACEPTACION §Mensajería-1 | Mensajería/IA | por construir |
| REQ-109 | Se documenta a los operadores que los mensajes vía Airbnb pueden ser escaneados/analizados por Airbnb con fines de fraude/seguridad. | SHOULD | RV10-R-11 | [DATO] Airbnb Privacy Policy art. 3175 | ACEPTACION §Privacidad-2 | Privacidad/Comunicación | por construir |
| REQ-110 | Se definen triggers propios de escalamiento a humano (quejas, emergencias, solicitudes inusuales, reembolsos, VIP) como práctica de producto. | SHOULD | RV10-R-12, RV18-R-07 | [R] Guesty (documentación de producto de tercero) | ACEPTACION §RV19/21-6 | Mensajería/Automatización | por construir |

---

## 10. Limpieza, mantenimiento e incidencias (RV11)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-111 | El sistema crea una tarea de limpieza vinculada a cada reserva al check-out (o con antelación configurable) y la reprograma automáticamente si la fecha cambia, preservando al responsable asignado. | MUST | RV11-R-01 | [DATO] Breezeway, Hostaway, Guesty | ACEPTACION §Limpieza-1 | Limpieza | por construir |
| REQ-112 | El producto permite definir un buffer mínimo configurable entre checkout y check-in, traducido en bloqueo real de calendario. | MUST | RV11-R-02, REQ-054 | [DATO] Airbnb "preparation time" | ACEPTACION §UX-1 | Calendario/Limpieza | por construir |
| REQ-113 | Cada tarea de limpieza permite adjuntar fotos y marcar ítems con timestamp; "checklist incompleto" puede bloquear la reapertura automática de disponibilidad. | MUST | RV11-R-03 | [DATO] Guesty, Operto | ACEPTACION §Limpieza-2 | Limpieza | por construir |
| REQ-114 | Los checklists son parametrizables por propiedad, tipo de tarea y amenidad, reutilizables como plantilla adjunta a la regla que genera la tarea. | SHOULD | RV11-R-04 | [DATO] Operto Teams | ACEPTACION §Limpieza-2 | Limpieza | por construir |
| REQ-115 | El producto gestiona inventario/ropa blanca con alertas de stock bajo por umbral configurable, descontado automáticamente al completar checklists. | SHOULD | RV11-R-05 | [DATO] Breezeway | ACEPTACION §Limpieza-2 | Limpieza | por construir |
| REQ-116 | El sistema distingue personal interno de proveedores/vendors externos asignables a la misma tarea, con portal/app dedicada de solo esa tarea para el externo. | MUST | RV11-R-06 | [DATO] Operto, Breezeway, Hospitable (Teammate Portal) | ACEPTACION §Limpieza-2 | Limpieza | por construir |
| REQ-117 | El producto soporta notificación multicanal (al menos dos canales) configurable por tipo de evento de tarea (asignada/actualizada/cancelada/completada). | SHOULD | RV11-R-07 | [DATO] Breezeway, Hospitable | ACEPTACION §Limpieza-2 | Limpieza | por construir |
| REQ-118 | El sistema permite crear, documentar (fotos/video) y dar seguimiento a incidencias de mantenimiento de forma independiente del flujo de limpieza; el vínculo automático "incidencia→bloqueo de calendario" es una decisión de diseño propia (sin precedente de mercado), nunca cierra automáticamente ni cancela reservas confirmadas. | MUST | RV11-R-08, REQ-000 | SUPUESTO (sin evidencia de mercado de vínculo automático) | ACEPTACION §RV19/21-6 | Mantenimiento | por construir |
| REQ-119 | El bloqueo manual por mantenimiento se propaga a todos los canales conectados por el calendario unificado. | MUST | RV11-R-09 | [DATO] Vrbo "Block calendar dates" | ACEPTACION §Calendario-1 | Calendario/Mantenimiento | por construir |
| REQ-120 | El calendario muestra estado operativo (pendiente/en curso/completo/incidencia abierta) antes de la siguiente reserva, tolerando latencia de integraciones externas de terceros (minutos a horas, no tiempo real). | MUST | RV11-R-10 | [DATO] Operto (Master Calendar); Hospitable+ResortCleaning (hasta 2h de latencia) | ACEPTACION §UX-1 | Calendario/Limpieza | por construir |

---

## 11. Finanzas, owners, contabilidad y pagos (RV12)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-121 | El motor de owner statements permite configurar, por canal y propiedad, si el monto ingerido ya viene neto de comisión (Airbnb confirmado) o bruto (Booking/Vrbo a determinar), evitando doble descuento. | MUST | RV12-R-01 | [DATO] Airbnb "host-only" 14-16%, 16% México | ACEPTACION §Finanzas-1 | Finanzas/Owners | por construir |
| REQ-122 | El sistema modela el esquema de comisión "host-only" de Airbnb (14-16%, 16% México) como aplicable por defecto a anfitriones gestionados vía Atiende, editable si Airbnb lo cambia. | MUST | RV12-R-02 | [DATO] L-RV12-02 | ACEPTACION §Finanzas-1 | Finanzas/Owners | por construir |
| REQ-123 | El módulo de pagos soporta múltiples métodos de payout de Airbnb con tiempos distintos (30 min–7 días) y ventana de hasta 45 días por antifraude, sin marcar como "atrasado" un payout dentro de rango. | MUST | RV12-R-03 | [DATO] L-RV12-01 | ACEPTACION §Finanzas-1 | Finanzas/Owners | por construir |
| REQ-124 | El módulo de conciliación se implementa como adaptadores por canal (no formato único), priorizando Vrbo (export CSV/XLS oficial confirmado). | MUST | RV12-R-04 | [DATO] L-RV12-04 | ACEPTACION §Finanzas-2 | Finanzas/Owners | por construir |
| REQ-125 | La comisión de Booking.com y Vrbo es configurable manualmente por tenant/propiedad (no hardcodeada) hasta confirmación oficial del porcentaje. | MUST | RV12-R-05 | PENDIENTE (RV12 §3.2, §3.3) | ACEPTACION §Finanzas-2 | Finanzas/Owners | bloqueado por externo |
| REQ-126 | Ninguna funcionalidad de generación/timbrado de CFDI se libera sin (a) lectura confirmada de normativa vigente del SAT y (b) revisión de fiscalista mexicano. | MUST | RV12-R-06, REQ-007 | PENDIENTE-EXTERNO (sat.gob.mx inaccesible, RV12 §5) | ACEPTACION §Legal-1 | Finanzas/Legal | bloqueado por laguna legal |
| REQ-127 | Todo cambio a entidades financieras (statement, gasto, comisión, rol) se registra en log de auditoría append-only con actor, timestamp, valor anterior/nuevo. | MUST | RV12-R-07, REQ-020 | SUPUESTO (diseño interno) | ACEPTACION §Auditoría-1 | Finanzas/Auditoría | por construir |
| REQ-128 | El modelo de datos aísla estrictamente por tenant (empresa gestora), con excepción auditada para Superadmin Atiende. | MUST | RV12-R-08, RV17-R-06/07, RV19-R-08 | [DATO] RV17-F-05 (RLS fail-closed) | ACEPTACION §RV19/21-4 | Multitenancy | por construir |
| REQ-129 | Los flujos de pago del anfitrión permiten capturar el RFC por unidad en México y alertar riesgo de retención agravada (20%/100%) si falta, sin calcular ni declarar impuestos de forma autoritativa. | MUST | RV19-R-14 | [DATO, con laguna de vigencia] LISR/LIVA arts. 113-A/C, 18-J | ACEPTACION §Legal-1 | Finanzas/Legal | bloqueado por laguna legal |

---

## 12. Pricing y revenue management (RV13)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-130 | El motor propio de pricing (base + estacionalidad + descuentos) se exporta/sincroniza hacia un canal solo cuando exista integración API activa; para canales solo iCal, el pricing se gestiona desde Atiende o manualmente en el canal. | MUST | RV13-R-01 | [DATO] Airbnb art. 99, ausencia de precio en iCal | ACEPTACION §Pricing-1 | Pricing | por construir |
| REQ-131 | El motor de descuentos por duración soporta como mínimo los umbrales de 7+ noches (semanal) y 28+ noches (mensual), con overrides por canal. | SHOULD | RV13-R-02 | [DATO] Airbnb art. 1344, Vrbo | ACEPTACION §Pricing-1 | Pricing | por construir |
| REQ-132 | El motor de min-stay soporta reglas dinámicas por fecha de check-in y día de la semana, no solo un mínimo global. | SHOULD | RV13-R-03 | [DATO] Airbnb rule-sets art. 2061/484; Vrbo min-stay por check-in | ACEPTACION §Pricing-1 | Pricing | por construir |
| REQ-133 | Cuando Atiende active pricing dinámico propio o de tercero sobre un listing Airbnb/Vrbo, desactiva explícitamente el pricing nativo del canal (Smart Pricing/MarketMaker), dado que ambos anulan reglas externas si quedan activos. | MUST | RV13-R-04 | [DATO] Airbnb art. 1168/2061; Vrbo MarketMaker | ACEPTACION §Pricing-1 | Pricing | por construir |
| REQ-134 | Antes de escribir tarifas vía API con cualquier canal, se valida acceso de partner aprobado, dado que el detalle de campos de precio no es público sin esa aprobación. | MUST | RV13-R-05 | [PENDIENTE] Airbnb/Booking/Vrbo | ACEPTACION §Conectividad-4 | Pricing | bloqueado por externo |
| REQ-135 | El módulo de paridad de precios es configurable por jurisdicción/mercado, dado que Booking.com solo confirma eliminación de cláusulas de paridad en el EEE. | SHOULD | RV13-R-06 | [DATO] news.booking.com | ACEPTACION §Pricing-2 | Pricing/Legal | por construir |
| REQ-136 | El diseño de inventario multi-unidad mapea explícitamente "unidad física interna" a "listing representativo/padre" del canal, replicando el modelo de Airbnb "multiple units property" para ese canal. | SHOULD | RV13-R-07 | [DATO] Airbnb art. 4050 | ACEPTACION §Datos-1 | Propiedades/Unidades | por construir |
| REQ-137 | Si se integra con PriceLabs/Beyond Pricing/Wheelhouse, se solicita directamente el modelo de precio/comisión actualizado antes de incluirlo en propuesta comercial (ninguno lo publica en la página de producto consultada). | SHOULD | RV13-R-08 | PENDIENTE | ACEPTACION §Comercial-1 | Pricing/Comercial | bloqueado por externo |

---

## 13. Arquitectura, datos y multitenancy (RV17)

(Ver también sección 2, que agrupa los invariantes de calendario. Aquí solo lo transversal de plataforma.)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-138 | Toda tabla con RLS habilitado se evalúa también contra la necesidad de `FORCE ROW LEVEL SECURITY`, según si el rol de conexión del backend coincide con el propietario de las tablas. | MUST | RV17-R-07, D-020 | [DATO] RV17-F-05 | ACEPTACION §RV19/21-4 | Multitenancy | por construir |
| REQ-139 | Las políticas RLS se implementan con el patrón de función `security definer` parametrizada verificado en código real de `atiende-restaurantes`, no con el patrón sin parámetros descrito solo en prosa en el documento de Hoteles. | MUST | RV17-R-06, D-020 | [DATO] RV17-F-09 (código real) vs. RV17-F-08 (prosa) | ACEPTACION §RV19/21-4 | Multitenancy | por construir |
| REQ-140 | Toda operación sobre datos de propiedad/reserva/calendario verifica explícitamente el permiso del llamador sobre ese tenant/objeto específico en la capa de servicio, nunca solo en cliente. | MUST | RV19-R-08 | [DATO] OWASP ASVS 8.4.1/8.2.2/8.2.3/8.3.1 | ACEPTACION §RV19/21-4 (caso 18,19) | Seguridad/Multitenancy | por construir |
| REQ-141 | Los tokens/credenciales de canal se cifran en reposo (AES-256-GCM o ChaCha20-Poly1305), se rotan periódicamente y se almacenan con alcance mínimo por tenant/integración, nunca compartidos entre tenants. | MUST | RV19-R-06 | [DATO] OWASP Secrets Management Cheat Sheet, ASVS V14 | ACEPTACION §RV19/21-13 (corrección BC2: la cita anterior, §RV19/21-5, apuntaba al catálogo adversarial de 20 casos, sin relación con cifrado; se creó el criterio §RV19/21-13 dedicado) | Seguridad/Credenciales | por construir |
| REQ-142 | Ningún log contiene credenciales, tokens, PII de huéspedes ni el payload completo de un feed; los logs de sincronización se limitan a metadatos operativos. | MUST | RV19-R-07, RV20-R-03 | [DATO] OWASP ASVS 16.2.5, Logging Cheat Sheet; OTel Body/Attributes (RV20-F-07) | ACEPTACION §RV19/21-7 | Seguridad/Observabilidad | por construir |

---

## 14. Automatización, agentes de IA y tool-calling (RV18)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-143 | El backend resuelve, por servidor, qué tools están disponibles para cada invocación según la matriz rol×tool, antes de pasar la lista de tools al modelo. | MUST | RV18-R-04 | SUPUESTO de diseño, RV18 §3.1 | ACEPTACION §RV19/21-14 (corrección BC2: la cita anterior, §RV19/21-6, era "no cancelación automática de reservas", sin relación con routing de tools; se creó el criterio §RV19/21-14 dedicado) | Automatización agéntica | por construir |
| REQ-144 | Cada tenant tiene presupuesto de gasto de LLM reservado antes de cada llamada; al agotarse, las llamadas se sustituyen por respuesta determinista explícita, nunca fallo silencioso. | MUST | RV18-R-05, D-016 | [DATO] patrón Likida (RV18-F-10) | ACEPTACION §Automatización-1 | Automatización agéntica | por construir |
| REQ-145 | Toda tool-call (LLM o determinista) se registra con actor humano, rol, canal, timestamp, resultado y costo atribuido al modelo real que respondió esa ronda. | MUST | RV18-R-06; RV14-R-02 (diferencial de mercado: audit log de acciones de IA visible al usuario, ningún competidor investigado lo ofrece públicamente — BC6) | [DATO] RV18-F-08, F-09 | ACEPTACION §Automatización-2 | Automatización agéntica | por construir |
| REQ-146 | Un agente escala a intervención humana ante ambigüedad no resuelta, señales de escalada emocional, montos por encima de umbral configurable, o cualquier acción irreversible (esta última nunca ofrecida como tool). | MUST | RV18-R-07, REQ-000/002 | [DATO] RV18-F-06 | ACEPTACION §RV19/21-6 | Automatización agéntica | por construir |
| REQ-147 | Ningún agente pasa de "borrador con aprobación humana obligatoria" a menor fricción sin superar el dataset de evals con cero fallos de tool fuera de alcance; el envío autónomo sin aprobación está fuera de alcance de producto por regla de negocio, no es un nivel de autonomía disponible. | MUST | RV18-R-08 | SUPUESTO de diseño (umbrales propios) | ACEPTACION §Automatización-3 | Automatización agéntica | por construir |
| REQ-148 | El fallback entre proveedores de LLM se limita exclusivamente a la llamada de generación de texto/borrador; nunca re-ejecuta una tool de mutación ya corrida en la misma conversación. | MUST | RV18-R-09 | SUPUESTO de diseño | ACEPTACION §Automatización-2 | Automatización agéntica | por construir |
| REQ-149 | El tope de rondas de tool-calling por conversación se verifica antes de ejecutar la ronda siguiente; al alcanzarse, la conversación se marca para revisión humana en vez de devolver respuesta parcial como completa. | MUST | RV18-R-10 | SUPUESTO de diseño | ACEPTACION §Automatización-2 | Automatización agéntica | por construir |

---

## 15. Seguridad, privacidad y legal (RV19)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-150 | El producto provee aviso de privacidad configurable con las fracciones de la LFPDPPP (MX) y registro de actividades de tratamiento conforme al RGPD (ES/UE), sin generar contenido legal final sin revisión humana. | MUST | RV19-R-10 | [DATO] LFPDPPP Art.15 (D3); RGPD Art.5-6 (E1) | ACEPTACION §Legal-1 | Legal/Privacidad | bloqueado por laguna legal (revisión humana pendiente) |
| REQ-151 | El producto incluye bandeja de gestión de solicitudes ARCO/derechos del interesado con plazos legales por jurisdicción, como herramienta de flujo, no de decisión sustantiva. | MUST | RV19-R-11 | [DATO] LFPDPPP Arts. 21-34 (D2); RGPD Arts. 15-22 (E1) | ACEPTACION §Legal-1 | Legal/Privacidad | por construir |
| REQ-152 | El producto permite capturar y exportar los datos exigidos por RD 933/2021 (registro de viajeros España) con retención de 3 años, marcado como sujeto a confirmación legal del modelo operativo vigente. | SHOULD | RV19-R-12 | [DATO con laguna] RD 933/2021 (E2); Orden INT no confirmada (E3) | ACEPTACION §Legal-1 | Legal/Compliance | bloqueado por laguna legal |
| REQ-153 | El producto no muestra ni exige "número de registro" en anuncios de España asumiendo el Registro Único de Arrendamientos hasta confirmar la norma de transposición; se implementa como campo opcional configurable. | MUST | RV19-R-13 | [DATO parcial] Reglamento UE 2024/1028 Art.4.2/7 (E5); RD español no confirmado (E4) | ACEPTACION §Legal-1 | Legal/Compliance | bloqueado por laguna legal |
| REQ-154 | Ninguna automatización cancela reservas, modifica datos de huéspedes, ni los contacta sin autorización explícita y registrada del anfitrión/administrador. | MUST | RV19-R-15, REQ-000/001 | SUPUESTO reforzado por Airbnb ToS §16 (C4) | ACEPTACION §RV19/21-6 | Legal/Automatización | por construir |
| REQ-155 | Cualquier parser XML presente en el pipeline (más allá del parser ICS de texto plano) deshabilita DTD/entidades externas por completo. | MUST | RV19-R-05 | [DATO] OWASP XXE Prevention Cheat Sheet | ACEPTACION §RV19/21-15 (corrección BC2: la cita anterior, §RV19/21-3, era límites de tamaño del importador ICS — control relacionado pero distinto de XXE; se creó el criterio §RV19/21-15 dedicado) | Seguridad | por construir |

---

## 16. Operación, observabilidad y recuperación (RV20)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-156 | El sistema expone, por cuenta de canal, un Gauge de "edad de última sincronización exitosa" y un Counter de "tasa de errores de sync" con dimensión `error_class`. | MUST | RV20-R-01 | [DATO] OTel Metrics API/Data Model (RV20-F-04/F-05) | ACEPTACION §Operación-2 | Observabilidad | por construir |
| REQ-157 | Todo ciclo de sincronización se instrumenta como traza única con spans PRODUCER/CONSUMER en el cruce cola-worker, propagando contexto en el mensaje encolado. | MUST | RV20-R-02 | [DATO] OTel Tracing API/Messaging Spans (RV20-F-01/F-02/F-06) | ACEPTACION §Operación-2 | Observabilidad | por construir |
| REQ-158 | Se define y mide un SLO interno de latencia del ciclo de sincronización (propuesto p95 < 5s) exclusivamente sobre el camino controlado por el sistema; ninguna comunicación presenta como SLA propio la disponibilidad/latencia de APIs de canal. | MUST | RV20-R-05 | SUPUESTO de diseño, justificado en RV20 §3 | ACEPTACION §Operación-1 | Observabilidad | por construir |
| REQ-159 | Existe una prueba de restauración de backup automatizada y periódica (propuesta mensual) que falla visiblemente (severidad de drift crítico) si el backup no pasa verificaciones mínimas de integridad. | MUST | RV20-R-06 | SUPUESTO de diseño | ACEPTACION §Operación-3 | Operación/DR | por construir |
| REQ-160 | Todo restore de backup en producción va seguido obligatoriamente de reconciliación de drift contra canales reales antes de reanudar push automático. | MUST | RV20-R-07 | SUPUESTO, dependiente de D-010 | ACEPTACION §Operación-3 | Operación/DR | por construir |
| REQ-161 | El reprocesamiento de un evento tras crash de worker es idempotente end-to-end (BD y efecto hacia canales), observable vía trazas/métricas. | MUST | RV20-R-08 | SUPUESTO, dependiente de D-010 | ACEPTACION §Operación-3 | Operación/DR | por construir |
| REQ-162 | Toda migración de esquema sobre tablas de reservas/disponibilidad/eventos sigue el patrón expand/contract; ninguna migración bloqueante corre en horario pico de check-in/checkout. | MUST | RV20-R-09 | SUPUESTO de diseño | ACEPTACION §Operación-3 | Operación | por construir |
| REQ-163 | Toda funcionalidad que module dinero, cancelaciones o contacto a huéspedes se controla por feature flag con default `false`, verificable en configuración. | MUST | RV20-R-10 | [R] patrón BP-163 (línea de producto Hoteles, referencia interna) | ACEPTACION §Operación-1 | Operación | por construir |
| REQ-164 | Los simuladores de canal en desarrollo llevan nombre inequívoco de "simulador"; el arranque se rechaza si las credenciales parecen de producción real. | MUST | RV20-R-11, D-019 | SUPUESTO de diseño | ACEPTACION §Operación-4 | Operación/Dev | por construir |
| REQ-165 | El estado de un token de canal expirado/revocado se refleja en el estado del conector y pausa automáticamente el push hacia ese canal hasta reconexión manual; nunca reintenta indefinidamente contra credenciales revocadas. | MUST | RV20-R-12 | SUPUESTO, dependiente de D-017/RV17 | ACEPTACION §Operación-1 | Operación/Seguridad | por construir |
| REQ-166 | Existe un modo de degradación de solo-lectura del calendario cuando la base de escritura primaria no responde, con pausa automática de todo push saliente y señalización visible en UI. | MUST | RV20-R-13 | SUPUESTO de diseño | ACEPTACION §Operación-3 | Operación/DR | por construir |

---

## 17. Pruebas, aceptación y plan enterprise (RV21)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-167 | El motor de resolución de conflictos implementa el algoritmo UID → SEQUENCE → DTSTAMP de RFC 5546 §2.1.5, con prueba automatizada que lo verifique explícitamente. | MUST | RV21-R-01 | [DATO] RFC 5546 §2.1.5 (B5) | ACEPTACION §RV19/21-1 | Sincronización/Pruebas | por construir |
| REQ-168 | El sistema trata cada UID conocido con datos incompatibles como caso de revisión humana, nunca de fusión silenciosa. | MUST | RV21-R-02 | [DATO] RFC 5545 §3.8.4.7 (B1), ausencia normativa | ACEPTACION §Calendario-2 (caso 13) | Sincronización | por construir |
| REQ-169 | El cálculo de duración de estancia implementa las reglas de desambiguación DST de RFC 5545 §3.3.5 exactamente, con prueba sobre al menos una transición real. | MUST | RV21-R-03 | [DATO] RFC 5545 §3.3.5 (B6) | ACEPTACION §Calendario-2 (caso 14) | Sincronización | por construir |
| REQ-170 | El catálogo adversarial completo (20 casos) se ejecuta en CI antes de cualquier release que toque el motor de sincronización o el importador de feeds. | MUST | RV21-R-05 | SUPUESTO de proceso, catálogo derivado de RFC/OWASP | ACEPTACION §RV19/21-5 | Pruebas/CI | por construir |
| REQ-171 | Ningún objetivo de carga/latencia se publica como SLO comprometido antes de completar al menos un ciclo de piloto con datos reales. | MUST | RV21-R-06 | [DATO] ausencia de SLA oficial de ningún canal para iCal | ACEPTACION §Plan-1 | Plan enterprise | por construir |
| REQ-172 | El sistema maneja HTTP 429 y cierres de conexión por rate limit con backoff, sin asumir un límite numérico fijo como constante de arquitectura. | MUST | RV21-R-07 | [R, confianza media] Booking.com Connectivity API (10,000/min, B12) | ACEPTACION §Calendario-2 (caso 17) | Sincronización | por construir |
| REQ-173 | Ninguna acción derivada de un feed vacío o malformado se aplica de forma masiva/silenciosa sin alerta o confirmación explícita. | MUST | RV21-R-08 | SUPUESTO, casos adversariales 9-10 | ACEPTACION §Calendario-3 | Sincronización | por construir |

---

## 18. Modelo de negocio y costos (RV16)

| ID | Enunciado | Prioridad | Origen | Evidencia | Aceptación | Módulo | Estado |
|---|---|---|---|---|---|---|---|
| REQ-174 | El sistema de facturación soporta cuota base por unidad/mes con escalones de volumen. | MUST | RV16-R-01 | [DATO] benchmarks Lodgify/Uplisting/Hospitable | ACEPTACION §Comercial-2 | Facturación | por construir |
| REQ-175 | El sistema de facturación soporta un add-on de IA conversacional facturable por separado, desacoplado del ciclo de facturación de unidades. | MUST | RV16-R-02, D-018 | [DATO] Uplisting "AI Suite Unlimited" como precedente de mercado | ACEPTACION §Comercial-2 | Facturación | por construir |
| REQ-176 | La arquitectura registra telemetría de consumo de tokens por conversación (entrada/salida, por modelo) desde el primer lanzamiento. | MUST | RV16-R-03 | SUPUESTO explícito a reemplazar con datos reales | ACEPTACION §Automatización-2 | Observabilidad/IA | por construir |
| REQ-177 | El modelo de costos permite seleccionar dinámicamente el modelo de IA por tipo de tarea, dado que el costo por conversación varía hasta ~37.5x entre el modelo más económico y el más caro verificado (GPT-4o mini $0.0006 vs. Claude Opus 5 $0.0225), o ~5x si se comparan dos modelos de la misma familia (Claude Haiku 4.5 $0.0045 vs. Claude Opus 5 $0.0225). | SHOULD | RV16-R-06 | [DATO] precios oficiales Anthropic/OpenAI (RV16 §3b) — corrección aritmética BC4: la cifra "~5x" que RV16-R-06/este REQ afirmaban originalmente para el par GPT-4o mini/Claude Opus 5 es incorrecta ($0.0006 a $0.0225 es 37.5x, no 5x); el punto cualitativo (el costo varía mucho entre modelos) se mantiene con la cifra corregida | ACEPTACION §Comercial-2 (facturación del add-on de IA, no del router en sí); §Automatización-4 (corrección de cierre: §Comercial-2 solo verifica ciclos de facturación, sin relación con SELECCIONAR el modelo por tarea — se creó el criterio §Automatización-4 dedicado al router) | Facturación/IA | construido — `packages/domain/src/agentes/enrutadorModelo.ts` (`elegirModeloParaRonda`/`complejidadMaximaDeRonda`) enruta cada ronda a `claude-haiku-4-5` (clasificación/sin tool LLM), `claude-sonnet-5` (generación interna: `incidencia_resumir`, `limpieza_proponer_tarea`, `precio_sugerir_ajuste`) o `claude-opus-5` (generación compleja cara al huésped: `mensajeria_proponer_borrador`) según las tools disponibles de la ronda; `apps/api/src/agentes/proveedorClaude.ts` ya no fija un modelo por instancia — lo pide al router en cada `generar()`; `AGENTES_MODELO_LLM` queda como override manual opcional. Evidencia: `npm run test -w @atiende-rv/domain` (`enrutadorModelo.test.ts`, 10/10) + `npm run test -w @atiende-rv/api` (`proveedorClaude.test.ts`, 9/9, incluye captura del cuerpo HTTP real enviado a la Messages API) + `npm run typecheck` y `npm run lint` limpios en los 8 workspaces — rama `closure/req-177-router-llm-por-costo` |
| REQ-178 | Antes de fijar precio final por tenant, se completa la cotización oficial de infraestructura (AWS RDS+S3) vía calculadora oficial, dado que esta investigación no pudo extraer esas cifras literalmente. | SHOULD | RV16-R-05 | [PENDIENTE] tablas JS no extraídas | ACEPTACION §Comercial-2 | Infraestructura/Costos | por construir |
| REQ-179 | El parser de eventos ICS trata la ausencia y la presencia explícita de `STATUS:CANCELLED` como equivalentes semánticos de "esta reserva de canal ya no reclama esas noches", sujeto siempre a la regla de no reapertura de REQ-006/D-002 (una noche ocupada por otra causa no se libera). Añadido en esta corrección (BC6) como REQ dedicado — antes RV06-R-04 solo estaba cubierto implícitamente por REQ-005/REQ-028. | MUST | RV06-R-04 | [DATO] RFC 5545 (semántica de `STATUS` opcional en `VEVENT`) | ACEPTACION §Calendario-2 (caso 3) | Sincronización | por construir |

---

## Resumen por prioridad

Conteo verificado con `grep -c` sobre las columnas de prioridad de este
archivo (180 filas REQ-000 a REQ-179, tras añadir REQ-179 en esta corrección
— BC6):

| Prioridad | Nº de requisitos |
|---|---|
| MUST | 148 |
| SHOULD | 28 |
| COULD | 4 |

(Corrección 2026-09-05: la versión anterior de esta tabla decía 149/29/5 —cada cifra inflada en 1 respecto al recuento real por columna, que suma 180 y coincide con las 180 filas declaradas arriba. Recontado con un patrón anclado a los valores exactos `MUST`/`SHOULD`/`COULD` de la columna de prioridad, confirmado independientemente por la reverificación de cierre de Fase 1.)

## Resumen por estado

Conteo aproximado por lectura de la columna "Estado" de cada dominio; ante
cualquier discrepancia, la fuente de verdad es el conteo real de filas de
este archivo, no esta tabla resumen, que debe recalcularse en cada
actualización sustancial del catálogo.

| Estado | Nº de requisitos (aprox.) |
|---|---|
| por construir | ~130 |
| bloqueado por externo | ~35 |
| bloqueado por laguna legal | ~14 |
