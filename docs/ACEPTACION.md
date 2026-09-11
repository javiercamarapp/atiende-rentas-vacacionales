# Criterios de aceptación — Atiende Rentas Vacacionales

Documento acumulativo: cada módulo de investigación (RVxx) añade su propia sección de criterios de aceptación verificables. Ningún criterio se marca cumplido sin el comando y la evidencia esperada indicados. Este archivo es un **borrador**; no reemplaza la revisión legal/técnica humana de cada criterio antes de su uso como gate de release.

---

## RV19/RV21 — Seguridad, privacidad, legal y pruebas

Fuente: `docs/investigacion/RV19-seguridad-privacidad-legal.md` y `docs/investigacion/RV21-pruebas-aceptacion.md`. Ledger: `docs/fuentes/rv19-21.md`.

1. **Resolución de conflictos UID/SEQUENCE/DTSTAMP**: ejecutar la suite unitaria del motor de conflictos (`<comando de test suite, ej. npm test -- conflict-resolution>`). Evidencia esperada: reporte de test en verde cubriendo explícitamente los casos "mismo UID, SEQUENCE distinto" y "mismo UID+SEQUENCE, DTSTAMP distinto".
2. **Bloqueo SSRF**: ejecutar la suite de seguridad del importador contra la lista de URLs de prueba (localhost, 169.254.169.254, rangos RFC1918, esquemas no-http). Evidencia esperada: todas las peticiones rechazadas antes de conexión de red saliente, verificable en log de la suite con 0 conexiones salientes registradas hacia esas URLs.
3. **Límites de tamaño del importador ICS**: alimentar el importador con un feed de tamaño/profundidad de recurrencia por encima del límite configurado. Evidencia esperada: el feed se rechaza con error explícito registrado, sin caída del proceso ni consumo de memoria fuera de límite (adjuntar métrica de memoria del proceso durante la prueba).
4. **Aislamiento multitenant**: ejecutar la suite de pruebas de privilegios que intenta acceso cross-tenant sobre el calendario/reservas. Evidencia esperada: 100% de los intentos cross-tenant rechazados con error de autorización, verificable en el reporte de la suite.
5. **Catálogo adversarial completo (20 casos)**: ejecutar la suite adversarial completa en CI (`<comando de CI, ej. make test-adversarial>`). Evidencia esperada: reporte de CI con los 20 casos identificados por nombre y en verde; cualquier caso omitido debe estar documentado como laguna abierta, no silenciado.
6. **No cancelación automática de reservas**: revisión de código/prueba que confirme que ninguna ruta del motor de sincronización invoca una cancelación de reserva sin un flag de autorización explícita del anfitrión. Evidencia esperada: grep/análisis estático del código mostrando 0 llamadas de cancelación fuera del flujo autorizado, más prueba de integración que verifique que un conflicto detectado produce una alerta, no una cancelación.
7. **Logs sin PII/secretos**: ejecutar un import de prueba con datos de huésped ficticios y tokens de canal ficticios, luego inspeccionar los logs generados. Evidencia esperada: grep de los logs no encuentra el token ni datos de huésped en texto plano (comando de verificación documentado y su salida "0 coincidencias").
8. **Medición separada de latencia**: extraer del sistema de observabilidad un reporte de al menos una ejecución real (o de piloto) mostrando latencia interna y latencia por canal como métricas distintas. Evidencia esperada: dashboard o export con ambas series claramente etiquetadas y no combinadas en un solo número.
9. **Avisos de privacidad y flujo ARCO/RGPD**: revisión firmada por la persona/rol legal designado del contenido generado del aviso de privacidad y del flujo de solicitudes de derechos. Evidencia esperada: documento de aprobación fechado y referenciado en el sistema de gestión de tareas del proyecto.
10. **Registro de viajeros (España) — solo si se activa esta función**: prueba de captura y exportación de los datos exigidos por RD 933/2021 con retención configurada a 3 años. Evidencia esperada: exportación de muestra más confirmación legal explícita de que el modelo operativo usado corresponde al vigente (referenciar la verificación de la laguna E3 de `rv19-21.md` como resuelta, no omitida).
11. **Número de registro en anuncios (UE 2024/1028) — solo si se activa esta función**: confirmación explícita de que la jurisdicción de destino activó el régimen de registro condicional (Art. 4.2) antes de habilitar el campo como obligatorio en la UI. Evidencia esperada: documento de verificación legal referenciado, no solo la existencia del campo en el producto.
12. **Homologación con canales**: para cada integración que dependa de certificación externa (Connectivity Partner de Booking.com, API de Airbnb), el estado se reporta como "pendiente de aprobación externa" con la fecha de solicitud, y **nunca se marca como completado** sin la confirmación explícita del canal (correo/portal de aprobación adjunto como evidencia).
13. **Cifrado de secretos en reposo con rotación** (añadido en esta corrección, BC2 — antes REQ-141 citaba erróneamente el ítem 5, el catálogo adversarial, sin relación con cifrado): inspeccionar el almacén de credenciales/tokens de canal (`cuenta_canal.credenciales_ref`) insertando un token de prueba y consultando directamente la fila subyacente en la base de datos, sin pasar por la capa de aplicación. Evidencia esperada: el valor almacenado no coincide con el texto plano del token (grep del token original contra el valor almacenado con 0 coincidencias; formato/longitud consistente con AES-256-GCM o ChaCha20-Poly1305); existe un mecanismo/documentación de rotación periódica de claves de cifrado con fecha de última rotación registrada, y las credenciales de un tenant no son legibles ni derivables desde el contexto de otro tenant.
14. **Routing de tools resuelto en servidor por rol** (añadido en esta corrección, BC2 — antes REQ-143 citaba erróneamente el ítem 6, "no cancelación automática de reservas", sin relación con routing de tools): con tres sesiones de prueba en los tres niveles de permiso de colaborador (acceso total, calendario+mensajería, solo calendario), inspeccionar la lista de `tools` efectivamente pasada al modelo en cada llamada (log de la petición al LLM antes de enviarla). Evidencia esperada: la lista de tools difiere según el rol de la sesión (p. ej. una sesión "solo calendario" nunca recibe una tool de mensajería o de sugerencia de precio en su contexto), y esa resolución ocurre en el backend antes de construir la petición al modelo, verificable porque el filtrado no depende de ningún dato que el propio modelo controle.
15. **Prevención de XXE en cualquier parser XML** (añadido en esta corrección, BC2 — antes REQ-155 citaba erróneamente el ítem 3, límites de tamaño del importador ICS, un control relacionado pero distinto): si el pipeline incluye o llega a incluir un parser XML más allá del importador ICS de texto plano, alimentarlo con un payload de prueba que declare una entidad externa (`<!ENTITY xxe SYSTEM "file:///etc/passwd">`) y una referencia a DTD externa. Evidencia esperada: el parser rechaza o ignora la DTD/entidad externa (configuración equivalente a `disallow-doctype-decl`/`FEATURE_SECURE_PROCESSING` activa), sin exponer contenido del sistema de archivos del servidor ni emitir una petición de red hacia la URL declarada en la entidad.

