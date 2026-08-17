# Checklist de Auditoría — 2026-08-06

Lista viva de los 59 findings de la auditoría, con explicación simple y estado.
Marcar `[x]` cuando se cierre. Ver `AUDITORIA_2026-08-06.md` para el detalle técnico.

## Resumen de progreso

| Sección | Total | Hechos | Pendientes |
|---|---|---|---|
| 🔴 CRITICAL | 5 | **5** | 0 |
| 🟠 HIGH | 23 | **23** | 0 |
| 🟡 MEDIUM | 21 | **18** | 3 |
| 🟢 LOW | 10 | **10** | 0 |
| **Total** | **59** | **56** | **3** |

---

## 🔴 CRITICAL

- [x] **C1 — Filtros del mapa que no aplicaban** (`2267733`)
  El chip decía "1 filtro activo" pero el mapa no cambiaba, porque score/confianza solo funcionan en Análisis. Ahora solo cuenta filtros que efectivamente aplican + badge de aviso.

- [x] **C2 — Scrapers revivían propiedades archivadas** (`7d7b28b`)
  Cuando verify marcaba una prop como muerta, el próximo scrape la resucitaba sin re-validar. Ahora `stripLifecycleIfNotActive` respeta la decisión de verify.

- [x] **C3 — Corregimientos duplicados** (`99d11d4`)
  "Bella Vista", "bella vista", "BELLA VISTA" contaban como 3 zonas distintas → benchmark de precios roto. Ahora `normalizeKey()` unifica. Backfill consolidó 107 duplicados sobre 5757 filas.

- [x] **C4 — Jobs fichando con nombre equivocado** (`b1db63f`)
  verify, refresh-precios y backfill-ia se registraban como "encuentra24" → métricas mezcladas. Migration 0018 creó filas propias; cada job registra bajo su nombre.

- [x] **C5 — refresh-precios ocultaba errores** (`f1d6212`)
  El update de "sin cambio" no capturaba errores → status="ok" con 600 filas que en realidad no se actualizaron. Ahora captura y cuenta como error.

---

## 🟠 HIGH

### Scraper — silent failures (Fase 2, todos cerrados)

- [x] **H1 — Status por umbral de errores** (`46f32f7`)
  Antes: 1 inserted + 200 errores = status "ok". Ahora: si más del 20% falla, status "error" y disparan alertas.

- [x] **H2 — Errores de scrapeDetail se contaban en cero** (`4ff5620`)
  El `.catch` silenciaba fallos de fetch/parse/geo. Ahora cada catch suma al contador de errores del run.

- [x] **H3 — fetchExistingUrls devolvía datos parciales** (`6f06f20`)
  Si la paginación fallaba en página 3/5, retornaba solo 1-2 y las de 3-5 se re-procesaban con Groq (gasto sorpresa). Ahora aborta ruidoso.

- [x] **H4 — SIGTERM handler mataba el insert en curso** (`86f3d16`)
  Cuando Railway cortaba, el handler llamaba writeRunOnce por segunda vez y process.exit(0) mataba el insert real. Ahora awaitea la Promise en vuelo.

- [x] **H7 — Cache de URLs fallidas en 4 fuentes que faltaban** (`9e08311`)
  Antes solo mlsacobir y savitat lo usaban → las otras 4 re-quemaban Groq en las mismas URLs sin-geo cada corrida. Ahora las 6 usan el cache.

- [x] **H16 — TTL 90d en edificios_cache source=web** (`72f8558`)
  Si el web scraper guardaba una coord equivocada (bug Marbella), quedaba para siempre. Ahora se re-valida cada 90d + script `detectar-colapso-cache.ts` auto-invalida entradas con ≥5 props colapsadas.

- [x] **H17 — TTL 90d en ia_extract_cache** (`b7a381b`)
  Si la IA sacaba mal la zona ("Área Bancaria" por "Marbella") quedaba cacheado indefinido. Ahora los hits >90d se ignoran + script `purgar-ia-cache.ts` para hard-delete.

