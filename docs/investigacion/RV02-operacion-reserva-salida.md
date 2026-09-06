# RV02 — Operación de reserva a salida

Módulo de investigación para Atiende Rentas Vacacionales. Fecha de consulta de todas las fuentes: 2026-09-05. El ledger completo de fuentes (título / editor / URL / cita / confianza / laguna) se entrega en `docs/fuentes/rv01-02-09-10-11.md` (sección RV02) y se resume también en la sección "Fuentes de este módulo" al final de este documento. Convención de etiquetas de confianza: `[DATO]` = leído literalmente en fuente primaria/oficial; `[R]` = reportado por fuente secundaria (vendor, blog, foro); `[E]` = estimación propia del investigador sin fuente publicada (ver `00-PLAN.md` §2).

**Principio rector del producto (no negociable):** el calendario unificado debe CERRAR disponibilidad entre canales; nunca cancelar reservas automáticamente ni contactar huéspedes sin autorización humana explícita.

---

## Resumen ejecutivo

Airbnb es, con diferencia, el canal mejor documentado públicamente para todo el ciclo reserva→salida: su centro de ayuda oficial (airbnb.com/help) confirma con texto verbatim cómo funcionan Instant Book y las solicitudes de reserva (respuesta del host en ~24h) [DATO], las cinco políticas de cancelación estándar y el periodo de gracia de 24 horas [DATO], la política de cancelación de host con tabla de penalizaciones (10/25/50 % según antelación, mínimo 50 USD) [DATO], el mecanismo de reseñas (ventana de 14 días, publicación solo cuando ambas partes han enviado su reseña o vence el plazo) [DATO], el calendario de payouts a hosts (fin del día hábil siguiente al check-in) [DATO], las opciones oficiales de autocheck-in (smart lock, keypad, lockbox, personal de edificio, recepción en persona — sin mención de marcas) [DATO], y el proceso de Resolution Center/AirCover, que exige explícitamente revisión por "a dedicated team member" antes de una decisión final [DATO].

Vrbo tiene documentación pública robusta y accesible vía WebFetch sobre cancelaciones (7 niveles de política, tabla de reembolsos) [DATO], pagos (plan de pagos configurable, reembolsos automáticos según política) [DATO] y penalización a cancelaciones iniciadas por el host (afecta "Ranking Metrics" incluso con causa justificada, salvo waiver aprobado en un plazo de 10 días) [DATO].

Booking.com es la laguna más grande de esta investigación: **todas** las páginas del portal para partners (partner.booking.com) devolvieron HTTP 403 al intentar leerlas con WebFetch, de forma sistemática y repetida, incluida la página raíz de ayuda. Solo pude leer con WebFetch la página general de términos (booking.com/content/terms.html) y la portada de ayuda para viajeros (secure.booking.com/help.html), que dan información mínima y genérica (el reembolso depende de la política del "Service Provider"; Booking.com puede gestionar el pago como intermediario) [DATO — texto genérico, no específico de operación]. Toda afirmación más específica sobre Booking.com que aparece en fragmentos de búsqueda (comisión, Genius, mensajería, plazos de reseña) **no se cita como hallazgo verificado** — queda registrada en Lagunas/Supuestos por no haber sido leída directamente.

Sobre herramientas de operación (PMS), Hospitable documenta en su propia página pública que automatiza mensajería en más eventos que Airbnb de forma nativa, pero recomienda expresamente un enfoque escalonado: usar sugerencias de IA editables antes de activar "Full Guest Reply Automation" [R — documentación de producto de un vendor sobre su propio producto]. Breezeway documenta automatización de tareas de limpieza/turnover basada en reglas de la reserva e integración con PMS, sin detalle público verbatim sobre el disparador exacto de checkout [R].

El hallazgo más relevante para las reglas de negocio no negociables del producto: **las propias plataformas ya diseñan sus flujos de cancelación e incidencias para requerir intervención humana explícita** (revisión de "dedicated team member" en Airbnb, documentación/foto/carta médica para cancelaciones sin penalización, aprobación explícita de guest cancellation waivers en Vrbo) [DATO] — lo cual respalda directamente, con evidencia primaria, la política del producto de no automatizar cancelaciones ni contacto sensible sin aprobación humana.

---

## Contenido

### 1. Consulta (pre-reserva)

Airbnb distingue, antes de que exista una reserva, entre anuncios con **Instant Book** (botón "Confirm and pay", sin aprobación del host) y anuncios que requieren **Request to Book** (el huésped puede añadir método de pago, revisar políticas y enviar un mensaje al host antes de enviar la solicitud) [Airbnb, "How to book a home", airbnb.com/help/article/85] [DATO]. No se identificó documentación específica de Airbnb sobre el estado "consulta"/pregunta previa a solicitud (pre-booking inquiry) más allá de la posibilidad de mensajear al host antes de reservar.

