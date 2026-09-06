export {
  ETIQUETA_SIMULADOR,
  HOST_BASE_SIMULADOR,
  CredencialesSospechosasDeProduccionError,
  assertNoParecerProduccion,
  logSimulador,
} from "./comun/etiquetado.js";
export type { OpcionesArranqueSimulador } from "./comun/etiquetado.js";

export { ServidorIcalSimulado } from "./comun/servidorIcal.js";
export type { EscenarioIcalSimulado, OpcionesServidorIcal } from "./comun/servidorIcal.js";

export { AirbnbIcalChannelSimulator } from "./airbnb-ical/index.js";
export { VrboIcalChannelSimulator } from "./vrbo-ical/index.js";
export { BookingIcalChannelSimulator } from "./booking-ical/index.js";
export { BookingApiSimulator } from "./booking-api/index.js";
export type { ReservaSimuladaBooking } from "./booking-api/index.js";

// Lote 3.4 (RV22, Fase 3): canales de distribución usados en México.
export { AgodaIcalChannelSimulator } from "./agoda-ical/index.js";
export { ExpediaApiSimulator } from "./expedia-api/index.js";
export type { EventoReservaExpedia } from "./expedia-api/index.js";
export { SiteMinderPmsXchangeSimulator } from "./siteminder-pmsxchange/index.js";
export type { RestriccionPmsXchange } from "./siteminder-pmsxchange/index.js";

// Lote 6 (E09, mensajería con aprobación humana): `SimuladorMensajeria`,
// único `CanalMensajeria` disponible hoy (ningún adaptador real declara
// `messaging`) — carpeta exclusiva de ese lote.
export { SimuladorMensajeria } from "./mensajeria/index.js";

// Lote 3.0 (Fase 3, H-054): notificaciones internas multicanal —
// `AdaptadorCorreoSimulado` implementa `AdaptadorCorreo` de
// `@atiende-rv/domain/notificaciones`. Carpeta exclusiva de este lote.
export { AdaptadorCorreoSimulado } from "./correo/index.js";
