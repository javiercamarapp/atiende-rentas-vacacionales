import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EstadoConexionBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@atiende-rv/ui-atiende";
import type { EstadoConexionCanal } from "@atiende-rv/ui-atiende";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { AlertaError } from "./components/AlertaError";
import { crearCuentaCanal, listarCuentasCanal, listarTenants } from "./api";

/** El contrato de Lote 3 (`EstadoConexionCanalContrato`) usa
 * `partner_pendiente`; el badge portado de Restaurantes (`EstadoConexionCanal`
 * en ui-atiende, Lote 0) usa `bloqueado_por_partner` para el mismo
 * concepto — reconciliado localmente (copia deliberada del patrón ya
 * usado en `apps/web/src/pages/conectividad/estadoConexion.ts`, Lote 4,
 * sin importar entre carpetas exclusivas de lotes distintos). */
function aEstadoBadge(estado: string): EstadoConexionCanal {
  if (estado === "partner_pendiente") return "bloqueado_por_partner";
  return estado as EstadoConexionCanal;
}

const CANALES = ["airbnb", "vrbo", "booking", "manual"] as const;
const TIPOS_CONEXION = [
  { valor: "ical", etiqueta: "iCal import/export" },
  { valor: "partner_pendiente", etiqueta: "Partner directo (pendiente)" },
  { valor: "simulador", etiqueta: "Simulador (solo desarrollo)" },
] as const;

/**
 * Alta de cuentas de canal con tipo de conexión HONESTO (H-011/H-012,
 * D-017/D-019, regla de oro de docs/fase2/DEFINICION-DE-HECHO.md §1):
 * nunca se presenta un simulador como conexión productiva, ni un
 * "partner directo" como si fuera cuestión de tiempo sin motivo
 * explícito. Las credenciales NUNCA se muestran — solo "configurada" /
 * "no configurada" (§RV19/21-13).
 */
export function CuentasCanalPage() {
  const { usuario } = useSesion();
  const [tenantIdSeleccionado, setTenantIdSeleccionado] = useState("");
  const tenantsQuery = useQueryLigero(
    () => (usuario?.rol === "superadmin" ? listarTenants() : Promise.resolve({ tenants: [] })),
    [usuario?.rol],
  );
  const tenantId = usuario?.rol === "superadmin" ? tenantIdSeleccionado : (usuario?.tenantId ?? "");

  const cuentasQuery = useQueryLigero(
    () => (tenantId ? listarCuentasCanal(tenantId) : Promise.resolve({ cuentas: [] })),
    [tenantId],
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Cuentas de canal</h1>
        <p className="text-sm text-muted-foreground">
          Tipo de conexión honesto: iCal import/export, partner pendiente (con motivo) o simulador — bloqueado
          fuera de development/test. Las credenciales nunca se muestran en claro.
        </p>
      </div>

      {usuario?.rol === "superadmin" && (
        <label className="text-xs text-muted-foreground flex flex-col gap-1 max-w-sm">
          Tenant (requiere concesión "romper cristal" vigente)
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

      <AlertaError error={cuentasQuery.error} />

      {tenantId && (
        <>
          <FormularioCuentaCanal tenantId={tenantId} onCreada={() => cuentasQuery.recargar()} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cuentas del tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo de conexión</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Credenciales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(cuentasQuery.datos?.cuentas ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="capitalize">{c.canalCodigo}</TableCell>
                        <TableCell>{c.nombre}</TableCell>
                        <TableCell>
                          {c.tipoConexion ?? "—"}
                          {c.motivoPartnerPendiente && (
                            <p className="text-[11px] text-muted-foreground">{c.motivoPartnerPendiente}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <EstadoConexionBadge estado={aEstadoBadge(c.estadoConexion)} />
                          {c.esSimulador && (
                            <p className="text-[10px] font-mono uppercase tracking-wide text-amber-700 mt-0.5">
                              SIMULADOR — desarrollo/pruebas
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.credencialesConfiguradas ? "default" : "outline"}>
                            {c.credencialesConfiguradas ? "configurada" : "no configurada"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {cuentasQuery.datos?.cuentas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                          Sin cuentas de canal todavía.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function FormularioCuentaCanal({ tenantId, onCreada }: { tenantId: string; onCreada: () => void }) {
  const [canalCodigo, setCanalCodigo] = useState<(typeof CANALES)[number]>("airbnb");
  const [nombre, setNombre] = useState("");
  const [tipoConexion, setTipoConexion] = useState<(typeof TIPOS_CONEXION)[number]["valor"]>("ical");
  const [motivoPartnerPendiente, setMotivoPartnerPendiente] = useState("");
  const [apiKey, setApiKey] = useState("");
  // `useMutacionLigera` memoiza `ejecutar` una sola vez (deps `[]`,
  // apps/web/src/lib/api/queryLigero.ts) — se pasa el cuerpo completo
  // como argumento de `ejecutar` en vez de cerrarlo sobre estado local
  // (que quedaría fijo en los valores del primer render).
  const crear = useMutacionLigera((cuerpo: Parameters<typeof crearCuentaCanal>[0]) => crearCuentaCanal(cuerpo));

  const requiereMotivo = tipoConexion === "partner_pendiente";
  const completo = nombre && (!requiereMotivo || motivoPartnerPendiente);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alta de cuenta de canal</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 items-end">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Canal
          <select value={canalCodigo} onChange={(e) => setCanalCodigo(e.target.value as typeof canalCodigo)} className="border rounded-md px-2 py-1 text-sm bg-background">
            {CANALES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background w-40" />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Tipo de conexión
          <select
            value={tipoConexion}
            onChange={(e) => setTipoConexion(e.target.value as typeof tipoConexion)}
            className="border rounded-md px-2 py-1 text-sm bg-background"
          >
            {TIPOS_CONEXION.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {requiereMotivo && (
          <label className="text-xs text-muted-foreground flex flex-col gap-1 flex-1 min-w-[16rem]">
            Motivo (obligatorio para partner pendiente)
            <input
              value={motivoPartnerPendiente}
              onChange={(e) => setMotivoPartnerPendiente(e.target.value)}
              placeholder='p. ej. "pausado por el canal — connect.booking.com"'
              className="border rounded-md px-2 py-1 text-sm bg-background"
            />
          </label>
        )}
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          Credencial (API key, opcional)
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-background w-40"
          />
        </label>
        <Button
          size="sm"
          disabled={!completo || crear.enCurso}
          onClick={async () => {
            await crear.ejecutar({
              tenantId,
              canalCodigo,
              nombre,
              tipoConexion,
              motivoPartnerPendiente: tipoConexion === "partner_pendiente" ? motivoPartnerPendiente : undefined,
              credenciales: apiKey ? { apiKey } : undefined,
            });
            setNombre("");
            setMotivoPartnerPendiente("");
            setApiKey("");
            onCreada();
          }}
        >
          Crear cuenta
        </Button>
        <AlertaError error={crear.error} />
      </CardContent>
    </Card>
  );
}