---

## Ampliación de producto completo (post-RV01–RV21)

Fuente: los 21 módulos de `docs/investigacion/`, `docs/DECISIONES.md`,
`docs/REQUISITOS.md`, `docs/fuentes/b002-archivo.md` (evidencia de conectividad
Booking.com/Vrbo, 2026-09-05). Cada criterio indica comando/evidencia
esperada. Ningún criterio se marca cumplido sin esa evidencia adjunta, y
ninguno sustituye revisión legal/técnica humana antes de usarse como gate de
release (misma advertencia del encabezado de este documento).

### §Calendario-1 — Invariantes de datos del calendario maestro

1. **Exclusion constraint de no solapamiento**: ejecutar contra
   `embedded-postgres` (no solo PGlite) dos inserciones concurrentes de rangos
   solapados sobre la misma `unidad_id`. Evidencia esperada: la segunda
   inserción es rechazada con el error de exclusion constraint de PostgreSQL;
   dos rangos adyacentes (`[in,out)` contiguos, mismo día de checkout/check-in)
   se insertan ambos sin error.
2. **Rango semiabierto forzado**: alimentar el importador con un evento
   `tstzrange` construido sin el tercer argumento explícito. Evidencia
   esperada: la aplicación rechaza el insert o lo normaliza a `'[)'` antes de
   persistir — nunca se acepta un bound ambiguo.
3. **Fuente de verdad única**: con un feed de canal en cuarentena (ver
   §Calendario-3), consultar el estado de disponibilidad de esa unidad.
   Evidencia esperada: el estado devuelto proviene de `ocupacion_unidad`
   (fuente interna), nunca de un cache directo del feed remoto.
4. **Outbox transaccional**: matar el proceso worker entre el `push` a un
   canal y el `UPDATE procesado_en` (inyección de fallo controlada). Evidencia
   esperada: al reiniciar, el evento pendiente se reprocesa y produce el mismo
   efecto final sin duplicar el bloqueo (verificable por conteo de filas antes/
   después).

### §Calendario-2 — Catálogo de 20 casos adversariales (obligatorio, RV21 §3)

Ejecutar la suite completa en CI (`make test-adversarial` o equivalente
documentado por el equipo). Evidencia esperada por caso: reporte en verde,
identificado por nombre; cualquier caso omitido debe declararse como laguna
abierta, nunca silenciado.

| # | Caso | Criterio de aceptación verificable |
|---|---|---|
| 1 | Doble evento (mismo UID+SEQUENCE, contenido distinto) | DTSTAMP decide el desempate; el estado final refleja exactamente un evento |
| 2 | Reserva simultánea en dos canales para las mismas noches | Conflicto detectado, marcado para revisión humana, ninguna reserva cancelada automáticamente |
| 3 | Eventos desordenados (CANCEL antes que CREATE) | El mayor SEQUENCE/DTSTAMP gana; el CANCEL prematuro no se aplica como estado final |
| 4 | Modificación de fechas (mismo UID, rango distinto) | El bloqueo se mueve completamente; noches liberadas verificables antes/después |
| 5 | Cancelación que no reabre noches ocupadas por otra causa | 0 falsos positivos de disponibilidad en fixture con reservas solapadas por error deliberado |
| 6 | Timeout tras éxito remoto | Reintento con clave de idempotencia no duplica el efecto |
| 7 | Reintento de import ya procesado | Diff de estado antes/después = vacío |
| 8 | ACK perdido | Reproceso posterior no corrompe el estado |
| 9 | Feed malformado | Rechazo explícito y registrado, sin estado parcial/inconsistente |
| 10 | Feed vacío | No se interpreta como "cancelar todas las reservas"; requiere confirmación/alerta |
| 11 | Feed inaccesible | Reintento con backoff, cuarentena tras N intentos, último estado conocido preservado |
| 12 | Bloqueo manual superpuesto con import | Bloqueo manual preservado o alerta explícita, nunca sobrescritura silenciosa |
| 13 | UID reciclado | Marcado para revisión humana, nunca fusión silenciosa de dos reservas distintas |
| 14 | DST en cálculo de noches/duración | Coincide exactamente con la regla de RFC 5545 §3.3.5, verificado con fixture real |
| 15 | Estancias contiguas (checkout=check-in mismo día) | No se marca error de solapamiento |
| 16 | Crash/replay a mitad de batch | Estado final equivalente a procesar el batch una sola vez |
| 17 | Límites de API / HTTP 429 | Backoff respetado, sin bucle de reintento agresivo |
| 18 | Aislamiento multitenant (cross-tenant) | Toda petición cross-tenant es rechazada con error de autorización, verificado con una suite de pruebas de privilegios que intenta explícitamente el cruce (RLS o control equivalente activo) — corrección BC11: se ajustó de "100% de intentos" (cuantificador no trazable palabra por palabra a RV21 §3 caso 18) a la formulación exacta de la fuente |
| 19 | Escalada de privilegios | Enforcement verificado en capa de servicio, no solo UI; intento auditado |
| 20 | SSRF (URL de feed apuntando a rango privado/metadata) | Petición rechazada antes de cualquier conexión de red saliente, verificado contra la lista completa de rangos de RV19-R-01/02 (169.254.169.254, RFC1918, loopback, etc.) — corrección BC11: se restauró la exigencia de verificación contra la lista completa que RV21 §3 caso 20 especifica y que esta fila había omitido |

