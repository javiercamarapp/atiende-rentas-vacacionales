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
import { useSesion } from "../../lib/sesion/SesionProvider";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { AlertaError } from "./components/AlertaError";
import { BotonConfirmar } from "./components/BotonConfirmar";
import {
  crearPropiedad,
  crearUnidades,
  eliminarUnidad,
  listarPropiedades,
  listarTenants,
  listarUnidades,
  type PropiedadBackoffice,
} from "./api";

/**
 * Administración de propiedades y unidades (H-011/H-012, LOTES.md
 * Lote 8): zona horaria IANA, dirección mínima y moneda obligatorias en
 * el alta de propiedad; alta de unidades con `cantidad` para multi-unidad
 * (crea N unidades independientes de una sola vez).
 */
export function PropiedadesPage() {
  const { usuario } = useSesion();
  const [tenantIdSeleccionado, setTenantIdSeleccionado] = useState("");
  const tenantsQuery = useQueryLigero(
    () => (usuario?.rol === "superadmin" ? listarTenants() : Promise.resolve({ tenants: [] })),
    [usuario?.rol],
  );
  const tenantId = usuario?.rol === "superadmin" ? tenantIdSeleccionado : (usuario?.tenantId ?? "");

  const propiedadesQuery = useQueryLigero(
    () => (tenantId ? listarPropiedades(tenantId) : Promise.resolve({ propiedades: [] })),
    [tenantId],
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Propiedades y unidades</h1>
        <p className="text-sm text-muted-foreground">
          Alta con zona horaria IANA, dirección mínima y moneda obligatorias (H-011); multi-unidad con cantidad
          (H-012).
        </p>
      </div>

      {usuario?.rol === "superadmin" && (
        <label className="text-xs text-muted-foreground flex flex-col gap-1 max-w-sm">
          Tenant (requiere concesión "romper cristal" vigente para leer/escribir)
          <select
            value={tenantIdSeleccionado}
            onChange={(e) => setTenantIdSeleccionado(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          >
            <option value="">Selecciona un tenant…</option>
            {(tenantsQuery.datos?.tenants ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <AlertaError error={propiedadesQuery.error} />

      {tenantId && (
        <>
          <FormularioPropiedad tenantId={tenantId} onCreada={() => propiedadesQuery.recargar()} />

          <div className="space-y-4">
            {(propiedadesQuery.datos?.propiedades ?? []).map((p) => (
              <PanelPropiedad key={p.id} propiedad={p} />
            ))}
            {propiedadesQuery.datos?.propiedades.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin propiedades visibles para este tenant (si eres superadmin, verifica que tengas una concesión
                "romper cristal" vigente).
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FormularioPropiedad({ tenantId, onCreada }: { tenantId: string; onCreada: () => void }) {
  const [nombre, setNombre] = useState("");
  const [zonaHoraria, setZonaHoraria] = useState("America/Mexico_City");
  const [moneda, setMoneda] = useState("MXN");
  const [linea1, setLinea1] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [pais, setPais] = useState("MX");
  // `useMutacionLigera` memoiza `ejecutar` una sola vez (deps `[]`,
  // apps/web/src/lib/api/queryLigero.ts) — un `fn` sin parámetros que
  // cierra sobre estado local capturaría para siempre los valores del
  // PRIMER render. Se pasa el cuerpo completo como argumento de
  // `ejecutar` en el `onClick`, nunca cerrado sobre las variables.
  const crear = useMutacionLigera((cuerpo: Parameters<typeof crearPropiedad>[0]) => crearPropiedad(cuerpo));

  const completo = nombre && zonaHoraria && moneda.length === 3 && linea1 && ciudad && pais.length === 2;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alta de propiedad</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background w-40" />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Zona horaria (IANA)
          <input
            value={zonaHoraria}
            onChange={(e) => setZonaHoraria(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background w-44"
          />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Moneda
          <input
            value={moneda}
            onChange={(e) => setMoneda(e.target.value.toUpperCase())}
            maxLength={3}
            className="border rounded-md px-2 py-1 text-sm bg-background w-20"
          />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Dirección — línea 1
          <input value={linea1} onChange={(e) => setLinea1(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background w-48" />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Ciudad
          <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background w-36" />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          País (ISO alfa-2)
          <input
            value={pais}
            onChange={(e) => setPais(e.target.value.toUpperCase())}
            maxLength={2}
            className="border rounded-md px-2 py-1 text-sm bg-background w-16"
          />
        </label>
        <Button
          size="sm"
          disabled={!completo || crear.enCurso}
          onClick={async () => {
            await crear.ejecutar({ tenantId, nombre, zonaHoraria, moneda, direccion: { linea1, ciudad, pais } });
            setNombre("");
            setLinea1("");
            setCiudad("");
            onCreada();
          }}
        >
          Crear propiedad
        </Button>
        <AlertaError error={crear.error} />
      </CardContent>
    </Card>
  );
}

function PanelPropiedad({ propiedad }: { propiedad: PropiedadBackoffice }) {
  const unidadesQuery = useQueryLigero(() => listarUnidades(propiedad.id), [propiedad.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          {propiedad.nombre}
          <Badge variant="outline">{propiedad.zonaHoraria}</Badge>
          {propiedad.moneda && <Badge variant="outline">{propiedad.moneda}</Badge>}
        </CardTitle>
        {propiedad.direccion && (
          <p className="text-xs text-muted-foreground">
            {[propiedad.direccion.linea1, propiedad.direccion.ciudad, propiedad.direccion.pais]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <AlertaError error={unidadesQuery.error} />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidad</TableHead>
                <TableHead>Duración mínima (noches)</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(unidadesQuery.datos?.unidades ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.nombre}</TableCell>
                  <TableCell>{u.duracionMinimaNoches}</TableCell>
                  <TableCell>
                    <BotonEliminarUnidad id={u.id} onEliminada={() => unidadesQuery.recargar()} />
                  </TableCell>
                </TableRow>
              ))}
              {unidadesQuery.datos?.unidades.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                    Sin unidades todavía.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <FormularioUnidad propiedadId={propiedad.id} onCreadas={() => unidadesQuery.recargar()} />
      </CardContent>
    </Card>
  );
}

function BotonEliminarUnidad({ id, onEliminada }: { id: string; onEliminada: () => void }) {
  const eliminar = useMutacionLigera(() => eliminarUnidad(id));
  return (
    <BotonConfirmar
      etiqueta="Eliminar"
      disabled={eliminar.enCurso}
      onConfirmar={async () => {
        await eliminar.ejecutar();
        onEliminada();
      }}
    />
  );
}

function FormularioUnidad({ propiedadId, onCreadas }: { propiedadId: string; onCreadas: () => void }) {
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const crear = useMutacionLigera((nombreArg: string, cantidadArg: number) =>
    crearUnidades({ propiedadId, nombre: nombreArg, cantidad: cantidadArg }),
  );

  return (
    <div className="flex flex-wrap gap-2 items-end border-t border-border pt-3">
      <label className="text-xs text-muted-foreground flex flex-col gap-1">
        Nombre base
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Depa" className="border rounded-md px-2 py-1 text-sm bg-background w-36" />
      </label>
      <label className="text-xs text-muted-foreground flex flex-col gap-1">
        Cantidad
        <input
          type="number"
          min={1}
          max={50}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="border rounded-md px-2 py-1 text-sm bg-background w-20"
        />
      </label>
      <Button
        size="sm"
        disabled={!nombre || crear.enCurso}
        onClick={async () => {
          await crear.ejecutar(nombre, parseInt(cantidad, 10));
          setNombre("");
          setCantidad("1");
          onCreadas();
        }}
      >
        {parseInt(cantidad, 10) > 1 ? `Crear ${cantidad} unidades` : "Crear unidad"}
      </Button>
      <AlertaError error={crear.error} />
    </div>
  );
}