Para Booking.com no se pudo verificar con WebFetch ninguna página oficial sobre el flujo de consulta previo a la reserva (ver Lagunas); la afirmación de terceros de que existe un modo "Instant Booking" y otro "Request to Book" en Booking.com **no se cita como hallazgo** por no haber sido leída directamente.

**Evento de calendario esperado:** ninguno — la etapa de consulta no debe generar bloqueo de disponibilidad; solo el paso siguiente (solicitud aceptada o Instant Book) debe hacerlo. [E — inferencia de diseño propia, no cifra de fuente publicada]

### 2. Solicitud / reserva instantánea

- **Instant Book (Airbnb):** "Instant Book is a convenient and fast way to allow guests to book your place without waiting for your approval" [Airbnb, "How Instant Book Works", airbnb.com/help/article/1510] [DATO]. El host puede exigir parámetros de huésped (p. ej. reseñas positivas de otros hosts) [misma fuente] [DATO]. Excepción documentada: "Instant Book isn't available if a guest books within 2 days of check-in and needs to arrive at a time that's outside your check-in window" — en ese caso, se genera una Request to Book aunque el anuncio tenga Instant Book activado [misma fuente] [DATO].
- **Request to Book (Airbnb):** "If you sent a request, your host will typically respond within 24 hours" y "If they decline or don't respond within 24 hours, there's no charge and you'll be free to book a different stay instead" (excepto pagadores en rupias indias, cobrados de inmediato al enviar la solicitud) [Airbnb, "How to book a home", airbnb.com/help/article/85] [DATO].
- **Vrbo:** no se localizó ni leyó una página oficial equivalente sobre modalidad instantánea vs solicitud (laguna).
- **Booking.com:** no verificado con WebFetch (laguna).

**Evento de calendario esperado:** 
- Instant Book confirmado → bloqueo inmediato y firme de esas fechas en todos los canales.
- Request to Book enviada → bloqueo *provisional/soft-hold* de las fechas mientras dura la ventana de respuesta del host (Airbnb documenta ~24h como comportamiento típico, no como límite técnico duro) [artículo 85] [DATO]; si no hay confirmación en ese plazo, liberar el hold. [E — regla de diseño derivada, no cifra publicada directamente como requisito técnico]

### 3. Confirmación

Una vez confirmada la reserva (Instant Book o solicitud aceptada), Airbnb aplica un **periodo de gracia de 24 horas**: "A 24-hour cancellation period applies to all standard cancellation policies for shorter stays (less than 28 nights)", que da al huésped "a full refund including taxes for up to 24 hours after the reservation is confirmed, as long as the reservation was confirmed at least 7 days before check-in" [Airbnb, "Cancellation policies for your home", airbnb.com/help/article/475] [DATO].

**Evento de calendario esperado:** al confirmarse la reserva (Instant Book o aceptación de solicitud), el sistema debe (a) cerrar disponibilidad en todos los canales conectados, y (b) registrar el timestamp de confirmación, porque de él depende el cómputo del periodo de gracia de 24 horas y de las políticas de cancelación aplicables. [E — requisito de diseño derivado de la regla anterior]

### 4. Pago / cobro por canal

- **Airbnb — payout al host:** "both host and co-host payouts will be sent by the end of the business day after the guest's scheduled check-in date" para la mayoría de reservas de corta estancia [Airbnb, "When you'll get paid", airbnb.com/help/article/3389] [DATO]. Hosts nuevos sin dos estancias completadas o sin verificación de ubicación del anuncio reciben el payout "by the end of the business day after the guest's scheduled checkout date" en vez de al check-in [misma fuente] [DATO]. Para estancias mensuales (28+ noches), el payout inicial de hosts no verificados se libera "by the end of the business day 28 days after the guest's scheduled check-in date" [misma fuente] [DATO]. Airbnb puede retener fondos "for up to 45 days after guest check-in, paused, or, in rare cases, removed" por prevención de fraude [misma fuente] [DATO]. No se encontró en esta página mención a "Fast Pay".
- **Vrbo — cobro al huésped:** el host configura en "Property > Rules & policies > Payment terms" si exige 100 % al reservar o hasta 3 pagos parciales, indicando "the percentage due for each payment" y "how many days before check-in each payment is due"; "the guest's first payment includes the percentage you set for that payment, plus any applicable taxes and fees for the entire reservation" [Vrbo, "Set up your payment terms", help.vrbo.com/articles/How-do-I-set-up-a-payment-schedule-for-reservations] [DATO]. Reembolsos: "Refunds are automatically issued according to your cancellation policy" [Vrbo, help.vrbo.com/articles/Does-HomeAway-Payments-automatically-issue-refunds-to-travelers] [DATO].
- **Booking.com:** no verificado vía WebFetch más allá de un enunciado genérico de los términos generales: "If we organize your payment, we (or, in some cases, our affiliate) will be responsible for managing it" [Booking.com, Terms and Conditions, booking.com/content/terms.html] [DATO — texto literal leído, pero de alcance genérico, no específico de operación]. Todo lo relativo a comisión exacta, Booking.com Payments, facturación y Genius **no se cita como hallazgo** (laguna — portal de partners bloqueado, ver Lagunas).

