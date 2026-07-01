-- =========================================================================
-- 0012 — Presunta venta (2026-07-01)
--
-- "Vendido" no es algo que los portales panameños marquen explícitamente
-- (salvo panamaequity ocasionalmente). Lo que sí podemos inferir con
-- señales de tiempo:
--
--   Si una propiedad estuvo activa MUCHO tiempo (≥30 días) y luego
--   desapareció hace RATO (≥14 días sin volver), es muy probable
--   que se haya vendido/alquilado — vs. una que murió a los 3 días
--   (más probable: pausada por el vendedor).
--
-- NO tocamos estado_anuncio (el frontend sigue igual). NO borramos filas
-- (el histórico vale para stats de "tiempo promedio de venta por zona").
-- Solo agregamos un flag consultable.
--
-- El script `marcar-presuntas-ventas.ts` corre las reglas y setea estos
-- campos. Idempotente: una prop que revive (vuelve a activa) NO limpia
-- el flag automáticamente — lo hace el mismo script al detectar
-- estado_anuncio='activo' con presunta_venta=true (se rectifica).
-- =========================================================================

alter table public.propiedades
  add column if not exists presunta_venta        boolean     not null default false,
  add column if not exists fecha_presunta_venta  timestamptz;

-- Comentario en la columna para admin panel futuro.
comment on column public.propiedades.presunta_venta is
  'True si inferimos que la propiedad se vendió/alquiló por su patrón de duración en el mercado. Ver scripts/scrapers/marcar-presuntas-ventas.ts.';

-- Índice para filtros tipo "mostrar solo activas y NO presuntas ventas".
create index if not exists propiedades_presunta_venta_idx
  on public.propiedades (presunta_venta)
  where presunta_venta = true;
