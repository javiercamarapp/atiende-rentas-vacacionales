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
import { useSesion } from "../../lib/sesion/SesionProvider";
import { ErrorApiAlerta } from "../calendario/components/ErrorApiAlerta";
import {
  auditoriaFlagAgente,
  establecerFlagAgente,
  listarFlagsAgentes,
  listarToolsAgentes,
  listarTrazasAgentes,
  obtenerCuotaAgente,
} from "./api";

const ROLES_ADMIN = ["superadmin", "admin_gestora"] as const;
const ID_FLAG_HABILITADO = "agentes.habilitado";

const ETIQUETA_EFECTO: Record<string, string> = {
  lectura: "Solo lectura",
  propuesta_aprobacion: "Propuesta — requiere aprobación humana",
};

/**
 * Página de Automatización agéntica (Auditoría 2, corrección P-01): antes
 * de esta corrección el ítem de menú "Automatización agéntica" no tenía
 * `ruta` (quedaba "Pronto" para siempre) pese a que el backend de Lote 9
 * (catálogo de tools, cuotas, escalamiento, evals — todo con test) ya
 * estaba completo. Esta pantalla es la única forma de producto de ver el
 * flag `agentes.habilitado` por tenant, el catálogo de tools con su
 * efecto/roles, la cuota consumida y las trazas de tool-calls — sin ella,
 * la transparencia de automatización que exige RV18/ACEPTACION
 * §Automatización-1/2/3 solo era verificable con acceso directo a BD/API.
 */