**Evento de calendario/sistema esperado:** el cobro/payout no debería, por sí mismo, disparar cambios de disponibilidad (la disponibilidad ya se cerró en el paso de Confirmación), pero sí debe generar un evento contable vinculado a la reserva (fecha de cobro al huésped, fecha de payout al host) para conciliación financiera. [E — requisito de diseño propio]

### 5. Mensajes pre-llegada

Airbnb ofrece **quick replies programables** ("scheduled quick replies") que se disparan por eventos: "Hosts can save time by scheduling quick replies to automatically send based on triggers, like a new reservation, check-in, or checkout" [Airbnb Resource Center, "Using quick replies to save time", airbnb.com/resources/hosting-services/a/using-quick-replies-to-save-time-747 — cita de fragmento de búsqueda corroborada] [R — fragmento de búsqueda corroborado, no lectura completa verbatim de la página]. En la página de ese mismo recurso leída vía WebFetch se documenta un mecanismo de seguridad: "You'll see a reminder in your conversation with the guest when a scheduled quick reply is coming up. Adjust or skip sending the message if it repeats information you've already shared" [misma URL] [DATO], lo que indica que Airbnb da al host la posibilidad de intervenir/cancelar un mensaje automático antes de su envío, aunque no lo exige.

Un análisis de terceros (Hostaway, proveedor de PMS) describe la función nativa de mensajería programada de Airbnb como limitada a tres disparadores: "The limitation of Airbnb's scheduled messaging feature is that it only offers three trigger events: booking confirmed, check-in, and checkout" [Hostaway, "Airbnb Scheduled Messages", hostaway.com/blog/airbnb-scheduled-messages/] [R]. Esta afirmación proviene de un proveedor comercial que compite/complementa a Airbnb, no de Airbnb directamente, por lo que se marca como fuente secundaria de confianza media, no como hallazgo de primera fuente Airbnb.

Hospitable (PMS) documenta en su propia web pública que automatiza mensajes en más eventos: "New inquiry, New pre-approval, New request to book, New reservation, New cancellation, Expired pre-approval, Inquiry/booking denied, New special offer, New payment issue", además de "check-in instructions, access codes, follow-up messages, checkout instructions, review requests, and reminders, and re-engagement (sent after checkout)" [Hospitable, "Airbnb Automated Messages", hospitable.com/airbnb-automated-messages] [R]. La misma página recomienda expresamente un despliegue gradual con supervisión humana: "Start by using the 'Suggest with AI' button in your inbox that creates draft responses that you can edit before sending", y solo después "toggle on 'Full Guest Reply Automation'" [misma fuente] [R].

**Evento de calendario esperado:** ninguno directo (esta etapa es de comunicación, no de disponibilidad), pero el sistema de mensajería debe consumir eventos ya generados por el calendario (reserva confirmada, N días antes de check-in, día de checkout) para disparar plantillas. [E]

### 6. Check-in

Airbnb documenta seis métodos oficiales de autocheck-in que un host puede seleccionar en su anuncio, citados verbatim [DATO]:
- "Smart lock: A code or app is used to open a wifi-connected lock."
- "Keypad: Tap in a code to open an electronic lock."
- "Lockbox: A code opens a small safe with the key locked inside."
- "Building staff: Someone will be available 24 hours a day to let guests in."
- "In-person greeting: Guests will meet you or a co-host to pick up keys."
- "Other: You can add a different method specific to your place."
[Airbnb, "Add check-in and checkout instructions to listings", airbnb.com/help/article/1644/how-do-i-add-self-checkin-to-my-listing]

**No se menciona ninguna marca comercial de cerradura** en esta página oficial — solo categorías genéricas. Regla de temporización documentada: "they won't see the detailed check-in instructions until 48 hours before check-in" [misma fuente] [DATO], mientras que las instrucciones de checkout están disponibles antes de reservar.

No se identificó ni leyó documentación oficial de Booking.com o Vrbo sobre check-in remoto/autocheck-in (laguna).

**Evento de calendario esperado:** al llegar a T-48h antes del check-in, el sistema debe disparar automáticamente la liberación/envío de instrucciones de acceso (código, dirección de lockbox, etc.) — esto es un evento de comunicación programada, no de disponibilidad, pero debe estar anclado a la fecha de check-in de la reserva. [E]

### 7. Estancia / incidencias