### §Calendario-3 — Feed inaccesible/malformado ≠ calendario vacío

Alimentar el importador con: (a) un endpoint que responde timeout, (b) un
`.ics` vacío pero sintácticamente válido, (c) un `.ics` malformado
(BEGIN/END desbalanceado). Evidencia esperada: en los tres casos, el estado
de disponibilidad de esa unidad/canal permanece congelado en el último valor
válido conocido (verificable por consulta directa), se genera una entrada de
"en cuarentena" con timestamp, y ninguna noche se marca disponible como
consecuencia directa del fallo.

### §Calendario-4 — Anti-eco y bucles de sincronización

Simular: exportar un bloqueo hacia un canal ficticio (simulador etiquetado,
ver §Operación-4) y hacer que ese mismo simulador lo "reexporte" en su
siguiente respuesta de import. Evidencia esperada: el sistema lo reconoce
como eco (por UID/namespace o por hash de contenido) y no crea un segundo
bloqueo `RESERVA_CANAL`; verificable por conteo de bloqueos activos antes/
después = igual.

### §UX-1 — Calendario visual: razón de bloqueo y acciones seguras

Inspección manual guiada (o snapshot de UI en CI): para cada fecha bloqueada
de una unidad de prueba con al menos 4 razones distintas activas en distintas
fechas (reserva de canal, bloqueo manual, bloqueo por regla automática,
bloqueo por sincronización externa), la UI muestra la razón exacta al
seleccionar la fecha. Evidencia esperada: captura o test de UI que confirme
que ninguna fecha con razón `RESERVA_CANAL` o `sincronización externa`
permite un botón/acción de "desbloquear" habilitado.

### §UX-2 — Estado de conexión honesto por canal

Con tres cuentas de canal en estados distintos (`no_conectado`,
`bloqueado_por_partner`, `producción` con última sync exitosa reciente),
inspeccionar el panel de conectividad. Evidencia esperada: los tres estados
se muestran con etiquetas distintas, nunca colapsados a un genérico
"conectado/no conectado"; el estado `producción` solo aparece si existe un
registro de sync exitoso dentro de la ventana esperada del canal.

### §UX-3 — Vistas de calendario y selección múltiple

Prueba de UI (Playwright): (a) cambiar entre vista de línea de tiempo
multi-propiedad y vista mensual de una unidad; (b) seleccionar un rango de
fechas por arrastre en escritorio y por gesto táctil equivalente en un
viewport móvil. Evidencia esperada: ambas vistas renderizan sin error; la
selección múltiple produce el mismo conjunto de fechas en ambos modos de
interacción.

### §UX-4 — Accesibilidad y zona horaria (validación previa a promesa)

Antes de comunicar soporte de accesibilidad (lector de pantalla, contraste,
navegación por teclado) como diferenciador de producto: ejecutar una auditoría
automatizada (axe-core o equivalente) contra el calendario maestro. Evidencia
esperada: reporte de auditoría con 0 violaciones críticas, o declaración
explícita de las violaciones pendientes como laguna abierta — nunca una
afirmación de accesibilidad sin este reporte adjunto (ninguna plataforma del
sector investigada en RV09 documenta este aspecto públicamente, por lo que no
existe un estándar de mercado que replicar por defecto).

### §Checkin-1 — Evento de liberación de instrucciones de acceso (T-48h)

Añadida 2026-09-10 al cerrar REQ-095 — la fila de REQ-095 en
`REQUISITOS.md` citaba `§UX-1` por error de copia (esa sección es sobre
razón de bloqueo en el calendario visual, sin relación con este REQ).

Con una reserva confirmada y bloqueante en una unidad cuya propiedad tiene
`zona_horaria` conocida (ej. `America/Cancun`, UTC-5 sin DST): ejecutar el
motor de liberación de instrucciones de acceso con un reloj inyectado en
tres puntos de referencia respecto al check-in estimado (día de check-in a
la hora de corte configurable, en la zona horaria de la propiedad) —
más de 48h antes, exactamente 48h antes, y después del check-in estimado.
Evidencia esperada: el evento se genera (fila nueva en `outbox_evento`,
`tipo_evento = 'liberar_instrucciones_acceso'`) si y solo si el reloj cae
dentro de `[checkin_estimado - 48h, checkin_estimado)` — nunca antes,
nunca después; una segunda corrida dentro de la misma ventana no duplica
el evento (idempotencia real, verificable contando filas de
`outbox_evento` para esa reserva); el payload del evento no contiene
ninguna mención a marca o proveedor de cerradura específico (verificable
por inspección/grep del payload); y el mismo cálculo aplica correctamente
para propiedades en otras zonas horarias (ej. `Asia/Tokyo`, UTC+9),
confirmando que la ventana usa la zona horaria real de la propiedad y no
UTC/hora de servidor.

Nota sobre el límite de esquema (no una laguna nueva, ya documentada en
`apps/api/src/workers/notificacionesHuesped/recordatorioCheckin.ts`):
`ocupacion_unidad.rango` es un `daterange` — el esquema no guarda una hora
de check-in real. "T-48h" se aproxima explícitamente como se describe
arriba; si en el futuro se agrega una hora de check-in real por
reserva/propiedad, la implementación debe reemplazar la hora de corte
configurable por ese dato en vez de seguir aproximando.

