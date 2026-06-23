-- =========================================================================
-- 0011 — Cache de edificios geocodeados (2026-06-23)
--
-- Pipeline de geocoding exacto (vs. zona-centroide):
--   1. IA extrae nombre del edificio del título+descripción.
--   2. Buscamos en esta tabla.
--   3. Si MISS → web search (DuckDuckGo + parse de coords del HTML).
--   4. Si encontró → guardamos permanentemente (no se paga 2 veces).
--   5. Si no encontró → fallback a zona-centroide (zonas-panama.ts).
--   6. Si tampoco zona → no se inserta la propiedad.
--
-- "Encontró" o "no encontró" se cachea por igual para evitar re-buscar
-- la misma cadena cada noche. attempts + last_attempt_at permiten
-- re-intentar después de N días si el edificio fue agregado a la web.
-- =========================================================================

create table if not exists public.edificios_cache (
  id              uuid primary key default gen_random_uuid(),
  nombre_norm     text unique not null,  -- "ph dos mares view" (lowercase, sin acentos)
  nombre_original text not null,         -- "PH Dos Mares View" (como apareció)

  -- Coords (null si no se encontraron — la fila marca "ya intentamos")
  lat             double precision,
  lng             double precision,

  -- Trazabilidad
  source          text not null,         -- 'manual' | 'web' | 'google' | 'sin_resultado'
  source_url      text,                  -- URL del sitio donde se confirmó (si web)
  confidence      numeric(3,2),          -- 0.00-1.00 (manual=1.0, web≈0.7-0.9)

  -- Re-intentos: si source='sin_resultado' y last_attempt_at > 30 días, re-intentar
  attempts        integer not null default 1,
  last_attempt_at timestamptz not null default now(),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists edificios_cache_nombre_norm_idx
  on public.edificios_cache (nombre_norm);

-- RLS: lectura pública (frontend nunca lo lee directamente, pero por
-- consistencia con el resto); escritura solo service_role.
alter table public.edificios_cache enable row level security;

drop policy if exists "anon read edificios_cache" on public.edificios_cache;
create policy "anon read edificios_cache" on public.edificios_cache
  for select using (true);

-- Trigger para updated_at
create or replace function public.touch_edificios_cache()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_edificios_cache_touch on public.edificios_cache;
create trigger trg_edificios_cache_touch
  before update on public.edificios_cache
  for each row execute function public.touch_edificios_cache();
