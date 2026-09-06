import type { Migracion } from "../runner/tipos.js";

// Rango 0020+ reservado para Lote 2 (iCal/simuladores/anti-eco), sin chocar
// con el rango 0010-0019 de Lote 3 (auth/RLS/auditoría) que corre en
// paralelo sobre las mismas migraciones (LOTES.md, nota de cabecera).
//
// `cuenta_canal`: una cuenta de canal por tenant (credenciales/config de
// acceso); `unidad_canal_feed`: la configuración de sincronización iCal
// por unidad+canal (H-012, D-017, D-019) — URL de import, estado de
// cuarentena (D-005), y el `SEQUENCE` de export incremental (H-026).
// `credenciales_ref` es un valor opaco: el cifrado real en reposo
// (AES-256-GCM/ChaCha20-Poly1305, REQ-141) es responsabilidad de Lote 3;
// aquí solo se garantiza que nunca se almacena en texto plano legible como
// columna de negocio — Lote 2 solo persiste la referencia que el
// adaptador/simulador necesita para reconectar.
export const migracion0020CuentaCanal: Migracion = {
  id: "0020_cuenta_canal",
  descripcion: "cuenta_canal, unidad_canal_feed (config de sincronización iCal por unidad/canal)",
  up: `
    CREATE TABLE cuenta_canal (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      canal_id           uuid NOT NULL REFERENCES canal(id),
      nombre             text NOT NULL,
      credenciales_ref   text,
      es_simulador       boolean NOT NULL DEFAULT false,
      es_sandbox         boolean NOT NULL DEFAULT false,
      partner_aprobado   boolean NOT NULL DEFAULT false,
      creado_en          timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX cuenta_canal_tenant_id_idx ON cuenta_canal (tenant_id);

    CREATE TABLE unidad_canal_feed (
      id                                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidad_id                             uuid NOT NULL REFERENCES unidad(id) ON DELETE CASCADE,
      canal_id                              uuid NOT NULL REFERENCES canal(id),
      cuenta_canal_id                       uuid REFERENCES cuenta_canal(id) ON DELETE SET NULL,
      -- Import: nunca almacena credenciales en la URL (H-024); si el
      -- canal exige token, va en credenciales_ref de cuenta_canal.
      url_import                            text,
      etag_import                           text,
      ultima_modificacion_http_import       text,
      ultima_sincronizacion_exitosa_en      timestamptz,
      en_cuarentena_desde                   timestamptz,
      intentos_fallidos_consecutivos        integer NOT NULL DEFAULT 0,
      motivo_cuarentena                     text,
      drift_ultima_reconciliacion_completa  integer NOT NULL DEFAULT 0,
      -- Export: SEQUENCE incremental propio por unidad/canal (H-026).
      export_sequence                       integer NOT NULL DEFAULT 0,
      creado_en                             timestamptz NOT NULL DEFAULT now(),
      actualizado_en                        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (unidad_id, canal_id)
    );
    CREATE INDEX unidad_canal_feed_unidad_id_idx ON unidad_canal_feed (unidad_id);
  `,
  down: `
    DROP TABLE IF EXISTS unidad_canal_feed;
    DROP TABLE IF EXISTS cuenta_canal;
  `,
};
