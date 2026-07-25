-- =========================================================================
-- 0016 — Cache de URLs con geo imposible (2026-07-25)
--
-- Marca URLs que un scraper ya intentó procesar y fallaron por razones
-- persistentes: sin coord, sin edificio identificable, sin zona en la
-- tabla, etc. La próxima corrida las skip sin llamar al pipeline IA.
--
-- Motivación: Savitat re-procesa ~40 URLs cada día (galeras, oficinas
-- en zonas industriales) que nunca resuelven geo. Cada intento consume
-- 2 llamadas a Groq (extract-edificio + resumen) y ~5s. Con 40 URLs =
-- 80 llamadas Groq desperdiciadas cada día + saturación del rate limit.
--
-- TTL: re-intentar después de 30 días — por si el sitio agregó coord,
-- o zona-panama.ts recibió el corregimiento faltante.
-- =========================================================================

create table if not exists public.urls_fallidas_cache (
  url             text primary key,
  fuente_id       text not null,
  motivo          text not null,           -- 'sin_geo' | 'sin_edificio' | 'html_invalido' | 'otro'
  intentos        integer not null default 1,
  primer_intento_at timestamptz not null default now(),
  ultimo_intento_at timestamptz not null default now(),
  ultimo_error    text                     -- descripción breve del último fallo
);

create index if not exists urls_fallidas_cache_fuente_idx
  on public.urls_fallidas_cache (fuente_id, ultimo_intento_at);

comment on table public.urls_fallidas_cache is
  'URLs ya intentadas por scrapers que fallan por razones persistentes (sin geo). Se re-intentan tras 30 días.';

-- RLS: solo service_role.
alter table public.urls_fallidas_cache enable row level security;

-- RPC para upsert con incremento atómico. Si la URL ya está, incrementa
-- intentos + actualiza ultimo_intento_at. Si no, insert nuevo.
create or replace function public.marcar_url_fallida(
  p_url text,
  p_fuente_id text,
  p_motivo text,
  p_ultimo_error text default null
) returns void language sql security definer as $$
  insert into public.urls_fallidas_cache
    (url, fuente_id, motivo, intentos, primer_intento_at, ultimo_intento_at, ultimo_error)
  values (p_url, p_fuente_id, p_motivo, 1, now(), now(), p_ultimo_error)
  on conflict (url) do update set
    intentos          = urls_fallidas_cache.intentos + 1,
    ultimo_intento_at = now(),
    motivo            = excluded.motivo,
    ultimo_error      = excluded.ultimo_error;
$$;

grant execute on function public.marcar_url_fallida(text, text, text, text) to service_role;