Airbnb canaliza los problemas durante la estancia a través del **Resolution Center**: "Go to the Resolution Center to open a refund or payment request", con un plazo de "up to 60 days after your reservation's checkout date... to submit a Resolution Center request" [Airbnb, "How the Resolution Center helps you", airbnb.com/help/article/767] [DATO]. Cuando host y huésped no llegan a acuerdo, pueden pedir mediación de Airbnb: "Issues must be reported to Airbnb within 72 hours of discovery to be eligible", y explícitamente **"a dedicated team member will review the info provided by everyone and ask questions (if necessary) before making a final decision"** [misma fuente] [DATO] — es decir, Airbnb documenta oficialmente que la resolución de disputas pasa por revisión humana, no por decisión automática. Nota operativa: "For mediation requests, you only have 1 hour to respond" [misma fuente] [DATO].

**AirCover for Hosts** cubre "guest identity verification, reservation screening, $3M Host damage protection, $1M Host liability insurance, $1M Experiences & Services liability insurance, and a 24-hour safety line" [Airbnb, "AirCover for hosts", airbnb.com/help/article/3733] [DATO]. El daño causado por huéspedes se reclama también vía Resolution Center dentro de 60 días tras el checkout [misma fuente] [DATO].

La política de "Reservation Issues" (qué da derecho a reembolso/reubicación) exige evidencia y plazo: "report Reservation Issues within 72 hours after discovery" con fotos/videos como evidencia; califican, entre otros, que el host no dé acceso al alojamiento, que "Accommodations are not habitable at check-in", o que sean "significantly different than advertised" [Airbnb, "Rebooking and refund policy for homes", airbnb.com/help/article/2868] [DATO].

**Evento de calendario esperado:** un reporte de incidencia grave (inhabitabilidad, cancelación de host) puede requerir bloquear o reabrir fechas según el desenlace de la mediación — pero solo tras la decisión del equipo de Airbnb (o del host, con aprobación humana), **nunca de forma automática apenas se reporta el problema, y en ningún caso implica que el sistema cancele la reserva o contacte al huésped por cuenta propia**: cualquier bloqueo/reapertura de fechas derivado de una incidencia requiere que un humano confirme la acción. [E — regla de diseño propia, coherente con la evidencia primaria citada arriba]

### 8. Check-out

No se localizó una página oficial de Airbnb dedicada específicamente a políticas de checkout (hora límite, procedimiento) más allá de la mención de que las instrucciones de checkout se comparten antes de reservar [artículo 1644, ya citado en Check-in]. Un ejemplo de mensajería de checkout (proveedor externo, confianza media): "Provide the check-out instructions the morning of their departure" con recordatorio de hora límite (p. ej. 11:00 a.m.) [Hostaway, hostaway.com/blog/airbnb-scheduled-messages/] [R].

**Evento de calendario esperado:** al momento/hora de checkout documentada de la reserva, el sistema debe disparar (a) el fin del bloqueo de "estancia activa" y el inicio de una ventana de "turnover" (limpieza/preparación) y (b) el evento que habilita la solicitud de reseña (ver sección 10). [E]

### 9. Limpieza

Breezeway (plataforma de operaciones de limpieza/mantenimiento) documenta en su propia web pública automatización de tareas de turnover ligada a atributos de la reserva y a integración con el PMS: "Schedule automated tasks based on rules for each reservation, guest type, property attribute, and length of stay" y "When a pet add-on is attached to the reservation in your PMS, the workflow is triggered" [Breezeway, "Task Automation", breezeway.io/task-automation] [R]. La página principal de Breezeway añade, en términos más generales de marketing: "Automate the heavy workload of scheduling property tasks to ensure each turnover is scheduled and completed on time" [Breezeway, breezeway.io] [R — lenguaje de marketing del propio vendor]. Ninguna de las dos páginas leídas documenta con detalle técnico verbatim el disparador exacto de checkout (p. ej., "se crea la tarea de limpieza X minutos después del checkout registrado") ni el mecanismo preciso de sincronización de calendario — se marca como laguna.

No se leyó documentación equivalente de Turno (bloqueado con 403 al intentar acceder a turno.com) ni de Guesty/Operto (no se encontraron URLs válidas dentro del presupuesto de búsqueda disponible).

**Evento de calendario esperado:** el checkout de una reserva debería generar automáticamente una tarea de limpieza/turnover con ventana de tiempo definida (potencialmente bloqueando el anuncio para nuevas llegadas hasta que la limpieza se marque completa), pero esto es una inferencia de diseño razonable, no un hallazgo documentado verbatim en fuente primaria de un PMS. [E]

### 10. Reseñas

Airbnb documenta el mecanismo de reseñas con cita directa y verbatim: **"Both parties will have 14 days after checkout to submit their review"** y **"Reviews are only posted after both parties have submitted their reviews, or once the 14-day period has ended—whichever comes first"** [Airbnb, airbnb.com/help/article/13] [DATO]. Esto produce en la práctica un efecto de "doble ciego" (ninguna parte ve la reseña de la otra hasta la publicación conjunta o el vencimiento del plazo), aunque la página leída no usa literalmente el término "double-blind" — se documenta el mecanismo, no la etiqueta.

