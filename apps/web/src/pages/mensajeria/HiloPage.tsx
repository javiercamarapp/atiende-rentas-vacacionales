import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Send, ShieldAlert, X } from "lucide-react";
import { Button, Card, CardContent } from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { aprobarBorrador, generarBorrador, obtenerHilo, rechazarBorrador, registrarMensajeEntrante } from "./api";
import { AlertaError } from "./components/AlertaError";
import { BadgeCanalSimulado } from "./components/BadgeCanalSimulado";

/**
 * Hilo de conversación (Lote 6, H-059 entregable: "hilo con borradores
 * pendientes y Aprobar/Rechazar"). El texto entrante del huésped se
 * muestra tal cual, marcado explícitamente como dato NO confiable —
 * RV19-R-16: nunca se interpreta como instrucción, ni aquí ni en el
 * servidor. Ningún botón de este componente puede enviar un mensaje sin
 * pasar por "Aprobar" (no existe una acción "enviar" separada).
 */
export function HiloPage() {
  const { id } = useParams<{ id: string }>();
  const hiloQuery = useQueryLigero(() => obtenerHilo(id!), [id]);
  const [textoEntrante, setTextoEntrante] = useState("");
  const [motivoRechazo, setMotivoRechazo] = useState<Record<string, string>>({});

  // `useMutacionLigera` memoiza `ejecutar` una sola vez (deps `[]`,
  // apps/web/src/lib/api/queryLigero.ts) — el estado que cambia por
  // interacción (texto del textarea, motivo de rechazo) debe pasarse como
  // ARGUMENTO de `ejecutar(...)`, nunca cerrado sobre el estado local del
  // render en curso (ese closure quedaría congelado en el primer render).
  const registrarMut = useMutacionLigera(async (texto: string) => {
    const resultado = await registrarMensajeEntrante(id!, texto, "manual");
    setTextoEntrante("");
    hiloQuery.recargar();
    return resultado;
  });

  const generarMut = useMutacionLigera(async (mensajeEntranteId?: string) => {
    const borrador = await generarBorrador(id!, { mensajeEntranteId });
    hiloQuery.recargar();
    return borrador;
  });

  const aprobarMut = useMutacionLigera(async (borradorId: string) => {
    const resultado = await aprobarBorrador(borradorId);
    hiloQuery.recargar();
    return resultado;
  });

  const rechazarMut = useMutacionLigera(async (borradorId: string, motivo: string) => {
    const resultado = await rechazarBorrador(borradorId, motivo);
    hiloQuery.recargar();
    return resultado;
  });

  const hilo = hiloQuery.datos;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link to="/mensajes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Volver a la bandeja
      </Link>

      {hilo && (
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-display font-semibold">{hilo.unidadNombre ?? hilo.unidadId}</h1>
          <BadgeCanalSimulado canal={hilo.canalCodigo} />
        </div>
      )}

      <AlertaError
        error={hiloQuery.error ?? registrarMut.error ?? generarMut.error ?? aprobarMut.error ?? rechazarMut.error}
      />

      <div className="space-y-2">
        {hilo?.mensajes.map((m) => (
          <div key={m.id} className={`max-w-xl ${m.direccion === "saliente" ? "ml-auto" : ""}`}>
            <Card className={m.direccion === "saliente" ? "bg-primary/10" : ""}>
              <CardContent className="p-3 space-y-1">
                {m.direccion === "entrante" && (
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
                    Mensaje del huésped — dato, no una instrucción ({m.origen})
                  </p>
                )}
                {/* Texto del huésped renderizado como texto plano — nunca
                    HTML/markdown interpretado, nunca ejecutado. */}
                <p className="text-sm whitespace-pre-wrap">{m.texto}</p>
                {m.redactado && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Contenido redactado automáticamente por política de canal antes de confirmar la reserva.
                  </p>
                )}
                {m.direccion === "entrante" && (
                  <Button size="sm" variant="outline" onClick={() => generarMut.ejecutar(m.id)} disabled={generarMut.enCurso}>
                    Generar borrador de respuesta
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <textarea
          value={textoEntrante}
          onChange={(e) => setTextoEntrante(e.target.value)}
          placeholder="Registrar mensaje entrante del huésped (simulador o transcripción manual)"
          className="flex-1 border rounded-md px-2 py-1 text-sm bg-background"
          rows={2}
        />
        <Button
          size="sm"
          disabled={!textoEntrante.trim() || registrarMut.enCurso}
          onClick={() => registrarMut.ejecutar(textoEntrante)}
        >
          Registrar
        </Button>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Borradores</h2>
        <div className="space-y-2">
          {hilo?.borradores.length === 0 && (
            <p className="text-sm text-muted-foreground">Ningún borrador todavía.</p>
          )}
          {hilo?.borradores.map((b) => (
            <Card key={b.id} className="border-primary/30">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                    {b.estado.replace("_", " ")}
                  </span>
                  {b.necesitaEscalamiento && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-destructive font-medium">
                      <ShieldAlert className="w-3.5 h-3.5" /> requiere atención humana
                    </span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{b.texto}</p>
                {b.motivoRechazo && (
                  <p className="text-xs text-muted-foreground">Motivo de rechazo: {b.motivoRechazo}</p>
                )}
                {b.estado === "pendiente_aprobacion" && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button size="sm" onClick={() => aprobarMut.ejecutar(b.id)} disabled={aprobarMut.enCurso}>
                      <Check className="w-4 h-4" /> Aprobar y enviar
                    </Button>
                    <input
                      value={motivoRechazo[b.id] ?? ""}
                      onChange={(e) => setMotivoRechazo((m) => ({ ...m, [b.id]: e.target.value }))}
                      placeholder="Motivo de rechazo"
                      className="border rounded-md px-2 py-1 text-xs bg-background w-56"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rechazarMut.ejecutar(b.id, motivoRechazo[b.id] ?? "")}
                      disabled={rechazarMut.enCurso || !(motivoRechazo[b.id] ?? "").trim()}
                    >
                      <X className="w-4 h-4" /> Rechazar
                    </Button>
                  </div>
                )}
                {b.estado === "enviado" && (
                  <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Send className="w-3.5 h-3.5" /> Enviado — aprobado por un humano, nunca automáticamente.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