Verificado 2026-09-10 (cierre de REQ-095): `npm run test
--workspace=@atiende-rv/api` (unitario, orquestación pura con `ejecutor`
simulado) y `npm run test:integration --workspace=@atiende-rv/api --
test/integration/liberacionInstruccionesAccesoSql.test.ts` (7 casos
contra Postgres real vía `embedded-postgres`, cubriendo exactamente los
puntos de referencia y zonas horarias de arriba) — ambos en verde.

### §Roles-1 — Permisos de colaborador por propiedad

Con tres usuarios de prueba en los tres niveles (acceso total,
calendario+mensajería, solo calendario) sobre la misma propiedad: intentar,
desde cada uno, cancelar una reserva, editar el precio, y editar el método de
pago de otro usuario. Evidencia esperada: solo el usuario de acceso total
logra las dos primeras acciones; ningún usuario, incluido el de acceso total,
logra editar el método de pago de otro usuario (reservado al propietario);
los otros dos niveles reciben error de autorización en las tres acciones
salvo lo explícitamente permitido a su nivel.

### §Roles-2 — Catálogo de jobs-to-be-done del cohost

Verificar en el modelo de datos que existen entidades/tareas asignables para:
configuración de anuncio, precios, mensajería, soporte in situ, limpieza/
mantenimiento, fotografía, por propiedad. Evidencia esperada: cada categoría
tiene un tipo de tarea o módulo correspondiente en el esquema, no solo texto
libre.

### §Roles-3 — No asumir paridad de roles entre canales

Revisión de documentación de producto y UI: ninguna pantalla afirma que un
permiso configurado en Atiende tiene "el mismo efecto" en Booking.com o Vrbo
sin una nota explícita de que el modelo de roles de esos canales no está
verificado. Evidencia esperada: grep de textos de UI/ayuda sin afirmaciones
de paridad no calificadas para esos dos canales.

### §Roles-4 — Roles internos y multi-empresa-gestora

Con un propietario vinculado a dos empresas gestoras distintas, verificar que
cada empresa gestora solo ve las propiedades que administra de ese
propietario, nunca las de la otra. Evidencia esperada: consulta cruzada
rechazada por RLS (ver §RV19/21-4).

**Verificado (REQ-023/H-048)**: el modelo N:M owner↔empresa_gestora existe
desde `packages/db/src/migrations/0133_owner_empresa_gestora.ts` — tabla
puente `owner_empresa_gestora`, migración de los datos 1:N existentes hacia
esa tabla (`INSERT ... SELECT ... WHERE empresa_gestora_id IS NOT NULL`,
cero pérdida), trigger que sigue sincronizando la columna de alta
`owner.empresa_gestora_id` (compatibilidad hacia atrás con todo el código y
fixtures existentes), y las políticas `owner_select`/`owner_escritura`
redefinidas sobre el nuevo predicado `owner_pertenece_a_tenant` (EXISTS
sobre la tabla puente) en vez del `owner_tenant_id` de una sola empresa
(0014). `owner_empresa_gestora` tiene su propia RLS (no fuga a un tenant
ajeno con qué OTRAS empresas_gestoras comparte owner un propietario que sí
tiene en común).

Comando ejecutado y resultado real (repo, rama `closure/h048-multitenancy-n-a-m`):

```
npm run test:integration -w @atiende-rv/db -- rls.test.ts
# Test Files  1 passed (dentro de 11 passed)
# Tests  27 passed (20 preexistentes + 7 nuevas del bloque
#   "REQ-023/H-048 §Roles-4: multitenancy N:M owner↔empresa_gestora")
```

El caso central del criterio de aceptación: un owner dado de alta en la
empresa_gestora del tenant A se vincula (vía la tabla puente) también a la
empresa_gestora de un tenant C nuevo, cada una con su propia
propiedad/unidad administrando a ese mismo owner. `adminA` ve el owner y
"Prop A", nunca "Prop C"; `adminC` ve el MISMO owner (antes de este cambio
esto era 0 filas — el owner solo pertenecía al tenant de alta) y "Prop C",
nunca "Prop A"; `adminB` (sin ninguna vinculación) no ve ni el owner ni
ninguna de las dos propiedades. Sensibilidad de la prueba confirmada
manualmente: deshabilitando temporalmente la redefinición de RLS de esta
migración, la misma suite falla exactamente en
`adminC ve el MISMO owner compartido... expected +0 to be 1`, antes de
restaurarse a la versión que sí pasa — la prueba detecta de verdad la
ausencia del fix, no es un mock que pasa por pasar.

También se corrigió, como parte del mismo cambio, un hueco de
correctitud financiera que el N:M habría abierto en
`apps/api/src/routes/finanzas.ts` (`POST /statements/generar`): el `JOIN`
original tomaba el `tenant_id` del `owner_statement` desde la empresa
gestora de ALTA del owner (columna `owner.empresa_gestora_id`), lo cual
—una vez el owner puede pertenecer a más de una empresa gestora— fugaría el
dato financiero al tenant de alta aunque la sesión que generó el statement
fuera de otra empresa gestora vinculada. Ahora se exige que el owner esté
vinculado, vía la tabla puente, al tenant de la SESIÓN que hace la
petición; sin tenant propio en la sesión (superadmin) y con más de una
empresa gestora vinculada visible, se rechaza explícitamente en vez de
elegir una en silencio. Verificado sin regresión:
`npm run test:integration -w @atiende-rv/api -- finanzasPricingReportes.test.ts`
→ 18/18 en verde (incluye "genera el owner statement del periodo" y
"propietario del owner ve su propio statement").

Regresión de todo lo demás verificada en la misma sesión: typecheck del
monorepo completo (`npm run typecheck`, 7/7 workspaces en verde), lint
(`npm run lint`, 0 errores), tests unitarios de raíz (`npm run test`, 277+112+140+89+304+39+12
= 973 en verde), integración de raíz (`npm run test:integration`,
139+84 = 223 en verde) y la suite adversarial de multitenancy
(`npm run test:adversarial -- --filter=multitenant`, 8/8 en verde,
caso 18/19 sin cambios).

