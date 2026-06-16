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
| Tareas programadas | GitHub Actions cron (1×/día @ 03am Panamá) |
| Hosting | Vercel |
| Código | GitHub + Visual Studio Code + Claude Code |

## Funcionalidades Clave

- Organización de información pública del mercado inmobiliario panameño
- Visualización de propiedades en mapa interactivo
- Mostrar fuentes originales de cada propiedad
- Resúmenes y comparaciones de precios
- Detección de cambios en propiedades
- (Futuro) Análisis de rentabilidad compra vs alquiler

## Cómo funciona el proyecto

Resumen estable del sistema. Para el detalle cronológico ver "Decisiones y Cambios".

### Flujo de datos

```
┌──────────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐
│ Fuente web   │ → │ Scraper │ → │  Gemini  │ → │ Supabase │ → │ Next.js │ → Mapbox
│ (encuentra24,│   │Playwright│   │(resumen +│   │(Postgres │   │  (App   │
│  acobir)     │   │  + JSON- │   │  tags    │   │  + RLS)  │   │  Router)│
│              │   │   LD)    │   │bilingües)│   │          │   │         │
└──────────────┘   └─────────┘   └──────────┘   └──────────┘   └─────────┘
                                                      ↑
                                                Pase 2: verifica
                                                URLs (lifecycle)
```

1. **Scraper** lee listados de la fuente, extrae JSON-LD `schema.org/Product`, parsea precio/área/recámaras del HTML estructurado.
2. **Gemini** genera resumen bilingüe (ES/EN) + tags. Anti-copia 3-gram descarta resúmenes que copian frases literales.
3. **Geocoding** — tabla manual `zonas-panama.ts` primero, Nominatim como fallback, Mapbox solo para validar (warnings >2 km).
4. **Supabase** recibe el upsert por `url_original`. Audita corridas en `scraper_runs`.
5. **Lifecycle** — pase 2 (`verificar-estado.ts`) revisa URLs no vistas en pase 1. 3 fallos → `posible_inactivo`, 7 fallos → `archivado`. El mapa solo muestra `estado_anuncio='activo'`.
6. **Frontend** lee de Supabase con RLS de lectura pública. Mapa agrupa pines por `lat.toFixed(4)__lng.toFixed(4)` (grilla ~11 m).

### Componentes clave

| Capa | Ubicación | Qué hace |
|------|-----------|---------|
| Scraper principal | [scripts/scrapers/fuente-prueba.ts](scripts/scrapers/fuente-prueba.ts) | encuentra24 — 7 listados por categoría, paginación `{base}.{N}`. |
| Scraper ACOBIR | [scripts/scrapers/scraper-acobir.ts](scripts/scrapers/scraper-acobir.ts) | Proyectos nuevos curados, paginación `/page2..N`. Semanal, independiente. |
| Verificación URLs | [scripts/scrapers/verificar-estado.ts](scripts/scrapers/verificar-estado.ts) | Pase 2 — fetch + JSON-LD, marca lifecycle. |
| Enriquecimiento IA | [scripts/scrapers/ia.ts](scripts/scrapers/ia.ts) | Gemini bilingüe + anti-copia + tags. |
| Geocoding tabla | [scripts/scrapers/zonas-panama.ts](scripts/scrapers/zonas-panama.ts) | Centroides verificados a mano. Fuente primaria. |
| Validación coords | [scripts/scrapers/mapbox-validate.ts](scripts/scrapers/mapbox-validate.ts) | Cross-check con Mapbox geocoding. |
| Admin Supabase | [scripts/scrapers/supabase-admin.ts](scripts/scrapers/supabase-admin.ts) | `service_role` para writes server-side. |
| Mapa | [src/components/map/MapView.tsx](src/components/map/MapView.tsx) | Mapbox GL, 2D dark + 3D Standard con `setConfigProperty`. |
| Datos en cliente | [src/features/propiedades/](src/features/propiedades/) | `api.ts`, `usePropiedades`, `format.ts`, `PropertyCard`. |
| Cron | [.github/workflows/scraper.yml](.github/workflows/scraper.yml) | GitHub Actions, 08:00 UTC = 03:00 Panamá. |

