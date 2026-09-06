# Despliegue de canales de distribución — México (Lote 3.4, RV22)

Guía paso a paso para conectar cada canal cubierto en este lote. Cada
sección dice **exactamente qué necesita hacer el usuario fuera de Atiende**
(solicitudes de partner, dónde pegar credenciales) y **qué NO hace el
sistema sin ellas**. El código/simulador de cada canal ya existe y está
probado — ningún canal pasa de `partner_pendiente`/`no_conectado` a
`sandbox`/`producción` sin evidencia real de sincronización (D-017,
RV22-R-06). El catálogo completo (nivel, estado, capacidades, latencia,
requisitos) vive en la tabla `canal_catalogo` (migración 0110) y se
consulta en vivo en `GET /canales-mexico/catalogo` / la página **Canales
México (RV22)** del panel.

Convención de niveles (ver también la leyenda en la propia UI):

- **Nivel A** — iCal o vía pública sin aprobación de partner. Implementable
  hoy, self-service.
- **Nivel B** — spec pública del canal, pero bloqueado por partner o
  credenciales. El adaptador y su simulador ya existen y están probados
  contra la spec; falta la aprobación/credenciales reales del canal.
- **Nivel C** — sin vía técnica implementable. Solo catálogo (`manual` o
  `no_aplica`), nunca un adaptador de código falso.

---

## Nivel A — conectar hoy, sin aprobación externa

### Airbnb (iCal)

1. En Airbnb: **Calendario → Disponibilidad → Sincronizar calendarios →
   Importar calendario**. Copia la URL que Airbnb pide que le entregues
   (nuestra propia URL de exportación, obtenida en Atiende: matriz de
   conectividad → "Exportar iCal").
2. Del lado de Atiende: pega la URL del calendario de Airbnb (la que
   Airbnb te da a ti, si quieres importar sus bloqueos hacia Atiende) en el
   formulario "Conectar iCal" de la unidad.
3. **Qué NO hace el sistema sin esto:** ninguna sincronización — el estado
   queda en `no_conectado` hasta el primer ciclo exitoso.
4. **Latencia esperada:** ~3 horas (documentada por Airbnb, confianza
   baja-media). Además, Airbnb solo importa hasta **2 años** hacia
   adelante de lo que exportamos — una reserva más allá de esa ventana no
   se reflejará del lado de Airbnb (no es un límite de Atiende).

### Vrbo (iCal)

1. En el Owner Dashboard de Vrbo: **Calendar → Availability → Import/
   Export calendar**.
2. Mismo flujo que Airbnb del lado de Atiende.
3. **Latencia esperada:** ~30 min + hasta 20 min de propagación adicional
   (documentada por Vrbo, confianza media-alta).

### Agoda ("calendar link")

1. En el extranet/YCS de Agoda: busca la opción de "calendar link" para la
   propiedad (equivalente funcional a iCal).
2. Pega la URL en el formulario de conexión de Atiende.
3. **Aviso honesto:** solo transmite disponibilidad (sin tarifas); la
   frecuencia de sincronización de Agoda no tiene cifra oficial exacta —
   se muestra "varias veces al día" con confianza BAJA, nunca una cifra
   inventada.

### Mercado Libre (presencia, sin calendario)

