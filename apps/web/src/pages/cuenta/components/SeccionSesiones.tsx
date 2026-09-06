import { useCallback, useEffect, useState } from "react";
import {
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
import { useSesion } from "../../../lib/sesion/SesionProvider";
import { listarSesiones, logoutGlobal, revocarSesion, type SesionActiva } from "../../../auth/api";

function formatoFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function SeccionSesiones() {
  const { logout } = useSesion();
  const [sesiones, setSesiones] = useState<SesionActiva[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    listarSesiones()
      .then((r) => setSesiones(r.sesiones))
      .catch(() => setError("No se pudieron cargar las sesiones activas."));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function alRevocar(id: string) {
    await revocarSesion(id).catch(() => undefined);
    cargar();
  }

  async function alCerrarTodas() {
    await logoutGlobal().catch(() => undefined);
    await logout();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sesiones activas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {sesiones && sesiones.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dispositivo/cliente</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sesiones.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.dispositivoEtiqueta ?? s.aud} {s.actual && <span className="text-xs text-muted-foreground">(esta sesión)</span>}
                  </TableCell>
                  <TableCell>{formatoFecha(s.creadoEn)}</TableCell>
                  <TableCell>{formatoFecha(s.expiraEn)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => alRevocar(s.id)}>
                      Revocar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {sesiones && sesiones.length === 0 && <p className="text-sm text-muted-foreground">No hay sesiones activas.</p>}
        <Button variant="outline" onClick={alCerrarTodas}>
          Cerrar todas las sesiones
        </Button>
      </CardContent>
    </Card>
  );
}
