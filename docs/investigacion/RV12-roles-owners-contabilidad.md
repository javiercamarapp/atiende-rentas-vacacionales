# RV12 — Roles, propietarios (owner statements), contabilidad y pagos

**Estado:** investigación inicial. **Fecha de consulta de fuentes:** 2026-09-05.
**Alcance:** módulo RV12 de Atiende Rentas Vacacionales (roles internos, liquidaciones a propietarios, flujo de pagos por canal, conciliación, facturación México, auditoría y multi-tenant).

**Aviso de método:** este documento distingue explícitamente tres tipos de contenido:
1. **Hechos de mercado verificados** — solo si vienen de una fuente primaria oficial que se leyó realmente (Airbnb, Booking.com, Vrbo). Cada uno tiene entrada en el ledger parcial (`/private/tmp/.../ledger-RV12.md`, a fusionar por otro proceso).
2. **Propuestas de diseño de producto** — decisiones de Atiende razonadas por el investigador, marcadas como tales, sin pretensión de ser "hecho externo".
3. **PENDIENTE** — dato que se buscó pero no se pudo verificar con fuente primaria leída en esta sesión (queda explícito qué falta y por qué).

No se inventaron cifras de comisión, plazos de pago ni requisitos legales que no estén respaldados por una cita textual de una página oficial efectivamente leída.

---

## Resumen ejecutivo

Se investigaron cuatro fuentes primarias oficiales y se leyeron con éxito (Airbnb Help Center x2, Booking.com "How we work", Vrbo Help Center). Confirman tres hechos con impacto directo en el diseño de RV12:

1. **Airbnb** libera el payout al anfitrión según el tipo de reserva y el método de cobro elegido tarda entre 30 minutos (Fast Pay) y 7 días (wire internacional) en llegar [DATO, L-RV12-01]; además puede haber retrasos de hasta 45 días por revisión antifraude [DATO, L-RV12-01].
2. **Airbnb obliga a los anfitriones que usan software de gestión (PMS) — el caso de Atiende — a operar bajo el esquema de comisión "host-only" (14–16%, 16% en México), no bajo el split-fee de 3–4%** [DATO, L-RV12-02, airbnb.com/help/article/1857]. Esto es un hallazgo crítico para modelar comisiones en los owner statements: los ingresos brutos que Atiende reciba vía API de Airbnb ya vendrán con esta comisión más alta descontada. **Este hallazgo se presenta con el mismo nivel de certeza que la fuente permite (cita textual de página oficial), pero está sujeto a la incertidumbre de vigencia y alcance detallada en el Riesgo R3 más abajo: no se confirmó la fecha de vigencia del mandato ni si aplica igual a todas las integraciones API (directa vs. vía channel manager certificado), por lo que no debe tratarse como un hecho definitivo e inmutable al fijar el motor de comisiones.**
3. **Booking.com** opera 100% por comisión (no revende el servicio) y tiene **al menos tres modelos distintos de cobro al huésped** (cobro directo por el anfitrión, cobro anticipado reenviado, o "Booking.com organiza el pago al proveedor por adelantado" — es decir, existe un modelo tipo "Booking.com Payments") [DATO, L-RV12-03]. No se logró leer una página oficial con el porcentaje de comisión (bloqueada por control de acceso de partner); esa cifra queda **PENDIENTE**.
4. **Vrbo** expone un "payout summary" descargable (CSV/XLS) que ya viene neto de comisión y fees, alineado a reservas completadas — insumo directo para conciliación [DATO, L-RV12-04]. No se pudo verificar el porcentaje de comisión de Vrbo con fuente oficial leída (páginas de tarifas dieron error 429/500); queda **PENDIENTE**.
5. Los requisitos de **CFDI/SAT** para facturación de arrendamiento en México **no pudieron verificarse con una página oficial de sat.gob.mx leída** en esta sesión (bloqueos HTTP 403, ECONNREFUSED y un PDF binario ilegible). Esta sección queda marcada **PENDIENTE de revisión legal/fiscal** con fuente primaria.