1. Publica el anuncio con tu cuenta de Mercado Libre (categoría "Renta
   Vacacional").
2. **Qué NO hace el sistema:** Mercado Libre no tiene motor de reservas
   (`reservation_allowed: not_allowed`) — Atiende NUNCA cierra
   disponibilidad automáticamente en este canal. Cualquier reserva que
   llegue por ahí debe bloquearse manualmente en el calendario unificado.

---

## Nivel B — spec pública lista, pendiente de aprobación del canal

Para cada canal de esta sección, el adaptador y su simulador YA EXISTEN
(`packages/adapters/src/<canal>/`, `packages/sim/src/<canal>/`) y pasan
pruebas de contrato. Lo único que falta es lo que el usuario debe conseguir
del canal — nunca código.

### Booking.com — API Connectivity (OTA/B.XML)

- **Bloqueo actual:** Booking.com pausó la admisión de nuevos
  Connectivity Partners "hasta nuevo aviso" (confirmado en vivo en
  `connect.booking.com`, 2026-09-06). Las propiedades individuales NUNCA
  conectan directo, aunque la pausa se levantara — solo vía channel
  manager certificado o la extranet manual del propio anfitrión.
- **Qué debe hacer el usuario:** monitorear `connect.booking.com` por si
  reabre admisión, o evaluar un channel manager ya certificado
  (Guesty/Hostaway/Smoobu/OwnerRez, o el puente SiteMinder de este mismo
  lote).
- **Qué NO hace el sistema:** no hay ningún botón de "conectar directo"
  para Booking.com en ningún flujo. El estado queda en `partner_pendiente`
  de forma permanente hasta nueva evidencia.

### Expedia Group (Expedia / Hotels.com)

- **Qué debe hacer el usuario:** solicitar acceso de partner en
  `connectivityportal.expediagroup.com` (formulario comercial, no
  autoservicio). Requiere PCI compliance (Attestation of Compliance
  anual), TLS 1.2+, y un license agreement.
- **Dónde pegar credenciales:** una vez aprobado, las credenciales OAuth2
  (`client_id`/`client_secret` del sandbox `api.sandbox.expediagroup.com`)
  se cargan en la cuenta de canal de Atiende (backoffice → Cuentas de
  canal), nunca en texto plano fuera de ese formulario (se cifran con
  AES-256-GCM).
- **Qué NO hace el sistema:** sin esas credenciales reales aprobadas, el
  cliente (`ExpediaApiClient`) solo puede hablar con el simulador de
  pruebas — nunca con `api.sandbox.expediagroup.com` real.

### Vrbo API propia (esqueleto, sin simulador)

- Vrbo tiene su **propio stack** (heredado de HomeAway), NO el mismo que
  Expedia — credenciales no intercambiables.
- **Qué debe hacer el usuario:** solicitar un Integration Engagement
  Manager de Vrbo; el whitelisting de IP puede tardar ~3 semanas.
- **Qué NO hace el sistema:** este adaptador es un esqueleto (capacidades
  declaradas, sin cliente HTTP real) porque el detalle de payload del
  stack legacy de Vrbo no está documentado públicamente con el mismo
  nivel de detalle que Expedia/Booking — no se inventa un esquema.

### Airbnb API partner (esqueleto, sin simulador)

- **Qué debe hacer el usuario:** solicitar el programa de partner en
  `developer.withairbnb.com/join-airbnb-api-program` — exige NDA firmado,
  revisión de seguridad de datos, y certificación (hasta 6 meses
  post-aprobación para features obligatorias).
- **Qué NO hace el sistema:** sin NDA aprobado no existe ninguna
  documentación pública para construir un cliente real — el adaptador es
  un esqueleto de capacidades, sin llamadas HTTP.

### Google Vacation Rentals (esqueleto, sin simulador)

- **Qué debe hacer el usuario:** el programa es exclusivamente por
  invitación de un Technical Account Manager de Google — no hay
  autoservicio ni formulario público de alta.
- **Qué NO hace el sistema:** sin invitación, esta vía no debe aparecer
  como activa en ningún roadmap (RV22-R-08).

### Puente SiteMinder pmsXchange (cubre Booking/Expedia/Vrbo/Despegar/PriceTravel)

- **Qué debe hacer el usuario:** contratar comercialmente a SiteMinder
  (no autoservicio) y solicitar credenciales de `pmsXchange`
  (`developer.siteminder.com`).
- **Cobertura confirmada** (tabla pública de "Booking Agent Codes"):
  Booking.com, Expedia, Vrbo, Despegar, PriceTravel. **Best Day NO está
  confirmado** — no se muestra como cubierto sin evidencia nueva.
- **Despegar y PriceTravel se muestran como "vía puente"** en la matriz:
  ninguno de los dos tiene spec/API pública propia — su única vía
  verificada es a través de un channel manager certificado como
  SiteMinder.
- **Qué NO hace el sistema:** sin contrato firmado con SiteMinder, no hay
  ninguna llamada real a su API — solo el simulador etiquetado.

### Holidu / Hotels.com (solo catálogo, sin adaptador de código)

- Holidu: cobertura en México/LatAm no confirmada — antes de invertir
  ingeniería, confirma directamente con Holidu.
- Hotels.com: probablemente comparte stack con Expedia, sin confirmación
  directa — no se construyó un cliente separado.

---

## Nivel C — sin vía técnica implementable

Estos canales **no tienen ningún adaptador de código** (ni real ni
simulador) — solo una entrada de catálogo con motivo y fuente. Nunca
prometas a un usuario que Atiende "sincroniza" con ellos:

| Canal | Estado | Qué puede hacer el usuario |
|---|---|---|
| Best Day | `no_aplica` | Ninguna — requiere verificación humana directa (bloqueo total de fuentes) antes de reconsiderar |
| TripAdvisor Rentals | `no_aplica` | Ninguna — estado operativo 2026 indeterminado, reverificar cada 4-6 semanas |
| FlipKey | `no_aplica` | Ninguna — canal cerrado, confirmado |
| HomeToGo | `no_aplica` | Contratar Smoobu (único channel manager certificado por HomeToGo) fuera de Atiende |
| Marriott Homes & Villas | `no_aplica` | Contratar uno de los 32 channel managers certificados fuera de Atiende |
| Plum Guide | `no_aplica` | Ninguna — sin presencia en México, modelo de curación por invitación |
| Hopper Homes | `no_aplica` | Ninguna — sin programa de partner identificable |
| Facebook Marketplace | `manual` | Publicar el anuncio manualmente — Atiende nunca cierra disponibilidad ahí |

---

## Preguntas frecuentes de despliegue

**¿Puedo marcar un canal como "conectado" manualmente si ya tengo un
acuerdo comercial en trámite?** No. Ningún flujo de Atiende permite eso —
el estado cambia únicamente cuando hay evidencia real de una
sincronización exitosa (`ultima_sincronizacion_exitosa_en` reciente).

**¿Dónde reviso qué le falta a cada canal?** `GET /canales-mexico/catalogo`
o la página **Canales México (RV22)** del panel — cada fila enlaza a su
asistente de conexión con los pasos exactos.

**¿Qué pasa si cargo credenciales de un canal Nivel B pero el partner aún
no me aprueba?** El estado se queda en `partner_pendiente` — las
credenciales se guardan cifradas, pero no se usan para tráfico real hasta
que el propio adaptador tenga evidencia de aprobación + sync exitoso.
