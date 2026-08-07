-- =========================================================================
-- 0018 — IDs "sistema" en `fuentes` para jobs no-scraper
-- =========================================================================
-- Motivo: `scraper_runs.fuente_id` tiene FK a `fuentes(id)`. Los scripts
-- que corren en el pipeline pero NO scrapean una fuente concreta
-- (refresh-precios, verificar-estado, backfill-ia) estaban abusando
-- `fuente_id="encuentra24"` como workaround para pasar la FK — mezclaba
-- las corridas de 3 jobs distintos bajo un mismo ID → dashboards y
-- alertas veían números falsos (ej. "encuentra24 found=6000" cuando la
-- realidad era 3 jobs sumados).
--
-- Fix: agregar 3 IDs internos en `fuentes` para que cada job tenga su
-- propia fila en scraper_runs, con URLs vacías porque no scrapean.
--
-- Ver auditoría 2026-08-06 — CRITICAL C4.
-- =========================================================================

insert into public.fuentes (id, nombre, url_base, descripcion) values
  ('refresh-precios', 'Refresh precios',   '', 'Job diario: re-lee HTML de todas las activas y actualiza precio/área/hab/baños sin IA.'),
  ('verify',          'Verificar estado',  '', 'Job diario: valida que las URLs sigan vivas y escala contador veces_no_encontrado.'),
  ('backfill-ia',     'Backfill IA',       '', 'Job manual: regenera resúmenes IA de filas sin ellos.')
on conflict (id) do nothing;
