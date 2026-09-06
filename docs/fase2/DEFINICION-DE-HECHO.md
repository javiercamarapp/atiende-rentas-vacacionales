# Definición de hecho — Fase 2 (Atiende Rentas Vacacionales)

Aplica a toda historia `H-nnn` de `docs/fase2/BACKLOG.md`, en cualquier lote
de `docs/fase2/LOTES.md`. Ninguna historia se marca "hecha" sin cumplir
**todos** los puntos de esta lista — no es una checklist orientativa, es un
gate de cierre.

---

## 1. Regla de oro (transversal, no negociable)

**Ningún mock ni simulador se presenta jamás como conexión productiva.**
Esto aplica en tres capas simultáneas, y una historia no está hecha si falla
cualquiera de las tres:

1. **En código**: todo simulador lleva nombre inequívoco
   (`XxxChannelSimulator`, nunca `XxxChannel` con flag oculto), vive en
   `packages/sim/` (nunca mezclado en `packages/adapters/`), y su
   comprobación de arranque rechaza credenciales que parezcan de producción
   real (D-019, REQ-164).
2. **En configuración/UI**: cualquier pantalla que muestre datos servidos
   por un simulador lleva el banner literal **"SIMULADOR — desarrollo/
   pruebas"**, visible sin necesidad de hacer scroll ni abrir un tooltip.
   `getConnectionState()` de un simulador nunca devuelve `producción`
   (D-017); si un canal real no tiene vía de integración disponible en Fase
   2 (Booking.com API directa, API partner de Airbnb), la UI muestra el
   estado honesto correspondiente (`no_conectado` / `bloqueado_por_partner`
   / "pausado por el canal" / "SIN EVIDENCIA") — nunca un simulador
   disfrazado de esos estados.
3. **En reportes/demos**: ninguna captura, reporte de latencia, o métrica
   presentada como evidencia de progreso mezcla datos de un simulador con
   datos de un canal real sin la etiqueta explícita de cuál es cuál.

**Estado de conexión honesto (D-017, REQ-008), verificado en cada historia
que toque un adaptador:** `getConnectionState()` nunca devuelve
`"producción"` sin un registro verificable de sync real exitoso reciente en
la base de datos de esa ejecución. Toda historia de adaptador incluye la
prueba unitaria que fuerza "credenciales presentes, sin sync reciente" y
confirma que el resultado no es `"producción"`.

---

## 2. DoD por historia — checklist completo

Una historia `H-nnn` está **hecha** cuando, en este orden:

### 2.1 Código
- [ ] Implementación completa de lo descrito en la fila de
  `docs/fase2/BACKLOG.md` (columna "Historia"), dentro de las carpetas
  exclusivas asignadas a su lote en `docs/fase2/LOTES.md` (sin editar
  archivos de otro lote fuera del punto de fusión documentado).
- [ ] Cumple los 7 principios no negociables de
  `docs/fase2/PLAN-CONSTRUCCION.md` §0 (verificado explícitamente, no por
  omisión): si la historia toca inventario/disponibilidad, no hay ningún
  punto donde un LLM decida disponibilidad (D-007); si toca tools de
  agente, `input_schema.properties` no declara identificadores de negocio
  (D-008); si toca cancelación/contacto a huésped, esas acciones no existen
  como tool y requieren UI determinista + humano (D-006).
- [ ] `npm run lint` y `npm run typecheck` en verde para los paquetes/apps
  tocados.

### 2.2 Pruebas, con salida guardada
- [ ] Todo `REQ-nnn` trazado en la fila del backlog tiene **al menos una
  prueba automatizada** que lo verifica explícitamente (no basta con que la
  funcionalidad "funcione a simple vista").
- [ ] El o los criterios de `docs/ACEPTACION.md` citados en la fila del
  backlog pasan, ejecutando exactamente el comando que ese criterio
  especifica (o el comando de prueba documentado en la fila del lote
  correspondiente de `docs/fase2/LOTES.md`).
- [ ] La **salida completa** de esa ejecución (no un resumen narrado) se
  guarda en `docs/logs/fase2/<lote>/<H-nnn>-<fecha>.log` — texto plano
  redirigido de la terminal, incluyendo comando ejecutado, timestamp, y
  resultado (verde/rojo con detalle). Un tercero debe poder reproducir el
  mismo resultado con el mismo comando.
- [ ] Si la historia toca el motor de sincronización o el importador de
  feeds, el subset relevante del catálogo adversarial (`tests/adversarial/`)
  corre y su salida también se guarda (REQ-170) — no se difiere "para
  después" ni se marca como pendiente sin abrir la laguna correspondiente.
- [ ] Si la historia toca concurrencia/invariante del calendario, la prueba
  corrió contra `embedded-postgres` (nunca solo PGlite, D-022) — la salida
  guardada lo indica explícitamente (motor usado, no solo "test verde").

### 2.3 Capturas de componentes reales (cuando aplique)
- [ ] Si la historia tiene superficie de UI (cualquier historia de
  `apps/web/pages/*`), se adjunta una captura de pantalla del componente
  **real renderizado** (no un mockup/wireframe) en
  `docs/logs/fase2/<lote>/<H-nnn>-captura.png`, mostrando el estado
  descrito en el criterio de aceptación (p. ej. la razón de bloqueo al
  seleccionar una fecha, el banner de simulador, el estado
  `bloqueado_por_partner` en la matriz de conectividad).
- [ ] Ninguna captura usada como evidencia de progreso muestra un estado
  fabricado a mano en el DOM/inspector — debe ser el resultado real de
  ejecutar la app contra datos de prueba reales (fixtures o BD de
  integración), consistente con la skill `run` del proyecto para lanzar y
  verificar la app antes de capturar.