Para Vrbo y Booking.com, la información sobre plazos de reseña, visibilidad y moderación **proviene solo de fragmentos de búsqueda** (no de páginas leídas con WebFetch: los intentos de leer help.vrbo.com sobre reseñas devolvieron error 429, y partner.booking.com devolvió 403) — se registra como Laguna, no como hallazgo verificado.

**Evento de calendario esperado:** el checkout debe disparar, tras un retraso definido, la apertura de la ventana de solicitud de reseña (Airbnb: ventana de 14 días desde checkout) [DATO]; el sistema debe registrar la fecha de checkout real (no solo la programada) como ancla de este cómputo. [E]

### 11. Contabilidad / pagos al anfitrión

Cubierto principalmente en la sección 4 (Pago/cobro). Puntos adicionales relevantes para conciliación contable: Airbnb puede retener fondos hasta 45 días tras el check-in por prevención de fraude [artículo 3389] [DATO]; en cancelaciones de host, Airbnb retiene el fee de cancelación "typically withheld from the next payout(s) to the host" [Airbnb, "Host Cancellation Policy for homes", airbnb.com/help/article/990] [DATO]. Vrbo permite planes de pago de hasta 3 cuotas configuradas por el host [help.vrbo.com, ya citado en sección 4] [DATO]. Booking.com: no verificado (laguna).

**Evento de calendario/sistema esperado:** cada cambio de estado de pago (cobro al huésped, payout liberado, fee de cancelación retenido) debe registrarse como evento contable trazable a la reserva, independientemente de si afecta o no la disponibilidad del calendario. [E]

---

## Políticas de cancelación y alteraciones — resumen comparativo

| Canal | Cancelación por huésped | Cancelación por host | Alteraciones/cambios de fecha | Etiqueta |
|---|---|---|---|---|
| **Airbnb** | 5 niveles (Flexible, Moderate, Limited, Firm, Strict/Super Strict) + gracia de 24h si se confirmó con ≥7 días de antelación [artículo 475] | Fee escalonado 10 %/25 %/50 % según antelación, mínimo 50 USD; retenido de payouts; bloqueo de calendario en esas fechas; posible suspensión de cuenta/pérdida de Superhost [artículo 990]; exenciones solo con documentación revisada por Airbnb (fotos, carta médica) [artículo 2022] | Requiere "trip change request" enviada por el huésped y aceptada explícitamente por el host; si se rechaza, la reserva original se mantiene sin cambios [Airbnb, "Modifying a home reservation as a host", airbnb.com/help/article/50] | [DATO] |
| **Vrbo** | 7 niveles (Day-before, Lenient, Relaxed, Moderate, Firm, Strict, No refund), con "Travelers must cancel by 11:59 p.m. property time on the final refund window day to qualify" [help.vrbo.com/articles/what-are-the-cancellation-policy-options] | "If a host cancels an accepted reservation, we may charge a cancellation fee, temporarily suspend the listing, or remove Premier Host status" [help.vrbo.com/articles/Partner-Cancellation-Fee-Policy]; cancelar en nombre del huésped afecta "Ranking Metrics... regardless of the reason", con reembolso íntegro obligatorio salvo incumplimiento de normas de la casa; waiver debe solicitarse en 10 días [help.vrbo.com/articles/How-do-I-cancel-a-reservation] | No se leyó página oficial específica (laguna) | [DATO] |
| **Booking.com** | No verificado vía WebFetch (403 en partner.booking.com); términos generales solo dicen que depende de la política del "Service Provider" [booking.com/content/terms.html] | No verificado (laguna) | No verificado (laguna) | [DATO — solo la fila de términos genéricos; el resto es laguna, no dato] |

---

## Riesgos / límites

- **No se puede documentar el flujo operativo de Booking.com con el mismo nivel de evidencia que Airbnb o Vrbo.** El portal partner.booking.com bloqueó sistemáticamente el acceso vía WebFetch (HTTP 403 en cada intento, incluida la página raíz de ayuda), por lo que cualquier decisión de producto sobre comisión exacta, Genius, Booking.com Payments, mensajería o plazos de reseña de Booking.com necesita verificación manual directa (login de partner) antes de convertirse en requisito.
- **No hay evidencia oficial de que ninguna plataforma documente disparadores de calendario en tiempo real para limpieza/turnover.** Breezeway describe automatización basada en reglas y atributos de reserva [R], pero no un verbatim técnico del disparador exacto de checkout; cualquier diseño de "checkout → limpieza automática" en el producto es una inferencia razonable [E], no un hallazgo confirmado en documentación de un PMS.
- **La ventana de "24 horas para respuesta del host" en Request to Book (Airbnb) se describe como comportamiento típico ("typically respond within 24 hours"), no como límite técnico contractual estricto** [DATO] — no se debe modelar como un timeout garantizado por API.
- **Ningún canal documentado ofrece de forma pública y verificada un mecanismo de webhook/tiempo real** para eventos de reserva, pago, o cancelación en las páginas leídas en esta investigación (excepción: el flujo de mensajería programada de Airbnb, que es asíncrono y basado en triggers definidos, no en push en tiempo real) [DATO por ausencia].
- **Ninguna marca de cerradura, PMS de checkin, o proveedor de hardware está documentada oficialmente por ningún canal** — cualquier integración de hardware de acceso debe tratarse como decisión de producto propia, no como requisito derivado de política de plataforma.
- **Las cifras de comisión de Vrbo (5 % + 3 % procesamiento) y de payout (día hábil siguiente al check-in) que aparecieron en fragmentos de búsqueda no fueron confirmadas con WebFetch directo** — se marcan como supuesto `[E]`, no hallazgo `[DATO]`.

