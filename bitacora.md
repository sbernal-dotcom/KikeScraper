# Bitácora del Proyecto

## Información General

- **Nombre del proyecto:** Mapa Interactivo Inteligente
- **Repositorio GitHub:** https://github.com/abilendesign/mapa-interactivo-inteligente.git
- **Correo del proyecto:** abilendesign@gmail.com
- **Fecha de inicio de bitácora:** 2026-05-15

## Descripción

Plataforma inteligente que organiza información pública del mercado inmobiliario panameño, mostrando fuentes originales, resúmenes, comparaciones y propiedades en un mapa interactivo.

A futuro, podría incluir una sección de análisis de rentabilidad para comparar oportunidades de compra o alquiler según los datos disponibles.

**Resumen corto:** Plataforma que organiza propiedades públicas, muestra fuentes originales, compara precios y detecta cambios en un mapa.

## Stack Tecnológico

| Área | Tecnologías |
|------|-------------|
| Frontend | Next.js + TypeScript + Tailwind CSS + shadcn/ui |
| Mapa | Mapbox GL JS |
| Base de datos | Supabase / PostgreSQL |
| Scraping | Node.js + Playwright |
| Geocoding | Nominatim (OpenStreetMap) — free, 1 req/s |
| IA | Gemini API (`gemini-flash-lite-latest`, free tier) |
| Tareas programadas | Railway Cron Jobs |
| Hosting | Vercel |
| Código | GitHub + Visual Studio Code + Claude Code |

## Funcionalidades Clave

- Organización de información pública del mercado inmobiliario panameño
- Visualización de propiedades en mapa interactivo
- Mostrar fuentes originales de cada propiedad
- Resúmenes y comparaciones de precios
- Detección de cambios en propiedades
- (Futuro) Análisis de rentabilidad compra vs alquiler

## Paleta de Colores

| Uso | Color | Hex | RGB |
|-----|-------|-----|-----|
| Venta (pin + cards + acentos) | Lime | `#D6FF00` | 214, 255, 0 |
| Alquiler (pin + cards + acentos) | Ámbar | `#FFBB00` | 255, 187, 0 |
| Cluster (grupo de pines en el mapa) | Amarillo | `#FFEC00` | 255, 236, 0 |
| Background | Negro casi puro | `#0a0a0a` | 10, 10, 10 |
| Texto sobre acento | Casi negro | `#0a0a0a` | 10, 10, 10 |

**Reglas:**
- El color de **cluster sobreescribe** el de operación (un cluster de venta o alquiler siempre se ve amarillo `#FFEC00`).
- Cards e indicadores derivan tints suaves del acento vía `accentVars()` en `src/features/propiedades/format.ts`:
  - `--accent-soft` = `rgba(R, G, B, 0.10)`
  - `--accent-medium` = `rgba(R, G, B, 0.14)`
- Definición canónica: `src/lib/mapbox/config.ts` (`MARKER_COLOR`, `MARKER_COLOR_ALQUILER`, `MARKER_COLOR_CLUSTER`) + `src/features/propiedades/format.ts` (`operationAccent()`).

## Decisiones y Cambios

<!-- Registrar aquí cambios importantes, decisiones técnicas, hitos del proyecto -->

