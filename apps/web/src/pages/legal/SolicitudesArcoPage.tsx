import { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import {
  Badge,
  type BadgeProps,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@atiende-rv/ui-atiende";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import {
  actualizarSolicitudArco,
  crearSolicitudArco,
  listarSolicitudesArco,
  listarUsuariosBasico,
  type SolicitudArcoContrato,
} from "./api";
import { AlertaError } from "./components/AlertaError";

const ETIQUETA_TIPO_DERECHO: Record<SolicitudArcoContrato["tipoDerecho"], string> = {
  acceso: "Acceso",
  rectificacion: "Rectificación",
  cancelacion: "Cancelación",
  oposicion: "Oposición",
};

const ETIQUETA_JURISDICCION: Record<SolicitudArcoContrato["jurisdiccion"], string> = {
  mx_lfpdppp: "México (LFPDPPP)",
  ue_rgpd: "UE (RGPD)",
};

const ETIQUETA_ESTADO: Record<SolicitudArcoContrato["estado"], string> = {
  recibida: "Recibida",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  rechazada: "Rechazada",
};

const VARIANTE_ESTADO: Record<SolicitudArcoContrato["estado"], BadgeProps["variant"]> = {
  recibida: "default",
  en_proceso: "secondary",
  resuelta: "outline",
  rechazada: "destructive",
};

/**
 * REQ-151 (docs/REQUISITOS.md, MUST): bandeja de solicitudes ARCO/RGPD.
 * Herramienta de FLUJO, no de decisión sustantiva (RV19-R-11) — esta
 * pantalla nunca decide si una solicitud procede; solo la registra,
 * muestra su plazo estatutario (calculado por jurisdicción en
 * apps/api/src/routes/solicitudesArco.ts / packages/db migración 0133) y
 * da seguimiento a estado/responsable. Cerrar un ticket (resuelta/
 * rechazada) exige una nota de resolución — la decisión la toma un humano
 * fuera de esta herramienta, pero queda documentada aquí.
 */
export function SolicitudesArcoPage() {
  const [filtroEstado, setFiltroEstado] = useState<SolicitudArcoContrato["estado"] | "">("");
  const bandejaQuery = useQueryLigero(
    () => listarSolicitudesArco(filtroEstado || undefined),
    [filtroEstado],
  );
  const usuariosQuery = useQueryLigero(() => listarUsuariosBasico(), []);
  const usuarios = usuariosQuery.datos?.usuarios ?? [];

  const [formAbierto, setFormAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState<SolicitudArcoContrato | null>(null);

  const [nuevoTipo, setNuevoTipo] = useState<SolicitudArcoContrato["tipoDerecho"]>("acceso");
  const [nuevaJurisdiccion, setNuevaJurisdiccion] = useState<SolicitudArcoContrato["jurisdiccion"]>("mx_lfpdppp");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");

  const crearMut = useMutacionLigera(
    async (
      tipoDerecho: SolicitudArcoContrato["tipoDerecho"],
      jurisdiccion: SolicitudArcoContrato["jurisdiccion"],
      solicitanteNombre: string,
      solicitanteEmail: string,
      descripcion: string,
    ) => {
      const creado = await crearSolicitudArco({
        tipoDerecho,
        jurisdiccion,
        solicitanteNombre,
        solicitanteEmail,
        descripcion: descripcion || undefined,
      });
      bandejaQuery.recargar();
      setNuevoNombre("");
      setNuevoEmail("");
      setNuevaDescripcion("");
      setFormAbierto(false);
      return creado;
    },
  );

  const [estadoEdicion, setEstadoEdicion] = useState<SolicitudArcoContrato["estado"]>("recibida");
  const [responsableEdicion, setResponsableEdicion] = useState("");
  const [notasEdicion, setNotasEdicion] = useState("");

  function abrirEdicion(s: SolicitudArcoContrato) {
    setSeleccionado(s);
    setEstadoEdicion(s.estado);
    setResponsableEdicion(s.responsableId ?? "");
    setNotasEdicion(s.resolucionNotas ?? "");
  }

  const cierraTicket = estadoEdicion === "resuelta" || estadoEdicion === "rechazada";

  const actualizarMut = useMutacionLigera(async (id: string) => {
    const actualizado = await actualizarSolicitudArco(id, {
      estado: estadoEdicion,
      responsableId: responsableEdicion || null,
      resolucionNotas: notasEdicion || undefined,
    });
    bandejaQuery.recargar();
    setSeleccionado(null);
    return actualizado;
  });

  const entradas = bandejaQuery.datos?.entradas ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Solicitudes ARCO / RGPD</h1>
        <p className="text-sm text-muted-foreground">
          Bandeja de seguimiento de solicitudes de derechos del interesado (acceso, rectificación, cancelación,
          oposición / RGPD). Esta herramienta solo da seguimiento de flujo y plazos — nunca decide si una solicitud
          procede; esa decisión la toma un humano y se documenta aquí al cerrar el ticket.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="arco-filtro-estado">
              Filtrar por estado
            </label>
            <select
              id="arco-filtro-estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as SolicitudArcoContrato["estado"] | "")}
              className="border rounded-md px-2 py-1 text-sm bg-background"
            >
              <option value="">Todas</option>
              {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={() => setFormAbierto((v) => !v)}>
            <Plus className="w-4 h-4" /> Nueva solicitud
          </Button>
        </CardContent>
      </Card>

      {formAbierto && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Nueva solicitud ARCO/RGPD</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="arco-nuevo-tipo">
                Tipo de derecho
              </label>
              <select
                id="arco-nuevo-tipo"
                value={nuevoTipo}
                onChange={(e) => setNuevoTipo(e.target.value as SolicitudArcoContrato["tipoDerecho"])}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              >
                {Object.entries(ETIQUETA_TIPO_DERECHO).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="arco-nueva-jurisdiccion">
                Jurisdicción
              </label>
              <select
                id="arco-nueva-jurisdiccion"
                value={nuevaJurisdiccion}
                onChange={(e) => setNuevaJurisdiccion(e.target.value as SolicitudArcoContrato["jurisdiccion"])}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              >
                {Object.entries(ETIQUETA_JURISDICCION).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="arco-nuevo-nombre">
                Nombre del interesado
              </label>
              <input
                id="arco-nuevo-nombre"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="arco-nuevo-email">
                Correo del interesado
              </label>
              <input
                id="arco-nuevo-email"
                type="email"
                value={nuevoEmail}
                onChange={(e) => setNuevoEmail(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground" htmlFor="arco-nueva-descripcion">
                Descripción (opcional)
              </label>
              <textarea
                id="arco-nueva-descripcion"
                value={nuevaDescripcion}
                onChange={(e) => setNuevaDescripcion(e.target.value)}
                rows={2}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                size="sm"
                disabled={!nuevoNombre || !nuevoEmail || crearMut.enCurso}
                onClick={() => crearMut.ejecutar(nuevoTipo, nuevaJurisdiccion, nuevoNombre, nuevoEmail, nuevaDescripcion)}
              >
                Crear ticket
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertaError error={bandejaQuery.error ?? crearMut.error ?? actualizarMut.error} />

      <Card>
        <CardContent className="p-0">
          {entradas.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Sin solicitudes ARCO todavía.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interesado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Jurisdicción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Plazo</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entradas.map((s) => {
                  const responsable = usuarios.find((u) => u.id === s.responsableId);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="text-sm">{s.solicitanteNombre}</div>
                        <div className="text-xs text-muted-foreground">{s.solicitanteEmail}</div>
                      </TableCell>
                      <TableCell className="text-sm">{ETIQUETA_TIPO_DERECHO[s.tipoDerecho]}</TableCell>
                      <TableCell className="text-sm">{ETIQUETA_JURISDICCION[s.jurisdiccion]}</TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE_ESTADO[s.estado]}>{ETIQUETA_ESTADO[s.estado]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className={s.vencida ? "text-destructive font-semibold flex items-center gap-1" : ""}>
                          {s.vencida && <AlertTriangle className="w-3.5 h-3.5" />}
                          {new Date(s.plazoLimite).toLocaleDateString("es-MX")}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{responsable?.email ?? "Sin asignar"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => abrirEdicion(s)}>
                          Gestionar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {seleccionado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Gestionar solicitud de {seleccionado.solicitanteNombre} ({seleccionado.solicitanteEmail})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="arco-edicion-estado">
                Estado
              </label>
              <select
                id="arco-edicion-estado"
                value={estadoEdicion}
                onChange={(e) => setEstadoEdicion(e.target.value as SolicitudArcoContrato["estado"])}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              >
                {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="arco-edicion-responsable">
                Responsable
              </label>
              <select
                id="arco-edicion-responsable"
                value={responsableEdicion}
                onChange={(e) => setResponsableEdicion(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground" htmlFor="arco-edicion-notas">
                Nota de resolución {cierraTicket && "(obligatoria para resolver/rechazar)"}
              </label>
              <textarea
                id="arco-edicion-notas"
                value={notasEdicion}
                onChange={(e) => setNotasEdicion(e.target.value)}
                rows={2}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button
                size="sm"
                disabled={(cierraTicket && !notasEdicion) || actualizarMut.enCurso}
                onClick={() => actualizarMut.ejecutar(seleccionado.id)}
              >
                Guardar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSeleccionado(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
