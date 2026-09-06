# Plan de investigación — Fase 1 (Atiende Rentas Vacacionales)

Barra de calidad, plantilla de módulo y alcance de los 21 informes de investigación
(RV01–RV21). Basado en la caracterización de la investigación de referencia
(Hoteles/Licitaciones/Restaurantes, `~/Desktop/PlataformaAgenticaBlueprintseInvestigacionPDF/`)
y en la metodología `deep-research` de OpenAI Codex. Ver `docs/fuentes/ref-plan.md`
para el ledger de qué se leyó y cómo se derivó cada regla de este plan.

Pregunta central del producto (no olvidar en ningún módulo): un calendario unificado
que **cierra disponibilidad entre canales** (Airbnb, Booking.com, Vrbo, otros) para
anfitriones/coanfitriones/administradores. **Nunca cancela reservas ni contacta
huéspedes** por cuenta propia. Todo módulo debe evaluar sus hallazgos contra esta
restricción explícita.

---

## 1. Barra de calidad medible

Un informe RVnn se considera **completo** solo si cumple las 8 condiciones
siguientes (verificables, no de criterio):

1. **Secciones obligatorias presentes** (ver plantilla §3), en el orden dado, con
   numeración consistente (`0.` resumen, `1..N` cuerpo, `N+1` implicaciones,
   `N+2` lagunas, `N+3` fuentes).
2. **Resumen ejecutivo con 8–10 hallazgos numerados**, cada uno con al menos una
   cifra o afirmación concreta y su etiqueta de confianza (§2). No se acepta un
   hallazgo puramente cualitativo sin dato de respaldo o marca `[E]` explícita.
3. **Mínimo de fuentes primarias**: ≥ 25 URLs distintas citadas en la sección de
   fuentes, agrupadas en ≥ 6 categorías temáticas, de las cuales ≥ 60 % deben
   pertenecer a los niveles 1–2 de la jerarquía de fuentes (§2.1). Módulos de
   arquitectura/legal (RV17, RV19) exigen además ≥ 3 fuentes de nivel 1 estrictas
   (documentación oficial de API, RFC, texto legal/regulatorio primario).
4. **Cada cifra cuantitativa lleva etiqueta de confianza** inline (`[DATO]`, `[R]`
   o `[E]`) — ver formato de cita en §2.
5. **Tabla de supuestos** presente y completa (§4): todo valor `[E]` usado en un
   cálculo de negocio o arquitectura aparece ahí con su fórmula/lógica.
6. **Sección "Lagunas e incertidumbres"** presente (§5), con cada fila apuntando a
   una fila de `docs/LAGUNAS.md` cuando aplique, o añadiendo una fila nueva si el
   módulo descubre una laguna no prevista.
7. **Sección "Implicaciones para producto/requisitos"** presente (§6), que traduce
   la investigación en decisiones de alcance, no solo en resumen de mercado.
8. **Nota metodológica al inicio**: qué se buscó, qué falló (dominios bloqueados,
   cuota agotada, paywalls), y cómo se compensó (fuentes espejo, documentación
   oficial vs. blogs de terceros, lectura de SDK/repositorios en vez del sitio
   comercial). Sin esta nota, cualquier limitación de cobertura queda oculta.

Un módulo que no alcanza el mínimo de fuentes (punto 3) debe declarar explícitamente
en la nota metodológica *por qué* (bloqueo real, no pereza) y listar qué faltó por
verificar en §5.

### 1.1 Regla de oro sobre el dominio (aplica a todos los módulos)

