import type { Migracion } from "../runner/tipos.js";

// Esqueleto mínimo de multitenancy (RV17 §1, BLUEPRINT §3.1). Sin RLS
// todavía (H-041, Lote 3) ni UI de gestión (Lote 8) — solo el modelo de
// datos que packages/domain necesita para expresar propiedad/unidad/owner.
export const migracion0002TenantEmpresaOwner: Migracion = {
  id: "0002_tenant_empresa_owner",
  descripcion: "tenant, empresa_gestora, owner (esqueleto)",
  up: `
    CREATE TABLE tenant (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre      text NOT NULL,
      tipo        text NOT NULL DEFAULT 'anfitrion'
                    CHECK (tipo IN ('anfitrion', 'empresa_gestora')),
      creado_en   timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE empresa_gestora (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      razon_social  text NOT NULL,
      creado_en     timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id)
    );

    -- H-048 (multi-empresa-gestora, COULD) no se resuelve en Lote 1: un
    -- owner referencia una sola empresa_gestora por ahora. Ampliar a N:M
    -- requiere una decisión de producto explícita (documentado, no bug).
    CREATE TABLE owner (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_gestora_id  uuid REFERENCES empresa_gestora(id) ON DELETE SET NULL,
      nombre              text NOT NULL,
      email               text,
      creado_en           timestamptz NOT NULL DEFAULT now()
    );
  `,
  down: `
    DROP TABLE IF EXISTS owner;
    DROP TABLE IF EXISTS empresa_gestora;
    DROP TABLE IF EXISTS tenant;
  `,
};
