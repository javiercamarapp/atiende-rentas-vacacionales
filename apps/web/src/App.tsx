import { Navigate, Route, Routes } from "react-router-dom";
import { DevShellNav } from "./components/DevShellNav";
import { SeccionVacia } from "./pages/SeccionVacia";
import {
  CalendarDays,
  Building2,
  Radio,
  BookOpenCheck,
  Wrench,
  MessageSquare,
  Wallet,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

// Shell de Lote 0: logo + navegación provisional + página vacía por sección,
// cada una con el banner de entorno de desarrollo. Sin conexión a apps/api
// (eso llega con el contrato de API de Lote 3) ni a ningún canal real.
export default function App() {
  return (
    <div className="flex min-h-screen bg-background">
      <DevShellNav />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/calendario" replace />} />
          <Route
            path="/calendario"
            element={<SeccionVacia titulo="Calendario" icono={CalendarDays} lote="Lote 4" />}
          />
          <Route
            path="/propiedades"
            element={<SeccionVacia titulo="Propiedades" icono={Building2} lote="Lote 8" />}
          />
          <Route path="/canales" element={<SeccionVacia titulo="Canales" icono={Radio} lote="Lote 4" />} />
          <Route
            path="/reservas"
            element={<SeccionVacia titulo="Reservas" icono={BookOpenCheck} lote="Lote 3" />}
          />
          <Route
            path="/operacion"
            element={<SeccionVacia titulo="Operación" icono={Wrench} lote="Lote 5" />}
          />
          <Route
            path="/mensajes"
            element={<SeccionVacia titulo="Mensajes" icono={MessageSquare} lote="Lote 6" />}
          />
          <Route path="/finanzas" element={<SeccionVacia titulo="Finanzas" icono={Wallet} lote="Lote 7" />} />
          <Route
            path="/reportes"
            element={<SeccionVacia titulo="Reportes" icono={BarChart3} lote="Lote 7" />}
          />
          <Route
            path="/administracion"
            element={<SeccionVacia titulo="Administración" icono={ShieldCheck} lote="Lote 8" />}
          />
          <Route path="*" element={<Navigate to="/calendario" replace />} />
        </Routes>
      </main>
    </div>
  );
}
