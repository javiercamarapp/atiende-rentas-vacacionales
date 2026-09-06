// Sesión (login/logout/usuario actual) — Lote 3.2 (H-096+) extiende el
// mínimo de Lote 4 con el cliente 'web' (refresh en cookie httpOnly, el
// access token sigue en memoria/localStorage exactamente igual que antes)
// y el paso 2 de MFA. `login()` ahora puede devolver que hace falta un
// segundo factor en vez de completar la sesión de una — `LoginPage`
// decide qué mostrar según ese resultado.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { UsuarioSesion } from "@atiende-rv/api/contrato";
import { guardarToken, peticion, tokenGuardado } from "../api/cliente";

interface RespuestaTokensWeb {
  accessToken: string;
  expiraEn: number;
  usuario: UsuarioSesion;
}
interface RespuestaMfaPendiente {
  mfaRequerido: true;
  mfaToken: string;
  expiraEn: number;
}
type RespuestaLogin = RespuestaTokensWeb | RespuestaMfaPendiente;

export type ResultadoLogin = { estado: "ok" } | { estado: "mfa_requerido"; mfaToken: string };

interface ContextoSesion {
  usuario: UsuarioSesion | null;
  autenticado: boolean;
  cargandoInicial: boolean;
  login: (email: string, password: string) => Promise<ResultadoLogin>;
  completarLoginConMfa: (mfaToken: string, codigo: string) => Promise<void>;
  logout: () => Promise<void>;
}

const CLAVE_USUARIO = "atiende-rv-usuario-sesion";

const Contexto = createContext<ContextoSesion | null>(null);

function esMfaPendiente(r: RespuestaLogin): r is RespuestaMfaPendiente {
  return "mfaRequerido" in r && r.mfaRequerido === true;
}

function usuarioGuardado(): UsuarioSesion | null {
  try {
    const crudo = localStorage.getItem(CLAVE_USUARIO);
    return crudo ? (JSON.parse(crudo) as UsuarioSesion) : null;
  } catch {
    return null;
  }
}

function guardarUsuario(usuario: UsuarioSesion): void {
  try {
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  } catch {
    // sin persistencia si localStorage no está disponible; la sesión
    // sigue viva en memoria para esta pestaña.
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() =>
    tokenGuardado() ? usuarioGuardado() : null,
  );

  const login = useCallback(async (email: string, password: string): Promise<ResultadoLogin> => {
    const respuesta = await peticion<RespuestaLogin>("/auth/login", {
      metodo: "POST",
      cuerpo: { email, password, cliente: "web" },
    });
    if (esMfaPendiente(respuesta)) {
      return { estado: "mfa_requerido", mfaToken: respuesta.mfaToken };
    }
    guardarToken(respuesta.accessToken);
    guardarUsuario(respuesta.usuario);
    setUsuario(respuesta.usuario);
    return { estado: "ok" };
  }, []);

  const completarLoginConMfa = useCallback(async (mfaToken: string, codigo: string) => {
    const respuesta = await peticion<RespuestaTokensWeb>("/auth/mfa/verificar", {
      metodo: "POST",
      cuerpo: { mfaToken, codigo, cliente: "web" },
    });
    guardarToken(respuesta.accessToken);
    guardarUsuario(respuesta.usuario);
    setUsuario(respuesta.usuario);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Revoca el refresh token en el servidor (cookie httpOnly, el
      // propio navegador la adjunta) — nunca bloquea el logout local si
      // la API no responde (p. ej. sin conexión).
      await peticion("/auth/logout", { metodo: "POST" });
    } catch {
      // ver comentario de arriba: logout local siempre procede.
    }
    guardarToken(null);
    try {
      localStorage.removeItem(CLAVE_USUARIO);
    } catch {
      // ver nota de login().
    }
    setUsuario(null);
  }, []);

  const valor = useMemo<ContextoSesion>(
    () => ({ usuario, autenticado: usuario !== null, cargandoInicial: false, login, completarLoginConMfa, logout }),
    [usuario, login, completarLoginConMfa, logout],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <SesionProvider>");
  return ctx;
}
