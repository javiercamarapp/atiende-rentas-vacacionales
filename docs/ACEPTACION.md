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