---

## Implicaciones para requisitos

- **RV02-R-01:** El calendario debe distinguir al menos tres estados de bloqueo de fecha — *confirmado* (Instant Book o solicitud aceptada), *provisional/pendiente* (Request to Book enviada, esperando respuesta del host) y *liberado* — porque Airbnb documenta que una solicitud sin respuesta en ~24h libera al huésped para reservar otro alojamiento sin cargo [airbnb.com/help/article/85] [DATO].
- **RV02-R-02:** El sistema debe registrar el timestamp exacto de confirmación de cada reserva, porque de él dependen tanto el cómputo del periodo de gracia de 24 horas de Airbnb [artículo 475] [DATO] como el de cualquier política de cancelación aplicable.
- **RV02-R-03 (no automatizar sin aprobación humana — cancelaciones):** Ninguna función del producto debe cancelar una reserva confirmada de forma automática; **el producto nunca cancela reservas por cuenta propia, bajo ninguna circunstancia, ni siquiera como respuesta automática a una incidencia**. Airbnb impone penalización económica real (10 %/25 %/50 %, mínimo 50 USD) y bloqueo de calendario por cancelación de host [artículo 990] [DATO], y solo exime de penalización tras revisión humana con evidencia documental (fotos, carta médica) [artículo 2022] [DATO]; Vrbo penaliza cualquier cancelación iniciada por el host contra sus "Ranking Metrics" incluso con causa válida, salvo waiver aprobado en un plazo de 10 días [help.vrbo.com/articles/How-do-I-cancel-a-reservation] [DATO]. Esto confirma, con evidencia primaria de dos canales, que cancelar es una decisión de alto costo que las propias plataformas tratan como excepcional y sujeta a revisión — el producto debe requerir confirmación humana explícita antes de ejecutar cualquier cancelación, y nunca ofrecerla como acción automática por reglas.
- **RV02-R-04 (no automatizar sin aprobación humana — incidencias/disputas):** Airbnb documenta que la mediación de disputas entre host y huésped es resuelta por "a dedicated team member" tras revisar evidencia de ambas partes [airbnb.com/help/article/767] [DATO], no por un sistema automático. El producto no debe simular ni sustituir esta resolución humana (p. ej., no debe emitir reembolsos, decisiones de responsabilidad, ni resoluciones de "Reservation Issue" de forma automática, y no debe contactar al huésped por su cuenta durante una disputa); a lo sumo puede ayudar a recopilar evidencia (fotos, fecha de reporte) para que un humano decida y, si corresponde, sea ese humano quien contacte al huésped, respetando el plazo de reporte de 72 horas documentado [artículo 2868] [DATO].
- **RV02-R-05 (mensajería sensible requiere supervisión):** el propio proveedor de PMS Hospitable, con años de experiencia en automatización de hosts, recomienda expresamente no activar automatización completa de respuestas a huéspedes sin antes usar un modo de sugerencia editable por humano ("Suggest with AI"... "you can edit before sending") [hospitable.com/airbnb-automated-messages] [R]. El producto debe adoptar como mínimo el mismo patrón: mensajes puramente informativos y de bajo riesgo (instrucciones de check-in, recordatorio de checkout) pueden programarse por triggers de calendario sin revisión previa, pero cualquier mensaje que implique negociación, disculpa, oferta de compensación, o respuesta a una queja debe pasar por aprobación humana antes de enviarse — el sistema nunca contacta al huésped de forma autónoma en estos casos.
- **RV02-R-06:** El motor de calendario debe generar un evento de "liberación de instrucciones de acceso" anclado a T-48h antes del check-in, replicando la regla documentada por Airbnb de que "they won't see the detailed check-in instructions until 48 hours before check-in" [airbnb.com/help/article/1644] [DATO]; el producto no debe prometer ni depender de una marca específica de cerradura inteligente, dado que ningún canal documenta oficialmente marcas soportadas.
- **RV02-R-07:** Cualquier función de "cambio de fechas" (alteración) debe modelarse en Airbnb como una solicitud que requiere aceptación explícita del host — nunca aplicarse automáticamente al calendario — porque si el host rechaza o no responde, "the reservation stays unchanged" [airbnb.com/help/article/50] [DATO]; en Vrbo, no se encontró página oficial equivalente y debe tratarse como laguna a verificar antes de prometer paridad de funcionalidad entre canales.
- **RV02-R-08:** El motor de reseñas del producto (si se construye uno) debe anclarse a la fecha real de checkout y a la ventana de 14 días documentada por Airbnb, publicando visibilidad conjunta solo cuando ambas partes han enviado su reseña o vence el plazo [airbnb.com/help/article/13] [DATO]; no se debe replicar esta misma regla para Vrbo o Booking.com sin verificación adicional (laguna).
- **RV02-R-09:** El producto no debe representar en su UI/documentación comercial cifras específicas de comisión, plazos de payout o condiciones de pago de Booking.com como si fueran verificadas, dado que el portal de partners fue inaccesible en esta investigación (bloqueo 403 sistemático); cualquier cifra usada debe marcarse internamente como "pendiente de verificación directa" `[E]` hasta que alguien con acceso de partner la confirme.
- **RV02-R-10:** Los eventos de checkout deben disparar automáticamente (a) el cierre del estado "estancia activa" en el calendario y (b) la creación de una tarea de limpieza/turnover en el módulo operativo correspondiente — esto es coherente con el patrón de automatización basado en reglas y atributos de reserva que documenta Breezeway [breezeway.io/task-automation] [R], aunque el detalle exacto del disparador no está confirmado verbatim y debe validarse con el proveedor de limpieza elegido antes de construir la integración. Esta automatización se limita estrictamente a tareas operativas internas (limpieza/calendario); no implica ni habilita cancelación de la reserva ni contacto al huésped.