### §Conectividad-1 — Interfaz de adaptador con capacidades declaradas

Para cada adaptador de canal implementado, ejecutar una prueba que invoque
`getConnectionState()` y verifique que el valor devuelto pertenece al enum
cerrado (`no_conectado | bloqueado_por_partner | sandbox | producción`) y que
`"producción"` solo se devuelve si existe un registro de sync exitoso
reciente en la base de datos de prueba. Evidencia esperada: test unitario en
verde que fuerza el caso "credenciales presentes pero sin sync reciente" y
confirma que el resultado no es `"producción"`.

### §Conectividad-2 — Latencia declarada por canal en la matriz

Inspeccionar el contenido servido al panel de administración para la matriz
de conectividad por cuenta. Evidencia esperada: para Airbnb aparece la
cifra de ~3h [DATO, confianza baja/media al generalizar a cualquier conexión
iCal producto-Airbnb — RV03 S1, corrección BC5; latencia externa no
controlada por el sistema]; para Vrbo, ~30min+20min [DATO]; para Booking.com
vía iCal, la etiqueta explícita "SIN EVIDENCIA — no verificado" en vez de
cualquier cifra estimada; para Booking.com vía partner directo, la etiqueta
"pausado por el canal" con la cita de origen.

### §Conectividad-3 — Cobertura geográfica no asumida

Antes de habilitar la Co-Host Network de Airbnb como función visible en un
mercado no confirmado en la lista oficial (incluyendo España), verificar
manualmente en una cuenta de prueba de ese mercado. Evidencia esperada:
documento de verificación fechado, o la función permanece oculta/deshabilitada
para ese mercado.

### §Conectividad-4 — Dependencias externas declaradas como tales

Revisión de cualquier material comercial o de producto que mencione
"Connectivity Partner", "Preferred+", certificación de Airbnb/Booking/Vrbo.
Evidencia esperada: cada mención incluye la fecha de solicitud y el estado
real (`pendiente` | `pausado por el canal` | `aprobado`, con evidencia
adjunta) — nunca se presenta como "en proceso" sin esa fecha y estado.

### §Mensajería-1 — Límites y filtros de contenido

Enviar, en un entorno de prueba, un mensaje de 4,001 caracteres hacia el
adaptador de Airbnb, y un mensaje generado por IA que intente ofrecer un
descuento no autorizado o compartir un contacto directo antes de la
confirmación de reserva. Evidencia esperada: el primero es rechazado/
truncado con error explícito antes del envío; el segundo es bloqueado por el
filtro de contenido antes de llegar al huésped.

### §Mensajería-2 — Automatización conservadora por canal sin verificación

Para Booking.com y Vrbo, intentar programar un mensaje pre-reserva con datos
de contacto directo (teléfono/email) en la plantilla. Evidencia esperada: el
sistema rechaza o redacta esos campos por defecto para esos dos canales,
reflejando la postura conservadora adoptada mientras no exista verificación
primaria.

### §Limpieza-1 — Generación y reprogramación de tareas

Confirmar un checkout de prueba y luego modificar la fecha de esa reserva.
Evidencia esperada: se crea una tarea de limpieza vinculada al checkout
original; al modificar la fecha, la tarea se reprograma automáticamente
preservando el responsable asignado (verificable por consulta directa a la
tabla de tareas antes/después).

### §Limpieza-2 — Checklist, inventario y portal de proveedor externo

Completar un checklist de limpieza con fotos adjuntas y timestamps por ítem;
verificar que el inventario configurado se descuenta automáticamente al
completar. Evidencia esperada: cada ítem del checklist tiene timestamp de
finalización; el nivel de inventario decrece exactamente en la cantidad
configurada; un usuario "proveedor externo" solo puede ver/aceptar/completar
la tarea asignada, sin acceso al resto del sistema.

### §Finanzas-1 — Owner statement sin doble descuento de comisión

Con una reserva de Airbnb configurada como "monto ya neto de comisión" (según
RV12), generar el owner statement del periodo. Evidencia esperada: el
statement no resta nuevamente la comisión de Airbnb sobre el bruto original;
el cálculo parte del monto neto ya recibido.

### §Finanzas-2 — Conciliación por canal y comisión configurable

Importar un "Payout summary" de Vrbo de prueba (CSV/XLS con formato oficial
documentado) y verificar la conciliación automática contra las reservas del
periodo. Evidencia esperada: cada línea del payout se asocia correctamente a
una reserva; para Booking.com/Vrbo, el porcentaje de comisión usado en el
cálculo es editable por tenant/propiedad, no una constante hardcodeada en el
código (verificable por inspección de configuración, no de código fuente).

### §Datos-1 — Multi-unidad y mapeo a listing representativo

Crear una propiedad con 3 unidades y verificar que cada una tiene su propio
invariante de exclusión independiente (dos unidades de la misma propiedad
pueden reservarse simultáneamente sin conflicto entre sí). Evidencia
esperada: dos reservas simultáneas en unidades distintas de la misma
propiedad se insertan sin error; una tercera reserva solapada en la misma
unidad que una de ellas es rechazada.

### §Auditoría-1 — Log de mutaciones financieras y acceso "romper cristal"

Ejecutar un ajuste manual sobre un owner statement ya generado y un acceso de
Superadmin Atiende a datos de un tenant. Evidencia esperada: ambas acciones
generan una entrada en `audit_log` con actor, timestamp, valores previos/
nuevos (o motivo, en el caso del acceso de superadmin); el ajuste al
statement versiona el documento en vez de sobrescribirlo.

### §Privacidad-1 — Minimización de `huesped_minimo`

Inspección de esquema: verificar que la tabla de huésped no contiene campos
de historial de marketing, segmentación cross-reserva, ni perfil unificado.
Evidencia esperada: diff de esquema contra la especificación de RV17 §1.4;
cualquier campo adicional requiere una decisión de producto documentada.