- **2026-05-15** — Bitácora creada e inicialización del proyecto.
- **2026-05-15** — Repo Git local conectado a `origin` (GitHub). Primer commit con `bitacora.md` y `.gitignore` empujado a `main`.
- **2026-05-15** — Node.js v24.15.0 (LTS) instalado vía winget.
- **2026-05-15** — Proyecto Next.js inicializado en la raíz con: TypeScript, Tailwind CSS v4, ESLint, App Router, `src/` directory, import alias `@/*`, npm. Next.js 16.2.6, React 19.2.4.
- **2026-05-15** — shadcn/ui inicializado (template `next`, preset `base-nova`, color `neutral`). Generados `components.json`, `src/components/ui/button.tsx`, `src/lib/utils.ts` (helper `cn`), variables CSS en `globals.css`.
- **2026-05-15** — Mapbox GL JS instalado (`mapbox-gl` + `@types/mapbox-gl`). Configuración en `src/lib/mapbox/config.ts` (centro Panamá: -79.5199, 8.9824; estilo `streets-v12`).
- **2026-05-15** — Estructura de carpetas del dominio creada: `src/features/propiedades/` (types.ts), `src/features/fuentes/` (types.ts), `src/components/map/MapView.tsx`, `src/components/layout/`.
- **2026-05-15** — Home (`src/app/page.tsx`) actualizada para mostrar `MapView` a pantalla completa con header overlay. Layout con `lang="es"` y metadata del proyecto.
- **2026-05-15** — `.env.example` creado con `NEXT_PUBLIC_MAPBOX_TOKEN`. `.env.local` queda en local (gitignored) — falta pegar el token real de Mapbox.
- **2026-05-16** — Token público de Mapbox (`pk.…`) creado en cuenta `abilendesign` con nombre `mapa-interactivo-inteligente`. Scopes: solo los públicos por defecto (`STYLES:TILES`, `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ`). Guardado en `.env.local`. Verificado: dev server en `http://localhost:3000` renderiza el mapa con centro en Ciudad de Panamá y `NavigationControl`.
- **2026-05-17** — Deploy en Vercel funcional. Fix clave: cambiar **Framework Preset** de `Other` a `Next.js` en project settings (con `Other` el build pasaba pero servía 404). Vercel Authentication queda en *Only Preview Deployments* (producción pública, previews protegidos). Env var `NEXT_PUBLIC_MAPBOX_TOKEN` configurada en Production/Preview/Development.
- **2026-05-17** — Tema oscuro forzado globalmente (`class="dark"` + `colorScheme: dark` en `<html>`). Estilo de mapa cambiado a `mapbox://styles/mapbox/dark-v11` (minimalista oscuro).
- **2026-05-17** — `MapView` refactorizado: init una sola vez al montar (ya no se destruye en cada render), `ResizeObserver` integrado para que el mapa se ajuste cuando el sidebar abre/cierra. `NavigationControl` sin compass.
- **2026-05-17** — Layout principal: `SidebarProvider` + `AppSidebar` (`src/components/layout/AppSidebar.tsx`) + `SidebarInset` con mapa a pantalla completa. Sidebar colapsable (`offcanvas`) con shortcut `Ctrl/Cmd+B`. Trigger overlayed top-left sobre el mapa. Componentes shadcn agregados: `sidebar`, `tooltip`, `sheet`, `separator`, `skeleton`, `input` y hook `use-mobile`.
- **2026-05-17** — Navegación del sidebar: **Mapa** (activo) + items "pronto" con badge: Propiedades, Fuentes, Análisis, Acerca de. Rutas placeholder (`/propiedades`, `/fuentes`, `/analisis`, `/acerca`) sin página todavía.
- **2026-05-17** — Marcadores de propiedades. `MARKER_COLOR = #D6FF00` en `mapbox/config.ts`. Mock con 10 propiedades en zonas clave de Ciudad de Panamá (Casco Viejo, Av. Balboa, Bella Vista, Obarrio, Marbella, Punta Pacífica, San Francisco, Costa del Este, El Cangrejo, Clayton). Iteraciones de diseño hasta llegar a la versión actual: **pin teardrop sólido lime con hueco transparente**, 18×24px, glow lime sutil.
- **2026-05-17** — **PropertyCard** (side panel a la derecha, 380px, full height). Muestra localización, categoría + operación, precio + precio/m², specs en chips (área/recámaras/baños/parking), condición, estado, resumen IA, fuente, fecha detectada/publicada, CTA "Ver anuncio original" en lime. Click sobre marker abre la card.
- **2026-05-17** — `font-sans` mapeado a `var(--font-geist-sans)` en `globals.css` (estaba recursivo y caía a fallback del sistema).
- **2026-05-17** — Buscador (geocoder de Mapbox) integrado en top-center sobre el mapa. `@mapbox/mapbox-gl-geocoder` instalado. Limitado a Panamá (`countries: "pa"`), idioma dinámico (es/en), tema oscuro overridden, focus state lime sin outline default. El buscador se **recentra** automáticamente con transición al espacio visible cuando el card de propiedad se abre a la derecha (`rightInsetPx`).
- **2026-05-18** — Experimento 3D buildings con `fill-extrusion` (vertical-gradient false, pitch 32°, rotación bloqueada). **Revertido** por decisión: se prefiere mantener el dark map plano y minimalista.
- **2026-05-20** — Página **/propiedades** (route `src/app/propiedades/page.tsx`). `AppShell` movido al root layout para compartir chrome entre rutas. Grid de tarjetas responsive (1/2/3 cols). Header con buscador centrado (grid 3-cols: `1fr_auto_1fr`) + contador + botón Filtros.
- **2026-05-20** — Sistema de **filtros** (`features/propiedades/filters.ts`): `PropiedadFilters` (operación, categoría, precio min/max, recámaras min, baños min, condición, fuente). `applyFilters()` combina búsqueda de texto + filtros. UI en `FilterPanel` con pills lime multi-select y inputs numéricos. Abre desde un **Sheet** lateral (botón "Filtros" con badge lime de contador junto al buscador).
- **2026-05-20** — **i18n cliente** (es/en). `src/i18n/dictionaries.ts` con shape tipada. `LocaleProvider` (`src/i18n/LocaleProvider.tsx`) expone `useLocale`, `useDict`, `useFormatters` (Intl per locale: USD currency, fecha larga) y `useDomainLabels` (categoría/operación/condición/estado). Persistencia en `localStorage` con clave `mii.locale` + detección de `navigator.language`. **Toggle ES/EN** como segmented control en el footer del `AppSidebar`. Componentes traducidos: `AppSidebar`, `/propiedades`, `FilterPanel`, `PropertyCard`, `PropertyGridCard`, `MapView` (geocoder.setLanguage + setPlaceholder al cambiar locale, sin recrear el mapa). Para nuevas strings: agregar al dict y consumir con `useDict()`.
- **2026-05-20** — **Multi-fuente por propiedad**. `Propiedad.otrosAnuncios?: AnuncioAdicional[]` (fuente, url, precio, fechaDeteccion). Permite mostrar la misma propiedad listada en varios portales (ej. Encuentra24, Compre o Alquile, Inmuebles 24) con sus precios respectivos. UI: sección "También publicado en" tanto en `PropertyCard` como en `PropertyGridCard`. Mock con 3 propiedades multi-fuente: Casco Viejo, San Francisco, Costa del Este.
- **2026-05-20** — `PropertyGridCard` rediseñado: **sin imagen** (placeholder eliminado). Header con chips de categoría/operación + estado. Contiene toda la info (paridad con la side panel del mapa): título, precio, precio/m², specs, KV condición/fuente/fecha detectada/fecha publicada, resumen IA (line-clamp 3), lista de otros anuncios y CTA lime al anuncio principal.
- **2026-05-20** — Fix de performance en marcadores: la transición de `transform` estaba en el root del marker (donde Mapbox aplica el translate de posición) → cada pan animaba 140ms y "se quedaban atrás". Ahora la transición vive en el SVG interno (hover/active scale) y el root se mueve al instante con el mapa.
- **2026-05-20** — **Supabase conectado** (proyecto `lbvboqoyvuxuanwvtypf`). `@supabase/ssr` + `@supabase/supabase-js` instalados. Clientes en `src/lib/supabase/`:
  - `client.ts` (browser, `createBrowserClient`),
  - `server.ts` (RSC/Actions, `createServerClient` con cookies),
  - `admin.ts` (`createClient` con `service_role` para tareas server-only — bypasea RLS),
  - `types.ts` (stub `Database` — regenerar con `supabase gen types`).

  Env vars añadidas a `.env.local` y `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Pendiente:** agregar estas tres en Vercel.
- **2026-05-20** — Schema inicial aplicado (`supabase/migrations/0001_init.sql`):
  - Tablas `fuentes`, `propiedades`, `anuncios`.
  - Enums Postgres: `tipo_operacion`, `categoria_propiedad`, `condicion_propiedad`, `estado_anuncio`, `moneda`.
  - Índices sobre lat/lng, corregimiento, tipo_operacion, categoria, precio, estado.
  - Trigger `touch_fecha_actualizacion` en `propiedades`.
  - RLS habilitado en las 3 tablas con políticas de **lectura pública anónima**; escritura solo `service_role` (sin policies de insert/update/delete para anon/authenticated).
  - Seed inicial de 3 fuentes: `encuentra24`, `compreoalquile`, `inmuebles24`.
- **2026-05-20** — Seed de datos (`supabase/seed/0001_mock_propiedades.sql`): 10 propiedades del mock cargadas, con 3 de ellas (Casco Viejo, San Francisco, Costa del Este) con anuncios adicionales en otros portales. Total: 10 propiedades + 5 anuncios.
- **2026-05-20** — **Páginas leyendo de Supabase**:
  - `features/propiedades/api.ts` → `fetchPropiedades()` consulta con join (`propiedades + anuncios + fuentes`) y mapea snake_case ⇄ camelCase a la forma `Propiedad`.
  - `features/propiedades/usePropiedades.ts` → hook `{ data, loading, error }` con load on mount.
  - Home (mapa) y `/propiedades` migrados: ya no importan `mockPropiedades`. Manejo básico de loading/error.
  - Verificado en dev: ambas páginas devuelven 200 y la query a Supabase trae las 10 propiedades + 5 anuncios.
- **2026-05-20** — `mock.ts` queda en el repo como referencia/fallback offline, pero sin uso en producción.
- **2026-05-20** — Pines diferenciados por tipo de operación. `MARKER_COLOR_ALQUILER = #FFEC00` añadido en `mapbox/config.ts`. El marker root recibe la clase `.mii-marker--alquiler` cuando `tipoOperacion === "alquiler"`. Usa CSS custom properties (`--mii-fill`, `--mii-glow`) para que el SVG y el glow del drop-shadow cambien sin duplicar reglas. Venta = lime `#D6FF00` (sin cambios); alquiler = amarillo `#FFEC00`.
- **2026-05-20** — Accent color por operación se propaga a las cards. Helper `operationAccent()` + `accentVars()` en `format.ts` que devuelve `--accent`, `--accent-soft`, `--accent-medium`, `--accent-text-on` como CSS vars inline. `PropertyCard` y `PropertyGridCard` aplican `accentVars(propiedad.tipoOperacion)` en el root y todos los acentos (precio, badges, sparkles del resumen IA, CTAs, precios de otros anuncios) consumen `var(--accent)`. Resultado: cards de alquiler en amarillo, venta en lime, sin código duplicado.
- **2026-05-20** — Paridad de info pin ↔ /propiedades. `PropertyCard` (side panel) ahora muestra: badge de categoría neutral + badges de estado y operación en accent, título real (`propiedad.titulo`), CTA con nombre de la fuente principal. Side panel y grid card muestran exactamente la misma información, solo cambia el layout.
- **2026-05-21** — Sidebar limpia: se quita "Sources / Fuentes" de la navegación (se queda solo Mapa, Propiedades, Análisis + Acerca de).
- **2026-05-21** — Mock data ampliada: Casco Viejo gana 2 anuncios adicionales (Mercado Libre $392k, Metro Cuadrado $379.5k) para tener una propiedad con 4 portales. Se agregan 2 fuentes a la DB: `mercadolibre`, `metrocuadrado`.