Los modelos de roles, el diseño de owner statement, la auditoría de mutaciones y el aislamiento multi-tenant son **propuestas de diseño de producto** de Atiende, no hechos de mercado verificados, y se presentan como tales.

---

## 1. Modelo de roles (propuesta de diseño de producto — no requiere fuente externa)

**Nota de método:** esta sección es diseño de producto razonado para Atiende. No es un hecho de mercado verificado externamente; se declara explícitamente como supuesto/propuesta.

| Rol | Alcance | Permisos clave | Vistas |
|---|---|---|---|
| **Superadmin Atiende** | Toda la plataforma, todas las empresas gestoras (tenants) | Alta/baja de tenants, soporte, acceso de "romper cristal" a datos de un tenant (auditado), gestión de planes/facturación de Atiende, configuración global de integraciones (Airbnb/Booking/Vrbo API keys a nivel plataforma si aplica) | Panel de operaciones multi-tenant, logs de auditoría globales, salud de integraciones por canal |
| **Administrador de empresa gestora** | Una empresa gestora (tenant), todas sus propiedades y usuarios | Alta/baja de propiedades, operadores, limpieza, propietarios y contadores dentro de su tenant; configuración de comisión del gestor por propiedad/propietario; aprobación de owner statements; conexión de canales (Airbnb/Booking/Vrbo) | Dashboard financiero del tenant, calendario multi-propiedad, configuración de reglas de comisión y reparto de gastos |
| **Operador** | Propiedades asignadas dentro del tenant | Gestión de reservas, mensajería con huéspedes, registro de gastos operativos, check-in/check-out | Calendario de propiedades asignadas, bandeja de mensajes, registro de incidencias/gastos |
| **Limpieza** | Propiedades/turnos asignados | Marcar tareas de limpieza completadas, reportar incidencias/daños, subir evidencia fotográfica | Lista de turnos asignados, checklist por propiedad, sin acceso a datos financieros ni de huésped más allá de fechas de turno |
| **Propietario (vista limitada)** | Solo sus propias propiedades | Solo lectura: reservas, ocupación, ingresos brutos, comisión del gestor, gastos imputados, neto a liquidar, descarga de owner statement | Dashboard de "mi propiedad": calendario de ocupación, historial de liquidaciones, documentos (CFDI si aplica) |
| **Contador** | Datos financieros/fiscales del tenant (o de un subconjunto de propietarios, configurable) | Lectura de todos los owner statements, acceso a registros de ingresos/gastos/impuestos, exportación contable, posible permiso de generar/adjuntar CFDI; sin permisos operativos (no gestiona reservas ni limpieza) | Vista consolidada de contabilidad, reportes por periodo fiscal, exportación (CSV/XML/CFDI) |

**Supuestos de diseño declarados:**
- Se asume modelo RBAC (role-based access control) con posibilidad de permisos granulares por propiedad (un operador puede ver solo un subconjunto de propiedades del tenant).
- Se asume que "administrador de empresa gestora" puede tener sub-roles (ej. admin financiero vs. admin operativo) en iteraciones futuras; para RV12 se modela como rol único.
- El rol de contador podría ser interno del tenant o un despacho externo con acceso restringido — pendiente de decisión de producto, no de investigación de mercado.

