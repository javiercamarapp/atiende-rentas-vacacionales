import type { Migracion } from "../runner/tipos.js";

// H-046 (§RV19/21-13): cifrado en reposo de las credenciales de
// `cuenta_canal`. Numerada 0090 (fuera del rango 0010-0019 asignado a este
// lote) por una dependencia real de orden de migraciones: `cuenta_canal`
// la crea el Lote 2 en la migración `0020_cuenta_canal.ts` (con una
// columna `credenciales_ref text` opaca, documentada ahí como "el cifrado
// real es responsabilidad de Lote 3") — esta migración solo puede
// `ALTER TABLE` una tabla que ya existe, así que tiene que numerarse
// después de 0020/0021. Se eligió 0090 (en vez de continuar en 0022) para
// minimizar la probabilidad de colisión de nombre de archivo con
// migraciones futuras que el propio Lote 2 pueda seguir añadiendo de forma
// secuencial (0022, 0023, ...) mientras ambos lotes trabajan en el mismo
// árbol de trabajo en paralelo. Documentado también en docs/PROGRESO.md.
//
// AES-256-GCM (apps/api/src/seguridad/cifrado.ts): `credenciales_cifradas`
// es el texto cifrado, `credenciales_iv` el nonce de 12 bytes,
// `credenciales_tag` el tag de autenticación de 16 bytes,
// `credenciales_clave_version` identifica qué clave del keyring de entorno
// (rotación, ver `.env.example` de apps/api) se usó para cifrar — permite
// rotar la clave activa sin invalidar de golpe las credenciales ya
// guardadas (se re-cifran de forma perezosa la próxima vez que se
// actualicen, o por un job de rotación explícito, documentado como
// pendiente de automatizar).
export const migracion0090CuentaCanalCifrado: Migracion = {
  id: "0090_cuenta_canal_cifrado",
  descripcion: "cuenta_canal: columnas de cifrado AES-256-GCM + alcance por propiedad",
  up: `
    ALTER TABLE cuenta_canal
      ADD COLUMN propiedad_id uuid REFERENCES propiedad(id) ON DELETE CASCADE,
      ADD COLUMN credenciales_cifradas bytea,
      ADD COLUMN credenciales_iv bytea,
      ADD COLUMN credenciales_tag bytea,
      ADD COLUMN credenciales_clave_version text,
      ADD COLUMN ultima_sincronizacion_exitosa_en timestamptz,
      ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now();

    ALTER TABLE cuenta_canal ADD CONSTRAINT cuenta_canal_cifrado_completo CHECK (
      (credenciales_cifradas IS NULL AND credenciales_iv IS NULL AND credenciales_tag IS NULL AND credenciales_clave_version IS NULL)
      OR (credenciales_cifradas IS NOT NULL AND credenciales_iv IS NOT NULL AND credenciales_tag IS NOT NULL AND credenciales_clave_version IS NOT NULL)
    );
  `,
  down: `
    ALTER TABLE cuenta_canal DROP CONSTRAINT IF EXISTS cuenta_canal_cifrado_completo;
    ALTER TABLE cuenta_canal
      DROP COLUMN IF EXISTS actualizado_en,
      DROP COLUMN IF EXISTS ultima_sincronizacion_exitosa_en,
      DROP COLUMN IF EXISTS credenciales_clave_version,
      DROP COLUMN IF EXISTS credenciales_tag,
      DROP COLUMN IF EXISTS credenciales_iv,
      DROP COLUMN IF EXISTS credenciales_cifradas,
      DROP COLUMN IF EXISTS propiedad_id;
  `,
};
