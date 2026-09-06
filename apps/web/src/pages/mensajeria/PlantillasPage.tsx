import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { Button, Card, CardContent } from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { aprobarPlantilla, crearPlantilla, obtenerPlantillas, type CanalMensajeria, type Plantilla } from "./api";
import { AlertaError } from "./components/AlertaError";

const EVENTOS: Plantilla["evento"][] = ["confirmacion", "pre_llegada", "check_in", "check_out", "resena"];

/**
 * Editor de plantillas por evento (Lote 6, H-056). Crear una plantilla la
 * deja SIN aprobar por defecto; "Aprobar" es un paso explícito y separado
 * — solo las plantillas aprobadas por el tenant pueden programarse como
 * mensaje automático (packages/db, migración 0041, trigger
 * `fn_exigir_plantilla_aprobada`).
 */
export function PlantillasPage() {
  const plantillasQuery = useQueryLigero(() => obtenerPlantillas(), []);
  const [evento, setEvento] = useState<Plantilla["evento"]>("confirmacion");
  const [idioma, setIdioma] = useState<Plantilla["idioma"]>("es");
  const [canalCodigo, setCanalCodigo] = useState<CanalMensajeria | "">("");
  const [cuerpo, setCuerpo] = useState("");

  const crearMut = useMutacionLigera(async () => {
    const plantilla = await crearPlantilla({ evento, idioma, canalCodigo: canalCodigo || null, cuerpo });
    setCuerpo("");
    plantillasQuery.recargar();
    return plantilla;
  });

  const aprobarMut = useMutacionLigera(async (id: string) => {
    const resultado = await aprobarPlantilla(id);
    plantillasQuery.recargar();
    return resultado;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link to="/mensajes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Volver a la bandeja
      </Link>

      <div>
        <h1 className="text-lg font-display font-semibold">Plantillas por evento</h1>
        <p className="text-sm text-muted-foreground">
          Variables con <code>{"{{nombre}}"}</code>. Solo las plantillas aprobadas por el tenant pueden programarse
          como mensaje automático.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select value={evento} onChange={(e) => setEvento(e.target.value as Plantilla["evento"])} className="border rounded-md px-2 py-1 text-sm bg-background">
              {EVENTOS.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
            <select value={idioma} onChange={(e) => setIdioma(e.target.value as Plantilla["idioma"])} className="border rounded-md px-2 py-1 text-sm bg-background">
              <option value="es">es</option>
              <option value="en">en</option>
            </select>
            <select
              value={canalCodigo}
              onChange={(e) => setCanalCodigo(e.target.value as CanalMensajeria | "")}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            >
              <option value="">Todos los canales</option>
              <option value="airbnb">Airbnb</option>
              <option value="vrbo">Vrbo</option>
              <option value="booking">Booking.com</option>
            </select>
          </div>
          <textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Hola {{nombreHuesped}}, tu reserva en {{propiedadNombre}} está confirmada."
            className="w-full border rounded-md px-2 py-1 text-sm bg-background"
            rows={3}
          />
          <Button size="sm" disabled={!cuerpo.trim() || crearMut.enCurso} onClick={() => crearMut.ejecutar()}>
            Crear plantilla (sin aprobar)
          </Button>
        </CardContent>
      </Card>

      <AlertaError error={plantillasQuery.error ?? crearMut.error ?? aprobarMut.error} />

      <div className="space-y-2">
        {plantillasQuery.datos?.plantillas.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-muted-foreground">
                  {p.evento} · {p.idioma} · {p.canalCodigo ?? "todos los canales"}
                </span>
                <span
                  className={
                    p.aprobadaPorTenant
                      ? "text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                      : "text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                  }
                >
                  {p.aprobadaPorTenant ? "Aprobada por el tenant" : "Sin aprobar — no puede programarse"}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{p.cuerpo}</p>
              {!p.aprobadaPorTenant && (
                <Button size="sm" variant="outline" onClick={() => aprobarMut.ejecutar(p.id)} disabled={aprobarMut.enCurso}>
                  <Check className="w-4 h-4" /> Aprobar plantilla
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
