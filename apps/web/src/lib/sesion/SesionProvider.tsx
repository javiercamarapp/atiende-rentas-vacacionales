// Sesión mínima (login/logout/usuario actual) — bloqueante para que
// cualquier pantalla de este lote pueda llamar a la API real de Lote 3.
// Ningún otro lote define todavía una pantalla de login (docs/fase2/
// LOTES.md no la asigna explícitamente); se construye aquí, con el
// alcance mínimo necesario, para no dejar el calendario/matriz/monitor
// inalcanzables detrás de auth sin UI.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { RespuestaTokens, UsuarioSesion } from "@atiende-rv/api/contrato";
import { guardarToken, peticion, tokenGuardado } from "../api/cliente";

interface ContextoSesion {
  usuario: UsuarioSesion | null;
  autenticado: boolean;
  cargandoInicial: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const CLAVE_USUARIO = "atiende-rv-usuario-sesion";

const Contexto = createContext<ContextoSesion | null>(null);

function usuarioGuardado(): UsuarioSesion | null {
  try {
    const crudo = localStorage.getItem(CLAVE_USUARIO);
    return crudo ? (JSON.parse(crudo) as UsuarioSesion) : null;
  } catch {
    return null;
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() =>
    tokenGuardado() ? usuarioGuardado() : null,
  );

  const login = useCallback(async (email: string, password: string) => {
    const respuesta = await peticion<RespuestaTokens>("/auth/login", {
      metodo: "POST",
      cuerpo: { email, password },
    });
    guardarToken(respuesta.accessToken);
    try {
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(respuesta.usuario));
    } catch {
      // sin persistencia si localStorage no está disponible; la sesión
      // sigue viva en memoria para esta pestaña.
    }
    setUsuario(respuesta.usuario);
  }, []);

  const logout = useCallback(() => {
    guardarToken(null);
    try {
      localStorage.removeItem(CLAVE_USUARIO);
    } catch {
      // ver nota de login().
    }
    setUsuario(null);
  }, []);

  const valor = useMemo<ContextoSesion>(
    () => ({ usuario, autenticado: usuario !== null, cargandoInicial: false, login, logout }),
    [usuario, login, logout],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <SesionProvider>");
  return ctx;
}