**⚠️ Nota de reconciliación pendiente (roles) — ver también RV18.** Este módulo (RV12) modela 6 roles internos (Superadmin Atiende, Administrador de empresa gestora, Operador, Limpieza, Propietario, Contador) sin niveles diferenciados de "coanfitrión" al estilo Airbnb. El módulo **RV18 — Agentes, automatización y tool-calling** (sección 3.1, escrito el mismo día que este documento, sin cruzarse con él) modela en cambio 4 roles (anfitrión, coanfitrión con 3 niveles delegados — acceso completo / calendario+mensajería / solo calendario, análogo a RV03 — administrador, superadmin de empresa gestora), sin los roles "Limpieza" ni "Contador" de este módulo. **Estos dos modelos de roles no están reconciliados**: no está definido si "Operador" (RV12) equivale a "coanfitrión full access" (RV18), ni dónde encajan "Limpieza"/"Contador" dentro del esquema de RV18. Ninguno de los dos documentos debe tratarse como el modelo final de roles del producto. **Recomendación (no ejecutada aquí, ver RV17 pendiente):** antes de que RV17 (arquitectura/datos) congele el modelo de datos de roles y permisos, se debe abrir un módulo dedicado de "roles y permisos" que unifique ambas propuestas, tomando como base los 3 niveles de cohost ya verificados con fuente primaria (RV01/RV03: acceso completo / calendario+mensajería / solo calendario) y extendiéndolos con los roles operativos/financieros de este módulo (Operador, Limpieza, Propietario, Contador). Referencia cruzada: `docs/LAGUNAS.md` (fila a añadir/actualizar sobre reconciliación de modelos de roles RV12↔RV18).

---

## 2. Owner statements (liquidaciones por propietario)

### 2.1 Estructura propuesta (diseño de producto)

Un owner statement por propietario y periodo debe reconstruirse a partir de, como mínimo:

- **Ingresos por reserva** (por canal): tarifa de alojamiento, fees adicionales cobrados al huésped que le correspondan al propietario (limpieza si se factura aparte, etc.), impuestos de ocupación cobrados y remitidos por el canal (si aplica).
- **Comisión del canal** (Airbnb/Booking/Vrbo) — deducida por el canal antes de pagar al anfitrión/gestor (ver sección 3).
- **Comisión del gestor** (Atiende/empresa gestora) — configurable por propiedad o por propietario, calculada sobre ingresos brutos o netos según la política del tenant (decisión de producto, no de mercado).
- **Gastos operativos imputables**: limpieza, mantenimiento, suministros, comisión de intermediarios locales — registrados por el operador.
- **Impuestos** aplicables al propietario (ver sección 5 — CFDI, PENDIENTE de verificación legal).
- **Neto a pagar al propietario** = ingresos brutos − comisión del canal (si el gestor la recibe ya neta) − comisión del gestor − gastos − impuestos retenidos.

**Punto crítico de diseño (deducido de la evidencia de la sección 3):** si el canal ya paga al gestor/anfitrión un monto **neto de su comisión** (como confirma Airbnb: "the entire fee is deducted from the host's payout" — L-RV12-02), el owner statement **no debe volver a restar la comisión del canal sobre el bruto original**, sino partir del monto neto ya recibido y solo aplicar la comisión del gestor y los gastos. Esto evita doble descuento, un error común si el sistema mezcla "precio publicado al huésped" con "monto realmente depositado".

### 2.2 Qué software de PM estructura esto de forma pública

**PENDIENTE.** No se encontró ni se leyó, en esta sesión, una página pública **oficial** de un PMS de rentas vacacionales que documente en detalle la estructura de su owner statement (comisiones separadas, líneas de gasto, formato de export). Las referencias encontradas en búsquedas (Hostaway, Hospitable, Guesty, iGMS, Lodgify, OwnerRez) son blogs/artículos de marketing, no documentación oficial de producto con nivel de detalle contable verificable, por lo que **no se citan como hecho** conforme a las reglas de evidencia. Si se requiere esta comparación, es un trabajo de investigación adicional (leer específicamente páginas de documentación de producto —no blogs— de esos PMS).

### 2.3 Datos reales de canal necesarios para construir el statement

En base a lo confirmado en las fuentes primarias leídas:

