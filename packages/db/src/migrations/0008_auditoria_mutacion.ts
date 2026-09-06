import type { Migracion } from "../runner/tipos.js";

// Esqueleto mínimo de auditoría (equivalente a `audit_log` de BLUEPRINT
// §3.6 — nombrado `auditoria_mutacion` por instrucción explícita del
// encargo de este lote). Sin triggers automáticos todavía: cablear
// triggers en tablas sensibles (ocupacion_unidad, statement, cuenta_canal)
// y el acceso "romper cristal" auditado es H-045 (Lote 3). Aquí solo el
// esqueleto de tabla que Lote 3 puebla.
export const migracion0008AuditoriaMutacion: Migracion = {
  id: "0008_auditoria_mutacion",
  descripcion: "auditoria_mutacion (esqueleto, sin triggers todavía)",
  up: `
    CREATE TABLE auditoria_mutacion (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tabla            text NOT NULL,
      fila_id          uuid NOT NULL,
      operacion        text NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
      actor_id         uuid REFERENCES usuario(id),
      tenant_id        uuid REFERENCES tenant(id),
      valores_previos  jsonb,
      valores_nuevos   jsonb,
      creado_en        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX auditoria_mutacion_tabla_fila_idx ON auditoria_mutacion (tabla, fila_id);
  `,
  down: `
    DROP TABLE IF EXISTS auditoria_mutacion;
  `,
};
