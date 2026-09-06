import { useState } from "react";
import { Download, Plus } from "lucide-react";
import {
  Badge,
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
import { tokenGuardado, BASE_URL } from "../../lib/api/cliente";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { AlertaError } from "./components/AlertaError";
import {
  crearReglaComision,
  decimalDesdeCentavos,
  generarStatement,
  importarPayout,
  listarReglasComision,
  listarStatements,
  obtenerMovimiento,
  registrarMovimiento,
  urlDescargaStatement,
  type StatementResumen,
} from "./api";

const ROLES_ADMIN = ["superadmin", "admin_gestora"] as const;
const ROLES_FINANZAS = ["superadmin", "admin_gestora", "contador"] as const;

async function abrirDescargaAutenticada(rutaRelativa: string, nombreArchivo: string) {
  const token = tokenGuardado();
  const url = new URL(rutaRelativa.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  const respuesta = await fetch(url.toString(), { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!respuesta.ok) throw new Error(`No se pudo descargar (HTTP ${respuesta.status})`);
  const blob = await respuesta.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(objUrl);
}

/**
 * Finanzas / owners / statements (Lote 7, BACKLOG E10). Vista con alcance
 * distinto por rol (RV12 §1): el rol `propietario` solo ve sus propios
 * statements (RLS ya lo garantiza en el backend — aquí solo se ocultan los
 * controles administrativos, nunca se confía únicamente en el frontend
 * para el aislamiento). `contador` ve finanzas consolidadas sin controles
 * operativos de calendario.
 */
export function FinanzasPage() {
  const { usuario } = useSesion();
  const esAdmin = usuario ? (ROLES_ADMIN as readonly string[]).includes(usuario.rol) : false;
  const esRolFinanzas = usuario ? (ROLES_FINANZAS as readonly string[]).includes(usuario.rol) : false;
  const esPropietario = usuario?.rol === "propietario";

  const [filtroOwnerId, setFiltroOwnerId] = useState("");
  const statementsQuery = useQueryLigero(
    () => listarStatements(esPropietario ? undefined : filtroOwnerId || undefined),
    [filtroOwnerId, esPropietario],
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Finanzas{esPropietario ? " — mis liquidaciones" : ""}</h1>
        <p className="text-sm text-muted-foreground">
          {esPropietario
            ? "Historial de tus liquidaciones (owner statements). Solo ves las tuyas."
            : "Owner statements, reglas de comisión de canal, movimientos financieros por reserva y conciliación de payouts."}
        </p>
      </div>

      {!esPropietario && esRolFinanzas && (
        <div className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Filtrar por propietario (ownerId)
            <input
              value={filtroOwnerId}
              onChange={(e) => setFiltroOwnerId(e.target.value)}
              placeholder="uuid del owner"
              className="border rounded-md px-2 py-1 text-sm bg-background w-72"
            />
          </label>
        </div>
      )}

      <AlertaError error={statementsQuery.error} />

      <TablaStatements statements={statementsQuery.datos?.statements ?? []} cargando={statementsQuery.cargando} />

      {esAdmin && <SeccionGenerarStatement onGenerado={() => statementsQuery.recargar()} />}
      {esRolFinanzas && <SeccionReglasComision soloLectura={!esAdmin} />}
      {esAdmin && <SeccionMovimientoReserva />}
      {esAdmin && <SeccionPayouts />}
    </div>
  );
}

function TablaStatements({ statements, cargando }: { statements: StatementResumen[]; cargando: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Owner statements</CardTitle>
      </CardHeader>
      <CardContent>
        {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!cargando && statements.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin statements generados todavía.</p>
        )}
        {!cargando && statements.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Versión</TableHead>
                <TableHead>Neto</TableHead>
                <TableHead>Generado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.periodoInicio} → {s.periodoFin}
                  </TableCell>
                  <TableCell>v{s.version}</TableCell>
                  <TableCell>
                    {s.moneda} {decimalDesdeCentavos(s.netoCentavos)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.generadoEn.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => abrirDescargaAutenticada(urlDescargaStatement(s.id), `statement-${s.id}.html`)}
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SeccionGenerarStatement({ onGenerado }: { onGenerado: () => void }) {
  const [ownerId, setOwnerId] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFin, setPeriodoFin] = useState("");
  const generar = useMutacionLigera(() => generarStatement({ ownerId, periodoInicio, periodoFin }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Generar owner statement (idempotente y versionado, H-062)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            placeholder="ownerId (uuid)"
            className="border rounded-md px-2 py-1 text-sm bg-background w-64"
          />
          <input
            type="date"
            value={periodoInicio}
            onChange={(e) => setPeriodoInicio(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          />
          <input
            type="date"
            value={periodoFin}
            onChange={(e) => setPeriodoFin(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          />
          <Button
            size="sm"
            disabled={!ownerId || !periodoInicio || !periodoFin || generar.enCurso}
            onClick={async () => {
              await generar.ejecutar();
              onGenerado();
            }}
          >
            Generar
          </Button>
        </div>
        <AlertaError error={generar.error} />
        {generar.datos && (
          <p className="text-xs text-muted-foreground">
            Neto calculado: {generar.datos.moneda} {decimalDesdeCentavos(generar.datos.netoCentavos)} — versión{" "}
            {generar.datos.version}. Si el contenido es idéntico a la versión vigente, no se crea una versión nueva
            (idempotente).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SeccionReglasComision({ soloLectura }: { soloLectura: boolean }) {
  const reglasQuery = useQueryLigero(() => listarReglasComision(), []);
  const [canalCodigo, setCanalCodigo] = useState<"airbnb" | "vrbo" | "booking" | "manual">("airbnb");
  const [yaNetoDeComision, setYaNetoDeComision] = useState(true);
  const [comisionPct, setComisionPct] = useState("16");
  const [fuente, setFuente] = useState("RV12 L-RV12-02: airbnb.com/help/article/1857");
  const crear = useMutacionLigera(() =>
    crearReglaComision({
      canalCodigo,
      yaNetoDeComision,
      comisionBasisPoints: Math.round(parseFloat(comisionPct) * 100),
      fuente,
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reglas de comisión de canal (H-063/H-065 — nunca hardcodeadas)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <AlertaError error={reglasQuery.error} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Canal</TableHead>
              <TableHead>¿Ya neto de comisión?</TableHead>
              <TableHead>Comisión</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Vigente desde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(reglasQuery.datos?.reglas ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="capitalize">{r.canalCodigo}</TableCell>
                <TableCell>{r.yaNetoDeComision ? "Sí" : "No"}</TableCell>
                <TableCell>{(r.comisionBasisPoints / 100).toFixed(2)}%</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={r.fuente}>
                  {r.fuente}
                </TableCell>
                <TableCell className="text-xs">{r.vigenteDesde}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!soloLectura && (
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              Canal
              <select
                value={canalCodigo}
                onChange={(e) => setCanalCodigo(e.target.value as typeof canalCodigo)}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              >
                <option value="airbnb">Airbnb</option>
                <option value="vrbo">Vrbo</option>
                <option value="booking">Booking.com</option>
                <option value="manual">Directa</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              ¿Ya neto?
              <select
                value={yaNetoDeComision ? "si" : "no"}
                onChange={(e) => setYaNetoDeComision(e.target.value === "si")}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              >
                <option value="si">Sí (Airbnb host-only)</option>
                <option value="no">No (bruto)</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              Comisión (%)
              <input
                value={comisionPct}
                onChange={(e) => setComisionPct(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm bg-background w-24"
              />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1 flex-1 min-w-[16rem]">
              Fuente (obligatoria, RV12 R1/R5)
              <input
                value={fuente}
                onChange={(e) => setFuente(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              />
            </label>
            <Button
              size="sm"
              disabled={crear.enCurso}
              onClick={async () => {
                await crear.ejecutar();
                reglasQuery.recargar();
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </Button>
          </div>
        )}
        <AlertaError error={crear.error} />
      </CardContent>
    </Card>
  );
}

function SeccionMovimientoReserva() {
  const [ocupacionId, setOcupacionId] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  const [montoBruto, setMontoBruto] = useState("");
  const [comisionGestorPct, setComisionGestorPct] = useState("10");
  const [comisionGestorBase, setComisionGestorBase] = useState<"bruto" | "neto_de_canal">("neto_de_canal");

  const registrar = useMutacionLigera(() =>
    registrarMovimiento(ocupacionId, {
      moneda,
      montoBrutoCentavos: Math.round(parseFloat(montoBruto) * 100),
      comisionGestorBasisPoints: Math.round(parseFloat(comisionGestorPct) * 100),
      comisionGestorBase,
      gastos: [],
      impuestos: [],
    }),
  );
  const consultar = useMutacionLigera(() => obtenerMovimiento(ocupacionId));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Movimiento financiero de una reserva (H-062/H-063, sin doble descuento)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          El ocupacionId es el identificador de la reserva en el calendario maestro (Lote 4). La comisión de canal se
          resuelve automáticamente desde la regla configurada arriba — nunca se vuelve a restar si el canal ya
          entrega el monto neto.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            value={ocupacionId}
            onChange={(e) => setOcupacionId(e.target.value)}
            placeholder="ocupacionId (uuid de la reserva)"
            className="border rounded-md px-2 py-1 text-sm bg-background w-72"
          />
          <input
            value={moneda}
            onChange={(e) => setMoneda(e.target.value.toUpperCase())}
            placeholder="MXN"
            className="border rounded-md px-2 py-1 text-sm bg-background w-20"
          />
          <input
            value={montoBruto}
            onChange={(e) => setMontoBruto(e.target.value)}
            placeholder="Monto bruto/recibido"
            className="border rounded-md px-2 py-1 text-sm bg-background w-40"
          />
          <input
            value={comisionGestorPct}
            onChange={(e) => setComisionGestorPct(e.target.value)}
            placeholder="Comisión gestor %"
            className="border rounded-md px-2 py-1 text-sm bg-background w-32"
          />
          <select
            value={comisionGestorBase}
            onChange={(e) => setComisionGestorBase(e.target.value as typeof comisionGestorBase)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          >
            <option value="neto_de_canal">Sobre neto de canal</option>
            <option value="bruto">Sobre bruto</option>
          </select>
          <Button size="sm" disabled={!ocupacionId || !montoBruto || registrar.enCurso} onClick={() => registrar.ejecutar()}>
            Calcular y guardar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!ocupacionId || consultar.enCurso}
            onClick={() => consultar.ejecutar()}
          >
            Ver movimiento actual
          </Button>
        </div>
        <AlertaError error={registrar.error ?? consultar.error} />
        {(registrar.datos || consultar.datos) && (
          <div className="text-xs rounded-md border p-3 space-y-1 bg-muted/40">
            {(() => {
              const m = registrar.datos ?? consultar.datos!;
              return (
                <>
                  <p>
                    Bruto: {m.moneda} {decimalDesdeCentavos(m.montoBrutoCentavos)} · Comisión canal:{" "}
                    {decimalDesdeCentavos(m.comisionCanalCentavos)} · Comisión gestor:{" "}
                    {decimalDesdeCentavos(m.comisionGestorCentavos)}
                  </p>
                  <p className="font-medium">Neto: {decimalDesdeCentavos(m.netoCentavos)}</p>
                  {"alertaFiscal" in m && (
                    <p className="text-muted-foreground">{(m as { alertaFiscal: { mensaje: string } }).alertaFiscal.mensaje}</p>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SeccionPayouts() {
  const [canalCodigo, setCanalCodigo] = useState<"airbnb" | "vrbo" | "booking">("vrbo");
  const [fechaPayout, setFechaPayout] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  const [lineasTexto, setLineasTexto] = useState("");

  const importar = useMutacionLigera(async () => {
    const lineas = lineasTexto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [referencia, monto] = l.split(",").map((v) => v.trim());
        return { referenciaExternaReserva: referencia || undefined, montoCentavos: Math.round(parseFloat(monto ?? "0") * 100) };
      });
    return importarPayout({ canalCodigo, moneda, fechaPayout, lineas });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conciliación de payouts (H-064)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Pega el "Payout summary" ya exportado del canal como líneas <code>referenciaExterna,monto</code> (una por
          renglón, monto en la moneda indicada). Vrbo es el caso de referencia (export CSV/XLS oficial, RV12 §4).
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            value={canalCodigo}
            onChange={(e) => setCanalCodigo(e.target.value as typeof canalCodigo)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          >
            <option value="vrbo">Vrbo</option>
            <option value="airbnb">Airbnb</option>
            <option value="booking">Booking.com</option>
          </select>
          <input
            type="date"
            value={fechaPayout}
            onChange={(e) => setFechaPayout(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          />
          <input
            value={moneda}
            onChange={(e) => setMoneda(e.target.value.toUpperCase())}
            className="border rounded-md px-2 py-1 text-sm bg-background w-20"
          />
        </div>
        <textarea
          value={lineasTexto}
          onChange={(e) => setLineasTexto(e.target.value)}
          placeholder={"VRBO-1001,4200.00\nVRBO-1002,1850.50"}
          rows={4}
          className="border rounded-md px-2 py-1 text-sm bg-background w-full font-mono"
        />
        <Button size="sm" disabled={!fechaPayout || !lineasTexto.trim() || importar.enCurso} onClick={() => importar.ejecutar()}>
          Importar y conciliar
        </Button>
        <AlertaError error={importar.error} />
        {importar.datos && (
          <div className="flex gap-2 text-xs">
            <Badge>Conciliadas: {importar.datos.resumen.conciliadas}</Badge>
            <Badge variant="outline">Pendientes: {importar.datos.resumen.pendientes}</Badge>
            <Badge variant="destructive">Discrepancias: {importar.datos.resumen.discrepancias}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