### Cron y lifecycle

- **Scraper principal**: 1 vez al día (03:00 hora Panamá) via GitHub Actions. Sube ~80–90 propiedades nuevas por corrida cuando hay inventario fresco.
- **Pase 2 (verificar)**: corre tras el scraper. Marca lifecycle de las URLs que NO aparecieron.
- **Scraper ACOBIR**: semanal (inventario pequeño y estable, ~30–80 proyectos).
- **Alertas**: si `scraper_runs.errors > 0` o el job falla, abre GitHub Issue automáticamente.

### Reglas no negociables

- **Descripción NO se persiste**. Solo vive en memoria mientras Gemini la procesa. Nunca a disco, Supabase, logs ni JSON.
- **NO se guardan** fotos, teléfono, email, vendedor, contacto.
- **Anti-copia 3-gram**: si el resumen IA comparte >20% de tri-gramas con la descripción original, se descarta.
- **UA honesto**: `MapaInteractivoInteligente/0.1 (+contacto: abilendesign@gmail.com)`.
- **robots.txt antes de cada listado**. Si bloquea, aborta.
- **Rate limit**: jitter 1.5–3 s entre anuncios; Nominatim 1 req/seg.
- **Feature flag** `AI_SUMMARY_ENABLED=false` corta toda llamada a Gemini si hay disputa de derechos.
- **Email del proyecto**: `abilendesign@gmail.com` (NO el del usuario logueado).

## Paleta de Colores

| Uso | Color | Hex | RGB |
|-----|-------|-----|-----|
| Venta (pin + cards + acentos) | Lime | `#D6FF00` | 214, 255, 0 |
| Alquiler (pin + cards + acentos) | Azul | `#0062FF` | 0, 98, 255 |
| Cluster / grupo (pines en el mapa) | Magenta | `#DD00FF` | 221, 0, 255 |
| Eliminar (X de quitar / clear) | Rojo | `#FF1F17` | 255, 31, 23 |
| Background | Negro casi puro | `#0a0a0a` | 10, 10, 10 |
| Texto sobre acento — venta | Casi negro | `#0a0a0a` | 10, 10, 10 |
| Texto sobre acento — alquiler/cluster | Blanco | `#FFFFFF` | 255, 255, 255 |

**Reglas:**
- El color de **cluster sobreescribe** el de operación (un cluster de venta o alquiler siempre se ve magenta `#DD00FF`).
- Cards e indicadores derivan tints suaves del acento vía `accentVars()` en `src/features/propiedades/format.ts`:
  - `--accent-soft` = `rgba(R, G, B, 0.10)`
  - `--accent-medium` = `rgba(R, G, B, 0.14)`
  - `--accent-text-on` = derivado de la operación (negro para venta, blanco para alquiler) — necesario porque el azul oscuro y el magenta no toleran texto negro.
- El **rojo de eliminar** solo se aplica a acciones destructivas (quitar de la lista de comparación, clear-all). NO se usa para errores ni para badges informativos.
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

### Cierre del ciclo Scraper → Supabase → Mapa (2026-05-26 → 2026-05-30)

Pin grouping (paso 7 del contrato), enrichments + base lista para el cron diario.

- **Modo Supabase del scraper** (`npm run scrape:prod` con flag `--supabase`):
  - Upsert por `url_original` (unique index agregado en `0003_scraper_fields.sql`).
  - Audita cada corrida en tabla `scraper_runs` (`status`, `found`, `inserted`, `updated`, `errors`, `notes`).
  - Cliente admin en `scripts/scrapers/supabase-admin.ts` (sin `"server-only"` para que tsx puro lo importe; usa `service_role` y bypasea RLS).
  - **Migración `0003_scraper_fields.sql`**: rename `resumen_ia → resumen_ia_es`, add `resumen_ia_en`, `tags_caracteristicas text[]`, `tags_extra text[]`, `ai_source_flag text`, `banos → numeric(3,1)` (medios baños), unique(url_original), `scraper_runs` con RLS.

