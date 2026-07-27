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

# Timeouts por paso — red de seguridad contra crashes silenciosos.
# 2026-07-27: agregado tras un deploy Railway que quedó colgado 13h+
# porque un scraper (probablemente Playwright) se colgó sin emitir logs.
# Cada scraper ya tiene sus propios timeouts internos por fetch/página,
# pero un cuelgue del proceso de Node/Playwright los burla. `timeout`
# mata el proceso hijo y devuelve control al pipeline.
#
# Duraciones observadas normales (26/07):
#   encuentra24 22min, acobir 3min, PE 2min, MLS 35min, savitat 11min,
#   verify 22min, inmopanama 90min (hard timeout interno).
#
# Timeouts con ~2x margen sobre lo normal — si algo se cuelga, lo mata
# y el pipeline sigue con el próximo paso.
T_ENC=60m
T_ACO=15m
T_PE=15m
T_MLS=60m
T_SAV=75m
T_VER=45m
T_INMO=120m
T_POST=15m

run_step() {
  local name=$1
  local dur=$2
  shift 2
  echo "▶ $name"
  if ! timeout --preserve-status --kill-after=30s "$dur" "$@"; then
    local rc=$?
    if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then
      echo "✗ $name TIMEOUT (${dur}) — matado forzoso"
    else
      echo "✗ $name fallo (exit $rc)"
    fi
  fi
}

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) — pipeline START ==="

# --- Scrapers (5 fuentes) ---
run_step "encuentra24"   $T_ENC  npm run scrape:prod
run_step "acobir"        $T_ACO  npm run scrape:acobir:prod
run_step "panama equity" $T_PE   npm run scrape:pe:prod
run_step "mls acobir"    $T_MLS  npm run scrape:mls:prod
run_step "savitat"       $T_SAV  npm run scrape:savitat:prod

# --- Verify (pase 2 del lifecycle) ---
run_step "verify"        $T_VER  npm run scrape:verify

# --- Scraper bottleneck al final (independiente del verify) ---
run_step "inmopanama"    $T_INMO npm run scrape:inmo:prod

# --- Post-passes (dedupe + limpieza + presunta venta) ---
run_step "dedupe"          $T_POST npm run dedupe:prod
run_step "archivar-en-mar" $T_POST npm run archivar-en-mar:apply
run_step "limpiar-cache"   $T_POST npm run limpiar-cache-duplicado:apply
run_step "presunta-venta"  $T_POST npm run presunta-venta:apply

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) — pipeline END ==="
