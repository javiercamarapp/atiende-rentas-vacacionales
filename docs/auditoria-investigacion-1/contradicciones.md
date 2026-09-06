# Contradicciones entre módulos — Auditoría independiente Fase 1

Auditor: Sonnet (independiente). Fecha: 2026-09-05. Se leyeron los 21 módulos completos (RV01–RV21) buscando cifras/afirmaciones distintas para el mismo hecho. Para cada contradicción: hecho, ubicación exacta de cada lado, si es real o aparente, y resolución propuesta.

---

### 1. Cobertura de España en la Co-Host Network de Airbnb (mayor impacto comercial)
- **Hecho:** si Airbnb confirma oficialmente España como país cubierto por su programa Co-Host Network.
- **RV01 L69** — afirma como hecho leído: *"la Co-Host Network está disponible en: Australia, Francia, Alemania, Italia, Japón, México, Puerto Rico, Corea del Sur, **España**, Reino Unido, Canadá, Estados Unidos y Brasil"* (citando art. 3472).
- **RV03 L67** — sobre el mismo artículo 3472: *"Cobertura geográfica... limitada a países seleccionados (EE.UU., Canadá, Reino Unido, Australia, Francia y otros no enumerados exhaustivamente) — **no se confirmó si España está incluida**"* (laguna explícita, tabla de supuestos S5, RV03-R-08).
- **Real o aparente:** **Real.** Ambos módulos citan la misma fuente primaria (mismo artículo de Airbnb) y llegan a conclusiones opuestas sobre el mismo dato binario.
- **Resolución propuesta:** re-verificar el artículo 3472 con fetch directo antes de construir cualquier mensaje comercial para España. RV01 cita el listado completo con 13 países nombrados explícitamente (mayor trazabilidad aparente), pero ninguno debe tratarse como definitivo sin relectura fresca. **Prioridad crítica** — bloquea cualquier claim de "Co-Host Network disponible en España" en material comercial.

### 2. Anticipación mínima de Request-to-Book en Booking.com: 3 días vs. 48 horas
- **Hecho:** umbral de anticipación que activa/permite el modo Request-to-Book en Booking.com.
- **RV04 L56,74,92**, citando **F04** (`developers.booking.com/.../request-to-book/overview`): *"al menos tres días antes de la fecha de entrada"* — **re-verificado hoy, CONFIRMADA**.
- **RV04 L56,74,92**, citando **F13** (`developers.booking.com/.../request-to-book/onboarding`): *"more than 48 hours in the future"* — **re-verificado hoy, CONFIRMADA**.
- **Real o aparente:** **Real** — dos páginas oficiales de la misma plataforma se contradicen entre sí; ambas citas fueron reconfirmadas independientemente por dos auditores distintos vía WebFetch directo hoy. No hay contaminación cruzada con RV02 (sus menciones de "48 horas" son sobre Instant Book de Airbnb y sobre invitación de reseña de Booking, conceptos distintos).
- **Resolución propuesta:** el propio RV04 ya declara la discrepancia honestamente en su §7 (laguna 1) — correcto, no debe "resolverse" artificialmente sin que Booking.com lo aclare. No fijar ningún número en copy de producto/SLA sobre esta ventana hasta que Booking.com lo confirme por soporte oficial.

