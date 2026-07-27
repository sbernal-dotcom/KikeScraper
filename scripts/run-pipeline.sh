#!/usr/bin/env bash
# Pipeline completo del scraper — hard cap de 3h.
#
# Hard limit inflexible: si el pipeline entero pasa de 3h, se aborta.
# Nada de "10 horas colgado en Railway consumiendo trial". Un cron
# diario razonable termina en 2-3h con los caches activos.
#
# Uso: bash scripts/run-pipeline.sh
#
# Env vars requeridas: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# GEMINI_API_KEY, GROQ_API_KEY, NEXT_PUBLIC_MAPBOX_TOKEN.

set -u

GLOBAL_TIMEOUT=3h

# Timeouts por paso — dobles-red-de-seguridad además del global.
# Si un paso individual se cuelga, muere en su cap y el pipeline sigue
# con el próximo. Los valores están calibrados para que la SUMA cabe
# en 3h con margen para post-passes.
#
# Duraciones normales observadas (26/07):
#   encuentra24 22min, acobir 3min, PE 2min, MLS 35min, savitat 11min,
#   verify 22min, inmopanama 90min. Total 3h.
T_ENC=30m
T_ACO=10m
T_PE=10m
T_MLS=45m
T_SAV=25m
T_VER=30m
T_INMO=50m
T_POST=10m

# --- Bloque principal del pipeline. Se ejecuta bajo `timeout` global ---
# Uso heredoc con delimitador single-quoted ('EOF') para que bash NO
# expanda nada en el texto — pasamos el script literal a bash por stdin.
timeout --preserve-status --kill-after=1m $GLOBAL_TIMEOUT bash <<PIPELINE_EOF
set -u

T_ENC=$T_ENC
T_ACO=$T_ACO
T_PE=$T_PE
T_MLS=$T_MLS
T_SAV=$T_SAV
T_VER=$T_VER
T_INMO=$T_INMO
T_POST=$T_POST

run_step() {
  local name=\$1
  local dur=\$2
  shift 2
  echo "▶ \$name"
  if ! timeout --preserve-status --kill-after=30s "\$dur" "\$@"; then
    local rc=\$?
    if [ \$rc -eq 124 ] || [ \$rc -eq 137 ]; then
      echo "✗ \$name TIMEOUT (\${dur}) — matado forzoso"
    else
      echo "✗ \$name fallo (exit \$rc)"
    fi
  fi
}

echo "=== \$(date -u +%Y-%m-%dT%H:%M:%SZ) — pipeline START (hard cap $GLOBAL_TIMEOUT) ==="

# --- Scrapers (5 fuentes) ---
run_step "encuentra24"   \$T_ENC  npm run scrape:prod
run_step "acobir"        \$T_ACO  npm run scrape:acobir:prod
run_step "panama equity" \$T_PE   npm run scrape:pe:prod
run_step "mls acobir"    \$T_MLS  npm run scrape:mls:prod
run_step "savitat"       \$T_SAV  npm run scrape:savitat:prod

# --- Verify (pase 2 del lifecycle) ---
run_step "verify"        \$T_VER  npm run scrape:verify

# --- Scraper bottleneck al final (independiente del verify) ---
run_step "inmopanama"    \$T_INMO npm run scrape:inmo:prod

# --- Post-passes (dedupe + limpieza + presunta venta) ---
run_step "dedupe"          \$T_POST npm run dedupe:prod
run_step "archivar-en-mar" \$T_POST npm run archivar-en-mar:apply
run_step "limpiar-cache"   \$T_POST npm run limpiar-cache-duplicado:apply
run_step "presunta-venta"  \$T_POST npm run presunta-venta:apply

echo "=== \$(date -u +%Y-%m-%dT%H:%M:%SZ) — pipeline END ==="
PIPELINE_EOF

rc=$?
if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) — GLOBAL TIMEOUT ${GLOBAL_TIMEOUT} — pipeline abortado forzoso ==="
fi
exit 0