- De **Airbnb**: el "Transactions"/earnings export (vía dashboard o API de Airbnb para software autorizado) debe incluir, como mínimo, el monto bruto de la reserva, la comisión host-only ya deducida (14–16%, 16% en México — L-RV12-02) y el monto neto liberado, con su fecha de liberación (L-RV12-01).
- De **Booking.com**: dado que el modelo de cobro al huésped varía (directo, anticipado reenviado, o gestionado por Booking.com — L-RV12-03), el statement debe soportar **al menos dos flujos de caja distintos**: (a) el gestor cobra directo al huésped y le debe una factura de comisión a Booking.com por separado; (b) Booking.com paga al gestor y la comisión ya viene descontada. El detalle operativo de facturación/plazos de Booking.com (para el flujo a) **no se pudo verificar** con fuente oficial leída — PENDIENTE.
- De **Vrbo**: el "payout summary" (CSV/XLS oficial, L-RV12-04) ya trae bookings, deducciones y payout neto — es el insumo más directo de los tres canales para poblar automáticamente el statement, aunque el desglose exacto de columnas no se confirmó.

---

## 3. Flujo de pagos por canal

### 3.1 Airbnb

- **Quién cobra al huésped:** Airbnb cobra al huésped al momento de la reserva (no se encontró página específica sobre esto en esta sesión sobre el cobro al huésped, pero se confirma el lado del payout al anfitrión).
- **Cuándo paga Airbnb al anfitrión:** "The timing of your payout depends on the type of reservation, the length of your guest's stay for a home reservation, your payout schedule and your payout method's processing time" (L-RV12-01) [DATO]. Una vez liberado el payout, el tiempo de entrega según método: Fast Pay/Pay to card ≤30 min, Payoneer ≤24h, PayPal ~1 día hábil, Western Union ~1 día hábil, ACH 3 días hábiles (solo EE.UU./Puerto Rico), transferencia bancaria 3–5 días hábiles, wire internacional 3–7 días hábiles [DATO, L-RV12-01]. Airbnb advierte que revisiones antifraude pueden retrasar el payout hasta 45 días después del check-in del huésped [DATO, L-RV12-01].
- **Comisión documentada:** ver sección 2.1 arriba y L-RV12-02. Relevante para Atiende: **al ser un software de gestión, los anfitriones operados vía Atiende caerían bajo el esquema host-only obligatorio (14–16%, 16% en México)** [DATO, L-RV12-02; ver matiz de vigencia en Riesgo R3], no bajo el split 3–4% [DATO, L-RV12-02].

### 3.2 Booking.com

- **Modelo de negocio:** comisión pura — "We don't buy or (re)sell any products or services" (L-RV12-03).
- **Quién cobra al huésped:** varía por acuerdo. La página oficial leída describe tres variantes para alojamientos: (1) el proveedor de servicio (anfitrión/hotel) cobra directamente en la propiedad; (2) el proveedor cobra por adelantado y Booking.com solo reenvía los datos de pago; (3) "We organize your payment to the Service Provider in advance" — Booking.com gestiona el cobro al huésped y paga por adelantado al proveedor (modelo tipo "Booking.com Payments").
- **Cuándo se paga la comisión / cuándo cobra el canal al gestor:** **PENDIENTE.** Se intentó leer las páginas oficiales de Booking.com Partner Hub sobre comisión e invoicing (`partner.booking.com/.../understanding-our-commission`, `.../understanding-your-commission`, `partnerhelp.booking.com/.../213700789`) y todas fallaron (HTTP 403 por requerir sesión de partner, o error de red). No se cita ningún porcentaje ni plazo de facturación de Booking.com como hecho verificado.
- **Comisión documentada:** **PENDIENTE** — no se pudo leer una página oficial con el porcentaje. (Cifras como "~15%" que aparecen en fuentes secundarias/blogs NO se citan aquí conforme a las reglas de evidencia.)

### 3.3 Vrbo / Expedia