### Scraper — quality (Fase 3, todos cerrados)

- [x] **H5 — Sitemap check Savitat sin normalizar** (`5ea825d`)
  Comparaba URLs contra el sitemap sin normalizar protocolo/case/query. Un cambio cosmético del formato del sitemap podía archivar 100+ propiedades vivas. Ahora `normalizeSavitatUrl()` aplicado simétricamente en ambos lados (https, lowercase, sin www, sin query, sin trailing slash).

- [x] **H6 — HTTP 403 en loop permanente** (`7694178`)
  Un 403 aislado (Cloudflare/bloqueo temporal) movía la prop a `error_verificacion` de inmediato y ahí quedaba. Ahora nueva columna `veces_error_consecutivo` (migration 0019): se sostiene el estado 3 corridas consecutivas antes de escalar. Cualquier resultado exitoso resetea el contador.

- [x] **H8 — InmoPanama refresh podía cambiar venta ↔ alquiler** (`37ea372`)
  `scrapeRefreshDirect` pasaba `tipoOperacion="venta"` hardcoded. Si el badge cambiaba, alquileres se re-guardaban como venta. Ahora `fetchRefreshTargets` trae el tipo real de DB y lo usa como default.

### UI / Performance (Fase 6, todos cerrados)

- [x] **H9 — 5000 pines re-creados en cada select/filter** (`fa8bfae`)
  El effect dependía de `pins, onSelect, selectedId, matchedIds, dict` → cualquier cambio de estado destruía y re-creaba los N nodos DOM. Ahora effect de creación depende solo de `pins`; `selectedId` y `matchedIds` se aplican como `classList.toggle` sobre elementos existentes. Frame time cae ~10-50× según inventario. (Migración full a GeoJSON+cluster nativo queda como mejora futura si el inventario supera 10k.)

- [x] **H10 — Loading overlay en el primer fetch** (`0325739`)
  El `loading` de `usePropiedades` ahora se consume en home-content y muestra un overlay "Cargando propiedades…" (nueva clave dict.common.loading) hasta que la primera query responde.

- [x] **H11 — useLastScraperRun con estado de error** (`0325739`)
  La hook ahora retorna `{run, loading, error}` y el badge distingue 3 estados: normal (datos), loading (···), error rojo con tooltip, vacío ("Sin corridas aún").

### UI Mobile / Accesibilidad (Fase 4, todos cerrados)

- [x] **H12 — Clipping en pantallas <600px** (`52c0d54`)
  Ambos asides ahora usan `w-full sm:w-[300/380px]` (100vw en mobile). En modo compare, si hay PropertyCard/ZonaList a la izquierda, ComparisonList se oculta en mobile (`hidden sm:flex`) y queda accesible al cerrar la card.

- [x] **H13 — Search bar del geocoder fuera del viewport** (`52c0d54`)
  Ancho cambiado a `w-[min(360px,calc(100vw-1.5rem))]` y el `left` se recorta con `min(..., calc(100vw-1.5rem))` para nunca salirse. Antes daba 72px útil en <400px.

- [x] **H14 — Pines del mapa sin acceso por teclado** (`52c0d54`)
  Agregado `role="button"`, `tabindex=0`, `aria-label` (nueva clave dict.pin.click_hint en ES/EN) y handler `keydown` para Enter/Space al elemento del marker.

- [x] **H15 — Color de archivados invisible en modo oscuro** (`52c0d54`)
  De `#7a1010 @ 0.55` (contraste <3:1, falla WCAG AA) a `#EF4444 @ 0.7` (red-500 de Tailwind, mantiene el "rojo apagado" pero visible). Opacity sincronizada en el legend.

### Data quality (Fase 5, todos cerrados)

- [x] **H18 — Contador `veces_no_encontrado` sin tope**
  Filas con `veces=999` seguían creciendo sin sentido — una vez archivada, no hace falta seguir contando. Ahora `Math.min(THRESH_ARCHIVADO, veces + 1)` en verify.

