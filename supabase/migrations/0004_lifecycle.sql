-- =========================================================================
-- 0004 — Lifecycle de anuncios (2026-05-30)
--
-- "Vivo mientras la fuente lo siga mostrando." Reglas:
--   - El scrape (pase 1) marca como vistas las propiedades que aparecen.
--   - Un script de verificación (pase 2) hace GET a cada URL no vista en
--     el pase 1. Decide si la propiedad sigue viva.
--     * 200 + JSON-LD Product → reset contador, status='activo'.
--     * 404/410/redirect raro/sin Product → incrementa veces_no_encontrado.
--     * Timeout/5xx/captcha → status='error_verificacion', NO suma.
--   - Transiciones:
--     * 0–2 fallos: 'activo'
--     * 3–6 fallos: 'posible_inactivo'
--     * ≥7 fallos: 'archivado'
--   - El mapa filtra estado_anuncio='activo'.
--
-- Idempotente. No borra filas — todo queda en historial vía 'archivado'.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Extender enum estado_anuncio.
--    Postgres no permite ALTER TYPE ADD VALUE en transacción si ya
--    se usa el valor en la misma transacción; por eso cada ADD VALUE
--    va con IF NOT EXISTS y solo.
-- -------------------------------------------------------------------------
alter type estado_anuncio add value if not exists 'posible_inactivo';
alter type estado_anuncio add value if not exists 'archivado';
alter type estado_anuncio add value if not exists 'error_verificacion';

-- -------------------------------------------------------------------------
-- 2. Columnas de lifecycle.
--    veces_no_encontrado: contador de fallos consecutivos en el pase 2.
--    fecha_ultima_vista: última vez que la URL respondió con Product (o
--                        salió en el listado del pase 1).
--    fecha_ultima_revision: última vez que el pase 2 la chequeó (sin
--                           importar el resultado).
--    motivo_estado: razón humana de la última transición o resultado
--                   ('visto en scrape', '404', 'sin Product', 'timeout',
--                   'verificado activo', etc.). Útil para debug y para
--                   el panel admin futuro.
-- -------------------------------------------------------------------------
alter table public.propiedades
  add column if not exists veces_no_encontrado   integer not null default 0,
  add column if not exists fecha_ultima_vista    timestamptz,
  add column if not exists fecha_ultima_revision timestamptz,
  add column if not exists motivo_estado         text;

-- Filas pre-existentes: asumimos que la última vez vistas fue cuando
-- las actualizamos. veces_no_encontrado queda en 0 (default).
update public.propiedades
   set fecha_ultima_vista = coalesce(fecha_ultima_vista, fecha_actualizacion)
 where fecha_ultima_vista is null;

-- -------------------------------------------------------------------------
-- 3. Índice para que el pase 2 pueda traer rápido las que necesitan
--    re-verificar (todo lo no archivado, ordenado por última revisión).
-- -------------------------------------------------------------------------
create index if not exists propiedades_lifecycle_idx
  on public.propiedades (estado_anuncio, fecha_ultima_revision);
