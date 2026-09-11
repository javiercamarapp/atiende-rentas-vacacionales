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

// Patrón 7 (rescatado de Likida/atiende.ai): onboarding conversacional con
// guardas deterministas — POST /onboarding/conversar (packages/domain/
// onboarding, sin LLM). `onboardingCompleto` viene SIEMPRE calculado por
// el servidor a partir de `pasos` real; nunca lo decide este cliente.
export type PasoOnboarding = keyof EstadoOnboarding["pasos"];

export interface RespuestaConversarOnboarding {
  onboardingCompleto: boolean;
  pasoObjetivo: PasoOnboarding | null;
  pregunta: string;
  ctaTexto: string | null;
  ctaRuta: string | null;
  datoFaltanteDeclarado: boolean;
  pasos: EstadoOnboarding["pasos"];
}

export function conversarOnboarding(mensaje?: string): Promise<RespuestaConversarOnboarding> {
  return peticion("/onboarding/conversar", { metodo: "POST", cuerpo: mensaje ? { mensaje } : {} });
}
