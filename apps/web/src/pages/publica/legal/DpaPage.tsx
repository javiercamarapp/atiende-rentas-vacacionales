import { LegalLayout } from "./LegalLayout";

// DPA = Data Processing Agreement / Acuerdo de Encargo de Tratamiento —
// el documento que formaliza que Atiende actúa como ENCARGADO del
// tratamiento de datos de huéspedes por cuenta de la empresa gestora
// (RESPONSABLE). Ver RV19 §2.2 y la nota "se asume que Atiende actúa como
// encargado... salvo que el modelo de negocio defina lo contrario" — esta
// calificación es un supuesto de la investigación, no una decisión legal
// cerrada.
export function DpaPage() {
  return (
    <LegalLayout titulo="Acuerdo de encargo de tratamiento de datos (DPA)">
      <p>
        Este DPA, en borrador, formaliza la relación entre la empresa gestora (RESPONSABLE del tratamiento de
        los datos personales de sus huéspedes y propietarios) y Atiende Rentas Vacacionales (ENCARGADO del
        tratamiento por cuenta de la empresa gestora, únicamente para prestar el servicio contratado).
      </p>

      <h2>1. Objeto y alcance</h2>
      <p>
        Atiende trata datos personales ÚNICAMENTE para prestar las funciones del panel (calendario,
        mensajería, finanzas) y siguiendo instrucciones documentadas de la empresa gestora — nunca para fines
        propios de Atiende (p. ej. entrenar modelos de IA con datos de huéspedes sin consentimiento explícito
        y separado).
      </p>

      <h2>2. Medidas de seguridad</h2>
      <p>
        Aislamiento multitenant por fila (Row Level Security) en base de datos, cifrado de credenciales de
        canal en reposo (AES-256-GCM), auditoría de mutaciones sensibles, y rate limiting — controles ya
        implementados en el código de este producto, no solo declarados en este documento.
      </p>

      <h2>3. Subencargados</h2>
      <p>
        [PENDIENTE] — depende del proveedor final de Postgres gestionado, del proveedor de correo (SMTP) y
        de Stripe si se activa el cobro real. Cada subencargado debe listarse aquí con su rol exacto antes de
        publicar este DPA como definitivo.
      </p>

      <h2>4. Transferencias internacionales</h2>
      <p>
        [PENDIENTE] — sujeto a dónde se hospede la infraestructura elegida (Neon/Supabase/Postgres propio,
        ver <code>docs/despliegue/README.md</code>) y a las cláusulas contractuales tipo aplicables si hay
        transferencia fuera de México/UE.
      </p>

      <h2>5. Notificación de vulneraciones</h2>
      <p>
        Atiende notificará a la empresa gestora sin dilación indebida ante cualquier vulneración de
        seguridad que afecte datos personales bajo su responsabilidad (Art. 18-19 LFPDPPP) — plazo exacto de
        notificación [PENDIENTE, requiere definición contractual].
      </p>

      <h2>6. Duración y devolución/eliminación de datos</h2>
      <p>
        Al terminar la relación contractual, Atiende devuelve o elimina los datos personales tratados por
        cuenta de la empresa gestora, según ésta indique. [PENDIENTE — plazo exacto].
      </p>
    </LegalLayout>
  );
}
