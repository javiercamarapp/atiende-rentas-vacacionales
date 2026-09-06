import type { Migracion } from "../runner/tipos.js";

// Rango 0070-0079 reservado a Lote 9 (automatización agéntica, BACKLOG
// E14, H-077 a H-085) — ver comentario de cabecera en
// `packages/db/src/migrations/index.ts`. Esta migración crea el esquema
// mínimo de persistencia que el ejecutor de tools de servidor
// (`packages/domain/agentes/ejecutor.ts`) necesita para dos cosas que NO
// pueden vivir solo en memoria de proceso (H-079/H-080):
//
// - `agente_cuota_tenant`: el presupuesto duro de IA por tenant
//   (`GestorCuotaAgente`), para que sobreviva reinicios del proceso y sea
//   consistente entre instancias.
// - `agente_tool_call_log`: la trazabilidad de cada tool-call (actor, rol,
//   canal, timestamp, resultado, costo real) — RV18 §4/§8 mecanismo 4.
//
// Ningún campo de `agente_tool_call_log.argumentos_no_sensibles` puede
// contener el texto crudo del huésped (saneado en
// `packages/domain/agentes/trazabilidad.ts` ANTES de llegar aquí) — esta
// migración no puede verificar eso en SQL, solo declara la columna.
export const migracion0070AgentesEsquema: Migracion = {
  id: "0070_agentes_esquema",
  descripcion: "agente_cuota_tenant + agente_tool_call_log (H-079, H-080)",
  up: `
    CREATE TABLE agente_cuota_tenant (
      tenant_id                     uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
      techo_tokens_periodo          bigint NOT NULL CHECK (techo_tokens_periodo >= 0),
      techo_llamadas_periodo        integer NOT NULL CHECK (techo_llamadas_periodo >= 0),
      tokens_reservados_periodo     bigint NOT NULL DEFAULT 0 CHECK (tokens_reservados_periodo >= 0),
      tokens_liquidados_periodo     bigint NOT NULL DEFAULT 0 CHECK (tokens_liquidados_periodo >= 0),
      llamadas_reservadas_periodo   integer NOT NULL DEFAULT 0 CHECK (llamadas_reservadas_periodo >= 0),
      llamadas_liquidadas_periodo   integer NOT NULL DEFAULT 0 CHECK (llamadas_liquidadas_periodo >= 0),
      periodo_inicia_en             date NOT NULL DEFAULT date_trunc('month', now()),
      creado_en                     timestamptz NOT NULL DEFAULT now(),
      actualizado_en                timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE agente_tool_call_log (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                 uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      actor_id                  uuid NOT NULL REFERENCES usuario(id),
      rol_actor                 text NOT NULL,
      conversation_id           text NOT NULL,
      canal                     text NOT NULL CHECK (canal IN ('airbnb', 'vrbo', 'booking', 'panel')),
      tool_nombre               text NOT NULL,
      argumentos_no_sensibles   jsonb NOT NULL DEFAULT '{}'::jsonb,
      resultado                 text NOT NULL CHECK (resultado IN ('exito', 'error', 'presupuesto_agotado', 'escalado', 'no_autorizado')),
      duracion_ms               integer NOT NULL CHECK (duracion_ms >= 0),
      modelo_real               text,
      costo_usd_real            numeric(12, 6) NOT NULL DEFAULT 0 CHECK (costo_usd_real >= 0),
      inicio_en                 timestamptz NOT NULL,
      fin_en                    timestamptz NOT NULL,
      creado_en                 timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX agente_tool_call_log_tenant_creado_idx ON agente_tool_call_log (tenant_id, creado_en DESC);
    CREATE INDEX agente_tool_call_log_conversation_idx ON agente_tool_call_log (conversation_id);
  `,
  down: `
    DROP INDEX IF EXISTS agente_tool_call_log_conversation_idx;
    DROP INDEX IF EXISTS agente_tool_call_log_tenant_creado_idx;
    DROP TABLE IF EXISTS agente_tool_call_log;
    DROP TABLE IF EXISTS agente_cuota_tenant;
  `,
};
