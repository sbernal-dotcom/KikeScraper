# Fuentes de datos

6 fuentes activas en el cron diario. Cada scraper tiene su `scraper-*.ts`
en `scripts/scrapers/` con npm scripts asociados.

## Fuentes activas

| Fuente | Tipo | Método discovery | Publica coord? | Volumen aprox |
|---|---|---|---|---|
| **Encuentra24** | Portal general | Listado paginado (7 categorías) | ❌ | ~316 activas |
| **ACOBIR Proyectos** | Gremial (curado) | Listado semanal | ❌ | ~47 activas |
| **Panama Equity** | Bróker boutique | Listado + JSON-LD por prop | ✅ `geo.latitude/longitude` | ~53 activas |
| **MLS Acobir** | Gremial MLS | Listado paginado (?wplpage=N) | ❌ | ~278 activas |
| **InmoPanama** | Agregador | Listado paginado | ❌ | ~314 activas |
| **CBRE Panamá (Savitat)** | Bróker corporativo | Sitemap XML | ⚠️ A veces JSON-LD | ~93 activas |

**Total activas ~1101 propiedades** (varía con el cron diario).

## Restricciones y ToS

Reglas obligatorias que cada scraper implementa:

- **robots.txt validado** en cada corrida. Si prohíbe la ruta, aborta.
- **User-Agent**: `MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)`
- **Jitter aleatorio** entre requests. Mínimo por scraper:
  - Encuentra24, MLS, InmoPanama, ACOBIR, Panama Equity: 300-700 ms
  - Savitat: 1500-3000 ms (rate limit Groq + concurrency 1)
- **Sin scraping** de fotos, teléfono, email, vendedor, descripción
  persistida.
- **Máximo 5 páginas** en Compre o Alquile (por robots.txt del sitio) —
  actualmente no scrapeado por bloqueo Cloudflare.

## Fuentes descartadas o evaluadas

| Fuente | Razón |
|---|---|
| Compre o Alquile | Cloudflare Turnstile bloquea Playwright headless. Requeriría stealth plugin (frágil) o CAPTCHA solver de pago |
| Inmuebles24 | Mismo grupo Adevinta que Encuentra24 — riesgo de baneo cruzado |
| Facebook Marketplace | ToS prohíbe scraping + requiere login |
| Colliers Panamá | Sitio corporativo global sin inventario Panamá públicamente listado |
| Registro Público | No es fuente de listings — sirve para due diligence 1-a-1 |
| MIVIOT / INEC | Datos macro (contexto de mercado), no listings — candidato a fase 2 del producto |

## Método de discovery por scraper

- **Encuentra24, MLS Acobir, ACOBIR, InmoPanama, Panama Equity**:
  paginación del listado del portal. Skip URLs que ya están en DB
  como activas (paginado con `.range()` para evitar cap de 1000).
- **Savitat**: sitemap.xml directo. Filtra `/properties/` en ES,
  descarta `/en/` para evitar duplicados.

## Cron

- Frecuencia: **1× por día** a las 08:00 UTC (03:00 hora Panamá).
- Timeout total: **120 minutos**.
- Orden de ejecución: encuentra24 → acobir → panamaequity → mlsacobir →
  inmopanama → **savitat** → verify → archivar-en-mar → dedupe →
  presunta-venta → alertas.
- Cada scraper tiene `continue-on-error: true` — un fallo aislado no
  detiene el resto del pase.