Ningún hallazgo, tabla o implicación puede sugerir, ni siquiera como opción
descartada sin marcar, que el sistema cancele una reserva o contacte a un huésped
de forma autónoma. Cuando la investigación de un canal (p. ej. una API que sí
permite cancelar reservas) toque esta capacidad, el módulo debe registrarla como
**capacidad existente en el canal que el producto decide NO usar**, y anotarlo en
`docs/LAGUNAS.md` si la forma de evitar el efecto colateral (p. ej. "cancelar
reserva" vs. "cerrar noches sin tocar la reserva") no está resuelta.

---

## 2. Formato de cita y etiquetas de confianza

Adoptado de la convención observada en los 63 informes de referencia (Hoteles,
Restaurantes, Licitaciones), adaptado a rentas vacacionales:

- **`[DATO]`** — cifra u afirmación leída literalmente en una fuente primaria u
  oficial durante la sesión de investigación (documentación oficial de API,
  RFC, texto legal, filing/reporte anual, comunicado oficial del canal),
  verificable abriendo la URL citada. Confianza alta.
- **`[R]`** — dato **r**eportado por una fuente secundaria con URL para
  re-verificar (prensa especializada, vendor de channel manager, agregador tipo
  Capterra/G2/Hotel Tech Report, foro de hosts). Confianza media; debe
  re-verificarse antes de presentarse a un cliente o inversionista como dato
  duro.
- **`[E]`** — **e**stimación o cálculo propio del agente de investigación; no
  proviene de una fuente publicada. Debe ir acompañada del supuesto explícito y
  registrada en la tabla de supuestos (§4).

Regla de cita: la etiqueta va **inline**, inmediatamente después de la cifra o
afirmación (no como nota al pie numerada). Las URLs no se citan inline en el
cuerpo del texto; se agrupan al final en la sección de fuentes (§3, sección
"Fuentes consultadas"), agrupadas por subtema, cada bullet con 1–4 URLs
relacionadas. Toda tabla comparativa de proveedores/APIs lleva una columna
"Etiqueta" (o abreviada "Etiq.") con la confianza de esa fila.

### 2.1 Jerarquía de fuentes (orden de preferencia, de `deep-research/SKILL.md`)

1. Documentación oficial de API/partner program, RFC (p. ej. RFC 5545), texto
   legal/regulatorio primario, filings públicos (SEC, informes anuales),
   repositorios oficiales de SDK (GitHub del vendor, npm/PyPI).
2. Análisis independiente de calidad con metodología transparente (Hotel Tech
   Report, D-EDGE/Kalibri/Cloudbeds cuando publican metodología, informes de
   consultoras con muestra declarada).
3. Comentario de especialista con experiencia declarada (blogs de integradores,
   foros de desarrolladores de channel managers, threads de hosts power-user).
4. Foros, reseñas y posts sociales — solo como señal exploratoria o anecdótica,
   nunca como base de una cifra de negocio sin corroborar.

Un módulo debe declarar, para cada tabla comparativa relevante, si las filas de
nivel 3–4 fueron cruzadas con al menos una fuente de nivel 1–2 (cross-check de
las afirmaciones de mayor impacto, no de todas).

---

## 3. Plantilla de módulo RV (esqueleto obligatorio)

```
RVnn · <Título del módulo>
<Subtítulo orientado a la decisión de producto>

Proyecto: Atiende Rentas Vacacionales — calendario unificado multi-canal
Caso ancla: <definir un anfitrión/cohost/administrador de referencia con
  supuestos concretos: nº de unidades, canales activos, ciudad/país, si es
  gestor de un solo alojamiento o portafolio>
Fecha del informe: <fecha> · Autor: <agente/sesión>
Informes relacionados: <RVxx, RVyy...>

### Nota metodológica (leer primero)
Qué se buscó, qué bloqueó (dominios, cuota, paywall, requisitos de aprobación de
partner que impiden ver documentación completa sin cuenta aprobada), cómo se
compensó. Convención de etiquetas [DATO]/[R]/[E] (referenciar este plan).

0. Resumen ejecutivo (8-10 hallazgos numerados, con cifra + etiqueta cada uno)

1..N. Cuerpo temático (numerado, con subsecciones N.1, N.2...)
   - Tablas comparativas con columna "Etiqueta"
   - Al menos una tabla "Cifras de referencia" consolidada antes de implicaciones

N+1. Implicaciones para producto/requisitos
   N+1.1 Qué decide/afecta este módulo en el calendario unificado
   N+1.2 Riesgos y mitigaciones (tabla: riesgo · probabilidad · impacto · mitigación)
   N+1.3 Alcance mínimo viable vs. diferido (qué construir primero)

N+2. Tabla de supuestos (todo valor [E] usado en cálculos)

N+3. Lagunas e incertidumbres
   - Qué quedó [R] sin re-verificar, con URL de re-verificación
   - Qué quedó inaccesible (bloqueo real) y cómo se retoma
   - Referencia cruzada a filas de docs/LAGUNAS.md abiertas o cerradas por este módulo

N+4. Fuentes consultadas (agrupadas por subtema, con URLs)

Fin del informe RVnn. Siguiente paso sugerido: <acción concreta con el fundador
o dato que falta para pasar de [E] a [DATO]>.
```

### 3.1 Tabla de supuestos — formato de fila obligatorio

| Supuesto | Valor usado | Lógica/fórmula | Módulo(s) que lo consumen | Cómo se reemplaza por dato real |
|---|---|---|---|---|

### 3.2 Lagunas e incertidumbres — formato de fila obligatorio

| Afirmación/dato pendiente | Por qué quedó pendiente | Fuente esperada para cerrarlo | Fila de LAGUNAS.md relacionada |
|---|---|---|---|

---

## 4. Metodología heredada de `deep-research` (resumen aplicable)

Ver ledger completo en `docs/fuentes/ref-plan.md`. Reglas concretas adoptadas:

- **Ledger de afirmaciones (gap matrix)**: mientras se investiga, mantener una
  lista compacta de cada afirmación consecuente, su evidencia, confianza,
  contradicciones y la siguiente búsqueda dirigida — esto es lo que en la
  plantilla RV se materializa como la tabla de "Lagunas e incertidumbres" y la
  tabla de supuestos.
- **Verificación cruzada**: las afirmaciones de mayor impacto para el modelo de
  negocio (comisiones de canal, límites de tasa de sync, ventanas de
  cancelación) deben tener más de una fuente independiente antes de pasar de
  `[R]` a tratarse como consolidado; nunca inventar una fuente o URL.
  Distinguir siempre hecho citado / inferencia propia / evidencia inaccesible /
  incertidumbre — no mezclar estas categorías bajo una sola etiqueta.
- **Regla de rendimiento decreciente**: detener la búsqueda sobre un mismo
  reclamo cuando una fuente adicional no cambiaría la conclusión ni la
  confianza; no acumular corroboración redundante. Registrar qué búsquedas se
  hicieron y por qué se detuvo.
- **Cierre de lagunas explícito**: nunca presentar un informe parcial como
  terminado; toda limitación de cobertura se declara en la nota metodológica y
  en la sección de lagunas, nunca se omite en silencio.
- **Disciplina de alcance**: cada módulo responde a su pregunta central (según
  §5 de este plan) sin duplicar el trabajo de otro módulo; cuando dos módulos
  comparten un dato (p. ej. comisión de Airbnb aparece en RV03 y en RV13), uno
  es la fuente canónica y el otro solo referencia.

---

## 5. Alcance específico por módulo (RV01–RV21)

Cada módulo debe usar el caso ancla y, cuando aplique, señalar explícitamente
diferencias entre "anfitrión de una sola unidad", "coanfitrión/administrador de
portafolio pequeño (5-30 unidades)" y "administrador profesional/PMC
(30+ unidades, múltiples ciudades)" — la segmentación de RV01 es la base para
todos los demás.

- **RV01 — Segmentación anfitrión / cohost / administrador.** Perfiles,
  volumen de unidades, motivación (ingreso complementario vs. negocio
  principal), nivel de sofisticación técnica, disposición a pagar, quién toma
  la decisión de compra (dueño vs. property manager contratado), relación
  contractual dueño↔administrador (comisión típica, split de responsabilidad
  sobre el calendario). Debe producir la tabla de segmentos que usan RV09–RV16.

- **RV02 — Operación reserva → salida.** Journey operativo completo: consulta →
  reserva → pre-estancia → check-in → estancia → check-out → limpieza → próxima
  reserva, por canal. Identificar en qué puntos el calendario debe cerrarse
  (al confirmar, al modificar, al cancelar, al bloquear manualmente) y qué
  actor humano interviene en cada paso hoy sin software.

- **RV03 — Matriz de capacidades Airbnb.** API oficial (Partner/Software
  Partner Program: proceso de aprobación, scopes, endpoints de calendario,
  reservas, mensajería, precios), vs. lo que solo existe vía iCal export/import
  de Airbnb. Comisión, política de cancelación, requisitos de conectividad,
  límites de tasa documentados o inferidos.

- **RV04 — Booking Connectivity.** Booking.com no publica API pública: el
  camino real es Connectivity Partner (niveles de certificación, requisitos de
  volumen histórico, tiempos de aprobación, estado de la admisión de nuevos
  partners), y el fallback de iCal en la extranet para propiedades no
  conectadas. Documentar direccionalidad real (qué escribe/lee cada nivel de
  partner) y paridad de tarifas.

- **RV05 — Vrbo/extensibilidad.** Vrbo/Expedia Partner Central: API vs. iCal,
  requisitos de partner de Expedia Group, y mapeo de "otros canales" relevantes
  para el caso ancla (Google Vacation Rentals si existe, TripAdvisor Rentals,
  agregadores regionales LATAM/España). Extensibilidad = qué tan fácil es
  añadir un canal nuevo sin rediseñar el modelo de datos.

- **RV06 — iCal / RFC5545.** Lectura del RFC, cómo lo implementa cada canal en
  la práctica (frecuencia de refresco real vs. anunciada, UID, SEQUENCE,
  DTSTAMP, VEVENT vs. VTODO, manejo de TZID/UTC, tamaño máximo de feed,
  latencia observada por vendors de channel manager). Es el módulo de
  referencia técnica que RV07 consume.

- **RV07 — Sincronización y overbooking.** El corazón del producto: latencia
  real por canal/método, webhook vs. polling (con qué frecuencia mínima
  garantiza no-overbooking cada combinación), reintentos y backoff, ventanas de
  riesgo de doble reserva, estrategia de reconciliación cuando dos canales
  reportan estados distintos para la misma noche, "anti-eco" (evitar que un
  bloqueo que puso el propio sistema en el Canal A se lea de vuelta como una
  reserva nueva). Debe consumir directamente `docs/LAGUNAS.md`.

- **RV08 — Conectividad directa vs. partner/channel manager.** Comparar
  construir conectores propios (aprobación directa con cada canal) contra
  integrarse vía un channel manager existente (Hospitable, Guesty, OwnerRez,
  Lodgify, SuperHote, etc. — con sus propias APIs/webhooks). Costo, velocidad
  de salida al mercado, control, riesgo de dependencia de un tercero.

- **RV09 — Calendario/UX.** Cómo se presenta el calendario unificado al
  anfitrión/cohost/administrador: vista multi-propiedad, resolución de
  conflictos visibles, estados (disponible/bloqueado/reservado/pendiente de
  sync), acciones manuales permitidas y su efecto en cada canal.

- **RV10 — Mensajes/huésped.** Qué mensajería expone cada canal (Airbnb
  Messaging API, Booking Guest Messaging, WhatsApp), y explícitamente qué NO
  debe automatizar el sistema por decisión de producto (contacto proactivo al
  huésped) frente a lo que sí es notificación al anfitrión.

- **RV11 — Limpieza/mantenimiento/incidencias.** Triggers desde el calendario
  (checkout → tarea de limpieza), buffers entre estancias, vendors de gestión
  de turnos/limpieza usados hoy por administradores (Turno, Properly,
  Breezeway y equivalentes LATAM), y su dependencia de la exactitud del
  calendario unificado.

- **RV12 — Roles/owners/contabilidad/pagos.** Multi-tenant: dueño de la
  propiedad, cohost, administrador con o sin poder de decisión sobre precio,
  reparto de ingresos, permisos por rol sobre el calendario (quién puede cerrar
  fechas manualmente), integraciones contables mínimas.

- **RV13 — Pricing/revenue/inventario.** Dynamic pricing (PriceLabs, Beyond/
  Beyondpricing, Wheelhouse y equivalentes), cómo empujan tarifas a cada canal,
  y su dependencia crítica de que el inventario/calendario esté sincronizado
  (un precio correcto sobre una noche ya vendida en otro canal no sirve).

- **RV14 — Competencia.** Vendors de calendario unificado / channel manager que
  ya resuelven este problema (Hospitable, Guesty, OwnerRez, Lodgify, SuperHote,
  Hostaway, Smoobu, iGMS, etc.): qué canales cubren, modelo de precio, gaps
  reportados por usuarios (foros, reseñas) — especialmente quejas de
  overbooking o desync.

- **RV15 — Mercado/estimaciones.** Tamaño de mercado de rentas vacacionales
  gestionadas profesionalmente (México/LATAM primero, luego expansión),
  número de unidades activas por canal, TAM/SAM/SOM del software de gestión.

- **RV16 — Modelo de negocio/costos unitarios.** Pricing del producto,
  unit economics por unidad gestionada, costo de servir (llamadas API,
  cómputo, soporte), comparación con el costo que hoy paga el administrador en
  software de terceros.

- **RV17 — Arquitectura/datos.** Modelo de datos canónico (propiedad, unidad,
  calendario, reserva, bloqueo, huésped minimizado), patrón de conectores
  (ingress webhook/polling, idempotencia, cola, reconciliación), stack técnico
  y de qué depende cada decisión de RV03–RV08.

- **RV18 — Automatizaciones/agentes/tool-calling/evals.** Qué decisiones puede
  tomar un agente de IA (explicar el estado del calendario, sugerir cierre de
  fechas, redactar respuesta a un anfitrión) vs. qué requiere ejecución
  determinista (escritura de disponibilidad) y humano-en-el-loop; diseño de
  evals para nunca permitir que un agente cancele una reserva o contacte a un
  huésped sin autorización explícita.

- **RV19 — Seguridad/privacidad/legal por jurisdicción.** Datos de huésped
  (pasaporte/ID) que exponen las APIs de canal, marco de protección de datos
  por país objetivo (México LFPDPPP, y jurisdicciones de expansión), términos
  de servicio de cada canal sobre uso de datos y almacenamiento de credenciales.

- **RV20 — Operación/observabilidad/recuperación.** Qué monitorear (lag por
  conector, tasa de error 429/5xx, drift de disponibilidad real vs. reportada),
  runbook de recuperación cuando un canal falla o un feed queda inaccesible
  (sin asumir que "inaccesible" significa "disponible").

- **RV21 — Pruebas/aceptación/plan enterprise.** Criterios de aceptación para
  "nunca overbooking, nunca cancela, nunca contacta sin permiso", plan de
  pruebas por canal/método, checklist enterprise (SLA, auditoría, DR) antes de
  vender a un administrador profesional.
