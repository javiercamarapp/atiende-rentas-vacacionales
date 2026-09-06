// Llamadas de API del asistente de onboarding self-serve (Lote 3.3).
import { peticion } from "../../lib/api/cliente";

export interface CuerpoRegistroEmpresa {
  empresaNombre: string;
  empresaRazonSocial: string;
  adminCorreo: string;
  adminPassword: string;
  planCodigo?: string;
}

export interface RespuestaRegistroEmpresa {
  tenantId: string;
  usuarioId: string;
  requiereVerificacionCorreo: boolean;
  siguientePaso: string;
}

export function registrarEmpresa(cuerpo: CuerpoRegistroEmpresa): Promise<RespuestaRegistroEmpresa> {
  return peticion("/onboarding/registro", { metodo: "POST", cuerpo });
}

export interface EstadoOnboarding {
  pasos: {
    empresaRegistrada: boolean;
    correoVerificado: boolean;
    primeraPropiedad: boolean;
    primeraUnidad: boolean;
    canalConectado: boolean;
    colaboradorInvitado: boolean;
  };
}

export function obtenerEstadoOnboarding(): Promise<EstadoOnboarding> {
  return peticion("/onboarding/estado");
}
