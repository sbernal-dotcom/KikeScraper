-- =========================================================================
-- 0003 — Campos del scraper + scraper_runs (2026-05-29)
--
-- Alinea el schema con el contrato del scraper:
--   * resumen IA bilingüe (es / en)
--   * tags de características (lista cerrada + extras libres)
--   * flag de origen del enriquecimiento IA
--   * unique(url_original) para permitir upsert desde el scraper
--   * tabla scraper_runs para auditar cada corrida
--
-- Idempotente: se puede re-ejecutar. NO escribe descripcion/imagenes/
-- vendedor (esos campos quedan vacíos por contrato de ToS).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Resumen IA bilingüe
--    El resumen_ia existente pasa a ser la versión ES; agregamos EN.
--
--    H19 (2026-08-10): el `rename column` fallaba en re-ejecución
--    ("column resumen_ia does not exist" — ya fue renombrada). Ahora se
--    envuelve en un DO $$ ... $$ que chequea la existencia primero.
-- -------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'propiedades'
       and column_name  = 'resumen_ia'
  ) then
    alter table public.propiedades
      rename column resumen_ia to resumen_ia_es;
  end if;
end $$;

alter table public.propiedades
  add column if not exists resumen_ia_en text;

-- -------------------------------------------------------------------------
-- 2. Tags + flag de origen IA
-- -------------------------------------------------------------------------
alter table public.propiedades
  add column if not exists tags_caracteristicas text[] not null default '{}',
  add column if not exists tags_extra           text[] not null default '{}',
  add column if not exists ai_source_flag       text;

-- banos puede ser fraccionario (medios baños: 3.5). smallint los redondea.
alter table public.propiedades
  alter column banos type numeric(3,1);

-- -------------------------------------------------------------------------
-- 3. Unique(url_original) — clave de upsert del scraper
--    (cada anuncio scrapeado = una propiedad canónica por ahora)
-- -------------------------------------------------------------------------
create unique index if not exists propiedades_url_original_key
  on public.propiedades (url_original);

-- -------------------------------------------------------------------------
-- 4. scraper_runs — auditoría de corridas
-- -------------------------------------------------------------------------
create table if not exists public.scraper_runs (
  id           uuid primary key default gen_random_uuid(),
  fuente_id    text references public.fuentes(id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running',   -- running | ok | error
  found        integer not null default 0,        -- anuncios detectados (candidatos procesados)
  inserted     integer not null default 0,        -- propiedades nuevas
  updated      integer not null default 0,        -- propiedades actualizadas (upsert sobre existente)
  errors       integer not null default 0,        -- filas saltadas o con error
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists scraper_runs_started_idx
  on public.scraper_runs (started_at desc);

-- -------------------------------------------------------------------------
-- 5. RLS — lectura pública anónima, escritura solo service_role
-- -------------------------------------------------------------------------
alter table public.scraper_runs enable row level security;

drop policy if exists "anon read scraper_runs" on public.scraper_runs;
create policy "anon read scraper_runs" on public.scraper_runs
  for select using (true);
-- (sin policy de escritura → solo service_role puede insertar/actualizar)
