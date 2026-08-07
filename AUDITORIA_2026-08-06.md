# Auditoría de proyecto — 2026-08-06

> **Estado 2026-08-07**: los 5 CRITICAL fueron arreglados (commits
> `b1db63f` C4, `7d7b28b` C2, `f1d6212` C5, `2267733` C1, `99d11d4` C3).
> Backfill C3 consolidó 107 buckets duplicados de corregimiento sobre
> 5757 filas históricas.
>
> **Fase 2 (silent failures del scraper) cerrada 2026-08-07**: 7 HIGH
> arreglados — H1 `46f32f7` (status por ratio 20% vs "todo-o-nada"),
> H2 `4ff5620` (errores en scrapeDetail cuentan), H3 `6f06f20`
> (fetchExistingUrls throw en fallo de paginación), H4 `86f3d16`
> (SIGTERM handler awaitea el insert), H7 `9e08311` (cache urls-fallidas
> en las 4 fuentes restantes), H16 `72f8558` (TTL 90d edificios_cache
> source=web + `detectar-colapso-cache.ts`), H17 `b7a381b` (TTL 90d
> ia_extract_cache + `purgar-ia-cache.ts`).

**Metodología**: 5 agentes de exploración paralelos, cada uno cubriendo una dimensión (scraper correctness, security, UI/UX, data quality, tech debt). ~67 findings raw deduplicados y consolidados abajo. Los CRITICAL fueron verificados manualmente antes de reportar.

**TL;DR**: 5 bugs críticos (2 UI, 2 datos, 1 scraper), muchos silent-failures en la layer de scrapers, y deuda de testing/duplicación que bloquea refactor futuro. Seguridad limpia — RLS, secrets, XSS todo OK. Verified: el bug de "score/confianza no aplica en mapa pero cuenta como filtro activo" existe.

---

## 🔴 CRITICAL — atender esta semana

