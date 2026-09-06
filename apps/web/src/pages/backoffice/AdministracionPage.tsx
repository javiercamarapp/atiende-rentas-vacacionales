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
import type { ColaboradorNivel, RolUsuario } from "@atiende-rv/api/contrato";
import { useSesion } from "../../lib/sesion/SesionProvider";
import { useMutacionLigera, useQueryLigero } from "../../lib/api/queryLigero";
import { AlertaError } from "./components/AlertaError";
import { BotonConfirmar } from "./components/BotonConfirmar";
import {
  crearInvitacion,
  listarAuditoria,
  listarInvitaciones,
  listarTenants,
  listarUsuariosTenant,
  revocarInvitacion,
  type EntradaAuditoria,
} from "./api";

const ROLES: RolUsuario[] = ["admin_gestora", "operador", "limpieza", "propietario", "contador"];
const NIVELES: ColaboradorNivel[] = ["acceso_total", "calendario_mensajeria", "solo_calendario"];

/**
 * Administración de tenant: usuarios/roles con los 3 niveles de
 * colaborador, invitaciones (token devuelto UNA vez), y auditoría
 * consultable con filtros (§Auditoría-1). Carpeta exclusiva de Lote 8.
 */
export function AdministracionPage() {
  const { usuario } = useSesion();
  const [tenantIdSeleccionado, setTenantIdSeleccionado] = useState("");
  const tenantsQuery = useQueryLigero(
    () => (usuario?.rol === "superadmin" ? listarTenants() : Promise.resolve({ tenants: [] })),
    [usuario?.rol],
  );
  const tenantId = usuario?.rol === "superadmin" ? tenantIdSeleccionado : (usuario?.tenantId ?? "");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Administración</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios/roles, invitaciones de colaborador y auditoría consultable con filtros.
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

      {tenantId && (
        <>
          <PanelUsuarios tenantId={tenantId} />
          <PanelInvitaciones tenantId={tenantId} />
        </>
      )}

      <PanelAuditoria />
    </div>
  );
}

function PanelUsuarios({ tenantId }: { tenantId: string }) {
  const usuariosQuery = useQueryLigero(() => listarUsuariosTenant(tenantId), [tenantId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usuarios del tenant</CardTitle>
      </CardHeader>
      <CardContent>
        <AlertaError error={usuariosQuery.error} />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Nivel de colaborador</TableHead>
                <TableHead>Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usuariosQuery.datos?.usuarios ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.rol}</TableCell>
                  <TableCell>{u.colaboradorNivel ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={u.activo ? "default" : "outline"}>{u.activo ? "activo" : "inactivo"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PanelInvitaciones({ tenantId }: { tenantId: string }) {
  const invitacionesQuery = useQueryLigero(() => listarInvitaciones(tenantId), [tenantId]);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<RolUsuario>("operador");
  const [nivel, setNivel] = useState<ColaboradorNivel>("calendario_mensajeria");
  // `useMutacionLigera` memoiza `ejecutar` una sola vez (deps `[]`,
  // apps/web/src/lib/api/queryLigero.ts) — se pasa el cuerpo como
  // argumento de `ejecutar` en vez de cerrarlo sobre estado local.
  const crear = useMutacionLigera((cuerpo: Parameters<typeof crearInvitacion>[0]) => crearInvitacion(cuerpo, tenantId));
  const revocar = useMutacionLigera((id: string) => revocarInvitacion(id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invitaciones de colaborador</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm bg-background w-56"
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value as RolUsuario)} className="border rounded-md px-2 py-1 text-sm bg-background">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {rol === "operador" && (
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              Nivel de colaborador
              <select value={nivel} onChange={(e) => setNivel(e.target.value as ColaboradorNivel)} className="border rounded-md px-2 py-1 text-sm bg-background">
                {NIVELES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            size="sm"
            disabled={!email || crear.enCurso}
            onClick={async () => {
              await crear.ejecutar({ email, rol, colaboradorNivel: rol === "operador" ? nivel : undefined });
              setEmail("");
              invitacionesQuery.recargar();
            }}
          >
            Invitar
          </Button>
        </div>
        <AlertaError error={crear.error ?? invitacionesQuery.error} />
        {crear.datos?.token && (
          <p className="text-xs rounded-md border border-border bg-muted px-3 py-2 font-mono break-all">
            Token de invitación (se muestra UNA sola vez, cópialo ahora): {crear.datos.token}
          </p>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invitacionesQuery.datos?.invitaciones ?? []).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.email}</TableCell>
                  <TableCell>{inv.rol}</TableCell>
                  <TableCell>{new Date(inv.expiraEn).toLocaleString()}</TableCell>
                  <TableCell>
                    {inv.aceptadaEn ? (
                      <Badge>aceptada</Badge>
                    ) : inv.revocadaEn ? (
                      <Badge variant="outline">revocada</Badge>
                    ) : (
                      <Badge variant="outline">pendiente</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!inv.aceptadaEn && !inv.revocadaEn && (
                      <BotonConfirmar
                        etiqueta="Revocar"
                        disabled={revocar.enCurso}
                        onConfirmar={async () => {
                          await revocar.ejecutar(inv.id);
                          invitacionesQuery.recargar();
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PanelAuditoria() {
  const [tabla, setTabla] = useState("");
  const [operacion, setOperacion] = useState("");
  const auditoriaQuery = useQueryLigero(
    () => listarAuditoria({ tabla: tabla || undefined, operacion: operacion || undefined, tamano: 20 }),
    [tabla, operacion],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auditoría (§Auditoría-1)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Tabla
            <input value={tabla} onChange={(e) => setTabla(e.target.value)} placeholder="p. ej. propiedad" className="border rounded-md px-2 py-1 text-sm bg-background w-40" />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Operación
            <select value={operacion} onChange={(e) => setOperacion(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-background">
              <option value="">Todas</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="ACCESO_ROMPER_CRISTAL">ACCESO_ROMPER_CRISTAL</option>
            </select>
          </label>
        </div>
        <AlertaError error={auditoriaQuery.error} />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tabla</TableHead>
                <TableHead>Operación</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(auditoriaQuery.datos?.entradas ?? []).map((e: EntradaAuditoria) => (
                <TableRow key={e.id}>
                  <TableCell>{new Date(e.creadoEn).toLocaleString()}</TableCell>
                  <TableCell>{e.tabla}</TableCell>
                  <TableCell>
                    <Badge variant={e.operacion === "ACCESO_ROMPER_CRISTAL" ? "destructive" : "outline"}>
                      {e.operacion}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.actorId ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate">
                    {JSON.stringify(e.valoresNuevos ?? e.valoresPrevios ?? {})}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
