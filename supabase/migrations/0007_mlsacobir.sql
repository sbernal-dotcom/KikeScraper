-- =========================================================================
-- 0007 — MLS ACOBIR como fuente (2026-06-18)
--
-- Inventario gremial de ACOBIR (Realtyna WPL plugin). ~1300 propiedades
-- visibles públicamente, cubre toda Panamá (no solo ciudad capital).
-- Datos via Schema.org microdata (itemprop="price/name/floorSize/...").
-- =========================================================================

insert into public.fuentes (id, nombre, url_base, descripcion) values
  ('mlsacobir', 'MLS Acobir', 'https://www.mlsacobir.com',
   'Inventario gremial MLS de ACOBIR — todo Panamá, plugin Realtyna WPL')
on conflict (id) do nothing;