---

## Lagunas

1. **Booking.com — portal de partners inaccesible.** Todos los intentos de WebFetch sobre partner.booking.com (cancelaciones, comisión, Genius, mensajería, reseñas, no-shows) devolvieron HTTP 403, incluida la página raíz `/en-us/help`. Requiere sesión de partner autenticada o acceso alternativo (no disponible en esta investigación). Fila relacionada en `docs/LAGUNAS.md`: sección 2.2 "Booking.com — iCal import (fallback sin conectividad)" y sección 6 "Comisión exacta de Booking.com".
2. **Vrbo — página de reseñas no accesible.** El intento de leer `vrbo.com/lp/b/content-guidelines` devolvió HTTP 429 (rate limit) en dos intentos; no se pudo confirmar con WebFetch el plazo, la visibilidad ni las reglas de manipulación de reseñas en Vrbo. Solo existe evidencia de fragmento de búsqueda (no citada como hallazgo).
3. **Airbnb — cobro exacto al huésped (timing).** No se localizó/leyó la página oficial específica sobre cuándo se cobra al huésped (al confirmar vs. desglosado), solo la del payout al host.
4. **Disparador técnico exacto de tareas de limpieza tras checkout.** Ninguna plataforma de operaciones (Breezeway, Turno, Guesty, Hostaway, Lodgify, Operto) documentó públicamente, en las páginas accesibles, el mecanismo verbatim de "checkout → creación automática de tarea de limpieza". Turno.com devolvió 403 en el intento de lectura. Fila relacionada en `docs/LAGUNAS.md`: sección 5 "Buffers de limpieza".
5. **Especificación exacta de "tres triggers nativos" de mensajería programada de Airbnb** (booking confirmado/check-in/checkout) — esta afirmación proviene de un blog de Hostaway (fuente secundaria, proveedor de PMS competidor/complementario), no de una página de Airbnb leída directamente con ese detalle exacto.
6. **Vrbo y Booking.com — flujo de alteraciones/cambios de reserva.** No se encontró ni leyó documentación oficial equivalente al "trip change request" de Airbnb.
7. **Cobertura oficial de sincronización de calendario multicanal** (cómo cada plataforma refleja técnicamente el cierre de disponibilidad cuando se recibe una reserva desde otro canal) — fuera del alcance de las páginas leídas en esta sesión; posible solapamiento con investigación RV03/RV04 ya existente en este mismo repositorio.
8. Presupuesto de búsqueda web (WebSearch) se agotó a mitad de la investigación (200/200 llamadas de la sesión compartida), lo que limitó la posibilidad de encontrar URLs oficiales adicionales para Guesty, Lodgify, Operto y para profundizar en Turno; el trabajo posterior se apoyó en URLs ya conocidas y en intentos directos de WebFetch.
9. **Cobertura de fuentes de este módulo.** Este módulo cuenta con 28 URLs primarias leídas con éxito (ver "Fuentes de este módulo" abajo y `docs/fuentes/rv01-02-09-10-11.md`), que sí supera el mínimo de 25 URLs de `00-PLAN.md` §1.3; sin embargo, la cobertura de Booking.com dentro de ese total es de una sola URL de alcance genérico (Términos y Condiciones), por lo que cualquier cifra operativa específica de Booking.com sigue pendiente de verificación directa (ver punto 1).

---

## Supuestos

