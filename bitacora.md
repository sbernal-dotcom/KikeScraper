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

### Pendientes

- **Token restrictions en Mapbox** — agregar `http://localhost:3000/*` a la URL allowlist del token. Cuando exista dominio de Vercel, agregarlo también. Sin restricciones cualquiera puede usar el token desde otro sitio.
- **Supabase** — pospuesto por decisión del usuario.
- **Scraper (Node.js + Playwright)** — pospuesto para fase muy posterior.

## Notas Pendientes

<!-- Tareas, ideas o dudas por resolver -->
