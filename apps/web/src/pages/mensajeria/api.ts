// Llamadas de API propias de mensajería (Lote 6, BACKLOG E09). Mismo
// patrón que apps/web/src/pages/limpieza/api.ts: cliente HTTP compartido
// (apps/web/src/lib/api/cliente.ts), tipos locales para lo que aún no está
// en el `zod` compartido de `@atiende-rv/api/contrato`.
import { peticion } from "../../lib/api/cliente";

export type CanalMensajeria = "airbnb" | "vrbo" | "booking";
export type EstadoBorrador = "pendiente_aprobacion" | "aprobado" | "rechazado" | "enviado";

export interface ConversacionResumen {
  id: string;
  unidadId: string;
  unidadNombre: string | null;
  canalCodigo: CanalMensajeria;
  ultimoMensajeEn: string | null;
  borradoresPendientes: number;
}

export interface Mensaje {
  id: string;
  conversacionId: string;
  direccion: "entrante" | "saliente";
  origen: "canal" | "simulador" | "manual";
  texto: string;
  redactado: boolean;
  creadoEn: string;
}

export interface BorradorMensaje {
  id: string;
  conversacionId: string;
  texto: string;
  canalCodigo: CanalMensajeria;
  estado: EstadoBorrador;
  generadoPor: "motor_borrador" | "plantilla" | "manual";
  redactado: boolean;
  aprobadoPor: string | null;
  rechazadoPor: string | null;
  motivoRechazo: string | null;
  creadoEn: string;
  necesitaEscalamiento?: boolean;
}

export interface HiloConversacion extends ConversacionResumen {
  mensajes: Mensaje[];
  borradores: BorradorMensaje[];
}

export interface PoliticaCanal {
  canal: CanalMensajeria;
  maxCaracteres: number;
  fuenteMaxCaracteres: string;
  permiteContactoDirectoPreReserva: boolean;
  permiteAutomatizacionPreReserva: boolean;
  accionAntePreReservaProhibida: "bloquear" | "redactar";
  fuentePolitica: string;
}

export interface Plantilla {
  id: string;
  evento: "confirmacion" | "pre_llegada" | "check_in" | "check_out" | "resena";
  idioma: "es" | "en";
  canalCodigo: CanalMensajeria | null;
  cuerpo: string;
  variablesRequeridas: string[];
  activa: boolean;
  aprobadaPorTenant: boolean;
}

export function obtenerBandeja(): Promise<{ conversaciones: ConversacionResumen[] }> {
  return peticion("/mensajeria/conversaciones");
}

export function crearConversacion(unidadId: string, canalCodigo: CanalMensajeria): Promise<ConversacionResumen> {
  return peticion("/mensajeria/conversaciones", { metodo: "POST", cuerpo: { unidadId, canalCodigo } });
}

export function obtenerHilo(conversacionId: string): Promise<HiloConversacion> {
  return peticion(`/mensajeria/conversaciones/${conversacionId}`);
}

export function registrarMensajeEntrante(
  conversacionId: string,
  texto: string,
  origen: "simulador" | "manual",
): Promise<Mensaje & { senalesEscalamiento: string[] }> {
  return peticion(`/mensajeria/conversaciones/${conversacionId}/mensajes`, {
    metodo: "POST",
    cuerpo: { texto, origen },
  });
}

export function generarBorrador(
  conversacionId: string,
  opciones: { mensajeEntranteId?: string; reservaConfirmada?: boolean } = {},
): Promise<BorradorMensaje> {
  return peticion(`/mensajeria/conversaciones/${conversacionId}/borradores`, { metodo: "POST", cuerpo: opciones });
}

export function aprobarBorrador(borradorId: string): Promise<BorradorMensaje> {
  return peticion(`/mensajeria/borradores/${borradorId}/aprobar`, { metodo: "POST" });
}

export function rechazarBorrador(borradorId: string, motivo: string): Promise<BorradorMensaje> {
  return peticion(`/mensajeria/borradores/${borradorId}/rechazar`, { metodo: "POST", cuerpo: { motivo } });
}

export function obtenerPoliticas(): Promise<{ politicas: PoliticaCanal[]; avisoEscaneoAirbnb: string }> {
  return peticion("/mensajeria/politicas");
}

export function obtenerPlantillas(): Promise<{ plantillas: Plantilla[] }> {
  return peticion("/mensajeria/plantillas");
}

export function crearPlantilla(datos: {
  evento: Plantilla["evento"];
  idioma: Plantilla["idioma"];
  canalCodigo?: CanalMensajeria | null;
  cuerpo: string;
}): Promise<Plantilla> {
  return peticion("/mensajeria/plantillas", { metodo: "POST", cuerpo: datos });
}

export function aprobarPlantilla(id: string): Promise<Plantilla> {
  return peticion(`/mensajeria/plantillas/${id}/aprobar`, { metodo: "POST" });
}
