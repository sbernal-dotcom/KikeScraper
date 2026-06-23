-- =========================================================================
-- 0009 — Deduplicación cross-source (2026-06-23)
--
-- Misma propiedad publicada en varias fuentes (encuentra24 + mlsacobir +
-- inmopanama, etc.) genera N filas en `propiedades`. Esta tabla mapea
-- cada duplicado a su "canónica" (la que el frontend debe mostrar).
--
-- Diseño:
--   * Tabla puente NO destructiva — no mutamos `propiedades`. El script
--     de dedupe es idempotente: wipe + rebuild en cada corrida.
--   * PK en `propiedad_id` → cada prop puede ser duplicado de UNA sola
--     canónica (la elección es determinista vía source priority).
--   * El frontend hace `LEFT JOIN propiedades_duplicados USING(id)` y
--     filtra `where propiedad_id is null` para mostrar solo canónicas.
--
-- Prioridad de fuentes (la canónica es la fuente con índice MÁS BAJO):
--   1. encuentra24    (listing más amplio, suele ser el original)
--   2. acobir         (proyectos nuevos con datos brand-name)
--   3. mlsacobir      (inventario gremial verificado)
--   4. panamaequity   (curado por broker)
--   5. inmopanama     (agregador, menos info)
-- =========================================================================

create table if not exists public.propiedades_duplicados (
  propiedad_id  uuid primary key references public.propiedades(id) on delete cascade,
  canonica_id   uuid not null    references public.propiedades(id) on delete cascade,
  score         numeric(4,3) not null,   -- 0.000-1.000 (mayor = más similar)
  motivo        text not null,            -- "geo+area+precio", "geo+area", etc.
  detectado_at  timestamptz not null default now(),

  check (propiedad_id <> canonica_id)
);

create index if not exists propiedades_duplicados_canonica_idx
  on public.propiedades_duplicados (canonica_id);

-- RLS: lectura pública (igual que el resto), escritura solo service_role.
alter table public.propiedades_duplicados enable row level security;

drop policy if exists "anon read propiedades_duplicados" on public.propiedades_duplicados;
create policy "anon read propiedades_duplicados" on public.propiedades_duplicados
  for select using (true);
