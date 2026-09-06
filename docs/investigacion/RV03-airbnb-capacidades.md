# RV03 — Matriz de capacidades Airbnb (calendario, API, roles)

Módulo de investigación para Atiende Rentas Vacacionales. Todas las afirmaciones están respaldadas en el ledger `docs/fuentes/rv03-airbnb.md` (referencias F01–F22). Fecha de consulta: 2026-09-05.

**Principio rector del producto (no negociable):** el calendario unificado debe CERRAR disponibilidad entre canales; nunca cancelar reservas confirmadas ni contactar huéspedes sin autorización explícita del anfitrión.

---

## 1. Resumen ejecutivo

Airbnb ofrece tres vías de conexión con niveles de control y fiabilidad muy distintos: (a) un **programa de API para partners aprobados** (Homes API / Activities API, bajo NDA, revisión de seguridad y certificación — F05, F06, F09), con documentación técnica detallada solo accesible tras aprobación; (b) **sincronización iCal** manual entre calendarios, que Airbnb documenta explícitamente como un ciclo de actualización **cada 3 horas, no instantáneo** (F01), y que solo transporta disponibilidad (ocupado/bloqueado) — la afirmación de que el feed de importación **no** incluye datos de huésped **no está documentada por Airbnb y se trata como NO CONFIRMADA** (corrección C2, ver §5 y Lagunas #6); y (c) **gestión manual** directa en la interfaz de Airbnb.

Ninguna de las tres vías permite prometer "cero overbooking" de forma absoluta: la vía API depende de aprobación de partner y de detalles técnicos (rate limits, webhooks) que Airbnb no publica completamente en fuentes abiertas (laguna crítica, F10); la vía iCal tiene una ventana de latencia reconocida por el propio Airbnb de horas, no segundos.

Airbnb SÍ documenta con claridad: reglas de disponibilidad que generan bloqueos automáticos (mínimo/máximo de noches, anticipación, tiempo de preparación — F15, F16); que las noches bloqueadas por un calendario sincronizado NO pueden desbloquearse manualmente desde Airbnb (F17); que cancelar una reserva confirmada como host conlleva penalización económica y bloqueo del calendario en esas fechas (F18) — refuerzo directo de la regla de negocio de nunca cancelar sin autorización; y tres niveles de permisos de co-anfitrión con control diferenciado sobre calendario, mensajes y precios, pero nunca sobre pagos de otros usuarios (F12, F13, F14).

Zonas de incertidumbre relevantes para el diseño de producto: nombres exactos de scopes de API, existencia y especificación real de webhooks (solo confirmados por fuentes de terceros, no por Airbnb), el flujo de consentimiento OAuth del host, y el límite máximo exacto de tiempo de preparación/turnover.

---

## 2. Vías de conexión: API partner vs iCal vs manual

| Dimensión | API Partner (Homes/Activities API) | iCal (exportar/importar) | Manual (interfaz Airbnb) |
|---|---|---|---|
| **Acceso/aprobación** | Requiere ser aceptado en un "API Program"; NDA mutuo, aceptar API Terms, Partner Specific Terms, revisión de seguridad de datos, implementar features obligatorias en 6 meses (F06) | Sin aprobación previa; disponible a cualquier host desde su panel (F01, F03) | Sin aprobación; acceso directo de cualquier host/co-host con permiso (F13) |
| **Autoridad de cuenta** | Cada persona que actúa por la organización partner debe registrar y mantener cuenta Airbnb propia en buen estado (F07) | El host controla su propia cuenta; no hay "cuenta de partner" | El host o co-host actúa con su propia sesión |
| **Consentimiento del host** | SIN EVIDENCIA de flujo textual exacto de autorización OAuth del host hacia la app partner (laguna, F07) | Consentimiento implícito: el host pega manualmente la URL del feed externo en su cuenta (F01) | No aplica (acción directa del propio host) |
| **Credenciales/sandbox/producción** | Existe "Sandbox V2" y "API Explorer" mencionados en el portal de desarrolladores; acceso completo a detalles técnicos gated tras aprobación de partner (F09) — SIN EVIDENCIA de detalle de credenciales OAuth exacto | No aplica (solo URL de feed iCal, sin credenciales OAuth) | No aplica |
| **Direccionalidad** | Bidireccional según scope (gestión de listados, disponibilidad, reservas — F09), pero especificación exacta no verificada públicamente | Bidireccional pero asimétrica: Airbnb exporta bloqueos derivados de reglas de disponibilidad (F03); al importar, trae disponibilidad; si también trae identidad de huésped o tarifa NO está confirmado por fuente oficial (F04, corrección C2 — ver §5) | Bidireccional manual (el propio usuario edita) |
| **Frecuencia/latencia real** | SIN EVIDENCIA pública de SLA/latencia interna de la API (no confirmado en esta sesión — laguna) | Documentado explícitamente: actualización automática **cada 3 horas** (F01); calendarios múltiples pueden actualizar en momentos distintos entre sí (F01) | Instantánea (acción directa del usuario) |
| **Webhook vs polling** | Terceros afirman existencia de "Airbnb Webhooks API" con eventos de reservas/mensajes/calendario (F10), pero **NO CONFIRMADO en fuente oficial de Airbnb accesible públicamente** — tratar como laguna, no como hecho | No aplica (iCal es un modelo de "pull"/polling por definición, ciclo de 3h) | No aplica |
| **Límites/reintentos** | SIN EVIDENCIA pública (rate limits no documentados en fuente accesible) | SIN EVIDENCIA de límite en número de calendarios conectables por anuncio (F22, laguna) | No aplica |
| **Cobertura — disponibilidad** | Sí, mencionada como capacidad de Homes API ("availability synchronization during booking" — F09) | Sí, es su función principal (F01, F03) | Sí, control total |
| **Cobertura — tarifas** | Mencionada en descripción de partners de software ("synchronizes availability, rates, rules" — F11, pero es página de MARKETING, no técnica) | SIN EVIDENCIA de que el feed iCal exportado incluya tarifas (F03, laguna) | Sí, control total |
| **Cobertura — restricciones (min/max noches, buffers)** | SIN EVIDENCIA directa de exposición vía API en fuente pública | Sí: el feed exportado incluye bloqueos derivados de min noches, preparación y anticipación (F03) | Sí, configurable directamente (F15, F16) |
| **Cobertura — reservas** | Sí ("reservation retrieval and management" — F09) | Indirecta: reservas se ven como noches bloqueadas, sin detalle de huésped (F03, F04) | Sí, control total |
| **Cobertura — modificaciones/alteration requests** | SIN EVIDENCIA pública específica | No aplica directamente al feed; el cambio de fechas requiere aprobación del host en la plataforma (F20), efecto en calendario durante la solicitud pendiente SIN EVIDENCIA | Sí, aprobar/rechazar solicitud de cambio de fechas (F20) |
| **Cobertura — cancelaciones** | SIN EVIDENCIA pública específica de endpoint | El bloqueo por cancelación de host permanece (no se puede desbloquear vía iCal ni manualmente si el sistema lo marca como reserva sincronizada — F17); cancelación de host conlleva penalización y bloqueo de fechas (F18) | Cancelar como host tiene consecuencias documentadas: fee mínimo $50 USD, escalas 10/25/50% según antelación, y bloqueo del calendario en esas fechas (F18) |
| **Cobertura — datos de huésped** | Mencionado como parte de "Messages API" para comunicación con huéspedes en Activities API (F09); alcance exacto para Homes API SIN EVIDENCIA | **NO CONFIRMADO** si se transfieren o no al importar (F04, corrección C2 — releído el 2026-09-05, la fuente citada solo dice "We import up to 2 years of data" y no menciona huésped/PII/identidad en ningún punto) | Sí, visibles en la interfaz nativa de Airbnb |
| **Cobertura — mensajería** | Sí, "Messages API" mencionada explícitamente para Activities API (F09); alcance para Homes API no verificado | No aplica | Sí, nativo |

---

## 3. Semántica de calendario Airbnb

- **Bloqueos vs reservas:** el calendario del host distingue noches disponibles (blancas) de noches bloqueadas (tachadas) (F17). Los bloqueos pueden originarse por: bloqueo manual del host, reglas automáticas de disponibilidad (mínimo/máximo de noches, anticipación, preparación — F15, F03), o por sincronización de un calendario externo (F01, F17).
- **Reservas importadas de otros canales:** al conectar un calendario externo vía iCal, las noches reservadas en ese otro canal se bloquean automáticamente en Airbnb (F01, F03). Si esa importación transfiere o no la identidad del huésped **no está documentado por Airbnb — [DATO releído 2026-09-05]: el artículo de ayuda 99 (versiones .com y .co.uk) solo afirma "We import up to 2 years of data" y no contiene ninguna mención a huésped, PII o identidad; tratar como NO CONFIRMADO, no como garantía de privacidad (corrección C2, ver §5 y Lagunas #6).** El host no puede desbloquear manualmente esas noches desde Airbnb — deben gestionarse desde el sistema de origen (F17: "except for... nights reserved through linked or synced calendars").
- **Día de salida / turnover:** existe una función de "tiempo de preparación" que bloquea noches antes/después de una reserva (F15, F16), con un ejemplo documentado de hasta 48 horas para limpieza reforzada (F16), pero el límite máximo exacto no está confirmado en fuente primaria (laguna).
- **Buffers:** configurables mediante "preparation time", con las mismas opciones de anticipación (mismo día con corte, 1/2/3/7 días — F15). Aplican, según evidencia, a "reservations" — no está confirmado si aplican igual a bloqueos manuales (mención de terceros no verificada con fuente primaria).
- **Zona horaria local del anuncio:** SIN EVIDENCIA directa encontrada en fuente primaria sobre cómo Airbnb determina o expone la zona horaria del anuncio para efectos de corte de "mismo día" o checkout (laguna).
- **Cancelaciones:** cancelación por HOST bloquea el calendario en esas fechas y conlleva penalización económica (F18) — evidencia oficial y de alta confianza, que refuerza directamente la regla de "nunca cancelar reservas confirmadas sin autorización" del producto. Cancelación por HUÉSPED liberaría el calendario de inmediato según evidencia de menor confianza no verificada con cita primaria directa (F19, laguna a cerrar).
- **Modificaciones (alteration/trip change requests):** un cambio de fechas de una reserva confirmada requiere que el huésped envíe una solicitud y el host la apruebe o rechace explícitamente; si el host no responde o rechaza, la reserva original se mantiene sin cambios (F20). No hay evidencia de que el cambio sea automático ni de cómo se refleja en el calendario mientras está pendiente.

---

## 4. Roles y permisos (host / co-anfitrión / equipos)

Airbnb documenta **tres niveles de acceso de co-anfitrión** (F12, F13):

1. **Full Access:** mensajes con huéspedes, editar calendario, gestionar el anuncio (incluyendo precios), gestionar reservas, gestionar solicitudes por daños, ver ingresos, y administrar permisos de otros co-anfitriones (F12, F13).
2. **Calendar & Messaging Access:** mensajes con huéspedes y **solo visualización** (no edición) del calendario (F13).
3. **Calendar Access:** solo visualización del calendario, sin edición ni mensajería (F13).

Restricciones transversales confirmadas:
- Solo el propietario del anuncio puede configurar o editar los pagos de un co-anfitrión; ningún co-anfitrión puede ver ni cambiar el método de pago o datos fiscales de otro usuario (F13, F14).
- Los pagos a co-anfitriones se estructuran en 4 modalidades (comisión de limpieza, comisión + porcentaje, porcentaje, o monto fijo) y se envían al final del día hábil posterior al check-in del huésped; el co-anfitrión tiene 14 días para confirmar o rechazar la propuesta de pago (F14).
- **Cobertura geográfica de la "Co-Host Network" — corregido 2026-09-05 (C3).** Releído directamente el artículo 3472 hoy: **España SÍ está incluida** [DATO]. Cita textual completa: "The Co-Host Network is currently available in Australia, France, Germany, Italy, Japan, Mexico, Puerto Rico, South Korea, Spain, and the United Kingdom (powered by Airbnb Global Services); Canada, the United States (powered by Airbnb Living LLC); and Brazil (powered by Airbnb Plataforma Digital Ltda)." Esto resuelve la contradicción documentada en `docs/auditoria-investigacion-1/contradicciones.md` #1: RV01 (que sí listaba España) tenía razón; la versión previa de este documento, que decía "no se confirmó", estaba desactualizada o basada en una lectura parcial de la misma fuente. Lista completa confirmada (13 países): Australia, Francia, Alemania, Italia, Japón, México, Puerto Rico, Corea del Sur, España, Reino Unido, Canadá, Estados Unidos, Brasil. Como cualquier lista de cobertura de producto, puede cambiar — no tratar como permanente sin re-verificación periódica.

**Equipos/multi-listado:** existen "herramientas de hosting profesional" con multi-calendario, "rule-sets" (reglas que pueden sobrescribir precio/disponibilidad de fechas específicas a través de múltiples anuncios) y gestión de tareas (F21). No se encontró documentación oficial que diferencie formalmente "hosting teams" (equipos multiusuario) del sistema de co-anfitriones — probable laguna conceptual a verificar directamente en la interfaz de producto real.

---

## 4.1 Identificadores de reserva/evento — qué documenta oficialmente Airbnb (corrección "Alta", UID/SEQUENCE/dedupe/anti-eco)

**Vía API de partner:** ninguna página pública leída (F09, developer.withairbnb.com) documenta un identificador de reserva análogo al `UID` de iCal, ni un mecanismo de versión/`SEQUENCE`, ni una política de deduplicación — esto vive detrás de la documentación técnica de partner aprobado, inaccesible en esta investigación. **NO ABORDADA** — confirmado también por `docs/LAGUNAS.md` §1.1: "UID/SEQUENCE/dedupe/idempotencia (nivel API)... no documentado a nivel de API". No inventar un `reservation_id` ni un esquema de versión para la API de Airbnb sin acceso de partner real.

**Vía iCal (export/import):** Airbnb no documenta explícitamente el uso de `UID`/`SEQUENCE` en su feed exportado más allá de lo que exige el RFC 5545 en general (ver RV06). No hay declaración oficial de Airbnb sobre si el `UID` que exporta es estable entre ciclos de refresco, ni sobre si preserva el `UID` original al reexportar un evento importado de otra fuente (riesgo de eco) — laguna explícita ya documentada en RV07 §3 y en `docs/LAGUNAS.md` §1.2 ("Anti-eco de bloqueos... no confirmado si Airbnb re-importa como 'reserva' un bloqueo generado por el propio sistema en otro canal").

**Convención propia (decisión interna, NO documentada por Airbnb, marcada explícitamente como tal):** el mecanismo de anti-eco por `UID`/namespace propio + hash de contenido especificado en RV07 §3 (`RV07-R-04`) es una propuesta de arquitectura de Atiende, no un comportamiento confirmado del canal. Debe validarse empíricamente con un feed `.ics` real de una cuenta de prueba de Airbnb antes de tratarse como mecanismo confiable (ver Lagunas #6 de este documento y `docs/LAGUNAS.md` §1.2).

---

## 5. Riesgos y límites (qué NO se puede prometer)

- **NUNCA prometer "cero overbooking" basado solo en iCal.** Airbnb documenta explícitamente un ciclo de actualización de 3 horas para calendarios sincronizados (F01), y advierte que calendarios múltiples pueden actualizar en momentos distintos entre sí. Existe una ventana real de riesgo de doble reserva entre el momento de una reserva en un canal y su reflejo en otro.
- **No se puede prometer soporte de webhooks/tiempo real vía API sin validación adicional.** La única evidencia de webhooks proviene de fuentes de terceros no oficiales (F10); no se confirmó en documentación pública de Airbnb. Prometer notificaciones push en tiempo real basadas en esta fuente sería una afirmación no respaldada.
- **No se puede prometer NI descartar transferencia de tarifas o datos de huésped vía iCal — tratar como riesgo residual, no como garantía de privacidad.** [Corrección C2, 2026-09-05] La afirmación previa de este documento ("la importación de calendarios externos NO trae datos de huésped") no tiene respaldo verbatim en la fuente citada (F04, artículo de ayuda 99, releído hoy en ambas versiones .com/.co.uk): la única cifra confirmable es "We import up to 2 years of data", sin ninguna mención a huésped/PII/identidad. Por diseño de política de producto y de seguridad (RV19-R-06/R-07), el pipeline de importación de Atiende debe tratar cualquier campo de texto libre proveniente de un feed iCal externo (p. ej. `SUMMARY`/`DESCRIPTION`) como **potencial PII no saneada** y sanitizarlo antes de almacenarlo o mostrarlo, en vez de asumir que el canal de origen ya lo excluye. No hay evidencia de que el feed exportado por Airbnb incluya tarifas.
- **No se puede desbloquear vía Airbnb una noche bloqueada por sincronización de calendario externo.** Debe gestionarse desde el sistema origen (F17). Esto tiene implicación directa para cualquier función de "liberar manualmente" en el producto: si el bloqueo proviene de un canal sincronizado, la UI debe dejar claro que la edición debe hacerse en el sistema de origen, no en Airbnb.
- **Cancelar una reserva confirmada en Airbnb como host tiene consecuencia económica documentada** (fee mínimo $50 USD, escalas 10/25/50% según antelación) y bloqueo de calendario en esas fechas (F18). Esto refuerza — con evidencia oficial — la regla de negocio de nunca cancelar reservas confirmadas sin autorización explícita del anfitrión: cualquier automatización que cancele por error tiene costo real y medible.
- **El acceso a la API de partner requiere aprobación, NDA, revisión de seguridad de datos e implementación de funciones obligatorias en 6 meses** (F06) — no es un acceso self-service; el producto no puede asumir integración inmediata sin pasar por este proceso.
- **Los scopes exactos de la API no están públicamente documentados** (F05, laguna) — no se puede diseñar con precisión qué datos/acciones exactas otorga cada scope sin acceso de partner aprobado.

---

## 6. Implicaciones para requisitos de producto

- **RV03-R-01:** El motor de sincronización de calendario debe tratar cualquier conexión vía iCal con Airbnb como asíncrona y de latencia mínima de horas (referencia: ciclo documentado de 3 horas, F01 — **confianza baja/media específicamente para su aplicabilidad a conexiones producto-Airbnb, no solo entre calendarios de terceros; ver supuesto S1 de este mismo documento; latencia externa no controlada por Atiende**); el diseño de cierre de disponibilidad entre canales no puede basarse en la suposición de sincronización instantánea vía iCal.
- **RV03-R-02:** Cuando el bloqueo de una fecha en Airbnb provenga de un calendario externo sincronizado, la interfaz debe indicar explícitamente que la edición debe realizarse en el sistema origen, replicando la restricción documentada de Airbnb (F17), evitando que el usuario intente "liberar" esa fecha desde el producto sin que tenga efecto real.
- **RV03-R-03:** El producto no debe prometer ni implementar notificaciones en tiempo real (webhooks) desde Airbnb sin antes obtener confirmación directa mediante acceso de partner aprobado — actualmente es una laguna sin evidencia oficial (F10).
- **RV03-R-04:** Cualquier función de cancelación automatizada debe incluir una advertencia explícita y requerir autorización humana confirmada, dado que Airbnb documenta penalización económica real (mínimo $50 USD, hasta 50% del valor de las noches) y bloqueo de calendario tras cancelación de host (F18) — coherente con la regla de negocio de nunca cancelar sin autorización.
- **RV03-R-05:** El modelo de permisos de co-anfitrión del producto debe reflejar (o al menos mapear explícitamente) los tres niveles nativos de Airbnb (Full Access / Calendar & Messaging / Calendar Access) para evitar inconsistencias entre lo que un cohost puede hacer en Airbnb directamente y lo que puede hacer en el producto (F12, F13).
- **RV03-R-06:** El producto no debe representar en la UI que puede sincronizar tarifas o datos de huésped vía iCal con Airbnb, dado que no hay evidencia de que el feed lo soporte (F03, F04); estas capacidades solo podrían estar disponibles vía API de partner aprobado, sujeta a scopes no confirmados (F05).
- **RV03-R-07:** Cualquier función de "cambio de fechas" debe modelarse como una solicitud sujeta a aprobación explícita del host (no automática), reflejando el flujo documentado de trip change request (F20).
- **RV03-R-08:** España SÍ está confirmada en la lista oficial de cobertura de la Co-Host Network (corrección C3, 2026-09-05, F13) — el producto puede comunicar esta cobertura a clientes del mercado español, siempre re-verificando periódicamente antes de campañas comerciales, dado que la lista de países es una decisión de producto de Airbnb que puede cambiar sin aviso.
- **RV03-R-09:** Cualquier alegación comercial sobre "integración certificada" o nivel "Preferred+" con Airbnb debe evitar prometer criterios cuantitativos (SLA, latencia) no publicados por Airbnb (F11, laguna).
- **RV03-R-10:** El diseño de reglas de "tiempo de preparación/buffer" en el producto no debe asumir un máximo específico de días sin verificación directa adicional (contradicciones entre fuentes de terceros y ausencia de confirmación oficial — F16, laguna).

---

## 7. Lagunas e incertidumbres

1. Nombres literales de scopes de API (listings/reservations/messaging/pricing/availability) — no confirmados en fuente pública (F05).
2. Existencia y especificación exacta de webhooks de Airbnb — solo fuentes de terceros no oficiales (F10).
3. Flujo exacto de consentimiento/autorización OAuth del host hacia una app partner — sin cita textual directa (F07).
4. Límite máximo de tiempo de preparación/turnover en días — no confirmado en fuente primaria, solo en blogs de terceros (F16).
5. Duración exacta del bloqueo de calendario tras una cancelación de host (¿solo las fechas afectadas o un periodo adicional?) (F18).
6. Si el feed iCal **exportado o importado** por Airbnb incluye tarifas o datos de huésped — no confirmado (F03, F04). **Corrección C2 (2026-09-05):** este documento afirmaba en 4 lugares (ahora corregidos) que Airbnb "no transfiere datos de huésped al importar", citando F04 (artículo de ayuda 99) como respaldo. Tras releer directamente ambas versiones de esa fuente (airbnb.com/help/article/99 y airbnb.co.uk/help/article/99) el 2026-09-05, **no se encontró ninguna mención a huésped, PII o identidad** — la única cifra verbatim es "We import up to 2 years of data", que se refiere a antigüedad de reservas, no a exclusión de PII. Degradado a NO CONFIRMADO; no debe usarse en material de privacidad/legal hacia clientes o reguladores hasta verificación adicional (p. ej. inspección directa de un feed `.ics` real de Airbnb, laguna #6 original de este mismo documento).
7. Diferencia formal entre "hosting teams" (multiusuario) y el sistema de co-anfitriones — no se encontró documentación oficial separada (F21).
8. ~~Cobertura geográfica completa de la Co-Host Network, incluyendo si España está soportada~~ — **CERRADA el 2026-09-05 (corrección C3): España SÍ está en la lista oficial de 13 países/territorios.** Ver §4 y RV03-R-08.
9. Rango exacto de meses de apertura de calendario (3/6/9/12/24 meses) — visto solo en snippet de búsqueda, sin verbatim confirmado (F17).
10. Criterios cuantitativos exactos para el nivel de partner "Preferred+" (SLA, tasa de error, latencia) — no publicados (F11).
11. Reflejo en el calendario de una solicitud de cambio de fechas mientras está pendiente de aprobación — sin evidencia (F20).
12. Límite en el número de calendarios externos que pueden conectarse a un mismo anuncio vía iCal — sin evidencia de un máximo documentado (F22).
13. Rate limits y reintentos de la API de partner — sin evidencia pública (no accesible sin aprobación de partner).
14. Si existe botón de "Refresh" manual para forzar sincronización iCal antes del ciclo de 3 horas — visto solo en snippet de búsqueda, no verificado con fetch directo verbatim (F02).
15. **Cobertura de fuentes por debajo del mínimo del plan.** Este módulo cita ~17 URLs distintas en "9. Fuentes de este módulo" (todas de airbnb.com/help, developer.withairbnb.com y airbnb.com/software-partners, más una fuente de terceros marcada [E/R]), por debajo del mínimo de 25 URLs distintas exigido por `docs/investigacion/00-PLAN.md` §1.3. La razón declarada: Booking.com, Vrbo y los proveedores de PMS/software de operaciones no aplican a este módulo (alcance específico de Airbnb), y no existe documentación pública adicional de Airbnb sobre webhooks, scopes de API ni rate limits de partner accesible sin cuenta de partner aprobada (ver Lagunas #1, #2, #13). Ampliar esta cobertura requiere acceso de partner autenticado, no repetir la misma búsqueda pública.

---

## 8. Tabla de supuestos

| # | Supuesto | Base | Riesgo si es incorrecto | Acción recomendada |
|---|---|---|---|---|
| S1 | El ciclo de sincronización iCal de ~3 horas es representativo también para conexiones producto-Airbnb (no solo entre calendarios de terceros) | F01, cita oficial pero genérica sobre "otras calendarios conectados" | Bajo/medio — es la cifra oficial más específica encontrada | Diseñar la UX asumiendo latencia de horas, no minutos, y comunicarlo al usuario final |
| S2 | Los scopes de API "listings/reservations/messaging/pricing/availability" existen tal como sugieren fuentes de terceros | Ninguna fuente oficial confirma estos nombres literales (F05) | Alto si se documentan como capacidades ciertas del producto | No usar estos nombres como si fueran API real hasta obtener acceso de partner y confirmar en documentación técnica real |
| S3 | Existen webhooks de Airbnb para eventos de reserva/calendario | Solo fuentes de terceros (F10) | Alto — podría no existir o diferir sustancialmente | Tratar como no confirmado; validar con Partner Portal antes de comprometer arquitectura basada en push |
| S4 | El bloqueo de calendario tras cancelación de host es permanente hasta acción manual, no temporal | F18 no especifica duración | Medio | Confirmar con soporte de partner o pruebas en cuenta real antes de modelar reglas de negocio |
| S5 | ~~La Co-Host Network no cubre España~~ — **retirado 2026-09-05 (corrección C3): España SÍ está cubierta**, confirmado por relectura directa del art. 3472 | Cita verbatim completa en §4 | Bajo (dato confirmado, no supuesto) | Re-verificar periódicamente antes de campañas comerciales, ya que es una lista de producto que Airbnb puede modificar |
| S6 | El feed iCal exportado no incluye tarifas | Ausencia de mención de tarifas en F03, presencia solo de reglas de disponibilidad | Medio | No prometer sincronización de precios vía iCal en ningún caso; confirmar exclusivamente vía API de partner si es necesario |
| S7 | "Hosting teams" y "co-anfitriones" son el mismo sistema bajo distinto nombre comercial | No se encontró documentación que los diferencie (F21) | Medio | Verificar en cuenta de prueba real de Airbnb antes de diseñar dos modelos de permisos distintos en el producto |
| S8 (nuevo, corrección C2) | El feed iCal importado hacia Airbnb podría contener texto libre (SUMMARY/DESCRIPTION) con datos de huésped u otra PII del canal de origen, aunque no hay evidencia oficial de Airbnb ni en ningún sentido (ni que lo excluya, ni que lo incluya) | Ausencia total de mención a huésped/PII en F04 tras relectura dirigida | Alto — si el producto asumiera "sin PII" como garantía contractual de Airbnb y no fuera cierto, sería una promesa de privacidad no respaldada hacia clientes/reguladores | Tratar todo campo de texto libre importado como PII potencial no saneada; sanitizar en el pipeline propio de Atiende (RV19-R-06/R-07) en vez de confiar en que el canal ya lo excluye |

---

## 9. Fuentes de este módulo

Todas releídas o verificadas el 2026-09-05. Ledger completo con cita textual por entrada: `docs/fuentes/rv03-airbnb.md` (F01–F22, más F13-bis añadida en la corrección C3).

- **Calendario iCal (frecuencia, contenido, bloqueos):** airbnb.com/help/article/99, airbnb.co.uk/help/article/99 (releído dirigidamente para C2 — huésped/PII no mencionado), airbnb.com/help/article/447, airbnb.com/help/article/484, airbnb.com/help/article/2923, airbnb.com/help/article/3612 [DATO].
- **API de partner (Homes/Activities):** airbnb.com/help/article/3418 (API Terms of Service), developer.withairbnb.com, airbnb.com/software-partners [DATO/R — ver F09/F11, contenido de marketing marcado como tal].
- **Co-Host Network y permisos de cohost (corrección C3):** airbnb.com/help/article/3472 (releído en vivo 2026-09-05, cita completa de países incluida España), airbnb.com/help/article/3264, airbnb.com/help/article/1534, airbnb.com/help/article/3389 [DATO].
- **Cancelación/modificación de reservas:** airbnb.com/help/article/990, airbnb.com/help/article/913 [DATO].
- **Herramientas multi-listado:** airbnb.com/help/topic/1561/managing-multiple-listings [R — resumen de página, no cita verbatim completa].
- **Webhooks (no confirmado, tratado como laguna):** apis.io/asyncapis/airbnb/airbnb-webhooks-asyncapi/ y agregadores similares [E/R — fuentes de terceros, explícitamente no usadas como base de un requisito].
