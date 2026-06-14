-- =========================================================================
-- 0005 — ACOBIR Proyectos como fuente (2026-06-02)
--
-- Cambios:
--   * Nueva fuente `acobir` (gremial oficial de bienes raíces de Panamá).
--   * Nuevo valor `proyecto_nuevo` en categoria_propiedad.
--   * Nuevo enum estado_datos: cuán completo / verificado es el registro.
--     - completo_verificado: scrape regular (precio + lat/lng + m² + recámaras).
--     - parcial_verificado: proyectos ACOBIR (precio + lat/lng + "desde X"
--       en m²/recámaras/baños — son rangos, no valores exactos por unidad).
--     - sin_verificar: reservado para fuentes futuras crowdsourced.
--   * Columna `estado_datos` en propiedades, default 'completo_verificado'
--     para no afectar filas existentes.
--
-- Idempotente: se puede re-ejecutar.
-- =========================================================================

-- 1. Fuente acobir
insert into public.fuentes (id, nombre, url_base, descripcion) values
  ('acobir', 'ACOBIR', 'https://www.acobir.com',
   'Asociación Panameña de Corredores y Promotores de Bienes Raíces — proyectos nuevos curados')
on conflict (id) do nothing;

-- 2. Nuevo valor en categoria_propiedad.
--    ALTER TYPE ADD VALUE no puede correr dentro de transacción que ya usa
--    el valor; por eso va en su propia sentencia y con IF NOT EXISTS.
alter type categoria_propiedad add value if not exists 'proyecto_nuevo';

-- 3. Enum estado_datos
do $$ begin
  if not exists (select 1 from pg_type where typname = 'estado_datos') then
    create type estado_datos as enum (
      'completo_verificado',
      'parcial_verificado',
      'sin_verificar'
    );
  end if;
end $$;

-- 4. Columna estado_datos en propiedades
alter table public.propiedades
  add column if not exists estado_datos estado_datos
    not null default 'completo_verificado';

create index if not exists propiedades_estado_datos_idx
  on public.propiedades (estado_datos);
