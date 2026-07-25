-- =========================================================================
-- 0015 — Cache de extracción IA de edificio (2026-07-25)
--
-- Cachea la respuesta de `extraerEdificio()` (Groq Llama 3.1) para
-- evitar re-preguntar la misma cadena título+descripción cada corrida.
--
-- Problema: 2026-07-24 Railway cron atascado 16h por 716 x 429 Groq.
-- Aún con concurrency=1, la ventana de 6000 TPM se satura porque
-- procesamos 1000+ URLs InmoPanama y 300 Savitat, y CADA URL llama
-- a Groq incluso si el anuncio es idéntico a ayer (títulos y desc
-- casi nunca cambian entre corridas).
--
-- Solución: hash del input (titulo + desc[:600]) como clave. Con
-- cache tibia (segunda corrida en adelante) esperamos 60-80% hit rate
-- → 60-80% menos llamadas a Groq → cero rate limits en corridas
-- diarias.
--
-- La extracción es determinista (temperature 0.1) — cachear indefinido
-- es seguro. Si en el futuro cambiamos prompt/modelo, dropeamos la tabla.
-- =========================================================================

create table if not exists public.ia_extract_cache (
  input_hash    text primary key,          -- sha256(titulo + "|" + desc.slice(0,600))
  edificio      text,                       -- nullable (IA dijo null)
  proyecto      text,
  zona          text,
  model         text not null,              -- 'llama-3.1-8b-instant' (para invalidar si cambia)
  hit_count     integer not null default 1,
  created_at    timestamptz not null default now(),
  last_hit_at   timestamptz not null default now()
);

comment on table public.ia_extract_cache is
  'Cache de extraerEdificio() de Groq. Key: sha256(titulo + | + desc[:600]).';

-- RLS: solo service_role escribe/lee (los scrapers). Frontend no toca.
alter table public.ia_extract_cache enable row level security;

-- Sin políticas anon → RLS bloquea acceso público por default.

-- RPC para incrementar hit_count sin race conditions (varios scrapers
-- corriendo a la vez pueden pegarle a la misma fila). Llamada desde
-- ia-extract-edificio.ts como fire-and-forget.
create or replace function public.ia_extract_cache_touch(p_hash text)
returns void language sql security definer as $$
  update public.ia_extract_cache
     set hit_count   = hit_count + 1,
         last_hit_at = now()
   where input_hash = p_hash;
$$;

grant execute on function public.ia_extract_cache_touch(text) to service_role;
