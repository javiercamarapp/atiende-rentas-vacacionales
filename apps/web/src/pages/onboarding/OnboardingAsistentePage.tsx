import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@atiende-rv/ui-atiende";
import { peticion, ErrorApi } from "../../lib/api/cliente";
import { obtenerEstadoOnboarding, type EstadoOnboarding } from "./api";
import { AsistenteConversacional } from "./AsistenteConversacional";

// Lote 3.3 — asistente guiado post-registro (autenticado): checklist en
// vivo (GET /onboarding/estado) que enlaza a las pantallas YA EXISTENTES
// del panel (propiedades, canales, colaboradores) en vez de reimplementar
// esos formularios aquí — el mismo principio de "reusar, no duplicar" que
// aplica del lado del servidor (ver comentario de cabecera de
// apps/api/src/routes/onboarding.ts).
interface PasoAsistente {
  clave: keyof EstadoOnboarding["pasos"];
  titulo: string;
  descripcion: string;
  cta: { texto: string; a: string } | null;
}

const PASOS: PasoAsistente[] = [
  { clave: "empresaRegistrada", titulo: "Empresa registrada", descripcion: "Tu cuenta y la de tu empresa ya existen.", cta: null },
  {
    clave: "correoVerificado",
    titulo: "Verifica tu correo",
    descripcion: "Confirma el enlace que te enviamos por correo.",
    cta: null,
  },
  {
    clave: "primeraPropiedad",
    titulo: "Da de alta tu primera propiedad",
    descripcion: "Nombre, zona horaria — la base de tu calendario.",
    cta: { texto: "Ir a propiedades", a: "/propiedades" },
  },
  {
    clave: "primeraUnidad",
    titulo: "Agrega tu primera unidad",
    descripcion: "Una unidad es lo que se reserva (una habitación, una casa completa, etc.).",
    cta: { texto: "Ir a propiedades", a: "/propiedades" },
  },
  {
    clave: "canalConectado",
    titulo: "Conecta tu primer canal",
    descripcion: "El asistente te da la URL exacta de feed iCal para pegar en Airbnb/Vrbo/Booking.",
    cta: { texto: "Ir al asistente de canales", a: "/canales-mexico" },
  },
  {
    clave: "colaboradorInvitado",
    titulo: "Invita a tu equipo",
    descripcion: "Operadores, contadores y propietarios — cada uno con su nivel de acceso.",
    cta: null,
  },
];

function FormularioInvitacion({ onInvitado }: { onInvitado: () => void }) {
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"operador" | "contador" | "propietario">("operador");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function alEnviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await peticion("/backoffice/usuarios/invitaciones", {
        metodo: "POST",
        cuerpo: { email, rol, colaboradorNivel: rol === "operador" ? "calendario_mensajeria" : undefined },
      });
      setEnviado(true);
      onInvitado();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo enviar la invitación.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return <p className="text-sm text-emerald-700 dark:text-emerald-400">Invitación enviada a {email}.</p>;
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1">
        <label htmlFor="invitarEmail" className="text-xs font-medium text-muted-foreground">
          Correo del colaborador
        </label>
        <input
          id="invitarEmail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="invitarRol" className="text-xs font-medium text-muted-foreground">
          Rol
        </label>
        <select
          id="invitarRol"
          value={rol}
          onChange={(e) => setRol(e.target.value as typeof rol)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="operador">Operador</option>
          <option value="contador">Contador</option>
          <option value="propietario">Propietario</option>
        </select>
      </div>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Invitar"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function OnboardingAsistentePage() {
  const [estado, setEstado] = useState<EstadoOnboarding | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    obtenerEstadoOnboarding()
      .then(setEstado)
      .catch(() => setError("No se pudo cargar el estado del asistente."));
  }

  useEffect(cargar, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">Asistente de arranque</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Completa estos pasos para dejar tu cuenta lista — puedes hacerlo en cualquier orden y volver cuando
        quieras; el calendario funciona de todas formas mientras tanto.
      </p>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6">
        <AsistenteConversacional />
      </div>

      {estado && (
        <div className="mt-6 space-y-3">
          {PASOS.map((paso) => {
            const completado = estado.pasos[paso.clave];
            return (
              <Card key={paso.clave}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        completado
                          ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white"
                          : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground text-xs text-muted-foreground"
                      }
                    >
                      {completado ? "✓" : ""}
                    </span>
                    <div>
                      <CardTitle className="text-sm">{paso.titulo}</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">{paso.descripcion}</p>
                      {paso.clave === "colaboradorInvitado" && !completado && (
                        <div className="mt-3">
                          <FormularioInvitacion onInvitado={cargar} />
                        </div>
                      )}
                    </div>
                  </div>
                  {paso.cta && !completado && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={paso.cta.a}>{paso.cta.texto}</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <div className="pt-4 text-center">
            <Button asChild>
              <Link to="/calendario">Ir a mi calendario</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