- **Resumen IA bilingüe + tags** (extraído a `scripts/scrapers/ia.ts`):
  - `enriquecerConIA` se usa desde el scrape inicial y desde el backfill. Lazy-init del cliente Gemini (necesario para que `loadEnv()` del caller corra antes — antes el módulo evaluaba `process.env.GEMINI_API_KEY` al importar y caía a `null` aunque la key existiera).
  - Tags: lista cerrada de 26 kebab-case + máximo 3 "extras" libres (`tags-caracteristicas.ts`).
  - **Anti-copia 3-gram**: si el resumen comparte >20% de tri-gramas con la descripción → descartado. Aplica a `es` y `en` por igual.
  - Regla durable ToS: la descripción es **input temporal en memoria** — no toca disco, ni Supabase, ni logs, ni JSON. Solo viaja del scraper a Gemini y se descarta.

- **Pin grouping por lat/lng redondeado** — paso 7 del contrato (`src/app/home-content.tsx`):
  - Antes agrupaba por `zona + tipoOperacion`, lo que separaba propiedades del mismo edificio en pines distintos si una era venta y otra alquiler.
  - Ahora: clave `${lat.toFixed(4)}__${lng.toFixed(4)}` (~11 m de grilla). Mezcla venta+alquiler en mismo pin si caen al mismo punto.
  - Cluster (count>1) muestra el número en el chip del pin (magenta, ver paleta).

- **Geocoding endurecido** (`scripts/scrapers/zonas-panama.ts`):
  - `normalizeKey` colapsa espacios múltiples (antes `"via españa "` no matchaba con `"via españa"`).
  - 30+ zonas agregadas con centroides verificados a mano contra landmarks de Google Maps. Esta tabla es la **fuente primaria** del geocoding; Nominatim queda como fallback. Ejemplos clave de zonas donde Nominatim caía mal:
    - Vía España y Vía Porras (son avenidas, no corregimientos).
    - El Dorado (Nominatim → Chiriquí), Llano Bonito (→ Coclé), La Locería.
    - Antón (Coclé) — Nominatim caía en el área del Canal por un homónimo.
    - Cerro Azul (corregimiento residencial E de Ciudad de Panamá — Nominatim caía en Cerro Azul de Chiriquí, 400 km al oeste).
    - Veracruz (Arraiján, costero).
  - `scripts/scrapers/recalcular-coords.ts` extendido con flag `--supabase` para `UPDATE propiedades SET lat/lng` en DB cuando la tabla cambia. Corrida del 30/5 movió 15 filas a sus nuevas coords.

- **Backfill IA** (`scripts/scrapers/backfill-ia.ts`, `npm run scrape:backfill-ia`):
  - Re-enriquece filas con `resumen_ia_es IS NULL AND ai_source_flag IS NULL` (típicamente porque la key Gemini estaba expirada en la corrida original o se agregó la columna después).
  - Visita la URL, extrae descripción, llama Gemini, hace `UPDATE` solo de los campos IA (no toca precio/lat/etc).
  - Audita en `scraper_runs` con `notes='backfill-ia'`.

- **Web por default lee de Supabase** (`src/features/propiedades/preview.ts`):
  - `isPreviewEnabled()` flippeado a **opt-in**: por default `false`, se activa con `?preview=1` en la URL. Antes era al revés (default true, `?preview=0` para Supabase). El badge "Preview · N" en el sidebar solo aparece cuando el modo está activo.

- **Comparación de propiedades** (`src/features/comparacion/`):
  - `ComparisonContext` con `add`/`remove`/`toggle`/`clear`. Máx 6, mín 2.
  - `ComparisonList` panel derecho de 300 px. Click en pin **dentro** del modo comparación abre la card a la izquierda pero NO agrega automáticamente — el usuario debe pulsar "Agregar a comparación" en la card. Esto evita agregados accidentales al explorar el mapa.
  - `PropertyCard` con prop `compact` (300 px en vez de 380) y `FittedTitle` que auto-shrinkea el título para que entre en 2 líneas (`useLayoutEffect` + `ResizeObserver`).