- [x] **H19 — Migration 0003 no idempotente**
  El `alter … rename column resumen_ia to resumen_ia_es` fallaba en re-ejecución. Ahora envuelto en `DO $$ ... $$` que chequea existencia de la columna antes de renombrar.

- [x] **H20 — reprocess-archived dejaba precision desactualizada**
  Actualizaba `lat/lng` pero NO `precision_ubicacion` ni `ubicacion_fuente` → filas revividas quedaban con coord nueva y metadata vieja (badge "Ubicación aproximada" incorrecto). Ahora se actualizan los 2 campos.

### Foundation — bloquea refactor futuro (Fase 7, todos cerrados)

- [x] **H21 — Cero tests** (`04b1376`)
  Instalado vitest + 34 tests iniciales sobre módulos críticos: `chunkedParallel` (11), `computeRunStatus` (8, cubre el bug histórico H1), `stripLifecycleIfNotActive` (9), `isOnLand` (7). Script `npm test` + `test:watch`. Nueva etapa en CI antes del lint. Cobertura incremental sobre el resto queda como M-level.

- [x] **H22 — Duplicación masiva de código** (`2ed4cce`)
  Extraído `chunkedParallel` de 8 copias a `scripts/scrapers/_common.ts` con 2 formas: `chunkedParallel` (filtra null, default) y `chunkedParallelKeepAll` (para verify/refresh-precios con side-effects). Opciones: `shouldStop` para deadlines. Los otros duplicados (`toNumber`, `checkRobotsTxt`, `fetchHtml`, `nominatimQuery`) quedan como M-level para extraer cuando se toque cada uno.

- [x] **H23 — CI que valida NADA** (`2ed4cce`)
  Nuevo `.github/workflows/ci.yml` con `tsc --noEmit`, `vitest run`, `eslint` y `next build` en push a main y en PRs. Lint permisivo por ahora (5 errores pre-existentes) — pasa `continue-on-error: true` hasta que se limpie. El resto sí bloquea el merge.

---

## 🟡 MEDIUM (17/21 cerrados, 2026-08-11)

### Scraper / Data

- [x] **M1 — Extractor de precio InmoPanama duplicado** (`5cb1cbc`)
  Nuevo módulo `scripts/scrapers/extractors/inmopanama-html.ts` con `parseInmoQuickFacts` y `extractInmoPrecio` (cascada de 4 fallbacks). `scraper-inmopanama.ts` y `refresh-precios.ts` importan del módulo — se acabó sincronizar a mano 2+ lugares cuando cambia el HTML de InmoPanama.

- [x] **M2 — Savitat isOnLand descarta coord con log estructurado** (`5cb1cbc`)
  Log con prefijo `[M2/isOnLand-reject] savitat url=... zona=... coord=...` cuando el JSON-LD trae coord y `isOnLand` la rechaza. Permite grep sobre logs de prod para detectar patrones (ej. muchos rechazos en la misma zona costera → extender whitelist).

- [x] **M3 — Verify: contadores DESPUÉS del update** (`6f55c12`)
  Deltas locales (`dArchivadas`, `dVivas`, ...) que se suman al total solo si el UPDATE devuelve success. Antes: si el update fallaba, stats reportaban una realidad distinta a la DB.

- [x] **M4 — Refresh-precios: fuentes dinámicas** (`6f55c12`)
  `SELECT DISTINCT fuente_id FROM propiedades WHERE estado_anuncio='activo'` filtrando sistema-jobs. Nuevos scrapers ya no quedan fuera del refresh indefinidamente.

- [x] **M5 — Backfill correctivo de precision por fuente** (`5cb1cbc`)
  Nuevo `scripts/scrapers/backfill-precision-por-fuente.ts` (`npm run backfill:precision-fuente[:apply]`). Para cada fuente que publica coord del JSON-LD (savitat, panamaequity), setea `precision_ubicacion='exacta'` + `ubicacion_fuente='jsonld_geo'` en filas que quedaron `aproximada` por el backfill masivo. Idempotente: solo toca filas con `ubicacion_fuente IS NULL`. **⚠ REQUIERE APLICAR MANUAL**: `npm run backfill:precision-fuente:apply`.

