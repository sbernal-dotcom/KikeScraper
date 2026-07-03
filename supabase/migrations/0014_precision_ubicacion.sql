-- =========================================================================
-- 0014 — Precisión de ubicación + fuente auditable (2026-07-02)
--
-- Hasta ahora todas las coordenadas iban con el mismo peso al mapa, aunque
-- ~93% son aproximadas (web-search) y solo ~7% son exactas (JSON-LD de
-- panamaequity). Este par de columnas permite:
--
--   a) Distinguir en el frontend con un badge "ubicación aproximada".
--   b) Aceptar centroides de zona SOLO cuando la fuente los publica
--      explícitamente (nueva política: allowZoneFallback en el pipeline).
--   c) Auditar retrospectivamente cómo se resolvió cada coord.
--
-- Notas:
--   - precision_ubicacion tiene CHECK constraint: solo 3 valores + null.
--     Nulos = históricos que no sabemos aún. Se pueden backfillear después
--     con un script que mire fuente_id + patrón de coord.
--   - ubicacion_fuente es text libre a propósito: valores como "jsonld_geo",
--     "streetAddress_zona", "titulo_zona", "web_search", "edificios_cache".
--     Nuevas variantes no requieren migración.
-- =========================================================================

alter table public.propiedades
  add column if not exists precision_ubicacion text,
  add column if not exists ubicacion_fuente    text;

-- CHECK con IF NOT EXISTS no está soportado; usamos DO $$ ... $$ para
-- que el script sea idempotente.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'precision_ubicacion_check'
      and conrelid = 'public.propiedades'::regclass
  ) then
    alter table public.propiedades
      add constraint precision_ubicacion_check
      check (precision_ubicacion in ('exacta', 'zona-declarada', 'aproximada'));
  end if;
end $$;

comment on column public.propiedades.precision_ubicacion is
  'Nivel de precisión de la coord: exacta (JSON-LD del source), zona-declarada (centroide de zona publicada por el source), aproximada (web-search u otro método inferido), o null (histórico no clasificado).';

comment on column public.propiedades.ubicacion_fuente is
  'Cómo se obtuvo la coord: jsonld_geo, streetAddress_zona, titulo_zona, web_search, edificios_cache, etc. Text libre para permitir nuevos métodos sin migración.';

create index if not exists propiedades_precision_ubicacion_idx
  on public.propiedades (precision_ubicacion);