- **Sidebar narrow** (`SIDEBAR_WIDTH=12rem` en vez de 16): brand `py-2`, items `size="sm"`, ícono `size-3.5`, badge "Preview · N" debajo de "Acerca de" (solo si modo preview activo).

### Automatización del scraper (2026-05-30)

- **GitHub Actions cron** (`.github/workflows/scraper.yml`): corre `npm run scrape:prod` 1×/día a las 08:00 UTC (= 03:00 hora Panamá). Off-peak para encuentra24, bajo riesgo de coincidir con anti-bot heuristics. Trigger manual disponible via `workflow_dispatch`. `concurrency: { group: scraper, cancel-in-progress: false }` evita pisarse si una corrida se pasa de duración.
- **Node 22** (LTS): obligatorio porque `@supabase/supabase-js` v2 inicializa Realtime al `createClient` y necesita `WebSocket` nativo (sin flag desde Node 22). Node 20 tiraba `"Node.js 20 detected without native WebSocket support."`
- **Secrets del repo**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.
- **Alertas vía GitHub Issue** (`scripts/scrapers/check-last-run.ts`):
  - Si el step de scrape falla (exit ≠ 0): abre issue con link al run log. No consulta Supabase porque el error puede ser pre-DB (env, WebSocket, captcha).
  - Si pasa pero la última fila de `scraper_runs` tiene `status='error'` o `errors > 0`: abre issue con tabla de detalles (found/inserted/errors/notes).
  - Si todo OK: no abre nada.
  - Usa `gh issue create` con `GH_TOKEN` del workflow + permiso `issues: write`. Sin dedupe — un issue por corrida con error; si se vuelve ruidoso, se puede mover a "buscar issue abierto y comentar" en vez de abrir nuevo.

### Paleta nueva (2026-05-30)

- Alquiler `#FFBB00` → **`#0062FF`** (azul). `accent-text-on` en cards de alquiler pasa a blanco para mantener contraste sobre azul oscuro.
- Cluster `#FFEC00` → **`#DD00FF`** (magenta). Badge text del chip del pin pasa a blanco para alquiler y cluster (negro no se leía).
- **Eliminar**: nuevo color `#FF1F17` aplicado en X de clear-all + X per-item de `ComparisonList`, y en el botón "Quitar" del `PropertyCard` cuando ya está en comparación (rol destructivo inequívoco).
- Venta sin cambios (`#D6FF00`).

### Lifecycle de anuncios + 100/run + Mapa 2D/3D (2026-05-30 → 2026-05-31)

Sesión grande con varios hitos. Más detalle por commit en `git log`.

**Lifecycle "vivo mientras la fuente lo siga mostrando"** (`supabase/migrations/0004_lifecycle.sql` + `scripts/scrapers/verificar-estado.ts`):
- Pase 1 (`scrape:prod`): cada upsert deja `estado_anuncio='activo'`, `veces_no_encontrado=0`, `fecha_ultima_vista=now`, `motivo_estado='visto en scrape'`.
- Pase 2 (`scrape:verify`, agregado al workflow después del scrape): para cada propiedad no-archivada con `fecha_ultima_revision` >6h vieja, hace GET ligero a la URL.
  - 200 con JSON-LD `"@type":"Product"` → reset, `activo`.
  - 404 / 410 / redirect que pierde el ID / 200 sin Product → incrementa `veces_no_encontrado`.
  - timeout / 5xx → `error_verificacion`, **no** suma al contador.
  - Umbrales: ≥3 fallos → `posible_inactivo`, ≥7 → `archivado`.
- Bug encontrado en la primera corrida: la regex `/captcha|verify|robot|access/i` matcheaba la string `"recaptchaSiteKey":"..."` (config del form de contacto presente en TODA página legítima de encuentra24) → 48/60 falsos positivos. Quitada — Product como única señal positiva.
- Flag `--force` para bypass del cooldown (útil para recuperar de bugs del verificador).
- Enum `estado_anuncio` extendido con `posible_inactivo`, `archivado`, `error_verificacion`. Columnas nuevas: `veces_no_encontrado`, `fecha_ultima_vista`, `fecha_ultima_revision`, `motivo_estado`. Índice `propiedades_lifecycle_idx`.
- `fetchPropiedades()` ahora filtra `estado_anuncio='activo'` — las archivadas quedan en DB pero ocultas del mapa (historial).

