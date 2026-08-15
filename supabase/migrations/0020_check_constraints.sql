-- =========================================================================
-- 0020 — CHECK constraints en columnas de texto libre (2026-08-11)
-- Fix auditoría M6 y M7.
--
-- Contexto:
--   * `propiedades.ubicacion_fuente` era text libre — cualquier typo
--     silencioso ("jsonldgeo", "Nominatim", "cache-manual") entraba y
--     no fallaba nada. El filtro del detector-colapso-cache buscaba
--     estrictamente `cache(web)`; una variante lo saltaba.
--   * `scraper_runs.status` era text libre con default 'running' — un
--     typo del scraper ("okay", "OK", "erorr") se aceptaba y rompía los
--     filtros de la alerta y del historial.
--
-- Regla:
--   * Se listan los valores documentados hoy en el código (ver
--     `scripts/scrapers/geocode-edificio.ts` para ubicacion_fuente).
--   * Cuando se agregue un source nuevo, la migration siguiente debe
--     dropear el constraint y recrearlo con la lista extendida.
-- =========================================================================

-- ── M6: CHECK en propiedades.ubicacion_fuente ────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ubicacion_fuente_check'
  ) then
    alter table public.propiedades
      add constraint ubicacion_fuente_check
      check (
        ubicacion_fuente is null
        or ubicacion_fuente in (
          'jsonld_geo',           -- coord del JSON-LD del portal (savitat, PE)
          'nominatim',            -- OSM/Nominatim fallback
          'titulo_zona',          -- zona-declarada extraída del título por IA
          'streetAddress_zona',   -- zona-declarada de streetAddress
          'cache(manual)',        -- edificios_cache con source='manual'
          'cache(google)',        -- edificios_cache con source='google'
          'cache(web)',           -- edificios_cache con source='web'
          'cache(sin_resultado)', -- edificios_cache miss cacheado
          'web'                   -- resolverNombre web-search directo (legacy)
        )
      );
  end if;
end $$;

-- ── M7: CHECK en scraper_runs.status ─────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scraper_runs_status_check'
  ) then
    alter table public.scraper_runs
      add constraint scraper_runs_status_check
      check (status in ('running', 'ok', 'error'));
  end if;
end $$;
