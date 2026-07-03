# Requerimientos técnicos

## Stack

- **Next.js 16.2.6** App Router con React 19, Turbopack, TypeScript
  strict. ⚠️ Esta versión tiene breaking changes vs. training data —
  siempre consultar `node_modules/next/dist/docs/` antes de escribir
  código Next.
- **Supabase** (PostgreSQL + RLS) — cliente `@supabase/supabase-js`.
  Service role key solo en scripts, nunca en frontend.
- **Playwright** (chromium) para sitios JS-heavy — solo cuando fetch()
  no basta.
- **Mapbox GL** para el mapa + Mapbox Static para thumbnails
  satelitales de las cards.
- **Groq API** (Llama 3.1 8B Instant) — extracción de edificio/zona.
  14,400 req/día free tier.
- **Gemini Flash Lite** — resumen bilingüe (kept post-migration).

## Estructura de directorios

```
src/
  app/                    — rutas Next (page.tsx por route)
  components/             — componentes compartidos + shadcn
  features/propiedades/   — feature slice completo (types, hooks, cards)
  lib/
    geo/panama-land.ts    — isOnLand() point-in-polygon + landmarks
    satellite-image.ts    — helper Mapbox Static URL
    supabase/             — clientes (server / admin / client)
  i18n/                   — LocaleProvider + dictionaries es/en
scripts/scrapers/         — todo el pipeline de scraping (tsx puro)
supabase/migrations/      — SQL numerados por orden de aplicación
requeriments/             — este directorio
```

## Reglas de código

- **Sin comentarios innecesarios**: solo cuando el "por qué" no es
  obvio (workaround de bug, invariante escondida, decisión de diseño).
- **NO error handling defensivo** para casos que no pueden pasar. Solo
  validar en bordes (input externo, APIs).
- **Preferir editar archivos existentes** sobre crear nuevos.
- **NO shims de compatibilidad**: si algo no se usa, se borra.
- **NO usar `next/image`**: usar `<img>` directo (limitación del
  proyecto por Mapbox Static URLs).

## Reglas de scraping

- **robots.txt siempre**: cada scraper valida robots.txt antes de
  correr. Si prohíbe la ruta → abortar.
- **User-Agent honesto**:
  `MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)`
- **Jitter entre requests**: mínimo 300-700 ms. Para scrapers que
  llaman a Groq (~500 tokens/call), jitter 1.5-3s + concurrency 1 para
  no chocar con rate limit (6k TPM free tier).
- **Sin retry infinito**: máx 2-3 intentos, luego skip y log.
- **Retry 429 con backoff exponencial** en llamadas IA.

## Reglas de DB

- Migraciones numeradas (`0001_init.sql` → `0014_precision_ubicacion.sql`).
  Idempotentes (`IF NOT EXISTS`).
- Aplicación manual en Supabase SQL Editor (no automatizada).
- `SELECT` con `.range(from, to)` **siempre en loops** cuando podemos
  pasar 1000 rows (Supabase cap default).
- **Nunca commit de credenciales**. `.env.local` en `.gitignore`.
  `.claude/` también.

## CI/CD

- **GitHub Actions cron**: 1×/día a las 08:00 UTC (03:00 hora Panamá).
  Timeout 120 min. Ver `.github/workflows/scraper.yml`.
- **Deploy Vercel** desde main branch. Env vars manuales.
- **Auto-commit y push** después de cada cambio en sesiones asistidas
  (política del proyecto).

## Fuentes de datos externas

- **DuckDuckGo HTML** — búsqueda de coord de edificios (sin API key).
- **Nominatim (OSM)** — fallback de geocoding por zona.
- **Mapbox Geocoding** — validación cruzada (loguea si diff >2 km).
  50k req/mes free tier.
- **Natural Earth** — contorno costero de Panamá (embebido en código,
  no bajado en runtime).