**Scraper 100/run** (paginación + diversidad por categoría):
- `DEFAULT_LISTADOS` pasa de 2 listados genéricos a **7 por categoría** (apartamentos/casas/terrenos venta + apartamentos/casas/oficinas/locales alquiler) sumando ~100 anuncios objetivo por corrida. Diversifica el dataset — los listados genéricos `bienes-raices-venta-de-propiedades` y `bienes-raices-alquiler` se sesgan a apartamentos en Ciudad de Panamá.
- `scrapeAll` ahora **pagina cada listado** hasta llegar al `limit` o `MAX_PAGES_PER_LISTADO=8`. encuentra24 pagina con `{listado}.{N}` (ej. `bienes-raices-venta-de-propiedades-apartamentos.2`). Antes solo leía página 1, así que cuando la DB se saturaba el scrape sumaba pocos nuevos. Ahora cumple "100 de 100" incluso con DB poblada.

**Toggle 2D/3D del mapa** (`src/features/map/MapModeProvider.tsx` + `src/components/layout/MapModeToggle.tsx`):
- Segmented control "Vista del mapa | 2D | 3D" arriba del LanguageToggle en el sidebar.
- 2D = `mapbox://styles/mapbox/dark-v11` con capa `fill-extrusion` `3d-buildings` (edificios extruidos planos sobre el dark base — visibles al hacer zoom). Pitch 32, rotación bloqueada.
- 3D = `mapbox://styles/mapbox/standard` con config aplicada vía `setConfigProperty('basemap', ...)`:
  - `theme=faded` (colores suaves desaturados que no chocan con los pines).
  - `lightPreset=night` (modo oscuro).
  - `showPointOfInterestLabels=true` + `densityPointOfInterestLabels=1` (Mapbox Standard no filtra POIs por categoría — densidad baja prioriza torres/landmarks sobre comercios chicos).
  - `showPlaceLabels` y `showRoadLabels` default true (barrios y calles visibles).
  - Pitch 55, drag-rotate y compass habilitados.
- Switch en runtime con `map.setStyle()` — markers persisten (DOM externo).
- **Siempre arranca en 2D** al entrar a la página (no se persiste en localStorage por decisión de producto).
- Bugs encontrados y arreglados en el camino:
  1. Llamar `applyStyleExtras` síncrono después de `new Map()` tira `Style is not done loading` y blanquea la home. Fix: aplicar SOLO tras `load`/`style.load`.
  2. La capa `3d-buildings` en 2D no aparecía porque `style.load` fire antes de que `composite` source tenga sus tiles. Fix: para el mount inicial usar `load` (espera estilo + sources + tiles).
  3. Un solo `try/catch` envolvía las 4 `setConfigProperty` calls — si una fallaba, las otras (incluida `lightPreset=night`) se saltaban en silencio y el 3D quedaba en daytime default. Fix: try/catch INDIVIDUAL + `console.warn` por falla + segundo apply en `idle` como red de seguridad.

**Validación cruzada Mapbox Geocoding** (estrategia A, `scripts/scrapers/mapbox-validate.ts`):
- Tabla `zonas-panama` sigue siendo PRIMARIA. Después de cada `geocodeZona` exitoso, llama a Mapbox Geocoding API con `{zona}, Panamá` y compara con haversine. Si difieren más de 2 km loguea warning; **nunca sobreescribe** las coords.
- Cachea por zona (1 request por zona por corrida, no por anuncio).
- Free tier Mapbox Geocoding: 100k/mes. Volumen actual ~10-20 requests/día con cache → bien dentro del límite.
- Nuevo secret en workflow: `NEXT_PUBLIC_MAPBOX_TOKEN`.

