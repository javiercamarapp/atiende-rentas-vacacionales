import type { Migracion } from "../runner/tipos.js";

// Lote 3.2 (H-096+): vinculación de cuenta con un proveedor OIDC (Google
// en producción; el proveedor OIDC simulado de
// apps/api/src/seguridad/oidcSimulado.ts en dev/pruebas/E2E, `proveedor =
// 'oidc_simulado'`). Un mismo `usuario` puede tener como máximo una
// identidad por proveedor; `(proveedor, sub)` es único porque `sub` (el
// identificador estable del proveedor, NUNCA el email — un email puede
// cambiar de dueño) es la clave real de la federación (OIDC Core §2).
//
// SIN RLS: igual que `refresh_token` (accedida solo por
// apps/api/src/routes/auth.ts, filtrando siempre por `usuario_id`/`sub` a
// mano) esta tabla se consulta en el flujo de login/callback, ANTES de que
// exista una sesión de aplicación — se protege con el mismo criterio que
// ya usa el propio `refresh_token` en la práctica (acceso por columnas
// exactas, nunca un `SELECT *` sin filtrar) en vez de RLS con funciones
// SECURITY DEFINER, porque a diferencia de `usuario` esta tabla no expone
// ningún dato de negocio sensible a un tenant (solo la vinculación
// externa-interna de un identificador ya opaco).
export const migracion0102IdentidadOidc: Migracion = {
  id: "0102_identidad_oidc",
  descripcion: "identidad_oidc (vinculación de cuenta local con Google/OIDC simulado)",
  up: `
    CREATE TABLE identidad_oidc (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
      proveedor   text NOT NULL,
      sub         text NOT NULL,
      email       text NOT NULL,
      hd          text,
      creado_en   timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX identidad_oidc_proveedor_sub_idx ON identidad_oidc (proveedor, sub);
    CREATE INDEX identidad_oidc_usuario_id_idx ON identidad_oidc (usuario_id);
  `,
  down: `
    DROP TABLE IF EXISTS identidad_oidc;
  `,
};
