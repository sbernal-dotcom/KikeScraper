-- =========================================================================
-- Seed: 10 propiedades de prueba + anuncios adicionales (3 propiedades
-- con publicaciones en múltiples portales).
-- Idempotente: limpia la tabla antes de insertar.
-- =========================================================================

truncate table public.anuncios, public.propiedades restart identity cascade;

do $$
declare
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid;
begin
  -- 1. Casco Viejo
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Apartamento en Casco Viejo', 385000, 'USD', 'venta', 'apartamento',
     8.9519, -79.5363, 'Panamá', 'Panamá', 'San Felipe', 95, 2, 2, 1,
     'usada', 'activo',
     'Apartamento usado de 95 m² en Casco Viejo, con 2 recámaras y 2 baños. Ubicación premium con valor histórico; precio por m² alto, dentro de lo esperado para la zona.',
     'encuentra24',
     'https://encuentra24.com/panama/casco-viejo-apartamento-1',
     '2026-04-01', '2026-04-02', '2026-05-17')
  returning id into p1;

  insert into public.anuncios
    (propiedad_id, fuente_id, url_original, precio, moneda, fecha_deteccion)
  values
    (p1, 'compreoalquile', 'https://compreoalquile.com/casco-viejo-1', 389000, 'USD', '2026-04-04'),
    (p1, 'inmuebles24',    'https://inmuebles24.com/panama/casco-viejo-1', 380000, 'USD', '2026-04-10');

  -- 2. PH Avenida Balboa
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('PH en Avenida Balboa', 525000, 'USD', 'venta', 'apartamento',
     8.9719, -79.5224, 'Panamá', 'Panamá', 'Calidonia', 180, 3, 3, 2,
     'nueva', 'activo',
     'Penthouse nuevo de 180 m² sobre Av. Balboa con vista al mar. 3 recámaras, 3 baños y 2 estacionamientos. Precio por m² está en el rango alto de la zona, justificado por la ubicación y la condición.',
     'compreoalquile', 'https://compreoalquile.com/balboa-ph-2',
     '2026-03-15', '2026-03-16', '2026-05-17')
  returning id into p2;

  -- 3. Bella Vista
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Apartamento en Bella Vista', 2400, 'USD', 'alquiler', 'apartamento',
     8.9831, -79.5208, 'Panamá', 'Panamá', 'Bella Vista', 110, 2, 2, 1,
     'usada', 'activo',
     'Apartamento usado de 110 m² en Bella Vista para alquilar. 2 recámaras y 2 baños, con 1 estacionamiento. Renta competitiva para el corregimiento.',
     'encuentra24', 'https://encuentra24.com/panama/bella-vista-3',
     '2026-04-20', '2026-04-21', '2026-05-17')
  returning id into p3;

  -- 4. Obarrio (oficina)
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Oficina en Obarrio', 1800, 'USD', 'alquiler', 'oficina',
     8.9866, -79.5302, 'Panamá', 'Panamá', 'Bella Vista', 85, null, null, 2,
     'usada', 'activo',
     'Oficina usada de 85 m² en Obarrio, con 2 estacionamientos. Zona corporativa consolidada; renta dentro del promedio del corregimiento.',
     'compreoalquile', 'https://compreoalquile.com/obarrio-oficina-4',
     '2026-04-05', '2026-04-06', '2026-05-17')
  returning id into p4;

  -- 5. Marbella
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Apartamento en Marbella', 295000, 'USD', 'venta', 'apartamento',
     8.9772, -79.5314, 'Panamá', 'Panamá', 'Bella Vista', 105, 2, 2, 1,
     'usada', 'activo',
     'Apartamento usado de 105 m² en Marbella, 2 recámaras y 2 baños. Precio por m² ligeramente por debajo de la media de la zona — posible oportunidad.',
     'encuentra24', 'https://encuentra24.com/panama/marbella-5',
     '2026-04-10', '2026-04-11', '2026-05-17')
  returning id into p5;

  -- 6. Penthouse Punta Pacífica
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Penthouse en Punta Pacífica', 950000, 'USD', 'venta', 'apartamento',
     8.9722, -79.5063, 'Panamá', 'Panamá', 'San Francisco', 280, 4, 4, 3,
     'nueva', 'activo',
     'Penthouse nuevo de 280 m² en Punta Pacífica frente al mar. 4 recámaras, 4 baños, 3 estacionamientos. Producto premium; precio por m² alto pero consistente con propiedades comparables.',
     'inmuebles24', 'https://inmuebles24.com/panama/punta-pacifica-6',
     '2026-03-22', '2026-03-23', '2026-05-17')
  returning id into p6;

  -- 7. San Francisco (alquiler)
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Apartamento en San Francisco', 2200, 'USD', 'alquiler', 'apartamento',
     9.0028, -79.5147, 'Panamá', 'Panamá', 'San Francisco', 120, 3, 2, 2,
     'usada', 'activo',
     'Apartamento usado de 120 m² en San Francisco, con 3 recámaras, 2 baños y 2 estacionamientos. Su precio por m² está dentro del rango medio de la zona.',
     'encuentra24', 'https://encuentra24.com/panama/san-francisco-7',
     '2026-05-01', '2026-05-12', '2026-05-17')
  returning id into p7;

  insert into public.anuncios
    (propiedad_id, fuente_id, url_original, precio, moneda, fecha_deteccion)
  values
    (p7, 'compreoalquile', 'https://compreoalquile.com/san-francisco-7', 2250, 'USD', '2026-05-14');

  -- 8. Casa Costa del Este
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Casa en Costa del Este', 720000, 'USD', 'venta', 'casa',
     9.0017, -79.4778, 'Panamá', 'Panamá', 'Parque Lefevre', 340, 4, 4, 3,
     'usada', 'activo',
     'Casa usada de 340 m² en Costa del Este, 4 recámaras y 4 baños. Zona residencial consolidada; precio por m² competitivo respecto a comparables recientes.',
     'compreoalquile', 'https://compreoalquile.com/costa-del-este-8',
     '2026-04-12', '2026-04-13', '2026-05-17')
  returning id into p8;

  insert into public.anuncios
    (propiedad_id, fuente_id, url_original, precio, moneda, fecha_deteccion)
  values
    (p8, 'encuentra24', 'https://encuentra24.com/panama/costa-del-este-8', 715000, 'USD', '2026-04-15'),
    (p8, 'inmuebles24', 'https://inmuebles24.com/panama/costa-del-este-8', 729000, 'USD', '2026-04-20');

  -- 9. Local El Cangrejo
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Local comercial en El Cangrejo', 4500, 'USD', 'alquiler', 'local-comercial',
     8.9854, -79.5343, 'Panamá', 'Panamá', 'Bella Vista', 160, null, null, 2,
     'usada', 'activo',
     'Local comercial usado de 160 m² en El Cangrejo, ideal para restaurante/oficina. Tráfico peatonal alto. Renta dentro del promedio comercial de la zona.',
     'inmuebles24', 'https://inmuebles24.com/panama/el-cangrejo-9',
     '2026-03-30', '2026-03-31', '2026-05-17')
  returning id into p9;

  -- 10. Terreno Clayton
  insert into public.propiedades
    (titulo, precio, moneda, tipo_operacion, categoria, lat, lng,
     provincia, distrito, corregimiento, area_m2, habitaciones, banos,
     estacionamientos, condicion, estado_anuncio, resumen_ia, fuente_id,
     url_original, fecha_publicacion, fecha_deteccion, fecha_actualizacion)
  values
    ('Terreno en Clayton', 480000, 'USD', 'venta', 'terreno',
     8.9956, -79.5867, 'Panamá', 'Panamá', 'Ancón', 820, null, null, null,
     'usada', 'activo',
     'Terreno de 820 m² en Clayton, con uso residencial. Zona en crecimiento; precio por m² bajo respecto a la media de venta de terrenos en el corregimiento.',
     'encuentra24', 'https://encuentra24.com/panama/clayton-10',
     '2026-04-25', '2026-04-26', '2026-05-17')
  returning id into p10;
end $$;