- **Payout al propietario:** el "Payout summary" oficial de Vrbo confirma que se puede consultar y descargar (CSV/XLS) el detalle de "funds you received after commission and fees are deducted" y que corresponde a "completed bookings" (L-RV12-04) [DATO], vía Payments → Statements and reports en el dashboard del propietario.
- **Comisión y plazos exactos de pago (cuántos días después del check-in, porcentaje de comisión):** **PENDIENTE.** Los intentos de leer páginas oficiales de tarifas de Vrbo (`help.vrbo.com/articles/What-fees-does-Vrbo-charge`, `vrbo.com/help`) devolvieron error interno del sitio (500) o rate-limit (429), sin contenido recuperable.
- **Cambio de modelo (Vrbo Payments / merchant of record):** se detectaron menciones en resultados de búsqueda sobre un cambio de Expedia Group hacia ser "merchant of record" en pagos de Vrbo, pero **no se leyó una página oficial que lo confirme** en esta sesión — PENDIENTE, y relevante para el diseño porque cambiaría quién es la contraparte de cobro en la conciliación.

---

## 4. Conciliación de payouts vs. reservas

Lo único confirmado con fuente oficial leída sobre exports/APIs de conciliación:

- **Vrbo:** ofrece un export oficial (CSV/XLS) del "Payout summary" que ata bookings completados a montos de payout después de comisión y fees (L-RV12-04). Esto es exactamente el tipo de dato que RV12 necesita ingerir para conciliar automáticamente payout bancario vs. reservas.
- **Airbnb:** el earnings dashboard permite ver "el estado de tus payouts" (mencionado en resultados de búsqueda sobre L-RV12-01), y presumiblemente exporta transacciones, pero **no se leyó una página oficial específica sobre el formato del export/API de transacciones de Airbnb** en esta sesión — PENDIENTE.
- **Booking.com:** no se pudo leer documentación oficial sobre qué expone el extranet para conciliación (Finance/Invoices) más allá de lo visto en snippets de búsqueda (no verificado por lectura directa) — PENDIENTE.

**Implicación de diseño (propuesta, no hecho verificado):** dado que ninguno de los tres canales garantiza (según lo que se pudo leer) un formato homogéneo, RV12 debería diseñar un **adaptador de conciliación por canal** (uno por Airbnb, Booking, Vrbo) que normalice a un esquema interno común (reserva → bruto, comisión canal, impuestos remitidos por canal, neto, fecha de payout, referencia bancaria), en lugar de asumir un formato único.

---

## 5. Facturación en México (CFDI) — PENDIENTE de verificación con fuente primaria; revisión legal/fiscal requerida

**Límite explícito:** el investigador **no es asesor legal ni fiscal**. Todo lo relacionado con CFDI/SAT en este documento debe pasar por revisión de un contador/abogado fiscalista antes de convertirse en requisito de producto.

**Estado de la investigación:** se intentó leer tres fuentes directas de sat.gob.mx / gob.mx:
- `https://www.sat.gob.mx/noticias/85392/expide-tu-comprobante-de-arrendamiento` → HTTP 403 (dos intentos).
- `http://omawww.sat.gob.mx/informacion_fiscal/factura_electronica/Paginas/requistos_cfd_electronico.aspx` → ECONNREFUSED.
- `https://www.gob.mx/cms/uploads/attachment/file/813353/GUIA_DESCARGA_CFDI_SAT.pdf` → se descargó el binario pero no se pudo extraer texto legible.

**Ninguna quedó verificada por lectura primaria exitosa.** En consecuencia, este documento **no afirma** requisitos específicos de CFDI (campos obligatorios, versión vigente, obligación de cuenta predial, etc.) como hechos verificados, aun cuando aparecieron en resultados de búsqueda de terceros (blogs fiscales) que citan al SAT — esas fuentes son secundarias y no cumplen la regla de evidencia de este documento.

