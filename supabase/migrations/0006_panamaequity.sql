-- =========================================================================
-- 0006 — Panama Equity como fuente (2026-06-09)
--
-- Bróker propio (no agregador) con JSON-LD RealEstateListing perfecto:
-- lat/lng exactos, m², recámaras, baños, año en cada anuncio. Complementa
-- a encuentra24 (clasificados masivos) y ACOBIR (proyectos nuevos).
--
-- Idempotente.
-- =========================================================================

insert into public.fuentes (id, nombre, url_base, descripcion) values
  ('panamaequity', 'Panama Equity', 'https://www.panamaequity.com',
   'Bróker boutique de Panamá — listings curados con coords GPS exactos')
on conflict (id) do nothing;
