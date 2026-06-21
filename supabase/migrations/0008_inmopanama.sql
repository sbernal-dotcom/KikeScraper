-- =========================================================================
-- 0008 — InmoPanama como fuente (2026-06-19)
--
-- Agregador grande (~9500 propiedades en venta). NO publica lat/lng → todo
-- el geocoding cae a la tabla zonas-panama.ts + Nominatim. Cap inicial: 50
-- páginas (1000 propiedades).
-- =========================================================================

insert into public.fuentes (id, nombre, url_base, descripcion) values
  ('inmopanama', 'InmoPanama', 'https://www.inmopanama.com',
   'Agregador panameño — inventario grande sin coords GPS (geocoding por zona)')
on conflict (id) do nothing;