- Se asume, sin cita primaria directa, que el patrón "checkout dispara tarea de limpieza" es una práctica estándar de la industria de PMS de alquiler vacacional, razonable como default de diseño, pero no confirmado verbatim en ninguna fuente leída. `[E]`
- Se asume, basado solo en fragmentos de búsqueda no verificados con WebFetch, que Booking.com cobra comisión sobre el valor de la reserva y que existe un programa "Genius" de descuentos — no se debe usar esta cifra o mecanismo en documentación de producto sin verificación directa. `[E]`
- Se asume, basado solo en fragmentos de búsqueda, que Vrbo cobra "5 % de comisión + 3 % de procesamiento de pago" y paga aproximadamente un día hábil después del check-in — no confirmado con WebFetch. `[E]`
- Se asume, basado solo en fragmentos de búsqueda, que Booking.com envía invitación de reseña al huésped ~48 horas tras el checkout con un plazo de 3 meses para completarla — no confirmado con WebFetch. `[E]`
- Se asume, basado solo en fragmentos de búsqueda, que Vrbo usa una ventana de reseña de hasta 14 días con mecanismo ciego similar a Airbnb y un plazo extendido de hasta un año para el huésped — no confirmado con WebFetch. `[E]`
- Se asume que el "hold" de fondos de hasta 45 días que documenta Airbnb por prevención de fraude es un caso excepcional, no el flujo estándar — la cita textual no distingue con qué frecuencia ocurre. `[E]`

---

## Fuentes de este módulo

Fecha de consulta de todas las URLs: 2026-09-05 (confirmado en el propio módulo y en `docs/fuentes/rv01-02-09-10-11.md`). Listado agrupado por subtema; URLs tal como aparecen en el ledger de fuentes del módulo (ledger completo con 28 URLs leídas con éxito en `docs/fuentes/rv01-02-09-10-11.md`, sección "RV02 — Operación de reserva a salida").

**Reserva / confirmación (Airbnb):**
- https://www.airbnb.com/help/article/1510 — "How Instant Book Works"
- https://www.airbnb.com/help/article/85 — "How to book a home: Instant Book and reservation requests"
- https://www.airbnb.com/help/article/475 — "Cancellation policies for your home"

**Cancelación y disputas (Airbnb):**
- https://www.airbnb.com/help/article/990 — "Host Cancellation Policy for homes"
- https://www.airbnb.com/help/article/2022 — "Canceling a reservation as a host without adverse consequences"
- https://www.airbnb.com/help/article/767 — "How the Resolution Center helps you"
- https://www.airbnb.com/help/article/2868 — "Rebooking and refund policy for homes"
- https://www.airbnb.com/help/article/170 — "If your host cancels your home reservation"
- https://www.airbnb.com/help/article/3733 — "AirCover for hosts"
- https://www.airbnb.com/help/article/50 — "Modifying a home reservation as a host"

**Check-in, reseñas y pagos (Airbnb):**
- https://airbnb.com/help/article/1644 — "Add check-in and checkout instructions to listings"
- https://www.airbnb.com/help/article/13 — "Reviews (overview)"
- https://www.airbnb.com/help/article/3389 — "When you'll get paid"

**Mensajería (Airbnb y vendors secundarios):**
- https://www.airbnb.com/resources/hosting-services/a/using-quick-replies-to-save-time-747 — Airbnb Resource Center
- https://hospitable.com/airbnb-automated-messages — Hospitable (vendor, fuente secundaria)
- https://www.hostaway.com/blog/airbnb-scheduled-messages/ — Hostaway (vendor, fuente secundaria)

**Vrbo — pagos y cancelación:**
- https://help.vrbo.com/articles/How-do-I-set-up-a-payment-schedule-for-reservations — "Set up your payment terms"
- https://help.vrbo.com/articles/Does-HomeAway-Payments-automatically-issue-refunds-to-travelers — "About guest refunds"
- https://help.vrbo.com/articles/what-are-the-cancellation-policy-options — "About cancellation policy options"
- https://help.vrbo.com/articles/Partner-Cancellation-Fee-Policy — "About the Host Cancellations Policy"
- https://help.vrbo.com/articles/How-do-I-cancel-a-reservation — "Cancel a guest's reservation as a host"

**Booking.com (cobertura mínima — ver Lagunas):**
- https://www.booking.com/content/terms.html — Terms and Conditions

Nota de cobertura: el ledger completo de RV02 (`docs/fuentes/rv01-02-09-10-11.md`) registra 28 páginas leídas con éxito en total para este módulo; las 22 listadas arriba son las citadas directamente en el cuerpo de este documento. Las 6 restantes (variaciones/espejos de páginas ya listadas, p. ej. duplicados de artículos de Airbnb) están en el ledger pero no aportan una cita distinta al texto. Booking.com queda representado por una sola URL de alcance genérico — declarado explícitamente como laguna estructural en la sección "Lagunas" arriba.