export function AgentesPage() {
  const { usuario } = useSesion();
  const esAdmin = usuario ? (ROLES_ADMIN as readonly string[]).includes(usuario.rol) : false;

  const flagsQuery = useQueryLigero(() => listarFlagsAgentes(), []);
  const toolsQuery = useQueryLigero(() => listarToolsAgentes(), []);
  const cuotaQuery = useQueryLigero(() => obtenerCuotaAgente(), []);
  const [pagina, setPagina] = useState(1);
  const trazasQuery = useQueryLigero(() => listarTrazasAgentes(pagina, 20), [pagina]);

  const flagHabilitado = flagsQuery.datos?.flags.find((f) => f.id === ID_FLAG_HABILITADO);
  const trazas = trazasQuery.datos?.trazas ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-display font-semibold">Automatización agéntica</h1>
        <p className="text-sm text-muted-foreground">
          Estado del flag por tenant, catálogo de tools disponibles, cuota de IA y trazabilidad de tool-calls.
        </p>
      </div>

      <div
        role="note"
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-400"
      >
        Toda propuesta de un agente (borrador de mensaje, tarea de limpieza, bloqueo) requiere aprobación humana
        explícita antes de tener efecto — ninguna tool de este catálogo puede cancelar una reserva ni contactar a un
        huésped directamente.
      </div>

      <ErrorApiAlerta error={flagsQuery.error ?? toolsQuery.error ?? cuotaQuery.error ?? trazasQuery.error} />

      <PanelFlagAgentes flag={flagHabilitado} esAdmin={esAdmin} onCambio={() => flagsQuery.recargar()} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cuota de IA del tenant</CardTitle>
        </CardHeader>
        <CardContent>
          {cuotaQuery.datos ? (
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Tokens restantes</dt>
                <dd className="font-mono">{cuotaQuery.datos.tokensRestantes.toLocaleString("es-MX")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Techo de tokens</dt>
                <dd className="font-mono">{cuotaQuery.datos.techoTokensPeriodo.toLocaleString("es-MX")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Llamadas restantes</dt>
                <dd className="font-mono">{cuotaQuery.datos.llamadasRestantes.toLocaleString("es-MX")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Periodo inicia</dt>
                <dd className="font-mono">{new Date(cuotaQuery.datos.periodoIniciaEn).toLocaleDateString("es-MX")}</dd>
              </div>
            </dl>
          ) : (
            !cuotaQuery.cargando && <p className="text-sm text-muted-foreground">Este tenant no tiene presupuesto de IA configurado.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Catálogo de tools ({toolsQuery.datos?.tools.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead>Efecto</TableHead>
                  <TableHead>Roles permitidos</TableHead>
                  <TableHead>Usa LLM</TableHead>
                  <TableHead>Máx./conversación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(toolsQuery.datos?.tools ?? []).map((tool) => (
                  <TableRow key={tool.nombre}>
                    <TableCell>
                      <p className="font-mono text-xs">{tool.nombre}</p>
                      <p className="text-[11px] text-muted-foreground max-w-md">{tool.descripcion}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tool.efecto === "lectura" ? "outline" : "secondary"}>
                        {ETIQUETA_EFECTO[tool.efecto] ?? tool.efecto}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {tool.rolesPermitidos.join(", ")}
                      {tool.nivelesColaboradorPermitidos && (
                        <p className="text-[11px] text-muted-foreground">
                          Operador: {tool.nivelesColaboradorPermitidos.join(", ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{tool.requiereLlm ? "Sí" : "No"}</TableCell>
                    <TableCell className="text-xs">{tool.maxLlamadasPorConversacion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Trazas de tool-calls (página {pagina})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!trazasQuery.cargando && trazas.length === 0 && pagina === 1 ? (
            <p className="text-sm text-muted-foreground">Sin tool-calls registradas todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Rol actor</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Costo (USD)</TableHead>
                    <TableHead>Cuándo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trazas.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.toolNombre}</TableCell>
                      <TableCell className="text-xs">{t.rolActor}</TableCell>
                      <TableCell className="text-xs">{t.canal}</TableCell>
                      <TableCell className="text-xs">{t.resultado}</TableCell>
                      <TableCell className="text-xs">{t.duracionMs} ms</TableCell>
                      <TableCell className="text-xs">${t.costoUsdReal.toFixed(4)}</TableCell>
                      <TableCell className="text-xs">{new Date(t.creadoEn).toLocaleString("es-MX")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={trazas.length < 20} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Toggle admin-only del flag `agentes.habilitado` con motivo obligatorio
 * (mismo patrón de auditoría que `PanelFlags` de `SuperadminPage.tsx`) —
 * un operador ve el estado pero el botón de cambiarlo no se renderiza para
 * su rol (defensa en profundidad: el backend también rechaza el PATCH). */
function PanelFlagAgentes({
  flag,
  esAdmin,
  onCambio,
}: {
  flag: { id: string; descripcion: string; valorEfectivo: boolean } | undefined;
  esAdmin: boolean;
  onCambio: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [verAuditoria, setVerAuditoria] = useState(false);
  const auditoriaQuery = useQueryLigero(
    () => (verAuditoria && flag ? auditoriaFlagAgente(flag.id) : Promise.resolve({ entradas: [] })),
    [verAuditoria, flag?.id],
  );
  const cambiar = useMutacionLigera((valor: boolean) =>
    establecerFlagAgente(ID_FLAG_HABILITADO, { valor, motivo }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Flag: agentes.habilitado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!flag ? (
          <p className="text-sm text-muted-foreground">Cargando estado del flag…</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={flag.valorEfectivo ? "default" : "outline"}>
                {flag.valorEfectivo ? "Activo" : "Inactivo (default-off)"}
              </Badge>
              <p className="text-xs text-muted-foreground">{flag.descripcion}</p>
            </div>

            {esAdmin && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground flex flex-col gap-1">
                  Motivo del cambio (auditoría)
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="ej. piloto habilitado para este tenant"
                    className="border rounded-md px-2 py-1 text-sm bg-background w-72"
                  />
                </label>
                <Button
                  size="sm"
                  disabled={!motivo.trim() || cambiar.enCurso}
                  onClick={async () => {
                    await cambiar.ejecutar(!flag.valorEfectivo);
                    setMotivo("");
                    onCambio();
                  }}
                >
                  {flag.valorEfectivo ? "Desactivar" : "Activar"}
                </Button>
                <ErrorApiAlerta error={cambiar.error} />
              </div>
            )}

            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setVerAuditoria((v) => !v)}
            >
              {verAuditoria ? "Ocultar auditoría" : "Ver auditoría de cambios"}
            </button>

            {verAuditoria && (
              <ul className="text-xs space-y-1 border-t border-border pt-2">
                {(auditoriaQuery.datos?.entradas ?? []).length === 0 ? (
                  <li className="text-muted-foreground">Sin cambios registrados todavía.</li>
                ) : (
                  auditoriaQuery.datos!.entradas.map((e, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="font-mono">{new Date(e.en).toLocaleString("es-MX")}</span> — {e.actor} cambió{" "}
                      {String(e.valorAnterior)} → {String(e.valor)}: "{e.motivo}"
                    </li>
                  ))
                )}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