### §Privacidad-2 — Aviso a operadores sobre escaneo de mensajes por el canal

Revisión de la documentación de usuario del producto. Evidencia esperada:
existe una sección visible que informa que los mensajes vía Airbnb pueden ser
escaneados/analizados por Airbnb con fines de fraude/seguridad.

### §Legal-1 — Ninguna función fiscal/legal sin verificación y revisión humana

Para cada función marcada `bloqueado por laguna legal` en
`docs/REQUISITOS.md` (CFDI, registro de viajeros España, número de registro de
anuncio): confirmar que en el código/configuración de producción esa función
está detrás de un feature flag en `false`, y que existe un documento de
verificación legal fechado antes de activarla. Evidencia esperada: flag
verificado en configuración + documento de aprobación legal referenciado
(mismo criterio que el punto 9-11 de la sección RV19/RV21 original de este
archivo).

### §Legal-2 — Nunca scraping ni sesión personal del anfitrión

Auditoría de código: grep de dependencias/uso de automatización de navegador
(Playwright/Puppeteer/Selenium) contra dominios de canal fuera del alcance de
pruebas E2E propias. Evidencia esperada: 0 coincidencias de automatización de
sesión contra dominios de producción de Airbnb/Booking.com/Vrbo.

### §Legal-3 — Bandeja de solicitudes ARCO/RGPD (REQ-151, cierre 2026-09-10)

REQ-151 exige una herramienta de FLUJO (no de decisión sustantiva): cola de
tickets de derechos del interesado (acceso, rectificación, cancelación,
oposición / RGPD) con plazo por jurisdicción, estado y responsable
asignado. A diferencia de REQ-150/152/153, este ID **no** depende de la
revisión legal pendiente (`docs/BLOQUEOS.md`) — no genera ningún texto
legal, solo registra el ticket y calcula el plazo estatutario citado en
`docs/REQUISITOS.md` (LFPDPPP Arts. 21-34; RGPD Arts. 15-22).

**Implementación** (rama `closure/req-151-bandeja-arco`):
- `packages/db/src/migrations/0133_solicitud_arco.ts` — tabla
  `solicitud_arco` con RLS (`FORCE ROW LEVEL SECURITY`, aislada por
  tenant+rol ROLES_ADMIN, sin política de DELETE), columna `plazo_limite`
  `GENERATED ALWAYS AS (fn_calcular_plazo_arco(jurisdiccion, recibida_en))
  STORED` (no editable a mano), y un `CHECK` que impide marcar un ticket
  `resuelta`/`rechazada` sin `resolucion_notas` + `resuelta_en`. Trigger de
  auditoría dedicado que excluye PII del interesado del JSON auditado
  (§Privacidad-1).
- `apps/api/src/routes/solicitudesArco.ts` — `GET/POST /solicitudes-arco`,
  `GET/PATCH /solicitudes-arco/:id`, ROLES_ADMIN, resolver/rechazar exige
  `resolucionNotas` en la misma petición.
- `apps/web/src/pages/legal/SolicitudesArcoPage.tsx` — bandeja visual
  (filtro por estado, alta, panel de gestión con asignación de
  responsable), ruta `/legal/solicitudes-arco` (ROLES_ADMIN), enlazada
  desde `AdminSidebar` (grupo PLATAFORMA).

**Evidencia** (comando + resultado, corridos dentro del worktree de
cierre):
- `npm run typecheck` (repo completo, 7 workspaces) → 0 errores.
- `npm run lint` (repo completo) → 0 errores (1 warning preexistente sin
  relación, `SesionProvider.tsx`).
- `cd packages/db && npx vitest run test/integration --config
  vitest.integration.config.ts` → 12 test files, 90 tests, todos en verde,
  incluido `solicitudArcoRls.test.ts` (13 tests: RLS FORCE activo,
  aislamiento cross-tenant, un operador no ve la bandeja, INSERT sin sesión
  rechazado, ninguna política de DELETE existe, plazo LFPDPPP=20 días
  hábiles desde un lunes cae 4 semanas después, plazo RGPD=+1 mes exacto,
  `plazo_limite` rechaza un UPDATE directo, jurisdicción desconocida
  rechazada por el CHECK, e invariantes de resolución con/sin notas).
- `cd apps/api && npm run test:integration` → 15 test files, 148 tests,
  todos en verde, incluido `solicitudesArco.test.ts` (9 tests: 403 para rol
  no-admin, plazo LFPDPPP/RGPD calculado en la respuesta, 422 por
  jurisdicción inválida, aislamiento cross-tenant en listado y en GET
  directo, 422 al resolver sin `resolucionNotas`, ciclo de vida completo
  asignar→en_proceso→resuelta, 404 en id inexistente, filtro por estado).
- `npm test` (repo completo, 7 workspaces) → verde.
- `cd apps/web && npm run build` → build de producción exitoso.

Sin credenciales reales ni servicio externo involucrado — REQ-151 es
puramente interno (BD + API + UI propias), por lo que no hay bloqueo
externo que reportar.

### §Automatización-1 — Presupuesto duro de IA reservado antes de llamar

Simular un tenant con saldo insuficiente y disparar una solicitud que
requeriría invocar al LLM. Evidencia esperada: la llamada al modelo no se
ejecuta; el sistema devuelve la respuesta determinista de "presupuesto
agotado" (mismo criterio que RV18 §8 mecanismo 5).

### §Automatización-2 — Trazabilidad y atribución de costo real

Simular un fallback de proveedor de LLM a mitad de una conversación de
prueba. Evidencia esperada: el registro de `tool_call_log` atribuye el costo
de cada ronda al modelo que realmente respondió esa ronda, no al modelo
nominal configurado (RV18 §8 mecanismo 4); cada tool-call queda registrada
con actor, rol, canal, timestamp y resultado.

### §Automatización-3 — Ningún salto de fase de autonomía sin evals en verde

