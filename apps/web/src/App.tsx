import { Navigate, Route, Routes } from "react-router-dom";
import { SeccionVacia } from "./pages/SeccionVacia";
import { LoginPage } from "./pages/auth/LoginPage";
import { CalendarioMaestroPage } from "./pages/calendario/CalendarioMaestroPage";
import { MatrizConectividadPage } from "./pages/conectividad/MatrizConectividadPage";
import { MonitorSyncPage } from "./pages/monitor-sync/MonitorSyncPage";
import { ConflictosPage } from "./pages/monitor-sync/ConflictosPage";
import { AlertasPage } from "./pages/monitor-sync/AlertasPage";
import { OperacionPage } from "./pages/limpieza/OperacionPage";
import { BandejaPage } from "./pages/mensajeria/BandejaPage";
import { HiloPage } from "./pages/mensajeria/HiloPage";
import { PlantillasPage } from "./pages/mensajeria/PlantillasPage";
import { FinanzasPage } from "./pages/finanzas/FinanzasPage";
import { PricingPage } from "./pages/pricing/PricingPage";
import { ReportesPage } from "./pages/reportes/ReportesPage";
import { SuperadminPage } from "./pages/backoffice/SuperadminPage";
import { PropiedadesPage } from "./pages/backoffice/PropiedadesPage";
import { CuentasCanalPage } from "./pages/backoffice/CuentasCanalPage";
import { AdministracionPage } from "./pages/backoffice/AdministracionPage";
import { AdminLayout } from "./components/admin/AdminLayout";
import { RutaProtegida } from "./components/admin/RutaProtegida";
import { SesionProvider } from "./lib/sesion/SesionProvider";
import { BookOpenCheck } from "lucide-react";

// Router de apps/web — punto de fusión compartido documentado en
// docs/fase2/LOTES.md (cabecera): cada lote añade sus propias rutas sin
// reescribir las de los demás. Lote 4 sustituye el `DevShellNav`
// provisional de Lote 0 por el `AdminLayout`/`AdminSidebar` real y aporta
// las 3 rutas de este lote (protegidas por sesión real contra la API de
// Lote 3); las demás secciones siguen como `SeccionVacia` hasta que su
// lote de origen las construya.
export default function App() {
  return (
    <SesionProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RutaProtegida>
              <AdminLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/calendario" replace />} />
                  <Route path="/calendario" element={<CalendarioMaestroPage />} />
                  <Route path="/conectividad" element={<MatrizConectividadPage />} />
                  <Route path="/monitor-sync" element={<MonitorSyncPage />} />
                  <Route path="/monitor-sync/conflictos" element={<ConflictosPage />} />
                  <Route path="/monitor-sync/alertas" element={<AlertasPage />} />
                  <Route path="/propiedades" element={<PropiedadesPage />} />
                  <Route path="/cuentas-canal" element={<CuentasCanalPage />} />
                  <Route
                    path="/reservas"
                    element={<SeccionVacia titulo="Reservas" icono={BookOpenCheck} lote="Lote 3" />}
                  />
                  <Route path="/operacion" element={<OperacionPage />} />
                  <Route path="/mensajes" element={<BandejaPage />} />
                  <Route path="/mensajes/plantillas" element={<PlantillasPage />} />
                  <Route path="/mensajes/:id" element={<HiloPage />} />
                  <Route path="/finanzas" element={<FinanzasPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/reportes" element={<ReportesPage />} />
                  <Route path="/administracion" element={<AdministracionPage />} />
                  <Route path="/backoffice/superadmin" element={<SuperadminPage />} />
                  <Route path="*" element={<Navigate to="/calendario" replace />} />
                </Routes>
              </AdminLayout>
            </RutaProtegida>
          }
        />
      </Routes>
    </SesionProvider>
  );
}
