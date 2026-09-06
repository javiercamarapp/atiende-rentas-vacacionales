import { LegalLayout } from "./LegalLayout";

// Lote 3.3 (RV19) — Aviso de privacidad, BORRADOR. Estructura ancorada en
// las 6 fracciones que exige el Art. 15 de la LFPDPPP mexicana (DOF
// 20-mar-2025) según docs/investigacion/RV19-seguridad-privacidad-legal.md
// §2.2 — el CONTENIDO de cada fracción (datos exactos tratados, finalidades
// específicas, plazos de conservación reales) debe llenarlo el responsable
// del tratamiento (la empresa gestora que usa Atiende, o Atiende mismo
// según el rol que finalmente se determine — ver nota abajo) antes de
// publicarlo como definitivo.
export function AvisoPrivacidadPage() {
  return (
    <LegalLayout titulo="Aviso de privacidad">
      <p>
        Este aviso describe, en borrador, cómo Atiende Rentas Vacacionales trata los datos personales de
        huéspedes, propietarios y usuarios del panel. Sigue la estructura de fracciones que exige el Artículo
        15 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP,
        reforma DOF 20-marzo-2025) — cada sección marcada "[PENDIENTE]" requiere que el responsable del
        tratamiento complete el dato específico antes de publicar este aviso como definitivo.
      </p>

      <h2>1. Identidad y domicilio del responsable</h2>
      <p>[PENDIENTE — razón social, RFC y domicilio de la empresa gestora que actúa como responsable].</p>

      <h2>2. Finalidades del tratamiento</h2>
      <p>
        Gestión de reservas y comunicación con huéspedes; conciliación financiera con propietarios;
        cumplimiento de obligaciones fiscales aplicables. Atiende actúa, salvo que el contrato con la empresa
        gestora indique lo contrario, como <strong>encargado</strong> del tratamiento por cuenta del
        anfitrión/responsable — esta calificación jurídica exacta está señalada como pendiente de decisión de
        producto en la investigación RV19 y debe confirmarse antes de publicar.
      </p>

      <h2>3. Datos personales tratados</h2>
      <p>
        Nombre y datos de contacto del huésped (los estrictamente necesarios para la reserva); datos de
        facturación del propietario; credenciales de acceso de usuarios del panel. Este producto NO trata
        datos personales sensibles (Art. 12 LFPDPPP) como parte de su operación normal.
      </p>

      <h2>4. Transferencias de datos</h2>
      <p>
        [PENDIENTE] — depende de dónde se aloje la infraestructura final (México/EE.UU./UE) y de los
        proveedores de pago/canal involucrados; requiere el análisis de transferencias internacionales del
        Art. 35-36 LFPDPPP antes de publicarse.
      </p>

      <h2>5. Derechos ARCO</h2>
      <p>
        Todo titular puede solicitar Acceso, Rectificación, Cancelación u Oposición al tratamiento de sus
        datos, en un plazo de respuesta de 20 días hábiles (más 15 días para hacerlo efectivo, Art. 31/34
        LFPDPPP), sin costo salvo el de reproducción. [PENDIENTE — canal de contacto para ejercer estos
        derechos].
      </p>

      <h2>6. Cambios al aviso de privacidad</h2>
      <p>Este aviso puede actualizarse; la versión vigente siempre estará disponible en esta página.</p>

      <h2>Nota sobre la autoridad de aplicación</h2>
      <p>
        La autoridad de aplicación de la LFPDPPP es, desde la reforma de 2025, la Secretaría Anticorrupción y
        Buen Gobierno (el INAI fue extinto) — este dato cambia con frecuencia normativa, verificar vigencia
        antes de publicar.
      </p>
    </LegalLayout>
  );
}
