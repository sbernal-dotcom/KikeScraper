-- =========================================================================
-- Mapa Interactivo Inteligente — schema inicial (2026-05-20)
--
-- Tablas:
--   fuentes     — catálogo de portales (Encuentra24, Compre o Alquile, …)
--   propiedades — propiedad canónica (1 por inmueble del mundo real)
--   anuncios    — N publicaciones de la misma propiedad en distintas fuentes
--
-- Convenciones:
--   * snake_case en columnas (Postgres)
--   * timestamps en timestamptz con default now()
--   * RLS habilitado en las 3 tablas; lectura pública anónima
--     (los datos vienen de fuentes públicas). Escritura solo service_role.
-- =========================================================================

-- Extensiones necesarias
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =========================================================================
-- 1. FUENTES
-- =========================================================================
create table if not exists public.fuentes (
  id          text primary key,             -- slug: "encuentra24", "compreoalquile"
  nombre      text not null,
  url_base    text not null,
  logo        text,
  descripcion text,
  created_at  timestamptz not null default now()
);

-- =========================================================================
-- 2. PROPIEDADES (canónicas)
-- =========================================================================
create type tipo_operacion as enum ('venta', 'alquiler');

create type categoria_propiedad as enum (
  'apartamento', 'casa', 'terreno', 'local-comercial', 'oficina', 'galera'
);

create type condicion_propiedad as enum ('nueva', 'usada');

create type estado_anuncio as enum ('activo', 'vendido', 'alquilado', 'retirado');

create type moneda as enum ('USD', 'PAB');

create table if not exists public.propiedades (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  descripcion         text,

  tipo_operacion      tipo_operacion not null,
  categoria           categoria_propiedad not null,
  condicion           condicion_propiedad,
  estado_anuncio      estado_anuncio not null default 'activo',

  -- ubicación
  lat                 double precision not null,
  lng                 double precision not null,
  direccion           text,
  provincia           text,
  distrito            text,
  corregimiento       text,

  -- specs
  area_m2             numeric(10,2),
  habitaciones        smallint,
  banos               smallint,
  estacionamientos    smallint,

  -- precio "primario" (el del anuncio principal)
  precio              numeric(14,2) not null,
  moneda              moneda not null default 'USD',

  -- IA
  resumen_ia          text,

  -- fuente principal (la primera detectada o la canónica)
  fuente_id           text not null references public.fuentes(id) on delete restrict,
  url_original        text not null,

  imagenes            text[] not null default '{}',

  fecha_publicacion   date,
  fecha_deteccion     timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index if not exists propiedades_lat_lng_idx     on public.propiedades (lat, lng);
create index if not exists propiedades_corregimiento_idx on public.propiedades (corregimiento);
create index if not exists propiedades_tipo_op_idx     on public.propiedades (tipo_operacion);
create index if not exists propiedades_categoria_idx   on public.propiedades (categoria);
create index if not exists propiedades_precio_idx      on public.propiedades (precio);
create index if not exists propiedades_estado_idx      on public.propiedades (estado_anuncio);

-- =========================================================================
-- 3. ANUNCIOS (cada listing en cada portal)
-- =========================================================================
create table if not exists public.anuncios (
  id                uuid primary key default gen_random_uuid(),
  propiedad_id      uuid not null references public.propiedades(id) on delete cascade,
  fuente_id         text not null references public.fuentes(id) on delete restrict,
  url_original      text not null,
  precio            numeric(14,2),
  moneda            moneda default 'USD',
  fecha_publicacion date,
  fecha_deteccion   timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  unique (propiedad_id, fuente_id, url_original)
);

create index if not exists anuncios_propiedad_idx on public.anuncios (propiedad_id);
create index if not exists anuncios_fuente_idx    on public.anuncios (fuente_id);

-- =========================================================================
-- 4. TRIGGERS — mantener fecha_actualizacion al día
-- =========================================================================
create or replace function public.touch_fecha_actualizacion()
returns trigger language plpgsql as $$
begin
  new.fecha_actualizacion := now();
  return new;
end;
$$;

drop trigger if exists trg_propiedades_touch on public.propiedades;
create trigger trg_propiedades_touch
  before update on public.propiedades
  for each row execute function public.touch_fecha_actualizacion();

-- =========================================================================
-- 5. RLS — lectura pública anónima, escritura solo service_role
-- =========================================================================
alter table public.fuentes      enable row level security;
alter table public.propiedades  enable row level security;
alter table public.anuncios     enable row level security;

-- SELECT público
create policy "anon read fuentes"      on public.fuentes
  for select using (true);
create policy "anon read propiedades"  on public.propiedades
  for select using (true);
create policy "anon read anuncios"     on public.anuncios
  for select using (true);

-- (sin policy de INSERT/UPDATE/DELETE para roles anon/authenticated
--  → solo service_role puede escribir, que es lo que queremos por ahora)

-- =========================================================================
-- 6. SEED — fuentes iniciales
-- =========================================================================
insert into public.fuentes (id, nombre, url_base, descripcion) values
  ('encuentra24',    'Encuentra24',     'https://www.encuentra24.com',    'Portal clasificados Centroamérica'),
  ('compreoalquile', 'Compre o Alquile','https://www.compreoalquile.com', 'Portal inmobiliario Panamá'),
  ('inmuebles24',    'Inmuebles 24',    'https://www.inmuebles24.com',    'Portal inmobiliario LatAm')
on conflict (id) do nothing;
