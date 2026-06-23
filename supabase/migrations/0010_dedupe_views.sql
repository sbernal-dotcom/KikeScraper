-- =========================================================================
-- 0010 — Filtrar duplicados de las views (2026-06-23)
--
-- Después de 0009 (tabla propiedades_duplicados) hay que actualizar las
-- views para que NO consideren los duplicados:
--   * vw_zona_benchmark: si no se excluyen, el benchmark queda inflado/
--     sesgado porque la misma propiedad cuenta N veces en su zona.
--   * vw_oportunidades: el frontend ya filtra propiedades vía la tabla
--     directa, pero la list view de oportunidades sale de aquí — debe
--     ver solo canónicas.
--
-- Idempotente: create or replace view. Re-ejecutar es seguro.
-- =========================================================================

create or replace view public.vw_zona_benchmark
  with (security_invoker = on) as
select
  corregimiento,
  tipo_operacion,
  categoria,
  count(*)::int                                                            as n_comparables,
  avg(precio_m2)::numeric                                                  as avg_precio_m2,
  percentile_cont(0.5) within group (order by precio_m2)::numeric          as median_precio_m2
from public.propiedades p
where precio_m2 is not null
  and estado_anuncio = 'activo'
  and categoria <> 'terreno'
  and not exists (
    select 1 from public.propiedades_duplicados d where d.propiedad_id = p.id
  )
group by corregimiento, tipo_operacion, categoria;

create or replace view public.vw_oportunidades
  with (security_invoker = on) as
with bench as (
  select * from public.vw_zona_benchmark
)
select
  p.id,
  p.titulo,
  p.precio,
  p.moneda,
  p.area_m2,
  p.precio_m2,
  p.tipo_operacion,
  p.categoria,
  p.condicion,
  p.estado_anuncio,
  p.corregimiento,
  p.distrito,
  p.provincia,
  p.fuente_id,
  f.nombre as fuente_nombre,
  p.url_original,
  p.fecha_deteccion,
  b.n_comparables,
  b.avg_precio_m2,
  b.median_precio_m2,
  coalesce(b.median_precio_m2, b.avg_precio_m2) as benchmark,
  case
    when coalesce(b.median_precio_m2, b.avg_precio_m2) is null
      or coalesce(b.median_precio_m2, b.avg_precio_m2) = 0
      then null
    else ((coalesce(b.median_precio_m2, b.avg_precio_m2) - p.precio_m2)
          / coalesce(b.median_precio_m2, b.avg_precio_m2)) * 100
  end as descuento_pct,
  case
    when p.categoria = 'terreno' then null
    when coalesce(b.median_precio_m2, b.avg_precio_m2) is null
      or coalesce(b.median_precio_m2, b.avg_precio_m2) = 0 then null
    else greatest(0::numeric, least(100::numeric,
      50 + (((coalesce(b.median_precio_m2, b.avg_precio_m2) - p.precio_m2)
             / coalesce(b.median_precio_m2, b.avg_precio_m2)) * 100) * 2
    ))
  end as opportunity_score,
  case
    when b.n_comparables is null or b.n_comparables < 3 then 'baja'
    when b.n_comparables < 8 then 'media'
    else 'alta'
  end as confianza,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'fuente_id',       a.fuente_id,
          'fuente_nombre',   af.nombre,
          'url_original',    a.url_original,
          'precio',          a.precio,
          'moneda',          a.moneda,
          'fecha_deteccion', a.fecha_deteccion
        )
        order by a.fecha_deteccion desc nulls last
      )
      from public.anuncios a
      left join public.fuentes af on af.id = a.fuente_id
      where a.propiedad_id = p.id
    ),
    '[]'::jsonb
  ) as otros_anuncios
from public.propiedades p
left join bench b
  on p.corregimiento  = b.corregimiento
 and p.tipo_operacion = b.tipo_operacion
 and p.categoria      = b.categoria
left join public.fuentes f on f.id = p.fuente_id
where p.precio is not null
  and p.area_m2 is not null
  and p.area_m2 > 0
  and not exists (
    select 1 from public.propiedades_duplicados d where d.propiedad_id = p.id
  );

grant select on public.vw_zona_benchmark to anon, authenticated;
grant select on public.vw_oportunidades  to anon, authenticated;