### 2.4 Trazabilidad de progreso
- [ ] Entrada nueva en `docs/PROGRESO.md` con: fecha/hora, historia
  `H-nnn`, qué se hizo, estado (`hecho`), y ruta a la evidencia (log +
  captura si aplica) — mismo formato de tabla que ya usa ese archivo para
  Fase 1.
- [ ] Si la historia cierra o reduce una laguna de `docs/LAGUNAS.md` o un
  bloqueo de `docs/BLOQUEOS.md`, se actualiza esa fila con la nueva
  evidencia — nunca se marca "cerrada" sin la cita/evidencia exacta que
  esos archivos ya exigen.

### 2.5 Commit atómico
- [ ] Un commit por historia (o el mínimo número de commits atómicos que
  la historia requiera si toca más de un paquete/app), con mensaje que
  referencia `H-nnn` y el/los `REQ-nnn` trazados. Ningún commit mezcla dos
  historias no relacionadas.
- [ ] El commit incluye el código, las pruebas, la entrada de
  `docs/PROGRESO.md`, y referencia (por ruta) a los logs/capturas
  guardados — los logs/capturas en sí pueden vivir fuera de git si son
  pesados (ver `.gitignore`), pero la ruta donde se guardaron queda citada
  en el mensaje de commit o en `docs/PROGRESO.md`.

---

## 3. DoD adicional por tipo de historia

### 3.1 Historias que tocan adaptadores de canal (Lote 2 y extensiones)
- El adaptador **real** y el **simulador** del mismo canal implementan
  exactamente la misma interfaz `ChannelAdapter` — verificado por un test
  de contrato compartido, no por inspección visual.
- `ChannelCapabilities` del adaptador real refleja únicamente lo que la vía
  de integración disponible en Fase 2 permite (nunca declara
  `availabilityPush: true` para una vía bloqueada por el canal — D-011).
- La matriz de conectividad (`docs/fase2/PLAN-CONSTRUCCION.md` §6) queda
  actualizada si la historia cambia el estado real/bloqueado de algún
  canal.

### 3.2 Historias que tocan tools de agente/IA (Lote 9 y Lote 6)
- Test de CI que falla si la tool declara un identificador de negocio en su
  `input_schema` (REQ-004, mecanismo 1 de RV18 §8).
- Test de CI que falla si aparece una tool de cancelación/envío directo en
  el registro accesible a un agente (REQ-002, mecanismo 3 de RV18 §8).
- Si la tool es de tipo "sugerencia" (borrador, resumen, precio), su efecto
  queda demostrado como no-mutante por sí solo: solo una tool determinista
  separada, invocada tras aprobación humana explícita, escribe el cambio
  real.

### 3.3 Historias que tocan datos financieros/fiscales
- Si el `REQ-nnn` trazado está marcado `bloqueado por laguna legal` en
  `docs/REQUISITOS.md`, la funcionalidad se entrega **detrás de un feature
  flag en `false`** (D-023, REQ-163) y la captura/log de evidencia lo
  demuestra explícitamente (flag verificado en configuración, no solo
  código muerto).
- Ninguna cifra de comisión/retención/impuesto se presenta en UI como
  definitiva si su REQ de origen está marcado `PENDIENTE`/`SIN EVIDENCIA`
  en `docs/LAGUNAS.md`.

### 3.4 Historias que tocan RLS/multitenancy
- La migración incluye tanto `ENABLE ROW LEVEL SECURITY` como, cuando
  aplique, `FORCE ROW LEVEL SECURITY` — el log de evidencia incluye la
  salida de la migración aplicada, no solo el archivo `.sql`.
- La suite de aislamiento cross-tenant (caso adversarial 18) se ejecuta
  específicamente contra la(s) tabla(s) nueva(s)/modificada(s) por esta
  historia, no solo contra el conjunto genérico ya existente.

### 3.5 Historias de observabilidad/alertas (Lote 10, parte de Lote 4/6)
- Toda alerta nueva se prueba simulando su disparo end-to-end (no solo la
  condición lógica aislada) y la evidencia guardada muestra que el único
  efecto automatizado observado es una pausa reversible o una notificación
  — nunca una cancelación o un contacto a huésped (REQ-009).

---

## 4. Qué NO cuenta como "hecho"

- Una funcionalidad que "parece funcionar" en el navegador pero sin prueba
  automatizada con salida guardada.
- Un simulador que quedó sin banner o sin verificación de arranque, aunque
  el resto de la historia esté completo.
- Una historia marcada "hecha" en `docs/PROGRESO.md` sin la ruta al log/
  captura correspondiente.
- Un adaptador real cuyo `getConnectionState()` puede devolver
  `"producción"` sin evidencia — esto revierte la historia completa a "por
  hacer", sin importar cuánto del resto esté implementado.
- Una historia de agente/IA cuyo test de CI de identificadores/tools
  prohibidas no existe todavía, aunque la funcionalidad conversacional
  "funcione" en una demo manual.
- Un commit que mezcla código de dos historias, o que omite la entrada de
  `docs/PROGRESO.md`.

---

## 5. Plantilla de entrada en `docs/PROGRESO.md` (Fase 2)

```
| <fecha/hora> | H-<nnn> (<lote>): <resumen corto> | hecho | código: <rutas
principales>; pruebas: docs/logs/fase2/<lote>/<H-nnn>-<fecha>.log; captura:
docs/logs/fase2/<lote>/<H-nnn>-captura.png (si aplica); commit: <hash corto> |
```
