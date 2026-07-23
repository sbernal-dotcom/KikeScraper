#!/usr/bin/env bash
# Pipeline completo del scraper — equivalente al workflow yml de GH Actions.
#
# Cada step corre con `|| true` implícito vía `|| echo "..."` para no cortar
# si uno falla (patrón `continue-on-error` de GH Actions). Un fallo puntual
# de un scraper no debe abortar el pipeline entero — el resto igual corre.
#
# Uso: bash scripts/run-pipeline.sh
#
# Env vars requeridas (mismas que el yml):
#   NEXT_PUBLIC_SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   GEMINI_API_KEY
#   GROQ_API_KEY
#   NEXT_PUBLIC_MAPBOX_TOKEN

set -u

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) — pipeline START ==="

# --- Scrapers (5 fuentes) ---
echo "▶ encuentra24"   && npm run scrape:prod          || echo "✗ encuentra24 fallo"
echo "▶ acobir"        && npm run scrape:acobir:prod   || echo "✗ acobir fallo"
echo "▶ panama equity" && npm run scrape:pe:prod       || echo "✗ pe fallo"
echo "▶ mls acobir"    && npm run scrape:mls:prod      || echo "✗ mls fallo"
echo "▶ savitat"       && npm run scrape:savitat:prod  || echo "✗ savitat fallo"

# --- Verify (pase 2 del lifecycle) ---
echo "▶ verify"        && npm run scrape:verify        || echo "✗ verify fallo"

# --- Scraper bottleneck al final (independiente del verify) ---
echo "▶ inmopanama"    && npm run scrape:inmo:prod     || echo "✗ inmopanama fallo"

# --- Post-passes (dedupe + limpieza + presunta venta) ---
echo "▶ dedupe"            && npm run dedupe:prod                    || echo "✗ dedupe fallo"
echo "▶ archivar-en-mar"   && npm run archivar-en-mar:apply          || echo "✗ archivar-en-mar fallo"
echo "▶ limpiar-cache"     && npm run limpiar-cache-duplicado:apply  || echo "✗ limpiar-cache fallo"
echo "▶ presunta-venta"    && npm run presunta-venta:apply           || echo "✗ presunta-venta fallo"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) — pipeline END ==="
