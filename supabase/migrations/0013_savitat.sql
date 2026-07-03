-- =========================================================================
-- 0013 — Savitat / CBRE Panamá como fuente (2026-07-02)
--
-- Savitat es el afiliado local de CBRE en Panamá (cbre.com.pa redirige
-- a savitat.com). Inventario ~150 propiedades únicas, mayormente
-- comercial/oficinas + algo residencial premium e inversión.
--
-- Datos via JSON-LD Schema.org RealEstateListing con coord exacta
-- (geo.latitude/longitude), precio, address. HTML server-rendered,
-- sin CF, sin JS. Se ingiere desde el sitemap XML.
-- =========================================================================

insert into public.fuentes (id, nombre, url_base, descripcion) values
  ('savitat', 'CBRE Panamá (Savitat)', 'https://savitat.com',
   'Afiliado local de CBRE en Panamá — comercial premium + residencial inversión, coord exacta en JSON-LD')
on conflict (id) do nothing;
