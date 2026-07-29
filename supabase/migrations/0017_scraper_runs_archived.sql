-- =========================================================================
-- 0017 — scraper_runs.archived (2026-07-30)
--
-- Agrega contador de "archivadas por corrida" para que la UI de historial
-- pueda mostrar en cada corrida cuántas propiedades salieron del mercado
-- (verificar-estado detecta 404/410/redirect y las marca archivado /
-- posible_inactivo). Antes vivía solo en el texto libre `notes` — frágil
-- para consumir desde el frontend.
--
-- Idempotente. Default 0 para filas históricas.
-- =========================================================================

alter table public.scraper_runs
  add column if not exists archived integer not null default 0;