### Observabilidad + ajustes finos (2026-06-01)

- **Badge "Último scrape" en el sidebar** (`src/components/layout/LastScrapeBadge.tsx` + `src/features/scraper/useLastScraperRun.ts`):
  - Muestra fecha relativa (ej. "hace 4 h") y cantidad insertada en la última corrida del scraper.
  - Lee de `scraper_runs` filtrando `notes ILIKE 'listados%'` para excluir las corridas del pase 2 (`verificar-estado`) y backfill IA.
  - Aprovecha la policy `anon read scraper_runs` de la migration 0003 — no necesita auth.
  - Ubicado en `SidebarFooter` arriba del `MapModeToggle`.

- **Tuning del Mapbox Geocoder** en `MapView.tsx` (search bar):
  - `minLength` 2 → 3 (no busca con apenas 2 letras).
  - `limit` 5 → 3 (3 sugerencias por request alcanzan).
  - El plugin ya debounceaba 200ms internamente vía `lodash.debounce`; el ahorro real son estos dos knobs. Free tier Mapbox Geocoding: 100k req/mes.

- **MAX_PAGES_PER_LISTADO 8 → 20** + **resumen tabular por listado** al final de cada `scrape:prod`:
  ```
  ┌─ Resumen scrape (total: 67/100)
  │ venta-apartamentos      19/20  4 pág  listado agotado
  │ alquiler-apartamentos    2/20  2 pág  listado agotado   ← saturado
  │ alquiler-comercios       0/10  1 pág  listado agotado   ← saturado
  └─
  ```
  - Cada listado registra `target`, `collected`, `pages`, `reason` (limit alcanzado / listado agotado / max páginas / HTTP error / robots.txt).
  - Confirmado: con DB ya con ~280 propiedades, encuentra24 está **saturado** (todos los listados cortan por "listado agotado" antes de las 20 páginas). 100/run no es realista solo con encuentra24 — hay que agregar otra fuente o nuevas categorías.

- **Probe de MercadoLibre Panamá** (NO implementado):
  - API oficial `api.mercadolibre.com/sites/MPA/...` ahora exige OAuth (devuelve 403 sin auth). Antes era libre.
  - Scraping HTML: requiere JS rendering + anti-bot agresivo (Akamai/policies).
  - Decisión: postergar hasta probar **inmuebles24.com.pa** u otra fuente con menos fricción.

### Nuevas fuentes + filtro por fuente + speedup (2026-06-02 → 2026-06-15)

- **Nueva fuente: ACOBIR Proyectos** (`scripts/scrapers/scraper-acobir.ts`, `scrape:acobir` + `scrape:acobir:prod`):
  - Buscador oficial de la gremial — proyectos nuevos curados, JSON-LD `Product`.
  - Categoría `proyecto_nuevo` (nuevo valor del enum) + `estado_datos='parcial_verificado'` (porque los datos son "desde X", no por unidad).
  - Migration **`0005_acobir_proyectos.sql`**: nueva fuente, nuevo enum `estado_datos`, columna `estado_datos` en `propiedades` (default `completo_verificado` → no afecta filas existentes).
  - Paginación `/proyectos/list/pageN` cicla con solapamiento — para tras 2 págs sin slugs nuevos.
  - Filtra slugs `^(se-alquila|alquiler|se-vende|venta)-` porque ACOBIR mete anuncios individuales mezclados en `/proyectos/list/`.
  - Inicialmente con Playwright; **migrado a `fetch()` puro** porque el JSON-LD viene server-rendered — ahorra el chromium launch (~3-5 s).

- **Nueva fuente: Panama Equity** (`scripts/scrapers/scraper-panamaequity.ts`, `scrape:pe` + `scrape:pe:prod`):
  - Bróker boutique con JSON-LD `RealEstateListing` perfecto: `geo.latitude` + `geo.longitude` exactos, `additionalProperty[]` con Bedrooms/Bathrooms/Garages/Area Size/Year Built.
  - Migration **`0006_panamaequity.sql`**: seed de la fuente.
  - Playwright detecta headless y hace tarpit (cuelga la respuesta) → cambiamos a `fetch()`, que devuelve sub-segundo.
  - Bug clave del `toNumber`: el regex eliminaba el signo `-` → todas las coords salían positivas (Panamá caía en China). Fix: preservar `-` si está al inicio del raw.
  - ~100 propiedades subidas a Supabase (42 + 58 en dos pases — el primero perdió 57 por "fetch failed" transient).