### 3. Precio público de Hospitable: "no público" (RV14) vs. cifras exactas (RV16) — y copy de diferenciación no reproducible
- **Hecho A (existencia de precio público):** RV14 (tabla de fichas, fila Hospitable) — *"Precio público: No público (todos 'from --/mo' excepto free)"*. RV16 (tabla sección 2, fila Hospitable) — *"¿Precio público? Sí"*, con cifras exactas (Essentials $0, Host $29, Professional $59, Mogul $99), citando `help.hospitable.com/.../hospitable-pricing-subscription-costs` con confianza "Alta".
- **Real o aparente:** **Real.** Ambos módulos investigaron el mismo competidor el mismo día y llegaron a veredictos opuestos sobre el mismo hecho verificable.
- **Resolución propuesta:** la cifra de RV16 es más confiable (URL de artículo de ayuda específico, no la home de marketing con placeholders sin renderizar JS). Usar RV16 como fuente canónica y corregir la ficha de RV14.
- **Hecho B (copy de diferenciación — hallazgo de re-verificación, mayor gravedad):** RV14 L22 y RV14-R-01 (hallazgo central de diferenciación de Atiende) citan textualmente *"AI drafts replies and sets the prices, you approve"* (tier Host) y *"Fully automated guest messaging with Inbox AI"* (tier Mogul). La auditoría independiente reabrió `hospitable.com/pricing/` **hoy, misma fecha de consulta declarada por RV14**, y **no pudo reproducir ninguna de las dos frases** tras dos búsquedas dirigidas — la página actual habla de "Dynamic pricing included", "Automated guest messaging" (Host) y "AI Copilot"/"AI auto reply"/"Inbox AI messaging assistant" (Mogul), sin el matiz "you approve" vs. "fully automated".
- **Real o aparente:** **Real y de alto impacto** — no se puede determinar si Hospitable cambió el copy el mismo día o si la cita original fue mal transcrita. **Este es el pilar central del argumento "aprobación humana no-opcional" que diferencia a Atiende de su competidor principal**, y hoy se apoya en una cita no verificable, sin captura de pantalla de respaldo.
- **Resolución propuesta:** bloquear cualquier material externo (pitch, comparativa de mercado) que cite esta frase de Hospitable hasta re-verificar con captura de pantalla fechada. **Prioridad crítica.**

### 4. Latencia de sincronización iCal de Booking.com: dos rangos distintos, ambos de baja confianza
- **Hecho:** cuánto tarda Booking.com en reflejar cambios vía sincronización iCal (distinto del polling de 20s de la Reservations API, que sí está bien documentado).
- **RV04 L30** (fuente [X3], confianza baja): *"refresco cada 2–6 horas o hasta 12h de delay"*.
- **RV08 L37** (snippet, confianza media): *"not meant to be real-time, often taking anywhere from a few minutes to a few hours"*.
- **Real o aparente:** técnicamente real (rangos distintos para el mismo hecho), pero de bajo impacto — ambas cifras vienen de fuentes secundarias no verificadas, y ambos módulos lo declaran explícitamente como no confiable.
- **Resolución propuesta:** ninguna de las dos cifras debe usarse como requisito de producto. RV07/RV09/RV20/RV21 hacen bien en tratar esta latencia como laguna total sin número — aplicar el mismo criterio retroactivamente en RV04/RV08, quitando ambos números de tablas comparativas hasta verificación directa (bloqueada hoy por 403 en partner.booking.com).

### 5. Componente LLM de mensajería a huéspedes: ¿ya es parte del alcance actual o es hipotético? (hallazgo de seguridad, no solo de dato)
- **Hecho:** si el producto Atiende ya incorpora, en su diseño actual (v1), un componente LLM que procese texto libre de huéspedes.
- **RV18** (líneas 11,29-35, tabla 2.2) y **RV16** (sección 3b, costo de IA "por conversación de atención a huésped") — diseñan explícitamente 3 agentes LLM que reciben *"mensaje entrante del huésped (cualquier canal)"* y generan borradores de respuesta, como función central de v1.
- **RV19 L160** (Supuestos): *"Se asume que el producto **no tiene (aún) componentes LLM** que procesen texto libre de huéspedes; si esto cambia, la laguna de prompt injection... pasa de teórica a bloqueante."* RV19 L38 trata el riesgo de prompt injection como condicional a un futuro "si se incorpora".
- **Real o aparente:** **Real y grave.** RV19 (el módulo de seguridad dedicado) trata como hipotética/futura una capacidad que RV18 y RV16 ya diseñan como parte del alcance actual, dejando el análisis de mitigación de prompt injection marcado como no aplicable cuando, según el propio corpus, ya es bloqueante.
- **Resolución propuesta:** actualizar RV19 §3/§7 para tratar la mitigación de prompt injection en mensajería a huéspedes como requisito de seguridad **actual**, incorporando el trabajo ya hecho en RV18 §6 (arquitectura anti-inyección, que sí cita fuentes de Anthropic) a la matriz de RV19. **Prioridad crítica** — es un gap de seguridad, no solo de trazabilidad documental.