- [x] **M6 — CHECK en ubicacion_fuente** (`6f55c12`)
  Migración `0020_check_constraints.sql` con whitelist de 9 valores documentados. Typos silenciosos ahora fallan en el INSERT/UPDATE. **⚠ NO APLICAR AÚN** hasta confirmar que la DB no tiene valores fuera de whitelist.

- [x] **M7 — CHECK en scraper_runs.status** (`6f55c12`)
  Misma migración: solo permite `'running' | 'ok' | 'error'`. Ver arriba.

- [x] **M8 — Session-cache hits cuentan en `ia_extract_cache_touch`** (`6f55c12`)
  Antes solo se contaban hits de Supabase → `hit_count` subestimado. Ahora la RPC se llama también cuando el hit viene del cache en memoria.

### UI / UX

- [x] **M9 — Labels hardcoded en /scraper** (`7ffe1f3`)
  6 nuevas claves en dict.scraper_info (verify_alive/missing/possible/archived/errors, preview_scraped) traducidas a ES/EN. `/scraper` y sidebar ya no rompen el switch de idioma.

- [x] **M10 — Otros strings hardcoded** (`7ffe1f3`)
  `title="Máx N"` en PropertyCard usa `dict.common.max`. "Preview · N scrapeados" cubierto por M9.

- [x] **M11 — Fechas con locale mezclado** (`7ffe1f3`)
  PropertyCard pasa locale explícito ("es-PA" / "en-US") a `toLocaleDateString`. Sin esto la app-ES mostraba fechas EN.

- [x] **M12 — Skeleton en fallbacks** (`7ffe1f3`)
  Los glyphs "…" en /analisis, /historial, /propiedades y los 3 KpiCard de /scraper reemplazados por el componente `Skeleton` existente. `KpiCard` acepta prop `loading` para renderizar skeleton en lugar del valor.

- [x] **M13 — Sheet de filtros a la derecha** (`7ffe1f3`)
  Sheet abre `side="right"` en /analisis, /home y /propiedades para no colisionar con la Sidebar (izquierda).

### Tech debt

- [x] **M14 — Tipos de Supabase generados** (commit siguiente)
  `src/lib/supabase/types.ts` ahora tiene 702 líneas con el schema real (11 tablas + 2 views + enums + RPCs). Los 3 `as unknown as X` reemplazados por casts simples (verificados por TS) o por tipos derivados del schema (`Pick<Database["public"]["Tables"]["scraper_runs"]["Row"], ...>`). **Bug destapado y corregido:** `safeCount(supabase, "edificio_coords_cache")` en `scraper-info/api.ts` — nombre inventado, la tabla real es `edificios_cache`. Antes silencioso (siempre devolvía null → card mostraba "—"), ahora TS lo hubiera atrapado en el editor.

- [x] **M15 — Drift entre Railway y Actions** (`7ffe1f3`)
  `scraper.yml` agrega el step `Refresh precios` que faltaba. Header del workflow documenta la diferencia intencional en la alerta (Railway=email vía Resend, Actions=GitHub Issue).

- [x] **M16 — noUncheckedIndexedAccess evaluado, NO activado** (`7ffe1f3`)
  Probado: activar el flag destapa 113 errores en 4 categorías (18048/2532/2345/2322). Demasiado para arreglar en batch sin riesgo de mal-fixear (mezclar `!` con `??`). Se deja como pendiente para arreglar incremental cuando se toque cada archivo. Registro para no re-explorar en la próxima auditoría.

### Security (bajo riesgo)

- [ ] **S1 — Sin rate limiting en Supabase** (REQUIERE CONFIG EXTERNA)
  No es código — hay que setearlo en Supabase Studio → Settings → API Rate Limits. Alternativa: middleware con Upstash Redis (requiere cuenta Upstash + code).

