import { useState } from "react";
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
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { AlertaError } from "./components/AlertaError";
import {
  CANALES_CONOCIDOS,
  cotizar,
  crearDescuentoDuracion,
  crearMinStay,
  crearReglaCanal,
  crearTemporada,
  detectarParidad,
  evaluarPublicacion,
  fijarTarifaBase,
  listarUnidadesBasico,
  obtenerContextoPricing,
  type ViolacionParidad,
} from "./api";

function decimal(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  return `${negativo ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Pricing básico (Lote 7, BACKLOG E11, RV13): precio base, temporadas,
 * descuentos por duración (7/28 noches con fuente), min-stay dinámico,
 * reglas por canal y cotización determinista. La publicación de tarifas
 * hacia un canal solo se permite si su adaptador declara `ratesPush:true`
 * (H-069) — hoy ninguno lo hace, y la UI lo dice explícitamente.
 */
export function PricingPage() {
  const unidadesQuery = useQueryLigero(() => listarUnidadesBasico(), []);
  const [unidadId, setUnidadId] = useState("");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Precio base, temporadas, descuentos por duración y min-stay por unidad. Las tarifas nunca se sincronizan
          por iCal — solo hacia un canal con integración API activa.
        </p>
      </div>

      <AlertaError error={unidadesQuery.error} />

      <label className="text-xs text-muted-foreground flex flex-col gap-1 max-w-sm">
        Unidad
        <select
          value={unidadId}
          onChange={(e) => setUnidadId(e.target.value)}
          className="border rounded-md px-2 py-1 text-sm bg-background"
        >
          <option value="">Selecciona una unidad…</option>
          {(unidadesQuery.datos?.unidades ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </label>

      {unidadId && <PanelUnidad unidadId={unidadId} />}
    </div>
  );
}

function PanelUnidad({ unidadId }: { unidadId: string }) {
  const contextoQuery = useQueryLigero(() => obtenerContextoPricing(unidadId), [unidadId]);

  return (
    <div className="space-y-4">
      <FormularioTarifaBase unidadId={unidadId} onGuardado={() => contextoQuery.recargar()} />

      <AlertaError error={contextoQuery.error} />

      {contextoQuery.datos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contexto de pricing actual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Precio base: {contextoQuery.datos.moneda} {decimal(contextoQuery.datos.precioBaseNocheCentavos)}/noche
            </p>
            {contextoQuery.datos.temporadas.length > 0 && (
              <div>
                <p className="font-medium text-xs uppercase text-muted-foreground">Temporadas</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Rango</TableHead>
                      <TableHead>Precio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contextoQuery.datos.temporadas.map((t, i) => (
                      <TableRow key={i}>
                        <TableCell>{t.nombre}</TableCell>
                        <TableCell>
                          {t.rango.inicio} → {t.rango.fin}
                        </TableCell>
                        <TableCell>{decimal(t.precioNocheCentavos)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {contextoQuery.datos.descuentosDuracion.length > 0 && (
              <div>
                <p className="font-medium text-xs uppercase text-muted-foreground">Descuentos por duración</p>
                {contextoQuery.datos.descuentosDuracion.map((d, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {d.nochesMinimas}+ noches: {(d.porcentajeDescuentoBasisPoints / 100).toFixed(2)}% — {d.fuente}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <FormularioTemporada unidadId={unidadId} onGuardado={() => contextoQuery.recargar()} />
      <FormularioDescuentoDuracion unidadId={unidadId} onGuardado={() => contextoQuery.recargar()} />
      <FormularioMinStay unidadId={unidadId} onGuardado={() => contextoQuery.recargar()} />
      <FormularioReglaCanal unidadId={unidadId} />
      <PanelCotizar unidadId={unidadId} />
      <PanelParidad unidadId={unidadId} />
    </div>
  );
}

function FormularioTarifaBase({ unidadId, onGuardado }: { unidadId: string; onGuardado: () => void }) {
  const [precio, setPrecio] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  const guardar = useMutacionLigera(() =>
    fijarTarifaBase(unidadId, { precioNocheCentavos: Math.round(parseFloat(precio) * 100), moneda }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Precio base por noche</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <input
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="Precio/noche"
          className="border rounded-md px-2 py-1 text-sm bg-background w-40"
        />
        <input
          value={moneda}
          onChange={(e) => setMoneda(e.target.value.toUpperCase())}
          className="border rounded-md px-2 py-1 text-sm bg-background w-20"
        />
        <Button
          size="sm"
          disabled={!precio || guardar.enCurso}
          onClick={async () => {
            await guardar.ejecutar();
            onGuardado();
          }}
        >
          Guardar
        </Button>
        <AlertaError error={guardar.error} />
      </CardContent>
    </Card>
  );
}

function FormularioTemporada({ unidadId, onGuardado }: { unidadId: string; onGuardado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [precio, setPrecio] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  const guardar = useMutacionLigera(() =>
    crearTemporada(unidadId, { nombre, rango: { inicio, fin }, precioNocheCentavos: Math.round(parseFloat(precio) * 100), moneda }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Temporada</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej. Alta)" className="border rounded-md px-2 py-1 text-sm bg-background w-40" />
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background" />
        <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background" />
        <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio/noche" className="border rounded-md px-2 py-1 text-sm bg-background w-32" />
        <input value={moneda} onChange={(e) => setMoneda(e.target.value.toUpperCase())} className="border rounded-md px-2 py-1 text-sm bg-background w-20" />
        <Button
          size="sm"
          disabled={!nombre || !inicio || !fin || !precio || guardar.enCurso}
          onClick={async () => {
            await guardar.ejecutar();
            onGuardado();
          }}
        >
          Agregar
        </Button>
        <AlertaError error={guardar.error} />
      </CardContent>
    </Card>
  );
}

function FormularioDescuentoDuracion({ unidadId, onGuardado }: { unidadId: string; onGuardado: () => void }) {
  const [noches, setNoches] = useState("7");
  const [pct, setPct] = useState("10");
  const [fuente, setFuente] = useState("RV13: Airbnb art. 1344 (7+ noches semanal), Vrbo Manage rates");
  const guardar = useMutacionLigera(() =>
    crearDescuentoDuracion(unidadId, {
      nochesMinimas: parseInt(noches, 10),
      porcentajeDescuentoBasisPoints: Math.round(parseFloat(pct) * 100),
      fuente,
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Descuento por duración (RV13-R-02: 7/28 noches con fuente)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <select value={noches} onChange={(e) => setNoches(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background">
          <option value="7">7+ noches (semanal)</option>
          <option value="28">28+ noches (mensual)</option>
        </select>
        <input value={pct} onChange={(e) => setPct(e.target.value)} placeholder="% descuento" className="border rounded-md px-2 py-1 text-sm bg-background w-28" />
        <input value={fuente} onChange={(e) => setFuente(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background flex-1 min-w-[16rem]" />
        <Button
          size="sm"
          disabled={guardar.enCurso}
          onClick={async () => {
            await guardar.ejecutar();
            onGuardado();
          }}
        >
          Guardar
        </Button>
        <AlertaError error={guardar.error} />
      </CardContent>
    </Card>
  );
}

function FormularioMinStay({ unidadId, onGuardado }: { unidadId: string; onGuardado: () => void }) {
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [diaSemana, setDiaSemana] = useState("");
  const [nochesMinimas, setNochesMinimas] = useState("2");
  const guardar = useMutacionLigera(() =>
    crearMinStay(unidadId, {
      rango: { inicio, fin },
      diaSemanaCheckIn: diaSemana === "" ? null : parseInt(diaSemana, 10),
      nochesMinimas: parseInt(nochesMinimas, 10),
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Min-stay dinámico (RV13-R-03)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background" />
        <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background" />
        <select value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background">
          <option value="">Todos los días</option>
          <option value="0">Domingo</option>
          <option value="1">Lunes</option>
          <option value="2">Martes</option>
          <option value="3">Miércoles</option>
          <option value="4">Jueves</option>
          <option value="5">Viernes</option>
          <option value="6">Sábado</option>
        </select>
        <input value={nochesMinimas} onChange={(e) => setNochesMinimas(e.target.value)} placeholder="Noches mínimas" className="border rounded-md px-2 py-1 text-sm bg-background w-32" />
        <Button
          size="sm"
          disabled={!inicio || !fin || guardar.enCurso}
          onClick={async () => {
            await guardar.ejecutar();
            onGuardado();
          }}
        >
          Guardar
        </Button>
        <AlertaError error={guardar.error} />
      </CardContent>
    </Card>
  );
}

function FormularioReglaCanal({ unidadId }: { unidadId: string }) {
  const [canalCodigo, setCanalCodigo] = useState<(typeof CANALES_CONOCIDOS)[number]>("airbnb");
  const [markupPct, setMarkupPct] = useState("0");
  const [activo, setActivo] = useState(false);
  const guardar = useMutacionLigera(() =>
    crearReglaCanal(unidadId, { canalCodigo, markupBasisPoints: Math.round(parseFloat(markupPct) * 100), activo }),
  );
  const publicacionQuery = useQueryLigero(() => evaluarPublicacion(unidadId, canalCodigo), [unidadId, canalCodigo]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regla de canal (markup) y publicación (H-069/H-070)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <select value={canalCodigo} onChange={(e) => setCanalCodigo(e.target.value as typeof canalCodigo)} className="border rounded-md px-2 py-1 text-sm bg-background">
            {CANALES_CONOCIDOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} placeholder="Markup %" className="border rounded-md px-2 py-1 text-sm bg-background w-28" />
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
          </label>
          <Button size="sm" disabled={guardar.enCurso} onClick={() => guardar.ejecutar()}>
            Guardar
          </Button>
        </div>
        <AlertaError error={guardar.error ?? publicacionQuery.error} />
        {guardar.datos?.avisoDesactivarNativo && (
          <p className="text-xs text-amber-700">{guardar.datos.avisoDesactivarNativo}</p>
        )}
        {publicacionQuery.datos && (
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={publicacionQuery.datos.puedePublicar ? "default" : "outline"}>
              {publicacionQuery.datos.puedePublicar ? "Publicable" : "No publicable"}
            </Badge>
            <span className="text-muted-foreground">{publicacionQuery.datos.mensaje}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelCotizar({ unidadId }: { unidadId: string }) {
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const cotizarMut = useMutacionLigera(() => cotizar({ unidadId, rango: { inicio, fin } }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cotizar (reserva directa, H-068)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background" />
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background" />
          <Button size="sm" disabled={!inicio || !fin || cotizarMut.enCurso} onClick={() => cotizarMut.ejecutar()}>
            Cotizar
          </Button>
        </div>
        <AlertaError error={cotizarMut.error} />
        {cotizarMut.datos && (
          <div className="text-sm space-y-1">
            <p>
              {cotizarMut.datos.noches} noches — subtotal {decimal(cotizarMut.datos.subtotalAntesDescuentoCentavos)}
            </p>
            {cotizarMut.datos.descuentoAplicado && (
              <p className="text-xs text-muted-foreground">
                Descuento {cotizarMut.datos.descuentoAplicado.nochesMinimas}+ noches:{" "}
                {(cotizarMut.datos.descuentoAplicado.porcentajeDescuentoBasisPoints / 100).toFixed(2)}% (
                {decimal(cotizarMut.datos.descuentoAplicado.montoCentavos)})
              </p>
            )}
            <p className="font-medium">
              Total: {cotizarMut.datos.moneda} {decimal(cotizarMut.datos.totalCentavos)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FilaCanalParidad {
  canalCodigo: (typeof CANALES_CONOCIDOS)[number];
  precio: string;
}

/**
 * H-071 (RV13-R-04/R-06): comparador de paridad de precios. Ningún canal
 * real declara `ratesPush` todavía (H-069) — el precio "publicado hoy" en
 * cada canal es dato de entrada manual de quien revisa la paridad, nunca
 * importado automáticamente. El comparador SOLO detecta y propone: no hay
 * ningún botón "publicar" en este panel — ver `paridad.ts` (dominio).
 */
function PanelParidad({ unidadId }: { unidadId: string }) {
  const [precioReferencia, setPrecioReferencia] = useState("");
  const [toleranciaPct, setToleranciaPct] = useState("2");
  const [filas, setFilas] = useState<FilaCanalParidad[]>([{ canalCodigo: "airbnb", precio: "" }]);
  const comparar = useMutacionLigera(() =>
    detectarParidad(unidadId, {
      precioReferenciaNocheCentavos: Math.round(parseFloat(precioReferencia || "0") * 100),
      toleranciaBasisPoints: Math.round(parseFloat(toleranciaPct || "0") * 100),
      precios: filas
        .filter((f) => f.precio.trim() !== "")
        .map((f) => ({ canalCodigo: f.canalCodigo, precioNocheCentavos: Math.round(parseFloat(f.precio) * 100) })),
    }),
  );

  function actualizarFila(i: number, cambio: Partial<FilaCanalParidad>) {
    setFilas((actual) => actual.map((f, idx) => (idx === i ? { ...f, ...cambio } : f)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paridad de precios entre canales (H-071)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Precio directo de referencia
            <input
              value={precioReferencia}
              onChange={(e) => setPrecioReferencia(e.target.value)}
              placeholder="1000.00"
              className="border rounded-md px-2 py-1 text-sm bg-background w-32"
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Tolerancia %
            <input
              value={toleranciaPct}
              onChange={(e) => setToleranciaPct(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm bg-background w-20"
            />
          </label>
        </div>

        <div className="space-y-2">
          {filas.map((fila, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-end">
              <select
                value={fila.canalCodigo}
                onChange={(e) => actualizarFila(i, { canalCodigo: e.target.value as FilaCanalParidad["canalCodigo"] })}
                className="border rounded-md px-2 py-1 text-sm bg-background"
              >
                {CANALES_CONOCIDOS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={fila.precio}
                onChange={(e) => actualizarFila(i, { precio: e.target.value })}
                placeholder="Precio publicado hoy"
                className="border rounded-md px-2 py-1 text-sm bg-background w-40"
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFilas((actual) => [...actual, { canalCodigo: "airbnb", precio: "" }])}
          >
            + Canal
          </Button>
        </div>

        <Button size="sm" disabled={!precioReferencia || comparar.enCurso} onClick={() => comparar.ejecutar()}>
          Detectar violaciones de paridad
        </Button>

        <AlertaError error={comparar.error} />

        {comparar.datos && comparar.datos.violaciones.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin violaciones de paridad fuera de la tolerancia configurada.</p>
        )}

        {comparar.datos && comparar.datos.violaciones.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-amber-700">
              {comparar.datos.violaciones.length} violación(es) detectada(s) — {comparar.datos.alertasGeneradas} alerta(s)
              registrada(s) en el monitor de alertas. Ningún precio se publicó automáticamente.
            </p>
            <TablaViolacionesParidad violaciones={comparar.datos.violaciones} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TablaViolacionesParidad({ violaciones }: { violaciones: ViolacionParidad[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Canal</TableHead>
          <TableHead>Esperado</TableHead>
          <TableHead>Publicado</TableHead>
          <TableHead>Diferencia</TableHead>
          <TableHead>Propuesta</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {violaciones.map((v, i) => (
          <TableRow key={i}>
            <TableCell>{v.canalCodigo}</TableCell>
            <TableCell>{decimal(v.precioEsperadoNocheCentavos)}</TableCell>
            <TableCell>{decimal(v.precioPublicadoNocheCentavos)}</TableCell>
            <TableCell>
              <Badge variant={v.diferenciaBasisPoints > 0 ? "destructive" : "secondary"}>
                {(v.diferenciaBasisPoints / 100).toFixed(2)}%
              </Badge>
            </TableCell>
            <TableCell className="text-xs">{decimal(v.propuesta.precioPropuestoNocheCentavos)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
