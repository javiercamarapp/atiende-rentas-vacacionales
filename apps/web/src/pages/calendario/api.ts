// Llamadas de API propias del calendario maestro. Los endpoints de lista
// (`GET /unidades`, `GET /propiedades`) no tienen todavía un esquema `zod`
// exportado en `@atiende-rv/api/contrato` (solo los cuerpos de escritura lo
// tienen) — se tipan aquí localmente con la forma real que devuelve
// `apps/api/src/routes/{unidades,propiedades}.ts`, sin inventar campos.
import type {
  CuerpoCrearBloqueo,
  CuerpoCrearReserva,
  CuerpoModificarReserva,
  RespuestaCalendario,
} from "@atiende-rv/api/contrato";
import { peticion } from "../../lib/api/cliente";

export interface Propiedad {
  id: string;
  nombre: string;
  zonaHoraria: string;
  tenantId: string;
}

export interface Unidad {
  id: string;
  propiedadId: string;
  ownerId: string | null;
  nombre: string;
  duracionMinimaNoches: number | null;
}

export function listarPropiedades(): Promise<{ propiedades: Propiedad[] }> {
  return peticion("/propiedades");
}

export function listarUnidades(): Promise<{ unidades: Unidad[] }> {
  return peticion("/unidades");
}

export function obtenerCalendarioUnidad(
  unidadId: string,
  desde: string,
  hasta: string,
): Promise<RespuestaCalendario> {
  return peticion(`/unidades/${unidadId}/calendario`, { query: { desde, hasta } });
}

export interface RespuestaBloqueoCreado {
  id: string;
  unidadId: string;
  rango: { inicio: string; fin: string };
  razon: string;
  conflictosCapaCruzada: number;
}

export function crearBloqueo(cuerpo: CuerpoCrearBloqueo): Promise<RespuestaBloqueoCreado> {
  return peticion("/bloqueos", { metodo: "POST", cuerpo });
}

export function cancelarBloqueo(id: string): Promise<void> {
  return peticion(`/bloqueos/${id}`, { metodo: "DELETE" });
}

export interface RespuestaReservaCreada {
  id: string;
  unidadId: string;
  rango: { inicio: string; fin: string };
  estado: string;
}

export function crearReservaDirecta(cuerpo: CuerpoCrearReserva): Promise<RespuestaReservaCreada> {
  return peticion("/reservas", { metodo: "POST", cuerpo });
}

export function modificarFechasReserva(
  id: string,
  cuerpo: CuerpoModificarReserva,
): Promise<{ id: string; rango: { inicio: string; fin: string } }> {
  return peticion(`/reservas/${id}`, { metodo: "PATCH", cuerpo });
}

export function cancelarReservaDirecta(id: string): Promise<{ id: string; estado: string }> {
  return peticion(`/reservas/${id}/cancelar`, { metodo: "POST" });
}