### Analytics V1 (2026-05-21)

- **Migración `supabase/migrations/0002_analytics.sql`**:
  - Generated column `precio_m2 = precio / nullif(area_m2, 0)` en `propiedades` (stored).
  - Índices nuevos: `precio_m2` y `(corregimiento, tipo_operacion, categoria)`.
  - Vista `vw_zona_benchmark` (security_invoker): por corregimiento + tipo_operacion + categoria → `n_comparables`, `avg_precio_m2`, `median_precio_m2`. Excluye terrenos del cálculo.
  - Vista `vw_oportunidades` (security_invoker): join propiedad ↔ benchmark + fuente, expone `benchmark`, `descuento_pct`, `opportunity_score`, `confianza`. Incluye **todas** las propiedades activas (terrenos también, su score queda null por no tener comparable). Expone `otros_anuncios` como `jsonb_agg(...)` con cada anuncio adicional ({ fuente_id, fuente_nombre, url, precio, moneda, fecha_deteccion }).
  - `GRANT SELECT` a `anon, authenticated`.
- **Fórmula**: `benchmark = coalesce(median, avg)`. `descuento_pct = (benchmark - precio_m2) / benchmark * 100`. `opportunity_score = clamp(0, 100, 50 + descuento_pct * 2)`. Confianza: `<3 baja`, `3-7 media`, `≥8 alta`.
- **Tipo `Oportunidad`** y `fetchOportunidades()` que consume la vista; mapeo snake_case ⇄ camelCase incluyendo `otrosAnuncios`. Hook `useOportunidades()`.
- **Página `/analisis`**:
  - Fila de **4 KPI cards**: oportunidades fuertes (score ≥ 70, en lime), total activas, precio/m² promedio, zona más activa. KPIs se recalculan sobre la data **filtrada**.
  - **OpportunitiesTable**: columnas Score (badge tonalizado por tier: ≥90 verde fuerte, ≥70 lime, ≥50 amarillo, <50 rojo), Propiedad (título + categoría/operación), Zona, Precio (en accent), Área, $/m², Promedio zona, Desc.% (verde/rojo según signo), Confianza (badge con n), Fuente.
  - Columna Fuente: anuncio principal en estilo destacado + cada anuncio adicional como link click-through al portal externo (sin precios — los precios viven en la columna $/m² y otras métricas de la tabla).
  - Botón **Filtros** abre Sheet lateral con: Score mínimo (pills ≥50/≥70/≥90), Operación, Categoría, Confianza, Zona. Badge lime con contador de filtros activos.
