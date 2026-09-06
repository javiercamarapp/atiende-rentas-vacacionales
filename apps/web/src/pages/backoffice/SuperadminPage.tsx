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
import { BotonConfirmar } from "./components/BotonConfirmar";
import {
  activarTenant,
  crearAccesoRomperCristal,
  crearTenant,
  establecerFlag,
  listarAccesosRomperCristal,
  listarFlags,
  listarTenants,
  revocarAccesoRomperCristal,
  suspenderTenant,
} from "./api";

/**
 * Panel Superadmin Atiende (H-074/H-075/H-076, LOTES.md Lote 8):
 * directorio de tenants con métricas agregadas (visible sin concesión),
 * alta/suspensión/reactivación, gestión de "romper cristal" (motivo +
 * ventana acotada, con banner persistente mientras hay una concesión
 * vigente) y feature flags por tenant. Visualmente separado del resto del
 * panel (franja superior oscura + rótulo "SUPERADMIN"): nunca se confunde
 * con la vista de administración de un tenant concreto.
 */
export function SuperadminPage() {
  const tenantsQuery = useQueryLigero(() => listarTenants(), []);
  const accesosQuery = useQueryLigero(() => listarAccesosRomperCristal(), []);

  return (
    <div className="min-h-full">
      <div className="bg-slate-900 text-slate-100 px-4 md:px-6 py-3 flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] bg-slate-100/10 border border-slate-100/30 rounded px-2 py-0.5">
          Superadmin
        </span>
        <h1 className="text-sm font-display font-semibold">Atiende — plataforma multi-tenant</h1>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        <BannerAccesosActivos accesos={accesosQuery.datos?.accesos ?? []} onCambio={() => accesosQuery.recargar()} />

        <AlertaError error={tenantsQuery.error} />

        <PanelCrearTenant onCreado={() => tenantsQuery.recargar()} />

        <PanelRomperCristal
          tenants={tenantsQuery.datos?.tenants ?? []}
          onCreado={() => accesosQuery.recargar()}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Directorio de tenants ({tenantsQuery.datos?.tenants.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Unidades</TableHead>
                    <TableHead>Cuentas de canal</TableHead>
                    <TableHead>Alertas abiertas</TableHead>
                    <TableHead>Outbox pendiente</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tenantsQuery.datos?.tenants ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.nombre}</TableCell>
                      <TableCell>
                        <Badge variant={t.estado === "activo" ? "default" : "outline"}>{t.estado}</Badge>
                        {t.suspendidoMotivo && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{t.suspendidoMotivo}</p>
                        )}
                      </TableCell>
                      <TableCell>{t.metricas.unidadesTotal}</TableCell>
                      <TableCell>
                        {t.metricas.cuentasCanalConfiguradas}/{t.metricas.cuentasCanalTotal} configuradas
                        {t.metricas.cuentasCanalSimulador > 0 && (
                          <span className="text-[11px] text-muted-foreground"> ({t.metricas.cuentasCanalSimulador} simulador)</span>
                        )}
                      </TableCell>
                      <TableCell>{t.metricas.alertasAbiertas}</TableCell>
                      <TableCell>{t.metricas.outboxPendiente}</TableCell>
                      <TableCell>
                        <AccionesTenant tenantId={t.id} estado={t.estado} onCambio={() => tenantsQuery.recargar()} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {tenantsQuery.datos?.tenants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm">
                        Sin tenants todavía.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <PanelFlags />
      </div>
    </div>
  );
}

/** Banner persistente (H-075) mientras haya al menos una concesión
 * "romper cristal" vigente — visible sin scroll, con motivo y expiración. */
function BannerAccesosActivos({
  accesos,
  onCambio,
}: {
  accesos: { id: string; tenantId: string; motivo: string; expiraEn: string }[];
  onCambio: () => void;
}) {
  const revocar = useMutacionLigera((id: string) => revocarAccesoRomperCristal(id));
  if (accesos.length === 0) return null;

  return (
    <div role="status" className="rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        Acceso "romper cristal" activo — {accesos.length} concesión(es) vigente(s)
      </p>
      <ul className="space-y-1">
        {accesos.map((a) => (
          <li key={a.id} className="text-xs flex flex-wrap items-center gap-2 justify-between">
            <span>
              Tenant <span className="font-mono">{a.tenantId}</span> — motivo: "{a.motivo}" — expira{" "}
              {new Date(a.expiraEn).toLocaleString()}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={revocar.enCurso}
              onClick={async () => {
                await revocar.ejecutar(a.id);
                onCambio();
              }}
            >
              Revocar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelCrearTenant({ onCreado }: { onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  // `useMutacionLigera` memoiza `ejecutar` una sola vez (deps `[]`,
  // apps/web/src/lib/api/queryLigero.ts) — un `fn` que cierra sobre estado
  // local capturaría para siempre los valores del PRIMER render (siempre
  // cadenas vacías). Se pasan los valores como argumentos de `ejecutar`
  // en vez de cerrarlos, mismo patrón ya usado por `establecerFlag`/
  // `revocarAccesoRomperCristal` en este mismo archivo.
  const crear = useMutacionLigera((nombreArg: string, razonSocialArg: string) =>
    crearTenant({ nombre: nombreArg, razonSocial: razonSocialArg }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alta de tenant</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background w-48"
          />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Razón social
          <input
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background w-56"
          />
        </label>
        <Button
          size="sm"
          disabled={!nombre || !razonSocial || crear.enCurso}
          onClick={async () => {
            await crear.ejecutar(nombre, razonSocial);
            setNombre("");
            setRazonSocial("");
            onCreado();
          }}
        >
          Crear tenant
        </Button>
        <AlertaError error={crear.error} />
      </CardContent>
    </Card>
  );
}

function AccionesTenant({
  tenantId,
  estado,
  onCambio,
}: {
  tenantId: string;
  estado: "activo" | "suspendido";
  onCambio: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const suspender = useMutacionLigera((motivoArg: string) => suspenderTenant(tenantId, { motivo: motivoArg }));
  const activar = useMutacionLigera(() => activarTenant(tenantId));

  if (estado === "suspendido") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={activar.enCurso}
        onClick={async () => {
          await activar.ejecutar();
          onCambio();
        }}
      >
        Reactivar
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo de suspensión"
        className="border rounded-md px-2 py-1 text-xs bg-background w-40"
      />
      <BotonConfirmar
        etiqueta="Suspender"
        disabled={!motivo || suspender.enCurso}
        onConfirmar={async () => {
          await suspender.ejecutar(motivo);
          setMotivo("");
          onCambio();
        }}
      />
      <AlertaError error={suspender.error} />
    </div>
  );
}

/** Alta de concesión "romper cristal": motivo obligatorio + ventana
 * temporal acotada (minutos, máx. 24h) — H-075. */
function PanelRomperCristal({
  tenants,
  onCreado,
}: {
  tenants: { id: string; nombre: string }[];
  onCreado: () => void;
}) {
  const [tenantId, setTenantId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [minutos, setMinutos] = useState("30");
  const crear = useMutacionLigera((tenantIdArg: string, motivoArg: string, minutosArg: number) =>
    crearAccesoRomperCristal({ tenantId: tenantIdArg, motivo: motivoArg, minutos: minutosArg }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acceso "romper cristal"</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Tenant
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background min-w-[12rem]"
          >
            <option value="">Selecciona un tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1 flex-1 min-w-[16rem]">
          Motivo (obligatorio)
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="p. ej. Investigación de ticket de soporte #123"
            className="border rounded-md px-2 py-1 text-sm bg-background"
          />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Minutos
          <input
            type="number"
            min={1}
            max={1440}
            value={minutos}
            onChange={(e) => setMinutos(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background w-24"
          />
        </label>
        <BotonConfirmar
          etiqueta="Romper cristal"
          etiquetaConfirmar="¿Confirmar acceso auditado?"
          variante="default"
          disabled={!tenantId || !motivo || crear.enCurso}
          onConfirmar={async () => {
            await crear.ejecutar(tenantId, motivo, parseInt(minutos, 10));
            setMotivo("");
            onCreado();
          }}
        />
        <AlertaError error={crear.error} />
      </CardContent>
    </Card>
  );
}

function PanelFlags() {
  const flagsQuery = useQueryLigero(() => listarFlags(), []);
  const cambiar = useMutacionLigera((id: string, valor: boolean, motivo: string) =>
    establecerFlag(id, { valor, motivo }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feature flags (globales)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <AlertaError error={flagsQuery.error ?? cambiar.error} />
        {(flagsQuery.datos?.flags ?? []).map((f) => (
          <FilaFlag
            key={f.id}
            flag={f}
            enCurso={cambiar.enCurso}
            onCambiar={async (valor, motivo) => {
              await cambiar.ejecutar(f.id, valor, motivo);
              flagsQuery.recargar();
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function FilaFlag({
  flag,
  enCurso,
  onCambiar,
}: {
  flag: { id: string; descripcion: string; categoriaRiesgo: string; valorGlobal: boolean };
  enCurso: boolean;
  onCambiar: (valor: boolean, motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-0">
      <Badge variant={flag.valorGlobal ? "default" : "outline"}>{flag.valorGlobal ? "activo" : "inactivo"}</Badge>
      <div className="flex-1 min-w-[16rem]">
        <p className="text-sm font-mono">{flag.id}</p>
        <p className="text-xs text-muted-foreground">{flag.descripcion}</p>
      </div>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo del cambio"
        className="border rounded-md px-2 py-1 text-xs bg-background w-48"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!motivo || enCurso}
        onClick={() => onCambiar(!flag.valorGlobal, motivo)}
      >
        {flag.valorGlobal ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}