- **Filtro por fuente en el mapa y /analisis** (campo `fuentes: string[]` en `AnalyticsFilters`):
  - `AnalyticsFilterPanel` recibe `fuentesDisponibles` y muestra pills (solo si > 0).
  - `applyMapFilters` + `applyAnalyticsFilters` filtran por `fuenteNombre`.
  - Wiring en `home-content.tsx` y `analisis/page.tsx`: derivan `fuentesDisponibles` desde los datos cargados.
  - Multi-select: combinable con operación/categoría/zona.

- **Speedup masivo de los scrapers** (~10-15 min → 2-8 min):
  - **Jitter reducido**: detail 1500–3000 ms → 400–900 ms; inter-página 1000–2000 ms → 300–700 ms.
  - **Concurrencia detail = 3** vía `chunkedParallel<T,R>` (helper en cada scraper).
  - **Concurrencia upsert Supabase = 5** (en lugar de uno por uno).
  - **encuentra24**: pool de 3 `Page` de Playwright (cada chunk asigna 1 page por item). Se extrajo `scrapeOne(page, item)` del loop secuencial. Tiempo: ~12 min → **~8 min**.
  - **ACOBIR**: migrado completo de Playwright a `fetch()`. Tiempo: ~10 min → **~2m 10s**.
  - **panamaequity**: ya era fetch; mismo patrón. Tiempo: ~10 min → **~2 min**.
  - Side effect conocido: Gemini free tier (15 req/min) se satura con concurrencia 3 → algunos items quedan sin `resumen_ia` (rellenable con `npm run scrape:backfill-ia`).

- **Badge "Último scrape" ahora mira las 3 fuentes** (`useLastScraperRun.ts`):
  - Antes filtraba `notes ILIKE 'listados%'` → solo veía encuentra24. Si solo corría ACOBIR o PE, el badge se quedaba viejo.
  - Ahora filtra `fuente_id IN ('encuentra24', 'acobir', 'panamaequity')`.
  - El badge muestra el `fuenteId` de la última corrida (`+58 nuevos · panamaequity`).

- **Fix `nativeButton={false}` en Base UI Button** (PropertyCard + PropertyGridCard):
  - Botones con `render={<a href=… target="_blank">}` disparaban warning de Base UI ("expected a native <button>"). Agregar `nativeButton={false}` lo silencia y conserva las semánticas correctas del `<a>`.
  - `SidebarMenuButton` (shadcn wrapper) no expone la prop → queda intocado.

- **Fix del cron de GitHub Actions** (`.github/workflows/scraper.yml`):
  - `timeout-minutes: 20` → **45**. Los últimos 5 runs del cron (Jun 12–14) salieron `cancelled` a los 20m 20s exactos — el workflow completo (npm ci + playwright install + scrape:prod + scrape:verify) tomaba ~25-30 min. Nada se escribía a Supabase. Por eso encuentra24 no entraba data desde 2026-06-06 aunque el cron corría todos los días.

- **Sección "Cómo funciona el proyecto"** agregada al inicio de la bitácora:
  - Diagrama ASCII del flujo (Fuente → Scraper → Gemini → Supabase → Next.js → Mapbox).
  - Tabla de componentes con paths clickables.
  - Resumen de cron + lifecycle + reglas no negociables.
  - Para mantenimiento estable; los cambios cronológicos siguen viviendo más abajo.

