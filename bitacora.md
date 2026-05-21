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
| IA | OpenAI API |
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
- **2026-05-20** — **Accent color por operación en TODA la UI de propiedad**, no solo pines. Helper en `features/propiedades/format.ts`:
  - `operationAccent(op)` → `{ color, rgb }`.
  - `accentVars(op)` → `React.CSSProperties` con `--accent`, `--accent-rgb`, `--accent-soft`, `--accent-medium`, `--accent-text-on`.

  Aplicado en el root de `PropertyCard` (side panel del mapa) y `PropertyGridCard` (/propiedades). Reemplazado todo el `#D6FF00` hardcodeado por `var(--accent)` (y tintes). Resultado: precio, badge de estado, chip de operación, icono ✦ del resumen IA, precios de "otros anuncios" y el botón "Ver anuncio" se pintan lime (#D6FF00) si es venta y amarillo (#FFEC00) si es alquiler. UI global (sidebar, filtros, language toggle) sigue en lime.

### Pendientes

- **Env vars en Vercel** — agregar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (Production, Preview, Development) y redeploy. Sin esto el deploy de prod no puede leer la DB.
- **Token restrictions en Mapbox** — agregar `http://localhost:3000/*` a la URL allowlist del token. Cuando exista dominio de Vercel, agregarlo también.
- **Tipos de Supabase** — regenerar `src/lib/supabase/types.ts` con `supabase gen types typescript --project-id lbvboqoyvuxuanwvtypf > src/lib/supabase/types.ts` (requiere `supabase` CLI o usar el dashboard).
- **Rotar claves Supabase** — `anon` y `service_role` quedaron expuestas en el chat de desarrollo. Para producción real, rotar en Project → Settings → API → Reset keys.
- **Scraper (Node.js + Playwright)** — pospuesto para fase muy posterior.
- **Resumen IA y títulos** — actualmente solo en español. Cuando integremos OpenAI habrá que generar/almacenar en ambos idiomas o traducir dinámicamente.

## Notas Pendientes

<!-- Tareas, ideas o dudas por resolver -->
