<p align="center">
  <img src="docs/brand/atiende-wordmark.svg" width="240" alt="atiende" />
</p>

<h3 align="center">El calendario unificado para rentas vacacionales que opera solo — y nunca contacta a un huésped sin que un humano lo apruebe.</h3>

---

> *Un anfitrión con unidades en Airbnb y Booking.com revisa dos calendarios
> a mano, cierra fechas por WhatsApp y aun así se le cruza una reserva.
> Aquí las fechas se cierran solas entre canales, un agente redacta la
> respuesta al huésped — y esa respuesta no sale hasta que alguien la
> aprueba.*

**Un solo calendario. Ningún mensaje sin revisión humana.**

---

## El problema

Un anfitrión o administrador de rentas vacacionales en México típicamente
opera varios canales a la vez — Airbnb, Booking.com, a veces Vrbo o Agoda —
cada uno con su propio calendario, su propio buzón de mensajes y ninguna
sincronización real entre ellos. Cerrar disponibilidad en un canal cuando
entra una reserva en otro es un proceso manual, y el costo de fallar es
directo: una doble reserva. La mensajería con el huésped se atiende canal
por canal, muchas veces desde el celular del propio anfitrión, sin registro
centralizado ni control de qué se prometió y cuándo. Ninguna de las dos
cosas escala más allá de un puñado de unidades sin un sistema que unifique
el calendario y deje un rastro auditable de cada mensaje enviado.

## Mercado

No existe todavía un censo público único que mida el mercado de rentas
vacacionales en México con el rigor de una cifra oficial: DATATUR e INEGI
registran ocupación hotelera, no anuncios de plataformas de hospedaje
alternativo. La señal más concreta y citable disponible es a nivel de
mercado individual: según [Airbtics](https://airbtics.com/best-airbnb-markets-mexico)
(datos enero–diciembre 2025), Ciudad de México es hoy el mercado de Airbnb
más grande del país, con **20,815 anuncios activos**, una ocupación
promedio del **70%** y una tarifa diaria promedio de **MXN 1,115** — y es
solo una de las ciudades mexicanas con presencia relevante en el mapa de
Airbnb. Preferimos citar ese dato real y acotado a una ciudad antes que
fabricar un TAM/SAM/SOM nacional sin una fuente que lo sostenga.

## Qué hace hoy

- **Calendario unificado multicanal.** Adaptadores de sincronización por
  iCal para Airbnb, Vrbo y Agoda, y adaptadores de API partner para
  Booking.com, Expedia, Vrbo, Airbnb y Google Vacation Rentals, más un
  puente de channel manager (SiteMinder) — con un motor de reconciliación,
  cuarentena y detección de eco para evitar que una unidad se cierre a sí
  misma por error (`packages/adapters/src/sync`).
- **Mensajería con adaptador real de Booking.com.** La API de mensajería de
  Booking.com está conectada de verdad (`packages/adapters/src/booking/mensajeria.ts`);
  el resto de canales corre sobre un simulador de mensajería mientras se
  habilitan sus integraciones nativas, respetando los términos de servicio
  de cada plataforma.
- **Agentes con aprobación humana, no envío automático.** Un motor de
  intención (LLM, con proveedor simulado o real por flag y con cuota por
  tenant) puede *proponer* un borrador de respuesta a un huésped o *proponer*
  un bloqueo de mantenimiento — nunca ejecuta ninguna de las dos cosas por
  sí mismo. Todo borrador queda en estado `pendiente_aprobacion` y solo
  existe una ruta capaz de terminar en un mensaje realmente enviado:
  `POST /borradores/:id/aprobar`, con la transición `aprobado → enviado`
  dentro de la misma transacción. Un intento de envío automático sin ese
  paso (`/borradores/:id/intento-automatico`) está probado para fallar
  siempre, sin excepción.
- **Correos al huésped.** Confirmación de reserva y recordatorio de
  check-in se generan y envían por su propio flujo (`apps/api/src/seguridad/plantillasCorreo`).
- **Cinco crons en producción** (`vercel.json`): sincronización de
  calendarios por iCal cada 15 minutos, reintento de webhooks salientes
  cada 5, limpieza al checkout cada 15, un worker de outbox cada 10, y
  recordatorio de check-in cada hora.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + [Hono](https://hono.dev), TypeScript estricto |
| Frontend | React + Vite, TypeScript |
| Base de datos | PostgreSQL, migraciones versionadas propias (`packages/db`) |
| Monorepo | npm workspaces (`apps/api`, `apps/web`, `packages/adapters`, `packages/db`, `packages/domain`, `packages/sim`, `packages/ui-atiende`) |
| Pruebas | Vitest (unitarias + integración contra Postgres real embebido), Playwright (e2e) |
| Despliegue | Vercel (función serverless de Node.js + estático), con crons nativos de `vercel.json` |

## Estado

El despliegue de producción está temporalmente fuera de línea mientras se
resuelve una migración de infraestructura — el código en `main`, incluidas
las correcciones de seguridad y el adaptador de mensajería de Booking.com,
no está afectado y queda listo para el próximo despliegue. El pipeline de
CI (lint, typecheck, pruebas unitarias, pruebas de integración contra
Postgres real y build) corre en cada push a `main` y hoy está en verde. El
producto está en desarrollo activo, feature-completo para su alcance
actual, sin clientes en producción todavía.

## Desarrollo local

```bash
npm ci
npm run dev            # levanta api + web en paralelo
```

Gates de calidad, en orden (mismos que corre CI vía `npm run ci`):

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration   # requiere Postgres — usa embedded-postgres real
npm run test:adversarial
npm run build
```

Guía de despliegue paso a paso (Vercel, Postgres gestionado, variables de
entorno, alternativa Docker/VPS): `docs/despliegue/README.md`.

---

<p align="center">
  <sub>Una de las verticales de atiende.ai — agentes de IA que operan un negocio por voz, WhatsApp y automatización, con aprobación humana en cada acción que importa.</sub>
</p>