- **Probes de fuentes que NO funcionaron** (todas auditadas; descartadas con razón documentada):
  - **compreoalquile.com** — Cloudflare WAF "Just a moment…" no resuelve con Playwright (headless ni headed). robots permitía, pero el WAF dice otra cosa. Mismo Navent group: probar evadir entra en territorio de "evasión de detección".
  - **inmuebles24.com** — mismo grupo Navent, mismo WAF, mismo `Just a moment…`. `inmuebles24.com.pa` no resuelve DNS.
  - **century21panama.com / c21centralamerica.com** — robots permisivo (allow ClaudeBot, anthropic-ai), pero el WAF rate-limita después del primer batch (todos los siguientes detail fetches → 503). El UA honesto recibe 503 directo; el browser UA pasa la primera lista (100 URLs) pero los detalles caen al primer paralelo. Implementado, smoke-tested, **descartado y rollback**.
  - **MIVIOT (Ministerio de Vivienda)** — robots OK, sitio responde OK, pero NO es inventario: páginas tipo `/techosdeesperanza-arraijan/` son comunicados de prensa sin precio, sin coords, sin specs. No encaja en el modelo de pines individuales.
  - **lacasa.com.pa / mudafy.com.pa** — DNS no resuelve (no existen).

### Pendientes

- **Env vars en Vercel** — agregar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (Production, Preview, Development) y redeploy. Sin esto el deploy de prod no puede leer la DB.
- **Token restrictions en Mapbox** — agregar `http://localhost:3000/*` a la URL allowlist del token. Cuando exista dominio de Vercel, agregarlo también.
- **Tipos de Supabase** — regenerar `src/lib/supabase/types.ts` con `supabase gen types typescript --project-id lbvboqoyvuxuanwvtypf > src/lib/supabase/types.ts` (requiere `supabase` CLI o usar el dashboard).
- **Rotar claves Supabase** — `anon` y `service_role` quedaron expuestas en el chat de desarrollo. Rotar cuando termine la fase de prueba. (Gemini ya rotado el 30/5.)
- **Más fuentes de scraping** — encuentra24 saturado (~280). ACOBIR + Panama Equity ya integrados (~100+80 más). Próximos candidatos honestos:
  - **MEF / Catastro** — registros públicos. PDF-heavy, requiere más trabajo de parsing.
  - **DGI valores referenciales** — como capa de "precio justo" (no per-property; heat-map).
  - **Brokers individuales tipo PE** — `gilbertoroldan.com`, `panamacasas.com`, `kw-panama.com`. Probar uno a la vez.
  - Descartados (ver bitácora): compreoalquile, inmuebles24, c21, miviot, MercadoLibre.
- **Zonas que siguen cayendo a Nominatim** — agregar a `zonas-panama.ts` con coords verificadas: Carrasquilla, Volcán, El Bosque, Las Cumbres, Ciudad de Panamá (genérico). Los logs del cron las marcan en cada corrida.

#### Resueltos (no quitar — historial)

- ✅ **Modo producción del scraper**: `npm run scrape:prod` con flag `--supabase` ya escribe en Supabase + audita en `scraper_runs`.
- ✅ **Migrar `?preview` → opt-in**: hecho. Default ahora es leer de Supabase; preview activable con `?preview=1`.
- ✅ **Resumen IA bilingüe**: dos columnas `resumen_ia_es` + `resumen_ia_en`, generadas por Gemini en la misma llamada.
- ✅ **Consolidar prompt Gemini**: extraído a `scripts/scrapers/ia.ts` y reusado desde `fuente-prueba.ts` y `backfill-ia.ts`.
- ✅ **Automatizar el scraper**: GitHub Actions cron diario @ 03am Panamá + alertas vía GitHub Issue.
- ✅ **Lifecycle de anuncios**: pase 2 verifica URLs no vistas y archiva tras 7 fallos. Mapa filtra solo `activo`.
- ✅ **Scraper llega a 100/run**: paginación + 7 listados por categoría.
- ✅ **Mapa con vista 3D opcional**: toggle 2D/3D en sidebar (Mapbox Standard faded night).
- ✅ **Validación de coords con Mapbox Geocoding**: cross-check vs tabla, warning si diverge >2 km.

## Notas Pendientes

<!-- Tareas, ideas o dudas por resolver -->