- **Sincronización con el mapa**: `AnalyticsFiltersProvider` en `AppShell` → estado de filtros compartido. La home aplica el subconjunto universal (operación / categoría / zona) a los pines vía `applyMapFilters()`; score y confianza no aplican al mapa porque vienen del view, no de propiedades. Indicador flotante en el mapa cuando hay filtros activos: chip con `visibles/total`, link a /analisis y X para limpiar.
- **i18n**: agregados strings para columnas de tabla, KPIs, tiers de score, niveles de confianza, filtros de analytics.
- **Pendiente**: cuando entren más propiedades reales, el opportunity_score empezará a diferenciarse (hoy todas las zonas tienen n=1 → score≈50). Considerar materialized view + refresh job cuando el dataset crezca.
- **2026-05-20** — **Accent color por operación en TODA la UI de propiedad**, no solo pines. Helper en `features/propiedades/format.ts`:
  - `operationAccent(op)` → `{ color, rgb }`.
  - `accentVars(op)` → `React.CSSProperties` con `--accent`, `--accent-rgb`, `--accent-soft`, `--accent-medium`, `--accent-text-on`.

  Aplicado en el root de `PropertyCard` (side panel del mapa) y `PropertyGridCard` (/propiedades). Reemplazado todo el `#D6FF00` hardcodeado por `var(--accent)` (y tintes). Resultado: precio, badge de estado, chip de operación, icono ✦ del resumen IA, precios de "otros anuncios" y el botón "Ver anuncio" se pintan lime (#D6FF00) si es venta y amarillo (#FFEC00) si es alquiler. UI global (sidebar, filtros, language toggle) sigue en lime.

### Scraper V1 + Modo Preview + Resumen IA (2026-05-23 → 2026-05-25)

- **Primer scraper en `scripts/scrapers/fuente-prueba.ts`** (`npm run scrape:test`):
  - **Fuente principal: encuentra24.com.** Probamos compreoalquile primero pero devolvió 403 (Cloudflare-like). encuentra24 publica JSON-LD `schema.org/Product`, que es la fuente más confiable: `name`, `offers.price`, `offers.priceCurrency`, `offers.availableAtOrFrom.address.addressLocality`, `offers.seller.name`, `image.contentUrl`, `description`.
  - **Reglas éticas (durables):** máximo 5 anuncios por corrida, `User-Agent: MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)`, lee `robots.txt` antes de cada listado y aborta si está prohibido, delay aleatorio 1.5–3 s entre anuncios, aborta si detecta captcha/login/4xx. No descarga imágenes (sólo URL). No copia descripción completa: la trunca a 280 caracteres.
  - **Características desde HTML** (no solo descripción libre): bloque estructurado de encuentra24 con pares `[<label>][<value>]` — labels son `span.text-muted-foreground.text-xs.capitalize` y el valor es el `nextElementSibling`. Espera `networkidle` (max 8 s) para que React hidrate. Resultado: 5/5 anuncios con `area_m2`, recámaras, baños y parking reales (antes 1/5).
  - **`toNumber` locale-aware**: distingue miles vs decimal estilo US. `"20,536 Mts2" → 20536`, `"1,425.50" → 1425.50`, `"1.42" → 1.42`.
  - **Filtro de calidad**: descartamos `/bienes-raices-proyectos-nuevos/` porque son rangos promocionales ("desde X, 1-3 recámaras") no comparables — romperían `opportunity_score`.

- **Geocoding con Nominatim (OpenStreetMap), gratis**:
  - Rate-limit 1 req/s (margen 1100 ms), User-Agent identificable, query a nivel zona (no direcciones exactas): `"{zona}, Panamá"`. Si falla, fallback a `"{zona}, Ciudad de Panamá, Panamá"` para corregimientos poco identificables a nivel país (Santa María, Bella Vista, etc.). Solo acepta resultados a nivel barrio/distrito/ciudad (rechaza country/state).
  - **Atribución obligatoria a OSM** en el footer del `AppSidebar`: "Geocoding © OpenStreetMap contributors" con link a `openstreetmap.org/copyright` (ES + EN en `dictionaries.brand.attribution`).

- **Modo preview** — el scraper escribe `public/scrape-preview.json` y las 3 vistas (mapa, /propiedades, /analisis) leen de ahí sin tocar Supabase:
  - `src/features/propiedades/preview.ts` adapta `ScrapedRow → Propiedad` y `→ Oportunidad`. Los IDs scrapeados llevan prefijo `preview:` para identificarlos sin tocar el tipo.
  - `usePropiedades` y `useOportunidades` usan `isPreviewEnabled()`: por DEFAULT está activo (mientras estemos demostrando con scrape). Para volver a los mock de Supabase: `?preview=0`.
  - Decisión clave (2026-05-25): preview **reemplaza** la fuente de datos en lugar de mergear con Supabase. Sin esto las 3 vistas mostraban N diferente.
  - **Badge "NUEVO"** en `PropertyCard`, `PropertyGridCard` y como chip flotante sobre los pines del mapa (color = `--mii-fill`, anclado con `top/left/translate` absolutos al tamaño conocido del marker para evitar el `position:absolute` de Mapbox).
  - `public/scrape-preview.json` curado a 2 entradas demo: 1 venta real de Coco del Mar + 1 alquiler ejemplo en Marbella (para mostrar ambos colores de pin sin saturar el mapa).

- **Resumen IA con Gemini** (free tier):
  - Modelo: `gemini-flash-lite-latest`. Probamos `gemini-2.0-flash` y `gemini-1.5-flash` y devolvieron `quota: 0` para nuestra key — el primero por restricciones del free tier, el segundo no existe en `v1beta`.
  - **Gemini SOLO escribe en `resumen_ia`**. Nunca modifica los campos del scraper (precio, área, hab, etc.). El prompt vive en 2 lugares (uno por script):
    - [scripts/scrapers/fuente-prueba.ts](scripts/scrapers/fuente-prueba.ts) — `generarResumenIA()`, llamado al final de cada scrape.
    - [scripts/scrapers/enriquecer-resumenes.ts](scripts/scrapers/enriquecer-resumenes.ts) — `npm run scrape:resumenes`, para enriquecer un JSON existente sin re-scrapear (útil tras editar el JSON manualmente).
  - Strip de prefijo `Resumen:` en la respuesta (Gemini lo agrega siempre aunque le pedimos que no).
  - `@google/genai` + `dotenv` como devDependencies. `GEMINI_API_KEY` en `.env.local` (gitignored, documentado en `.env.example`). `dotenv` cargado explícitamente con `path: ".env.local"` (no se carga automático fuera de Next.js).
  - El campo `resumenIA` ya existía en `Propiedad`, ya renderizado por las cards — el scraper solo lo llena.

- **Bug fix prerender Vercel**: `useSearchParams` en App Router requiere `<Suspense>` boundary durante prerender. Splitting clave: `src/app/page.tsx` (server component, exporta default + `Suspense`) → `src/app/home-content.tsx` (client component, usa hooks). Antes el archivo entero era `"use client"` y el Suspense también era cliente, no protegía el prerender.

- **Paridad mapa ↔ análisis**: `fetchPropiedades` ahora filtra `precio not null AND area_m2 > 0` igual que `vw_oportunidades`. Antes el mapa traía propiedades sin precio/área que /analisis descartaba → conteos diferentes.

### Pendientes

- **Env vars en Vercel** — agregar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (Production, Preview, Development) y redeploy. Sin esto el deploy de prod no puede leer la DB.
- **Token restrictions en Mapbox** — agregar `http://localhost:3000/*` a la URL allowlist del token. Cuando exista dominio de Vercel, agregarlo también.
- **Tipos de Supabase** — regenerar `src/lib/supabase/types.ts` con `supabase gen types typescript --project-id lbvboqoyvuxuanwvtypf > src/lib/supabase/types.ts` (requiere `supabase` CLI o usar el dashboard).
- **Rotar claves Supabase y Gemini** — `anon`, `service_role` y `GEMINI_API_KEY` quedaron expuestas en el chat de desarrollo. Rotar en cada proveedor cuando termine la fase de prueba (Gemini: aistudio.google.com → API keys → revoke + create new).
- **Consolidar el prompt de Gemini** en `scripts/scrapers/resumen-ia.ts` para no mantenerlo en 2 lugares (`fuente-prueba.ts` + `enriquecer-resumenes.ts`).
- **Resumen IA bilingüe** — actualmente solo en español. Cuando se promueva a producción habrá que generar/almacenar en ambos idiomas o traducir dinámicamente.
- **Más fuentes de scraping** — agregar compreoalquile e inmuebles24 cuando se resuelva el bloqueo anti-bot, y/o probar `MercadoLibre Inmuebles`. Estructura JSON-LD/HTML cambia por sitio → un módulo por fuente.
- **Modo producción del scraper** — pasar de "modo prueba" (escribe a JSON, no toca DB) a `npm run scrape:prod` que use el admin client de Supabase para upsert en `propiedades` + `anuncios`. Requiere lógica de deduplicación por `url_original`.
- **Migrar `?preview=0` → flag de runtime/admin** cuando empecemos a escribir scrapes reales a Supabase.

## Notas Pendientes

<!-- Tareas, ideas o dudas por resolver -->
