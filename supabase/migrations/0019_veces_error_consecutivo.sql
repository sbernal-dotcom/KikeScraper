-- =========================================================================
-- 0019 — Contador de errores consecutivos de verify (2026-08-09, fix H6)
--
-- Problema: HTTP 403 (Cloudflare/rate-limit/bloqueo temporal) hacía que
-- verify moviera la propiedad de "activo" a "error_verificacion" en la
-- primera corrida con error. Al día siguiente el 403 seguía → misma
-- transición → loop permanente. Estados legítimos perdidos por un
-- problema de red del portal.
--
-- Fix: sostener 3 corridas consecutivas con error antes de escalar a
-- "error_verificacion". Requiere contador propio (no reusar
-- `veces_no_encontrado` que tiene semántica distinta — mide "muerte
-- probable" vs este mide "posible bloqueo").
--
-- Reglas del contador:
--   - viva            → reset a 0
--   - no_encontrada   → reset a 0 (no está bloqueado, sí desaparecido)
--   - error           → incrementa. <3 mantiene estado_anuncio previo,
--                       >=3 mueve a "error_verificacion".
-- =========================================================================

alter table public.propiedades
  add column if not exists veces_error_consecutivo integer not null default 0;

comment on column public.propiedades.veces_error_consecutivo is
  'Corridas de verify consecutivas con error transitorio (403/timeout/5xx). '
  'Se resetea al primer resultado exitoso (viva o no_encontrada). '
  'A partir de 3 se escala a estado_anuncio=error_verificacion.';
