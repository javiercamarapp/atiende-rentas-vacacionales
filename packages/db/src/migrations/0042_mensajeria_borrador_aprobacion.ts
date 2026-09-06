import type { Migracion } from "../runner/tipos.js";

// H-059 (D-006, RV18-R-03, RV19-R-18): cola de aprobación humana
// obligatoria. Ningún proceso automático puede insertar directamente en
// `mensaje` con `direccion = 'saliente'` sin pasar antes por
// `borrador_mensaje.estado = 'aprobado'` — reforzado aquí con un CHECK que
// hace explícito el invariante de la máquina de estados de
// `packages/domain/src/mensajeria/colaAprobacion.ts` (pendiente_aprobacion
// → aprobado/rechazado; aprobado → enviado; ninguna otra transición existe).
//
// `senal_escalamiento` (H-060): puramente informativa (nunca dispara una
// acción por sí sola) — un trigger la puebla automáticamente desde
// `packages/domain` en la capa de aplicación (apps/api), no aquí; esta
// migración solo crea la tabla.
export const migracion0042MensajeriaBorradorAprobacion: Migracion = {
  id: "0042_mensajeria_borrador_aprobacion",
  descripcion: "mensajeria: borrador_mensaje (cola de aprobación humana) + senal_escalamiento",
  up: `
    CREATE TABLE borrador_mensaje (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversacion_id     uuid NOT NULL REFERENCES conversacion(id) ON DELETE CASCADE,
      mensaje_entrante_id uuid REFERENCES mensaje(id) ON DELETE SET NULL,
      plantilla_id        uuid REFERENCES plantilla_mensaje(id) ON DELETE SET NULL,
      canal_codigo        text NOT NULL CHECK (canal_codigo IN ('airbnb', 'vrbo', 'booking')),
      texto               text NOT NULL,
      generado_por        text NOT NULL CHECK (generado_por IN ('motor_borrador', 'plantilla', 'manual')),
      redactado           boolean NOT NULL DEFAULT false,
      estado              text NOT NULL DEFAULT 'pendiente_aprobacion'
                            CHECK (estado IN ('pendiente_aprobacion', 'aprobado', 'rechazado', 'enviado')),
      creado_por          uuid REFERENCES usuario(id) ON DELETE SET NULL,
      aprobado_por        uuid REFERENCES usuario(id) ON DELETE SET NULL,
      aprobado_en         timestamptz,
      rechazado_por       uuid REFERENCES usuario(id) ON DELETE SET NULL,
      rechazado_en        timestamptz,
      motivo_rechazo      text,
      mensaje_enviado_id  uuid REFERENCES mensaje(id) ON DELETE SET NULL,
      creado_en           timestamptz NOT NULL DEFAULT now(),
      actualizado_en      timestamptz NOT NULL DEFAULT now(),

      -- D-006/RV18-R-03: 'enviado' exige aprobado_por poblado (nunca un
      -- envío sin rastro de quién aprobó); 'aprobado'/'rechazado' exigen su
      -- respectivo actor. Nunca ambos aprobado_por Y rechazado_por a la vez.
      CONSTRAINT borrador_mensaje_estado_coherente CHECK (
        (estado = 'pendiente_aprobacion' AND aprobado_por IS NULL AND rechazado_por IS NULL AND mensaje_enviado_id IS NULL)
        OR (estado = 'aprobado' AND aprobado_por IS NOT NULL AND rechazado_por IS NULL)
        OR (estado = 'rechazado' AND rechazado_por IS NOT NULL AND aprobado_por IS NULL AND mensaje_enviado_id IS NULL)
        OR (estado = 'enviado' AND aprobado_por IS NOT NULL AND mensaje_enviado_id IS NOT NULL)
      )
    );
    CREATE INDEX borrador_mensaje_conversacion_id_idx ON borrador_mensaje (conversacion_id);
    CREATE INDEX borrador_mensaje_estado_idx ON borrador_mensaje (estado);

    CREATE TABLE senal_escalamiento (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mensaje_id  uuid NOT NULL REFERENCES mensaje(id) ON DELETE CASCADE,
      tipo        text NOT NULL CHECK (tipo IN ('queja', 'emergencia', 'reembolso', 'vip')),
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX senal_escalamiento_mensaje_id_idx ON senal_escalamiento (mensaje_id);
  `,
  down: `
    DROP TABLE IF EXISTS senal_escalamiento;
    DROP TABLE IF EXISTS borrador_mensaje;
  `,
};
