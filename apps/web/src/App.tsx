import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/publica/LandingPage";
import { PreciosPage } from "./pages/publica/PreciosPage";
import { EstadoPage } from "./pages/publica/EstadoPage";
import { AvisoPrivacidadPage } from "./pages/publica/legal/AvisoPrivacidadPage";
import { TerminosPage } from "./pages/publica/legal/TerminosPage";
import { CookiesPage } from "./pages/publica/legal/CookiesPage";
import { DpaPage } from "./pages/publica/legal/DpaPage";
import { OnboardingRegistroPage } from "./pages/onboarding/OnboardingRegistroPage";
import { OnboardingAsistentePage } from "./pages/onboarding/OnboardingAsistentePage";
import { FacturacionPage } from "./pages/facturacion/FacturacionPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegistroPage } from "./pages/auth/RegistroPage";
import { VerificarCorreoPage } from "./pages/auth/VerificarCorreoPage";
import { OlvidePasswordPage } from "./pages/auth/OlvidePasswordPage";
import { RestablecerPasswordPage } from "./pages/auth/RestablecerPasswordPage";
import { GoogleCompletadoPage } from "./pages/auth/GoogleCompletadoPage";
import { CuentaPage } from "./pages/cuenta/CuentaPage";
import { CalendarioMaestroPage } from "./pages/calendario/CalendarioMaestroPage";
import { MatrizConectividadPage } from "./pages/conectividad/MatrizConectividadPage";
import { MatrizCanalesPage } from "./pages/canales/MatrizCanalesPage";
import { AsistenteConexionPage } from "./pages/canales/AsistenteConexionPage";
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
import { AgentesPage } from "./pages/agentes/AgentesPage";
import { SolicitudesArcoPage } from "./pages/legal/SolicitudesArcoPage";
import { AdminLayout } from "./components/admin/AdminLayout";
import { RutaProtegida } from "./components/admin/RutaProtegida";
import { RutaConRol } from "./components/admin/RutaConRol";
import { SesionProvider } from "./lib/sesion/SesionProvider";
import { ROLES_ADMIN } from "./lib/roles";

// Router de apps/web — punto de fusión compartido documentado en
// docs/fase2/LOTES.md (cabecera): cada lote añade sus propias rutas sin
// reescribir las de los demás. Lote 4 sustituye el `DevShellNav`
// provisional de Lote 0 por el `AdminLayout`/`AdminSidebar` real y aporta
// las 3 rutas de este lote (protegidas por sesión real contra la API de
// Lote 3); las demás secciones siguen como `SeccionVacia` hasta que su
// lote de origen las construya.
//
// Auditoría 2, corrección Q-05 (calidad-codigo.md): `/reservas` era el
// último placeholder `SeccionVacia` del router, pese a que la feature de
// reservas está completa (packages/domain/src/aplicacion/reservas.ts,
// apps/api/src/routes/reservas.ts) y vive dentro del calendario maestro
// (`ModalCrearReserva.tsx`, enlazado desde `PanelSeleccion.tsx`) — nunca
// tuvo su propia pantalla dedicada ni un ítem de menú que apuntara ahí.
// Se redirige a `/calendario` en vez de dejar un "sección sin contenido"
// que sugeriría una feature rota; el import de `SeccionVacia` ya no se
// usa en ningún otro lugar de este archivo.
export default function App() {
  return (
    <SesionProvider>
      <Routes>
        {/* Lote 3.3 — sitio público (landing/precios/estado/legal) +
            paso 1 de onboarding self-serve, todos ANTES del catch-all
            `/*` protegido por sesión (RutaProtegida) — nunca exigen
            login. `LandingPage` internamente redirige a /calendario si
            ya hay sesión, para no romper el atajo histórico de "/" =
            "entra a la app" para usuarios ya logueados. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/precios" element={<PreciosPage />} />
        <Route path="/estado" element={<EstadoPage />} />
        <Route path="/legal/aviso-de-privacidad" element={<AvisoPrivacidadPage />} />
        <Route path="/legal/terminos" element={<TerminosPage />} />
        <Route path="/legal/cookies" element={<CookiesPage />} />
        <Route path="/legal/dpa" element={<DpaPage />} />
        <Route path="/onboarding" element={<OnboardingRegistroPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegistroPage />} />
        <Route path="/verificar-correo" element={<VerificarCorreoPage />} />
        <Route path="/olvide-password" element={<OlvidePasswordPage />} />
        <Route path="/restablecer-password" element={<RestablecerPasswordPage />} />
        <Route path="/auth/google/completado" element={<GoogleCompletadoPage />} />
        <Route
          path="/*"
          element={
            <RutaProtegida>
              <AdminLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/calendario" replace />} />
                  <Route path="/calendario" element={<CalendarioMaestroPage />} />
                  <Route path="/conectividad" element={<MatrizConectividadPage />} />
                  <Route path="/canales-mexico" element={<MatrizCanalesPage />} />
                  <Route path="/canales-mexico/:canalCodigo" element={<AsistenteConexionPage />} />
                  <Route path="/monitor-sync" element={<MonitorSyncPage />} />
                  <Route path="/monitor-sync/conflictos" element={<ConflictosPage />} />
                  <Route path="/monitor-sync/alertas" element={<AlertasPage />} />
                  <Route
                    path="/propiedades"
                    element={
                      <RutaConRol roles={ROLES_ADMIN}>
                        <PropiedadesPage />
                      </RutaConRol>
                    }
                  />
                  <Route
                    path="/cuentas-canal"
                    element={
                      <RutaConRol roles={ROLES_ADMIN}>
                        <CuentasCanalPage />
                      </RutaConRol>
                    }
                  />
                  <Route path="/reservas" element={<Navigate to="/calendario" replace />} />
                  <Route path="/onboarding/asistente" element={<OnboardingAsistentePage />} />
                  <Route
                    path="/facturacion"
                    element={
                      <RutaConRol roles={ROLES_ADMIN}>
                        <FacturacionPage />
                      </RutaConRol>
                    }
                  />
                  <Route path="/cuenta" element={<CuentaPage />} />
                  <Route path="/operacion" element={<OperacionPage />} />
                  <Route path="/mensajes" element={<BandejaPage />} />
                  <Route path="/mensajes/plantillas" element={<PlantillasPage />} />
                  <Route path="/mensajes/:id" element={<HiloPage />} />
                  <Route path="/finanzas" element={<FinanzasPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/reportes" element={<ReportesPage />} />
                  <Route
                    path="/administracion"
                    element={
                      <RutaConRol roles={ROLES_ADMIN}>
                        <AdministracionPage />
                      </RutaConRol>
                    }
                  />
                  <Route
                    path="/agentes"
                    element={
                      <RutaConRol roles={ROLES_ADMIN}>
                        <AgentesPage />
                      </RutaConRol>
                    }
                  />
                  <Route
                    path="/backoffice/superadmin"
                    element={
                      <RutaConRol roles={ROLES_ADMIN}>
                        <SuperadminPage />
                      </RutaConRol>
                    }
                  />
                  {/* REQ-151: bandeja de solicitudes ARCO/RGPD — mismo nivel
                      de rol que el resto de configuración legal/de
                      cumplimiento (ROLES_ADMIN), ver
                      apps/api/src/routes/solicitudesArco.ts. */}
                  <Route
                    path="/legal/solicitudes-arco"
                    element={
                      <RutaConRol roles={ROLES_ADMIN}>
                        <SolicitudesArcoPage />
                      </RutaConRol>
                    }
                  />
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