### 6. Confiabilidad de UID/SEQUENCE en resolución de conflictos: "algoritmo normativo confiable" (RV21) vs. "señal oportunista, no garantía" (RV06/RV07)
- **Hecho:** si el algoritmo UID→SEQUENCE→DTSTAMP puede tratarse como mecanismo confiable de resolución de conflictos en los feeds reales de los canales.
- **RV21 L11**: *"La especificación iCalendar (RFC 5545/5546) define un **algoritmo normativo** de resolución de conflictos..."*, usado sin matiz como criterio de aceptación en el caso adversarial #1 (L50).
- **RV06 L35** / **RV07 L35-38**: *"no hay evidencia primaria de que los canales incrementen SEQUENCE de forma consistente al mover/extender una reserva; debe tratarse como **señal oportunista, no garantía**, y complementarse con hash de contenido."*
- **Real o aparente:** **Real** (de matiz, no de cifra) — RV21 construye sus criterios de aceptación asumiendo que el algoritmo del RFC "simplemente funciona" contra canales reales, mientras RV06/RV07 (leyendo el mismo RFC) advierten que no es fiable por sí solo en feeds `PUBLISH` reales y exigen un hash de contenido como respaldo obligatorio que RV21 no incorpora en sus casos #1 y #3.
- **Resolución propuesta:** actualizar los criterios de aceptación de RV21 (casos 1, 3, 13) para exigir también verificación por hash de contenido, alineándolo con RV06-R-03/RV07-R-03-04.

### 7. Modelos de roles internos del producto no reconciliados: RV12 vs. RV18
- **Hecho:** qué roles de usuario existen dentro del producto Atiende.
- **RV12 L33-40**: 6 roles — *Superadmin Atiende, Administrador de empresa gestora, Operador, Limpieza, Propietario (vista limitada), Contador* — sin niveles de "coanfitrión" estilo Airbnb.
- **RV18 L49**: 4 roles — *anfitrión, coanfitrión (3 niveles delegados análogos a RV03: acceso completo / calendario+mensajería / solo calendario), administrador, superadmin de empresa gestora* — sin "Limpieza" ni "Contador".
- **Real o aparente:** **Real** (inconsistencia de diseño interno, no de hecho externo) — dos propuestas de arquitectura de roles para el mismo producto, escritas el mismo día, sin citarse entre sí. No está claro si "Operador" (RV12) equivale a "coanfitrión full access" (RV18), ni dónde encajan "Limpieza"/"Contador" en el esquema de RV18.
- **Resolución propuesta:** unificar en un módulo de "roles y permisos" dedicado, tomando como base los 3 niveles de cohost ya verificados con fuente primaria (RV01/RV03) y extendiéndolos con los roles operativos/financieros de RV12.

### 8. Umbral de "anfitrión profesional": 10-200 unidades (RV01) vs. 2+ unidades (RV15)
- **Hecho:** a partir de cuántas unidades un anfitrión se considera "profesional/semi-profesional" (segmento objetivo).
- **RV01 L122**: *"anfitrión individual 1-3 unidades... administrador profesional (10-200 unidades)"* — vacío no cubierto entre 4 y 9 unidades.
- **RV15 L89**: para el SAM de España usa *"% dirigible a anfitriones profesionales/semi-profesionales (**2+ unidades** o alto volumen...)"*.
- **Real o aparente:** **Aparente pero relevante** — ambos son supuestos de trabajo explícitamente marcados como no verificados (no es una contradicción de dato externo), pero sí una inconsistencia de definición del mismo concepto de negocio usado para fines distintos (requisitos de producto vs. dimensionamiento de mercado) sin reconciliarse.
- **Resolución propuesta:** fijar una única definición de "profesional/semi-profesional" y usarla consistentemente en RV01 y RV15; documentar el vacío 4-9 unidades explícitamente.

### 9. Nomenclatura de "capas" de bloqueo de calendario: RV07 vs. RV17
- **Hecho:** qué categorías de bloqueo existen sobre una noche de calendario.
- **RV07 L57**: 4 categorías con precedencia — `RESERVA_CANAL > BLOQUEO_PROPIETARIO > MANTENIMIENTO > BUFFER_LIMPIEZA`.
- **RV17 L64** (campo `capa` de `bloqueo_manual`): `limpieza`, `mantenimiento`, `manual_anfitrion`, `regla_automatica` — sin `RESERVA_CANAL` (vive en tabla `reserva` separada) y sin `buffer_limpieza` diferenciado de `limpieza`.
- **Real o aparente:** **Aparente** (probablemente conciliable, ya que RV17 separa `reserva` de `bloqueo_manual` en tablas distintas), pero la falta de mapeo explícito es un riesgo real de implementación. RV17 §11 reconoce que "modelar `reserva` y `bloqueo_manual` como tablas separadas no impide solapamientos ENTRE las dos" y deja pendiente una tabla única `ocupacion_unidad` — la decisión que resolvería esta discrepancia.
- **Resolución propuesta:** al resolver la decisión pendiente de RV17 (tabla única con discriminador), usar exactamente el vocabulario de 4 categorías ya definido en RV07.