**Lo que se necesita para cerrar esta sección (siguiente paso de investigación):**
1. Lograr acceso de lectura a una página oficial de sat.gob.mx (posible causa del bloqueo: user-agent o geobloqueo del fetch automatizado; puede requerir acceso manual o una herramienta con navegador real).
2. Confirmar con fuente oficial: versión vigente de CFDI, campos obligatorios para arrendamiento de inmuebles (incluyendo si aplica número de cuenta predial), régimen fiscal aplicable a propietarios de rentas vacacionales, y tratamiento de plataformas digitales extranjeras (Airbnb/Booking/Vrbo) como retenedoras de ISR/IVA en México — este último punto no se investigó en esta sesión y es altamente relevante para RV12.
3. Validar todo con un contador/fiscalista antes de fijarlo como requisito de producto.

---

## 6. Auditoría de cada mutación (propuesta de diseño interno — no requiere fuente externa)

**Nota de método:** requisito de diseño interno de Atiende, no un hecho de mercado.

Propuesta:
- Cada mutación sobre entidades financieras (owner statement, gasto, comisión, ajuste manual de payout, cambio de rol/permiso) debe generar un registro de auditoría inmutable: `quién` (usuario + rol al momento del cambio), `qué` (entidad + campo + valor anterior/nuevo), `cuándo` (timestamp), `desde dónde` (IP/dispositivo si aplica), y `por qué` (motivo/nota opcional para ajustes manuales).
- Los registros de auditoría deben ser de solo-append (no editables ni borrables) y visibles al menos para superadmin Atiende y administrador de empresa gestora (con alcance a su propio tenant).
- Cualquier ajuste manual a un owner statement ya generado (ej. corrección de un gasto mal imputado) debe versionar el statement, no sobrescribirlo, para preservar lo que el propietario vio originalmente.

---

## 7. Multi-tenant y aislamiento de datos (propuesta de diseño interno — no requiere fuente externa)

**Nota de método:** requisito de diseño interno de Atiende, no un hecho de mercado.

Propuesta:
- Aislamiento estricto por `tenant_id` (empresa gestora) en cada tabla con datos operativos/financieros; ningún query debe poder cruzar tenants salvo el rol superadmin Atiende, y ese acceso debe quedar auditado (sección 6).
- Las credenciales de integración con canales (API keys/OAuth de Airbnb, Booking, Vrbo) deben almacenarse por tenant (o por propiedad, si el propietario conecta su propia cuenta de canal), nunca compartidas entre tenants.
- Los roles "propietario" y "contador" deben poder acotarse no solo por tenant sino por subconjunto de propiedades dentro del tenant (un propietario con varias propiedades gestionadas por el mismo gestor solo ve las suyas).
- Recomendación de diseño: separar lógicamente "empresa gestora" (tenant) de "propietario" como entidad, ya que un mismo propietario podría, en teoría, tener relación con más de una empresa gestora — esto afecta el modelo de datos de aislamiento (relación N:M controlada, no solo jerarquía estricta tenant→propietario).

---

## Riesgos / límites

- **R1.** El porcentaje de comisión de Booking.com y de Vrbo no se pudo confirmar con fuente oficial leída en esta sesión. Cualquier cálculo de comisión de canal en el motor de owner statements para estos dos canales debe tratarse como **configurable/editable manualmente** hasta tener el dato verificado, no hardcodeado.
- **R2.** La sección de CFDI/SAT está completamente PENDIENTE de fuente primaria. No debe implementarse ninguna lógica de generación de CFDI en RV12 sin validación de un fiscalista y sin lograr leer la normativa oficial vigente.
- **R3.** El hallazgo de que Airbnb obliga a hosts con PMS al esquema "host-only" (14–16%) es reciente en la evidencia leída pero no se confirmó su fecha de vigencia ni si aplica igual a todas las integraciones API — riesgo de que el dato cambie o tenga excepciones no capturadas.
- **R4.** No se investigó en esta sesión el tratamiento de retención de impuestos (ISR/IVA) por plataformas digitales extranjeras en México — es un tema fiscal de alto impacto para el owner statement y quedó fuera de alcance por límite de fuentes verificadas.
- **R5.** Las propuestas de roles, auditoría y multi-tenant son diseño razonado, no validado con ningún cliente/usuario real de Atiende ni con benchmarking de producto verificado (sección 2.2 quedó PENDIENTE por falta de fuentes primarias comparables).

