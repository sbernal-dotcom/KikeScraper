-- =========================================================================
-- Analytics V1 — generated column precio_m2 + vistas de oportunidades
-- (idempotente — se puede re-ejecutar para actualizar)
-- =========================================================================

alter table public.propiedades
  add column if not exists precio_m2 numeric
  generated always as (precio / nullif(area_m2, 0)) stored;

create index if not exists propiedades_precio_m2_idx on public.propiedades (precio_m2);
create index if not exists propiedades_zona_op_cat_idx
  on public.propiedades (corregimiento, tipo_operacion, categoria);

-- Benchmark agregado por corregimiento + tipo_operacion + categoria
-- Excluye terrenos del cálculo de comparables (no comparable con apartos/casas).
create or replace view public.vw_zona_benchmark
  with (security_invoker = on) as
select
  corregimiento,
  tipo_operacion,
  categoria,
  count(*)::int                                                            as n_comparables,
  avg(precio_m2)::numeric                                                  as avg_precio_m2,
  percentile_cont(0.5) within group (order by precio_m2)::numeric          as median_precio_m2
from public.propiedades
where precio_m2 is not null
  and estado_anuncio = 'activo'
  and categoria <> 'terreno'
group by corregimiento, tipo_operacion, categoria;

-- Vista principal de oportunidades — INCLUYE todas las propiedades activas
-- (terrenos incluidos, pero su opportunity_score queda en null porque no
--  hay benchmark comparable para terrenos en V1).
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
  -- Lista de anuncios adicionales del mismo inmueble en otros portales.
  -- Cada elemento: { fuente_id, fuente_nombre, url_original, precio, moneda, fecha_deteccion }
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
  and p.area_m2 > 0;

grant select on public.vw_zona_benchmark to anon, authenticated;
grant select on public.vw_oportunidades  to anon, authenticated;