### 10. Tono de confianza inconsistente sobre el mandato host-only de Airbnb dentro de RV12
- **Hecho:** si el mandato "host-only fee" para hosts con software de gestión es un hecho firme o tiene incertidumbre de vigencia/alcance.
- **RV12, Resumen ejecutivo**: presenta el mandato como hallazgo firme y categórico.
- **RV12, sección de Riesgos (R3)**: matiza correctamente: *"no se confirmó su fecha de vigencia ni si aplica igual a todas las integraciones API — riesgo de que el dato cambie o tenga excepciones no capturadas."*
- **Real o aparente:** tensión de énfasis dentro del mismo módulo, no una falsedad — pero un lector que solo lea el resumen ejecutivo se llevará más certeza de la que el documento respalda.
- **Resolución propuesta:** alinear el lenguaje del resumen ejecutivo con el matiz ya presente en la sección de riesgos.

### 11. Framing de la regulación de CDMX: detalle específico (RV15) vs. "no verificable ni la existencia misma" (RV19/BLOQUEOS B-004)
- **Hecho:** nivel de certeza sobre la existencia y contenido de una normativa local de alojamiento turístico en CDMX.
- **RV15 L61**: da detalles operativos específicos (Padrón de Anfitriones, límite de 182 noches, seguro obligatorio, fecha de vigencia 22-mayo-2026) atribuidos a "reformas de abril y octubre de 2024", citando solo prensa (Infobae, POSTA México, Xataka México), con hedge de "confianza baja-media".
- **RV19 §6.1 / BLOQUEOS.md B-004**: trata la existencia misma de cualquier regulación local de CDMX como *"no verificable, ni confirmar ni descartar"* por bloqueo técnico total.
- **Real o aparente:** **Real** — ambos documentos son honestos por separado pero no se cruzan; un lector de RV15 podría creer que hay más certeza sobre el contenido de la norma de la que RV19 permite sostener sobre su existencia misma.
- **Resolución propuesta:** RV15 debe remitir explícitamente a la advertencia más fuerte de RV19/B-004 en vez de solo declarar "confianza baja-media".

### 12. Desconexión entre el hallazgo de comisión host-only (RV12) y el modelo de pricing de Atiende (RV16)
- **Hecho:** si el diseño de pricing/valor de Atiende contempla que sus clientes (PMS de terceros) quedarían forzados al esquema de comisión más alto de Airbnb (14-16%, o 16% en México) en vez del split-fee estándar (~3-4%).
- **RV12** identifica este hallazgo como crítico para el anfitrión que usa cualquier software de gestión.
- **RV16** diseña el pricing de Atiende (cuota base + add-on IA) sin mencionar ni integrar este hallazgo como riesgo/consideración de valor.
- **Real o aparente:** no es una contradicción factual, pero sí una desconexión de diseño entre módulos que debe resolverse antes de fijar el pricing final.
- **Resolución propuesta:** RV16 debe incorporar explícitamente el impacto de la comisión host-only en la propuesta de valor/pricing de Atiende.

---

## Categorías revisadas sin contradicción material

Latencias de Airbnb (~3h) y Vrbo (~30min+20min) son consistentes en RV03/RV04/RV05/RV06/RV07/RV08/RV09/RV13/RV20/RV21; la semántica `[check-in, check-out)` (DTEND exclusivo) es consistente en RV06/RV07/RV09/RV17/RV21; los 3 niveles de permiso de cohost de Airbnb son consistentes en RV01/RV03/RV18; los rate limits de Booking.com (10.000/min general, 75-700/min por endpoint) son consistentes entre RV04 y RV21; los límites de precio de Booking.com (€5-€50.000) coinciden entre RV04 y RV13; no hay superposición de cifras de TAM entre RV14 y RV15 (RV14 no reporta cifras de mercado); ninguna contradicción de comisión de Booking.com entre RV04/RV13/RV16 porque ninguno de los tres afirma una cifra concreta (los tres la marcan PENDIENTE correctamente).
