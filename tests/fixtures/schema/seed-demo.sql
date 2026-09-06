-- Fixture de esquema/seed para Fase 2 (Lote 1, packages/db + packages/domain).
--
-- Escenario mínimo reutilizable por lotes posteriores (Lote 4 UI de
-- calendario, Lote 11 adversarial): un tenant con una propiedad y DOS
-- unidades, una de ellas ("Depto 101") con las 4 razones de bloqueo
-- activas en fechas distintas (ACEPTACION §UX-1: "unidad de prueba con al
-- menos 4 razones de bloqueo distintas activas"), y la otra unidad
-- ("Depto 102") vacía para casos de multi-unidad sin interferencia.
--
-- Requiere que las migraciones de packages/db/src/migrations ya estén
-- aplicadas contra la base de datos destino. No es una migración en sí
-- misma (no se registra en schema_migrations) — es solo dato de prueba.
--
-- Uso: cargar con el runner (`ejecutor.exec(fs.readFileSync(...))`) contra
-- PGlite o embedded-postgres después de `aplicarMigraciones`.

INSERT INTO tenant (id, nombre) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Tenant demo Fase 2');

INSERT INTO propiedad (id, tenant_id, nombre, zona_horaria) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Edificio Reforma', 'America/Mexico_City');

INSERT INTO unidad (id, propiedad_id, nombre) VALUES
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'Depto 101'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'Depto 102');

-- Depto 101: 4 razones de bloqueo distintas en fechas no solapadas entre sí
-- (para que cada una sea seleccionable de forma aislada en la UI).
INSERT INTO ocupacion_unidad (unidad_id, rango, capa, razon, estado, bloqueante) VALUES
  ('00000000-0000-0000-0000-000000000100', daterange('2026-11-01', '2026-11-05', '[)'), 'reserva', 'RESERVA_CANAL', 'confirmado', true),
  ('00000000-0000-0000-0000-000000000100', daterange('2026-11-10', '2026-11-12', '[)'), 'bloqueo', 'BLOQUEO_PROPIETARIO', 'confirmado', true),
  ('00000000-0000-0000-0000-000000000100', daterange('2026-11-15', '2026-11-16', '[)'), 'bloqueo', 'MANTENIMIENTO', 'confirmado', true),
  ('00000000-0000-0000-0000-000000000100', daterange('2026-11-05', '2026-11-06', '[)'), 'bloqueo', 'BUFFER_LIMPIEZA', 'confirmado', true);

-- Depto 102 se deja sin ocupaciones (caso multi-unidad "libre").