### C1 · Filtros de score/confianza cuentan en el mapa pero NO se aplican
- **Archivos**: [analyticsFilters.ts:23-31](src/features/propiedades/analyticsFilters.ts#L23-L31), [AnalyticsFiltersContext.tsx:59-72](src/features/propiedades/AnalyticsFiltersContext.tsx#L59-L72)
- Verificado: `countActiveAnalyticsFilters` incrementa por `scoreMin` y `confianza`, pero `applyMapFilters` explícitamente NO los aplica. Consecuencia: el usuario setea "score ≥ 90" en /analisis, vuelve al mapa, ve el chip "1 filtro" y `500/500 matched` — pareciera que no hay resultados o que el filtro está roto.
- **Fix**: `activeCount` en la vista de mapa debe usar solo los filtros que efectivamente se aplican (excluir `scoreMin`/`confianza`), o mostrar aviso "estos filtros solo aplican en /analisis".

### C2 · Los scrapers pisan lifecycle state — silenciosamente resucitan propiedades archivadas
- **Archivos**: `toDbRow()` en los 6 scrapers ([scraper-inmopanama.ts:760](scripts/scrapers/scraper-inmopanama.ts#L760), [scraper-savitat.ts:575](scripts/scrapers/scraper-savitat.ts#L575), etc.)
- Cada upsert fuerza `estado_anuncio="activo"`, `veces_no_encontrado=0`. Si verify había marcado una URL como `posible_inactivo` con `veces=5`, el próximo scrape resetea el contador SIN re-validar el HTML. Peor: si `archivar-props-en-mar` archivó una prop (coord falsa en mar), el scraper la revive con la misma coord mala.
- **Fix**: cambiar `.upsert(row)` por `.upsert(row, { onConflict: 'url_original' })` + `where estado_anuncio not in ('archivado', 'error_verificacion')`, o excluir esos campos del payload cuando la fila ya existe.

### C3 · `corregimiento` sin normalizar rompe el benchmark de zonas
- **Archivos**: los 6 scrapers escriben `corregimiento: a.zona` crudo — InmoPanama "Bella Vista", Savitat "Marbella, Bella Vista", MLS "PUNTA PACIFICA" (uppercase), PE "Punta Caelo" (typo)
- La vista `vw_zona_benchmark` hace `GROUP BY corregimiento` con igualdad estricta → cada variante genera un bucket propio → `avg_precio_m2`, `median_precio_m2` y `opportunity_score` calculados sobre subgrupos de 1-2 propiedades. El score de "oportunidad" está podrido por variance splitting.
- **Fix**: `normalizeKey(a.zona)` (que ya existe en `zonas-panama.ts`) antes de escribir; agregar CHECK a nivel DB.

### C4 · FK abuse: `scraper_runs.fuente_id="encuentra24"` para 3 jobs distintos
- **Archivos**: [refresh-precios.ts:534](scripts/scrapers/refresh-precios.ts#L534), [verificar-estado.ts:413](scripts/scrapers/verificar-estado.ts#L413), [backfill-ia.ts:33](scripts/scrapers/backfill-ia.ts#L33)
- Ya lo vimos ayer: cache-cleanup no aparece en scraper_runs → FK a `fuentes` rechaza IDs desconocidos → tres scripts distintos abusan `fuente_id="encuentra24"`. Consecuencia: dashboards que agrupen por fuente ven `encuentra24 found=6000` (mezcla real + refresh + verify) — números engañosos. Además, si refresh-precios muere silenciosamente, queda enmascarado como encuentra24.
- **Fix**: agregar fila `('system', 'System jobs', 'internal')` a `fuentes` y setear cada script con su `fuente_id` propio (`refresh-precios`, `verify`, `backfill-ia`). Actualizar el filtro de `useLastScraperRun` en consecuencia.

### C5 · Refresh-precios: update de "sin cambio" ignora error de Supabase
- **Archivo**: [refresh-precios.ts:456-462](scripts/scrapers/refresh-precios.ts#L456-L462)
- El `.update({ fecha_ultima_revision })` para propiedades sin cambio no captura `{ error }`. Si falla (RLS, network), `stats.sinCambio` se incrementa igual → status=ok con 600 "sin cambio" cuando en realidad ninguna fila se actualizó → verify las re-verifica → `veces_no_encontrado` escala inapropiadamente.
- **Fix**: capturar `{ error }` y incrementar `stats.errores` si falla.

---

## 🟠 HIGH — atender este mes

### Scraper (silent failures)

- **H1** · Refresh-precios reporta `status=ok` con cientos de errores mientras haya ≥1 cambio. Fórmula `errores > 0 && cambiados === 0 ? "error" : "ok"` está copiada en todos los scrapers. Alerta no dispara. Fix: umbral por ratio (`errores/total > 0.2` → error).
- **H2** · `chunkedParallel(...).catch(() => null)` silencia errores en `scrapeDetail` — muchas URLs fallan por fetch/geo/timeout pero NUNCA cuentan como error. `scraper_runs.errors` reporta 3 cuando la realidad son 200. Fix: incrementar `runState.errors` en el catch.
- **H3** · `fetchExistingUrls` devuelve set parcial en error de paginación sin señalizar. Si SELECT falla en página 3/5, se retornan solo páginas 1-2 → las URLs de páginas 3-5 aparecen como "no en DB" → se re-procesan con IA completa (gasto Groq masivo). Fix: throw en error.
- **H4** · Race en el SIGTERM handler — el segundo `writeRunOnce` (del handler) puede matar el proceso mid-insert del primero (el natural). Fix: awaitear la Promise en curso antes de decidir.
- **H5** · Savitat: sitemap check para verify sin normalizar protocolo/case/query. Un cambio de formato del sitemap puede archivar 100+ propiedades en 7 corridas. Fix: normalizar ambos lados (lowercase, drop query, decode) antes de comparar.
- **H6** · HTTP 403 (Cloudflare / block) → `error_verificacion` permanente sin salida. La URL se re-fetcha cada corrida, vuelve a 403, mismo estado. Fix: sostener 3 corridas antes de mover, o cola separada.
- **H7** · `urls-fallidas` cache solo implementado en Savitat. Las otras 5 fuentes vuelven a quemar Groq en URLs sin-geo-posible cada día. Ahorro estimado: docenas de calls Groq/día. Fix: integrar en los 5 scrapers restantes.
- **H8** · `scrapeRefreshDirect` de InmoPanama pasa `tipoOperacion="venta"` por default — si el badge del sitio cambia y `extractOperacion` retorna null, una URL de alquiler se re-guarda como venta. Fix: pasar el `tipo_operacion` de DB en `refreshMap`.

### UI/UX (bugs visibles al usuario)

- **H9** · Mapa: 5000 pines = 5000 nodos DOM absolutamente posicionados. Cada filter/select destruye y re-crea TODOS los markers (deps del effect incluye inline `onSelect`). Performance terrible con inventario creciendo. Fix: migrar a GeoJSON source + `symbol` layer + `cluster: true` nativo de Mapbox.
- **H10** · Loading state existe en `usePropiedades` pero nunca se rendera. Entre mount y respuesta de Supabase, el mapa está vacío indistinguible de "no hay resultados". Fix: consumir `loading` y mostrar skeleton/overlay.
- **H11** · `useLastScraperRun` sin `.catch()` — si el query falla (RLS, network), la sidebar muestra "Sin corridas aún" idéntico a healthy-but-empty.
- **H12** · Mobile: `ComparisonList` + `PropertyCard` = 600px de asides fixed side-by-side → clipping en viewports <600px. Fix: sheet full-screen en móvil.
- **H13** · Geocoder search bar clipping en mobile. Con filtro activo `leftInsetPx=260` + width 360 → sale del viewport en pantallas <640px.
- **H14** · Pines del mapa sin keyboard/screen-reader access. `role="button"`, `tabIndex=0`, `keydown Enter/Space` faltan. La feature principal es inaccesible.
- **H15** · Color de archivados `#7a1010` @ opacity 0.55 sobre fondo dark ≈ invisible (falla WCAG AA). Fix: `#EF4444` @ 0.6 o outline.

### Data quality

- **H16** · `edificios_cache` sin TTL en hits positivos. Cuando el geocoder web devuelve coord mala (bug Marbella, 16 props colapsadas — el que arreglamos manualmente), queda para siempre. Fix: TTL 90d en `source='web'` + detector automático de "colapso" (N props ≥ K en misma coord dispara re-cache).
- **H17** · `ia_extract_cache` mismo problema. Si IA saca "Área Bancaria" en vez de "Marbella", cachea el error indefinidamente. Fix: `created_at < now() - 90d` como TTL + endpoint para purgar.
- **H18** · `veces_no_encontrado` sin cap — filas con `veces=999` que crecen sin parar. Fix: `Math.min(THRESH_ARCHIVADO, veces + 1)` en verify.
- **H19** · Migration 0003 no idempotente — el `alter … rename column resumen_ia to resumen_ia_es` falla en re-ejecución. Rompe la promesa de idempotencia. Fix: envolver en `if exists`.
- **H20** · `reprocess-archived` actualiza `lat/lng` pero NO `precision_ubicacion`/`ubicacion_fuente`. Fila queda con coord nueva y precisión vieja (null o "aproximada"). Fix: agregar los 2 campos al UPDATE.

### Tech debt (bloquea refactor)

- **H21** · **Cero tests**. Módulos críticos y triviales de testear: `toNumber` (7 copias), `extractPrecio` (4 lugares), `computeUpdate`, `overlapAlto`, `isOnLand`. Fix: vitest + ~100 tests unitarios cubren el core.
- **H22** · **Duplicación masiva sin justificar**. 8 copias de `chunkedParallel`, 7 de `toNumber`, 5 de `checkRobotsTxt`, 5 de `fetchHtml`, 4 de `nominatimQuery` (¡el módulo compartido `nominatim.ts` ya existe y nadie lo usa!). Cambio en uno = auditar 7 archivos. Fix: `scripts/scrapers/_common.ts`.
- **H23** · **CI no valida NADA**. El único workflow es el de scraper en producción. No hay `tsc --noEmit`, `next build`, `eslint` en PRs. Fix: `.github/workflows/ci.yml` con esos 3 comandos en `pull_request`.

---

## 🟡 MEDIUM — backlog

### Scraper / Data
- **M1** · Extractor precio InmoPanama duplicado en 4 lugares (scraper, savitat con lógica parecida, refresh-precios, extraer-html-ia). Cuando se agrega un fallback nuevo (como el del 08-01), 3 lugares se sincronizan a mano. Fix: módulo `extractors/inmopanama.ts` compartido.
- **M2** · Savitat descarta coord JSON-LD legítima si `isOnLand` la rechaza — sin log estructurado y corre pipeline caro (Groq + web + Nominatim) para una prop cuya coord real ya teníamos.
- **M3** · Verify: contadores se incrementan ANTES del update en DB → si el update falla, discrepancia entre stats y estado real.
- **M4** · Refresh-precios: lista de fuentes hardcodeada. Nuevos scrapers quedan fuera indefinidamente. Fix: `SELECT DISTINCT fuente_id FROM propiedades`.
- **M5** · Backfill de `precision_ubicacion` aplanó 3781 filas a "aproximada" sin diferenciar por fuente — Savitat y PE (que casi siempre tenían coord exacta del JSON-LD) quedaron mal etiquetadas. Badge "Ubicación aproximada" aparece indebidamente en el mapa. Fix: backfill correctivo por fuente.
- **M6** · `ubicacion_fuente` es text libre — sin CHECK. Cualquier tipeo se pierde silenciosamente. Fix: documentar valores válidos y agregar CHECK.
- **M7** · `scraper_runs.status` sin CHECK — typos ("okay", "OK") se aceptan y rompen filtros del alerta.
- **M8** · `ia_extract_cache_touch` no se llama en session-cache hits → métricas de hit rate subestimadas.

### UI/UX
- **M9** · `/scraper` tiene labels hardcodeados en ES ("vivas", "no encontradas", "archivadas", "posibles"). Switch a EN no traduce.
- **M10** · "Preview · N scrapeados" hardcoded ES. Igual `alt` de satellite y `title="Máx N"` del compare.
- **M11** · Fechas con `.toLocaleDateString()` sin locale → mezcla ES app con EN browser.
- **M12** · Loading fallbacks son un `…` glyph en div de 64px. Se ve roto. Fix: `Skeleton` component ya existe, usarlo.
- **M13** · Sheet de filtros abre en el mismo lado que la Sidebar → visualmente colisionan en desktop. Fix: sheet a la derecha o auto-collapse sidebar.

### Tech debt
- **M14** · `src/lib/supabase/types.ts` sigue siendo stub `Record<string, unknown>`. El código compensa con casts `as unknown as DbPropiedad[]` — sin tipos de Supabase. Fix: `npx supabase gen types typescript`.
- **M15** · Drift entre `run-pipeline.sh` (Railway) y `.github/workflows/scraper.yml` — el segundo NO tiene `refresh-precios` ni `alerta`. Si alguien lo dispara pensando que replica producción, corre incompleto.
- **M16** · `tsconfig` estricto pero le falta `noUncheckedIndexedAccess` — activarlo probablemente destape 2-3 bugs reales en `html.match()?.[1]` sin chequeo.

### Security (bajo riesgo pero mitigable)
- **S1** · Sin rate limiting en lectura pública de Supabase. `anon key` visible en bundle, cualquiera puede martillar tu quota. Fix: rate limits en Supabase settings o middleware con Upstash.
- **S2** · Token Mapbox necesita restricciones de URL en la consola de Mapbox — `.env.example` lo dice pero no hay verificación.
- **S3** · `<a href={urlOriginal}>` sin whitelist de protocolo → si un scraper alguna vez inserta `javascript:...` como url, clic ejecuta script. Probabilidad baja pero fix simple: helper `safeExternalHref()`.

---

## 🟢 LOW — nice-to-have

- **L1** · `src/features/propiedades/mock.ts` — 313 líneas de código muerto (mockPropiedades no se importa).
- **L2** · `PANAMA_BOUNDS` exportado y nunca importado.
- **L3** · `createAdminClient()` en `src/lib/supabase/admin.ts` no se importa desde ningún lado.
- **L4** · `AI_SUMMARY_ENABLED` — Gemini apagado en prod. 176 líneas de `ia.ts` que un cambio silencioso rompería sin nadie enterarse. Decidir: prender o eliminar.
- **L5** · Scripts one-shot acumulados sin caducidad en `package.json` (`backfill:precision` ya corrido, etc.). Mover a `_archived/` o borrar.
- **L6** · Comentarios "fix 2026-07-XX" apilándose sin convención de limpieza — mover histórico a `bitacora.md`.
- **L7** · Marker `alquiler` naranja `#FF7A00` pero glow `rgb(0,98,255)` (azul) — visualmente incoherente. Fix: sync el glow con el color base.
- **L8** · Pin únicos: cuando clickeás cerca del borde derecho, la card lo cubre. Fix: `map.easeTo({ center, padding: { right: rightInsetPx } })` en `selectedId` change.
- **L9** · `use-mobile.ts` retorna `false` en primer render → 1 frame de flash donde el Sheet renderiza como popover desktop.
- **L10** · Test contractual para "no persistir PII" — no hay guardarraíl que falle si alguien agrega `telefono` a `toDbRow`.

---

## Verificado OK (no findings)

- **Secrets**: `.env.local`, `.env`, `.claude/` en `.gitignore`. Grep de patterns `sk-`, `AIza`, `ghp_`, `gsk_`, `eyJ` en repo → 0 matches fuera de `env.example`.
- **RLS**: 7 tablas con RLS habilitado. Todas las policies anon son SELECT-only. Service role solo en scripts server-side.
- **XSS**: 0 `dangerouslySetInnerHTML`, `eval`, `new Function` en `src/`. SQL siempre via query builder.
- **Robots.txt**: chequeado por los 6 scrapers antes de scrapear. UA honesto.
- **Anti-PII**: los 6 `toDbRow()` NO incluyen `descripcion`, `telefono`, `email`, `contacto`, fotos. Solo campos técnicos + `resumen_ia_*` generado.

---

## Prioridades sugeridas

**Semana 1** (los CRITICALs que rompen datos):
1. C2 — scrapers pisan lifecycle → fix es 6 líneas por scraper, gran impacto
2. C4 — FK abuse — agregar fila `system` en `fuentes`, cambiar 3 fuente_id
3. C5 — silent failure en refresh-precios "sin cambio"
4. C3 — normalizar `corregimiento` antes de persistir (backfill correctivo aparte)

**Semana 2** (silent failures del scraper):
5. H1, H2, H3, H4 — errores silenciosos varios
6. H16, H17 — TTL de caches para evitar poisoning permanente

**Semana 3-4** (UI y tests):
7. C1 — filtros del mapa coherentes con el chip
8. H9 — clustering nativo del mapa (crítico si el inventario sigue creciendo)
9. H21, H22, H23 — tests + `_common.ts` + CI basic
10. H10, H11 — loading/error states

**Backlog largo**: los MEDIUM y LOW.

---

*Auditoría generada por Claude Code — 5 agentes de exploración paralelos en ~10 min.*