Antes de mover un agente de "Fase 1 (100% aprobación humana)" a "Fase 2
(borrador de baja fricción)": ejecutar el dataset de evals de RV18 §7.2.
Evidencia esperada: reporte con 0 fallos automáticos de "tool fuera de
alcance" y ≥95% de aciertos en criterios de contenido; documento de decisión
de producto que autoriza el cambio de fase, fechado.

### §Automatización-4 — Router dinámico de modelo LLM por complejidad de tarea (REQ-177)

Invocar `elegirModeloParaRonda`/`complejidadMaximaDeRonda`
(`packages/domain/src/agentes/enrutadorModelo.ts`) con conjuntos de tools
disponibles de distinta complejidad, y verificar en `ProveedorLLMClaude`
que el cuerpo de la petición HTTP real hacia la Messages API varía su
campo `model` según esas tools — nunca un único modelo fijo de instancia
leído de una sola variable de entorno global para todo el tráfico.
Evidencia esperada: una ronda sin tools que requieran LLM (clasificación/
conversación simple) envía el modelo más barato del catálogo; una ronda
con la tool de borrador de mensajería al huésped (generación compleja de
cara al huésped) envía el modelo más caro; una ronda con solo tools de
generación interna de riesgo medio envía un tercer modelo intermedio,
distinto de los otros dos; la variable de entorno `AGENTES_MODELO_LLM`,
cuando está presente, sigue pudiendo forzar un único modelo para toda
ronda (override operativo), pero su ausencia ya NO implica un modelo por
defecto fijo — implica enrutamiento dinámico. Comando:
`npm run test -w @atiende-rv/domain -- enrutadorModelo` y
`npm run test -w @atiende-rv/api -- proveedorClaude` (o su equivalente
`vitest run`), ambos en verde.

### §Operación-1 — Runbook de alerta nunca cancela ni contacta

Simular las cuatro alertas de RV20 §2 (edad de sync, tasa de error, drift,
cola creciente) en un entorno de prueba. Evidencia esperada: en ningún caso
la alerta ejecuta una cancelación de reserva o un envío directo a huésped; el
único efecto automatizable observado es la pausa reversible del push hacia el
canal afectado.

### §Operación-2 — Métricas y trazas conforme a OpenTelemetry

Ejecutar un ciclo de sincronización de prueba de extremo a extremo y exportar
las métricas/trazas generadas. Evidencia esperada: existe un Gauge de "edad
de última sync" y un Counter de "tasa de errores" con dimensión
`error_class`; la traza del ciclo muestra spans PRODUCER/CONSUMER encadenados
con el mismo `TraceId`.

### §Operación-3 — Restauración de backup y reconciliación posterior

Ejecutar una restauración de backup en un entorno aislado seguida del flujo
de reconciliación de drift. Evidencia esperada: el backup restaurado pasa las
verificaciones mínimas de integridad (conteo de filas, integridad
referencial, una reserva de prueba recuperable); la reconciliación de drift
se ejecuta automáticamente antes de que se reanude cualquier push automático
de disponibilidad.

### §Operación-4 — Simuladores de canal inequívocos

Intentar arrancar un simulador de canal con credenciales que coincidan con el
patrón de credenciales de producción. Evidencia esperada: el arranque se
rechaza explícitamente con un error que indica el motivo.

### §Operación-5 — Modo degradado de solo-lectura del calendario (REQ-166/H-091)