---

## Implicaciones para requisitos

- **RV12-R-01.** El motor de owner statements debe permitir configurar, por canal y por propiedad, si el monto ingerido desde el canal ya viene neto de comisión (caso Airbnb confirmado, L-RV12-02) o bruto (a determinar para Booking/Vrbo), para evitar doble descuento de comisión.
- **RV12-R-02.** El sistema debe modelar el esquema de comisión "host-only" de Airbnb (14–16%, 16% México) como el aplicable por defecto a anfitriones gestionados vía Atiende, dado que Airbnb declara este esquema obligatorio para usuarios de software de gestión (L-RV12-02); debe ser editable si Airbnb lo cambia.
- **RV12-R-03.** El módulo de pagos debe soportar múltiples métodos de payout de Airbnb con tiempos de entrega distintos (30 min a 7 días) y una ventana de posible retraso de hasta 45 días por antifraude, para no marcar como "atrasado" o "discrepante" un payout que simplemente está dentro del rango documentado.
- **RV12-R-04.** El módulo de conciliación debe implementarse como adaptadores por canal (no un formato único), priorizando Vrbo (export CSV/XLS oficial confirmado, L-RV12-04) como caso de referencia, y dejando Airbnb/Booking pendientes de especificación técnica adicional.
- **RV12-R-05.** El módulo de comisión de Booking.com y Vrbo debe ser configurable manualmente por tenant/propiedad (no hardcodear porcentaje) hasta obtener confirmación oficial (ver Riesgo R1).
- **RV12-R-06.** Ninguna funcionalidad de generación/timbrado de CFDI debe liberarse sin (a) lectura confirmada de la normativa oficial vigente del SAT y (b) revisión de un fiscalista mexicano (ver Riesgo R2).
- **RV12-R-07.** Todo cambio a entidades financieras (statement, gasto, comisión, rol) debe registrarse en un log de auditoría append-only con actor, timestamp, valor anterior/nuevo (diseño interno, sección 6).
- **RV12-R-08.** El modelo de datos debe aislar estrictamente por tenant (empresa gestora), con excepción auditada para superadmin Atiende, y soportar la posibilidad de que un propietario esté vinculado a más de una empresa gestora (diseño interno, sección 7).
- **RV12-R-09.** El rol "propietario" debe tener acceso de solo lectura acotado a sus propias propiedades, incluyendo descarga del owner statement y (cuando exista) su CFDI — sujeto a RV12-R-06.
- **RV12-R-10.** El rol "contador" debe tener acceso a datos financieros consolidados sin permisos operativos, con exportación para uso contable/fiscal externo.

---

## Lagunas