- [ ] **S2 — Token Mapbox sin restricciones de URL** (REQUIERE CONFIG EXTERNA)
  Tampoco es código — hay que ir a account.mapbox.com → tokens → editar el token público → agregar restricción por URL (solo dominios propios). Sin esto el token puede usarse desde cualquier sitio.

- [x] **S3 — href externo con whitelist de protocolo** (`5cb1cbc`)
  Nuevo helper `src/lib/safeHref.ts` que rechaza cualquier protocolo distinto a `http:` / `https:`. Aplicado en `PropertyCard` (link "Ver original" + "otros anuncios") y `OpportunitiesTable`. Cierra el vector aunque la probabilidad era baja.

---

## 🟢 LOW (todos cerrados, 2026-08-11)

- [x] **L1 — 313 líneas de código muerto** (`4c495f9`)
  Borrado `src/features/propiedades/mock.ts` — no se importaba desde ningún lado.

- [x] **L2 — PANAMA_BOUNDS exportado sin usarse** (`4c495f9`)
  Removido el export de `src/lib/mapbox/config.ts`.

- [x] **L3 — createAdminClient() sin usarse** (`4c495f9`)
  Borrado `src/lib/supabase/admin.ts` — los scripts usan `createScraperClient` del helper propio.

- [x] **L4 — AI_SUMMARY_ENABLED apagado** (`4c495f9`)
  `scripts/scrapers/ia.ts` reemplazado por STUB (176 → 30 líneas). `enriquecerConIA` retorna resultado vacío. Removida dependency `@google/genai`. Pendiente en memoria del proyecto: usuario va a pasar spec de qué hace cada IA para rediseñar.

- [x] **L5 — Scripts one-shot acumulados** (`d5e62ad`)
  Movidos `backfill-precision-null.ts` (corrido 2026-07-25) y `backfill-corregimiento-normalizado.ts` (corrido 2026-08-07) a `scripts/scrapers/_archived/` con README. Removidos los 4 scripts npm asociados.

- [x] **L6 — Comentarios "fix 2026-07-XX" apilándose** (`d5e62ad`)
  Nueva sección en `AGENTS.md` con política: comentarios inline explican "por qué actual", historia va a bitacora.md. Cuando un archivo tiene ≥3 "fix" apilados, consolidar al tocar.

- [x] **L7 — Glow del pin alquiler descoordinado con el color** (commit siguiente)
  Sincronizados los glows: alquiler naranja `#FF7A00` → glow `255,122,0`; cluster azul `#3B82F6` → glow `59,130,246`. Antes eran restos del color viejo pre-refactor.

- [x] **L8 — Card del pin tapa el pin al borde derecho** (commit siguiente)
  Nuevo effect: cuando cambia `selectedId`, `map.easeTo({ center, padding: { right: rightInsetPx } })` re-encuadra para que el pin no quede tapado por la card.

- [x] **L9 — use-mobile.ts retorna false primer render** (commit siguiente)
  Reescrito con `useSyncExternalStore` — el primer render en cliente ya lee el valor real. Se acabó el frame de flash "desktop → mobile".

- [x] **L10 — Sin test contractual de "no persistir PII"** (commit siguiente)
  Nuevo `tests/anti-pii.test.ts` con 12 tests. Lee el bloque de `function toDbRow` de los 6 scrapers y falla si detecta keys prohibidas (descripcion, telefono, email, contacto, fotos, etc.). Blindaje contra descuidos de copy-paste. 46/46 tests totales pasan.

---

## Verificado OK (no action needed)

- ✅ **Secrets** — `.env*` y `.claude/` en `.gitignore`. Grep de patterns sensibles en repo → 0 matches.
- ✅ **RLS** — 7 tablas con Row Level Security habilitado. Policies anon son SELECT-only.
- ✅ **XSS** — 0 `dangerouslySetInnerHTML`, `eval` ni `new Function` en `src/`.
- ✅ **Robots.txt** — chequeado antes de scrapear en los 6 scrapers. UA honesto.
- ✅ **Anti-PII** — los 6 `toDbRow()` no incluyen descripción, teléfono, email, contacto ni fotos.