Añadida en el cierre de H-091 (Lote de cierre REQ-166): REQ-166 citaba
§Operación-3 desde el catálogo original, pero esa sección describe la
restauración de backup (REQ-160/161/162) — un criterio distinto, sin
ninguna sección propia para el enunciado real de REQ-166 ("modo de
degradación de solo-lectura del calendario cuando la base de escritura
primaria no responde, con pausa automática de todo push saliente y
señalización visible en UI"). Esta sección cierra ese vacío con el
criterio real.

Apagar el proceso de la base de datos PRIMARIA (proceso Postgres real
detenido, no una excepción simulada) mientras una réplica de lectura
(`DATABASE_URL_REPLICA`) sigue viva, y verificar:

1. `GET /unidades/:id/calendario` sigue respondiendo 200 con datos
   correctos (servidos por la réplica vía `EnrutadorLecturaReplica`,
   `packages/db/src/runner/enrutadorLecturaReplica.ts`) — el calendario
   permanece legible en modo de solo lectura.
2. `GET /health/detallado` reporta `status: "degradado"` y
   `modoDegradadoCalendario: true`, y APAGA automáticamente el flag
   `sync.push_automatico` (auditado, actor `monitor-salud-primario`) — sin
   que un operador tenga que intervenir para que la pausa ocurra.
3. Con `sync.push_automatico` en `false`, el cron real de push saliente
   (`GET /internal/cron/outbox-worker`) NO procesa ningún evento
   pendiente del outbox — la pausa es efectiva sobre el push real, no solo
   un campo decorativo en un registro de flags.
4. La reactivación de `sync.push_automatico` NUNCA es automática — exige
   una acción explícita de un operador (mismo criterio que la
   reconciliación de drift tras un restore de backup, §Operación-3).
5. La UI del calendario (`apps/web/src/pages/calendario/`) muestra un
   banner visible ("Modo degradado: calendario en solo lectura") mientras
   `GET /health/detallado` reporte `modoDegradadoCalendario: true`.

Evidencia esperada: DOS clusters `embedded-postgres` reales e
independientes (primario + una "réplica" sembrada a mano — sin streaming
replication real de Postgres, imposible de levantar en este entorno de
construcción, límite documentado también en `enrutadorLecturaReplica.ts`);
apagar el PROCESO real del primario, nunca una función que lanza a mano.
Verificado en
`apps/api/test/integration/calendarioModoDegradadoPrimario.test.ts` (los 5
puntos de arriba, contra Postgres real) y
`apps/api/test/integration/calendarioReplicaLectura.test.ts` (wiring del
enrutador al endpoint + fallback real ante la réplica caída).

### §Comercial-1 — Ninguna cifra de mercado/competidor sin verificación directa

Revisión de cualquier material comercial que cite comisión de Booking.com/
Vrbo, precio de PriceLabs/Beyond/Wheelhouse, o descuento Genius. Evidencia
esperada: cada cifra citada tiene una fuente primaria verificada adjunta con
fecha de consulta, o no se cita.

### §Comercial-2 — Facturación en dos ciclos independientes

Verificar en el sistema de facturación que la cuota base por unidad y el
add-on de IA se facturan en ciclos independientes y pueden variar
independientemente. Evidencia esperada: factura de prueba con ambas líneas
desglosadas por separado.

### §Reputación-1 — Motor de reseñas no replicado sin verificación

Verificar que el motor de reseñas (si existe) solo aplica la ventana de 14
días de Airbnb a reservas de ese canal; para Vrbo/Booking.com, confirmar que
no se aplica la misma regla sin verificación adicional documentada.

### §Plan-1 — Ningún SLO publicado antes del piloto

Revisión de material comercial/contractual anterior a completar la Fase 1 del
plan enterprise (§13 de `docs/BLUEPRINT.md`). Evidencia esperada: ningún
documento compromete una cifra de latencia/disponibilidad como SLA firme
antes de que exista al menos un ciclo de piloto con datos reales de al menos
dos semanas.

---

## Criterios que NO pueden cerrarse sin aprobación externa

Esta sección enumera explícitamente qué NO puede marcarse "hecho" por el
equipo interno, porque depende de un tercero fuera del control del proyecto.
Ningún gate de release puede tratar estos puntos como completados sin la
evidencia externa exacta que se describe.

1. **Partner directo de Booking.com (Connectivity API)**: Booking.com declara
   en vivo (`connect.booking.com`, leído 2026-09-05) que está *"pausing
   integrations with new connectivity providers until further notice"*
   [DATO, `docs/fuentes/b002-archivo.md` F01]. Este criterio permanece
   cerrado hasta que Booking.com comunique explícitamente la reapertura de
   admisión, con esa comunicación adjunta como evidencia (correo o anuncio
   oficial del portal de partners). No se acepta una fecha estimada por el
   equipo interno como sustituto.
2. **Conexión directa de una propiedad individual a Booking.com sin
   intermediario**: excluida por diseño declarado del canal [DATO, F02: "We
   don't accept direct connections from individual properties right now"],
   no solo por proceso de aprobación — este criterio no se "resuelve" con
   más esfuerzo de ingeniería; solo cambia si Booking.com cambia su política
   pública.
3. **Elegibilidad y frecuencia del iCal de Booking.com para "homes"/
   alojamientos vacacionales**: sin evidencia primaria de ningún tipo (ni en
   vivo ni archivada — cero capturas de Wayback Machine para
   `partner.booking.com`/`partnerhelp.booking.com`, F07). Solo se cierra con
   acceso directo a una cuenta de partner autenticada o con una respuesta
   oficial de soporte de Booking.com citada con fecha.
4. **Certificación como partner de conectividad de Airbnb (Homes/Activities
   API)**: requiere NDA, revisión de seguridad de datos e implementación de
   features obligatorias en 6 meses post-aprobación (RV03 §5, F06); el
   proceso de aprobación en sí no tiene plazo público. Se cierra solo con la
   confirmación de aceptación de Airbnb (correo/portal de partner) adjunta.
5. **Requisitos exactos, costos y política de admisión del Vrbo Connectivity
   Partner Program (niveles Elite/Preferred/Integrated)**: la única evidencia
   disponible es una captura archivada de Wayback Machine con 6 meses de
   antigüedad respecto a esta investigación (`docs/fuentes/b002-archivo.md`
   F05, confianza media). Se cierra solo con lectura directa de una cuenta de
   partner de Expedia Group vigente, o con confirmación por escrito de
   Expedia Group Partner Central.
6. **Vigencia de tasas de retención ISR (4%/20%) e IVA (50%/100%) en México
   tras las reformas de 2024/2021**: sat.gob.mx fue inaccesible en toda la
   investigación (SPA sin contenido estático extraíble, `docs/BLOQUEOS.md`
   B-005). Se cierra solo con verificación directa del portal del SAT o con
   confirmación escrita de un contador/fiscalista mexicano con cita a la
   normativa vigente.
7. **Existencia del Real Decreto español de "Registro Único de
   Arrendamientos" y de la Orden INT del modelo operativo del parte de
   viajeros (RD 933/2021)**: `docs/BLOQUEOS.md` B-003, cupo de búsqueda
   agotado, mivau.gob.es/interior.gob.es con 403, BOE.es con error de
   parámetros. Se cierra solo con verificación manual directa en boe.es,
   mivau.gob.es o interior.gob.es, o con opinión escrita de un despacho legal
   español especializado.
8. **Regulación local de alojamiento turístico de la Ciudad de México**:
   `docs/BLOQUEOS.md` B-004, error de certificado TLS y SPA sin contenido
   estático en las fuentes oficiales intentadas. Se cierra solo con consulta
   manual directa a la Gaceta Oficial de la Ciudad de México o a SECTURCDMX.
9. **Fecha exacta de entrada en aplicación del Reglamento (UE) 2024/1028** y
   confirmación de si España activó el régimen condicional de registro (Art.
   4.2): no verificado con cita literal del articulado final (RV19 §6.9). Se
   cierra solo con lectura directa de EUR-Lex de la versión consolidada
   vigente o con confirmación de un despacho legal español/UE.
10. **Cualquier modelo de precio/comisión de PriceLabs, Beyond Pricing,
    Wheelhouse, o de Booking.com/Vrbo directamente**, dado que ninguna página
    oficial consultada lo publica de forma explícita y verificable (RV13 §4,
    RV16 §2). Se cierra solo con respuesta directa del proveedor o con
    lectura de una página de precios oficial con cifra explícita.