1. **Porcentaje y plazo de comisión de Booking.com** — no verificado con fuente oficial leída (bloqueo de acceso a Partner Hub). Siguiente paso: reintentar con navegador autenticado o solicitar acceso de partner de prueba. Ver `docs/LAGUNAS.md` sección 6, fila "Comisión exacta de Booking.com" (LAGUNA HONESTA, módulos RV12/RV13).
2. **Porcentaje de comisión y plazos exactos de payout de Vrbo** — páginas oficiales de tarifas devolvieron error al momento de la consulta; reintentar en otro momento. Ver `docs/LAGUNAS.md` sección 6, fila "Comisión exacta de Vrbo" (LAGUNA HONESTA, módulos RV12/RV13).
3. **Formato de export/API de transacciones de Airbnb para conciliación** — no se localizó ni leyó documentación oficial específica en esta sesión.
4. **Requisitos oficiales de CFDI/SAT para arrendamiento de rentas vacacionales** — bloqueo total de acceso a sat.gob.mx en esta sesión; sección completa pendiente y requiere revisión legal/fiscal antes de cualquier implementación. Ver `docs/LAGUNAS.md` sección 6, fila "México — vigencia post-reforma de tasas ISR (4%/20%)/IVA (50%/100%)" (LAGUNA HONESTA, módulos RV12/RV19).
5. **Tratamiento fiscal de retenciones de ISR/IVA por plataformas digitales extranjeras en México** — no investigado en esta sesión; alto impacto en el cálculo de neto del owner statement. Misma fila de `docs/LAGUNAS.md` que el punto 4.
6. **Comparación con estructura de owner statements de otros PMS** — no se encontró documentación oficial pública suficientemente detallada (solo blogs de marketing, descartados por regla de evidencia); pendiente si se requiere benchmarking formal.
7. **Confirmación de "Vrbo Payments" / cambio a merchant-of-record** — mencionado en fuentes secundarias, no confirmado con página oficial leída; relevante para saber quién es la contraparte de cobro en la conciliación de Vrbo a futuro.
8. **Modelo de roles no reconciliado con RV18** — ver "Nota de reconciliación pendiente" en la sección 1; requiere un módulo dedicado de roles/permisos antes de que RV17 congele el modelo de datos. Fila ya existente en `docs/LAGUNAS.md` sección 5: "Modelo de roles internos no reconciliado (RV12 vs. RV18)".
9. **Cobertura de fuentes por debajo del mínimo del plan.** Este módulo cita 4 URLs de fuente primaria (L-RV12-01 a L-RV12-04), muy por debajo del mínimo de 25 URLs distintas exigido por `docs/investigacion/00-PLAN.md` §1.3. La razón declarada no es pereza sino bloqueo real de acceso: Booking.com Partner Hub (HTTP 403), Vrbo fee pages (HTTP 429/500) y sat.gob.mx (HTTP 403/ECONNREFUSED/PDF binario) bloquearon todos los intentos adicionales de esta sesión (ver detalle en `docs/fuentes/rv12-13-15-16.md`, sección "Fuentes buscadas pero NO leídas con éxito (RV12)"). Ampliar esta cobertura requiere reintentar con acceso de partner autenticado o navegador con sesión real, no repetir el mismo WebFetch bloqueado.

---

## Supuestos

- Se asume arquitectura RBAC con permisos acotables por propiedad dentro de un tenant (sección 1).
- Se asume que el owner statement se calcula por periodo (mensual, configurable) y por propiedad/propietario, agregando reservas con check-out dentro del periodo (supuesto de diseño, no confirmado contra política de ningún canal específico).
- Se asume que la comisión del gestor (Atiende/empresa gestora) es independiente y configurable, superpuesta a la comisión del canal, y que el tenant define si se calcula sobre bruto o neto de canal.
- Se asume que cada canal se conecta a Atiende vía API oficial o export manual (CSV) según disponibilidad, y que el sistema debe tolerar ambos modos de ingesta de datos por canal.
- Se asume que el rol "contador" puede ser interno o externo (despacho), sin que esto cambie el modelo de permisos de solo-lectura financiera.

---

## Fuentes de este módulo

**Nota:** solo 4 URLs de fuente primaria se leyeron con éxito en esta sesión (por debajo del mínimo de 25 exigido por el plan — ver Laguna 9 arriba); las URLs adicionales intentadas y bloqueadas están listadas en `docs/fuentes/rv12-13-15-16.md`, sección "Fuentes buscadas pero NO leídas con éxito (RV12)", y no se repiten aquí porque no aportan contenido verificado. Fecha de consulta de todas las fuentes: 2026-09-05.

**Payouts y comisiones (Airbnb):**
- https://www.airbnb.com/help/article/425 (How and when your payout is released) — L-RV12-01
- https://www.airbnb.com/help/article/1857 (Airbnb service fees) — L-RV12-02

**Modelo de pagos (Booking.com):**
- https://www.booking.com/content/how_we_work.html (How we work) — L-RV12-03

**Conciliación de payouts (Vrbo):**
- https://help.vrbo.com/articles/How-do-I-view-my-payout-summary (How do I view my payout summary?) — L-RV12-04
