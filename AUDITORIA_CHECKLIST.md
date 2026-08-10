# Checklist de Auditoría — 2026-08-06

Lista viva de los 59 findings de la auditoría, con explicación simple y estado.
Marcar `[x]` cuando se cierre. Ver `AUDITORIA_2026-08-06.md` para el detalle técnico.

## Resumen de progreso

| Sección | Total | Hechos | Pendientes |
|---|---|---|---|
| 🔴 CRITICAL | 5 | **5** | 0 |
| 🟠 HIGH | 23 | **23** | 0 |
| 🟡 MEDIUM | 21 | 0 | 21 |
| 🟢 LOW | 10 | 0 | 10 |
| **Total** | **59** | **28** | **31** |

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

## 🟡 MEDIUM

### Scraper / Data

- [ ] **M1 — Extractor de precio InmoPanama duplicado en 4 lugares**
  Scraper principal, savitat con lógica parecida, refresh-precios y extraer-html-ia. Cuando se agrega un fallback nuevo (como el del 08-01), hay que sincronizar 3 lugares a mano.

- [ ] **M2 — Savitat descarta coord JSON-LD legítima si isOnLand la rechaza**
  Sin log estructurado. Y encima corre el pipeline caro completo (Groq + web + Nominatim) para una prop cuya coord real ya teníamos, solo por un falso negativo del check.

- [ ] **M3 — Verify: contadores se incrementan antes del update**
  Si el update a DB falla, `stats.archivadas++` ya se ejecutó → discrepancia entre lo que reporta el log y el estado real de la DB.

- [ ] **M4 — Refresh-precios: lista de fuentes hardcodeada**
  Nuevos scrapers agregados en el futuro quedan fuera del refresh indefinidamente. Fix: `SELECT DISTINCT fuente_id FROM propiedades`.

- [ ] **M5 — Backfill de precision_ubicacion aplanó 3781 filas a "aproximada"**
  Sin diferenciar por fuente. Savitat y PE (que casi siempre tenían coord exacta del JSON-LD) quedaron mal etiquetadas → badge "Ubicación aproximada" aparece indebido en el mapa. Fix: backfill correctivo por fuente.

- [ ] **M6 — ubicacion_fuente es texto libre sin CHECK**
  Cualquier tipeo se pierde silenciosamente. Fix: documentar valores válidos y agregar CHECK constraint.

- [ ] **M7 — scraper_runs.status sin CHECK**
  Typos ("okay", "OK") se aceptan y rompen filtros de la alerta. Fix: CHECK en solo ('ok', 'error').

- [ ] **M8 — Métricas de hit-rate del cache IA subestimadas**
  `ia_extract_cache_touch` no se llama en session-cache hits → `hit_count` refleja menos hits reales de los que hay.

### UI / UX

- [ ] **M9 — /scraper con labels hardcodeados en español**
  Al hacer switch a inglés, textos como "vivas", "no encontradas", "archivadas", "posibles" no se traducen.

- [ ] **M10 — Otros strings hardcoded ES**
  "Preview · N scrapeados", `alt` del botón satellite, `title="Máx N"` del compare. Rompen i18n.

- [ ] **M11 — Fechas con locale mezclado**
  `.toLocaleDateString()` sin pasar locale → app en español, fechas en formato del navegador (inglés en la mayoría).

- [ ] **M12 — Loading fallbacks se ven rotos**
  Los skeletons actuales son un glyph `…` en un div de 64px. Se ve como bug. Existe un componente `Skeleton` que no se usa.

- [ ] **M13 — Sheet de filtros colisiona visualmente con la sidebar**
  Ambos abren en el mismo lado en desktop → visualmente se pisan. Fix: sheet a la derecha o auto-collapse sidebar.

### Tech debt

- [ ] **M14 — Tipos de Supabase son stub**
  `src/lib/supabase/types.ts` es `Record<string, unknown>`. El código compensa con casts `as unknown as DbPropiedad[]`. Fix: correr `npx supabase gen types typescript`.

- [ ] **M15 — Drift entre Railway pipeline y GitHub Actions**
  `run-pipeline.sh` (Railway, el que corre en prod) tiene más pasos que `.github/workflows/scraper.yml`. Si alguien dispara el workflow pensando que replica producción, corre incompleto.

- [ ] **M16 — TypeScript strict sin noUncheckedIndexedAccess**
  El flag está apagado. Activarlo probablemente destape 2-3 bugs reales del tipo `html.match()?.[1]` sin chequeo de undefined.

### Security (bajo riesgo)

- [ ] **S1 — Sin rate limiting en Supabase**
  La anon key está en el bundle público (normal), pero sin rate limits cualquiera puede martillar y quemar tu quota. Fix: rate limits en Supabase settings o middleware con Upstash.

- [ ] **S2 — Token Mapbox sin restricciones de URL**
  El `.env.example` dice que hay que restringir el token en la consola de Mapbox, pero no hay verificación automática.

- [ ] **S3 — href externo sin whitelist de protocolo**
  `<a href={urlOriginal}>` sin chequeo. Si algún día un scraper inserta `javascript:...` como URL, un click lo ejecuta. Probabilidad baja, fix simple: helper `safeExternalHref()`.

---

## 🟢 LOW

- [ ] **L1 — 313 líneas de código muerto** — `src/features/propiedades/mock.ts` no se importa desde ningún lado.

- [ ] **L2 — PANAMA_BOUNDS exportado sin usarse.**

- [ ] **L3 — createAdminClient() sin usarse** en `src/lib/supabase/admin.ts`.

- [ ] **L4 — AI_SUMMARY_ENABLED apagado** — Gemini en prod está off. 176 líneas de `ia.ts` que un cambio silencioso rompería sin nadie enterarse. Decidir: prender o eliminar el módulo.

- [ ] **L5 — Scripts one-shot acumulados** — `backfill:precision` y otros ya ejecutados siguen en `package.json`. Mover a `_archived/` o borrar.

- [ ] **L6 — Comentarios "fix 2026-07-XX" apilándose** — sin convención de limpieza. Fix: mover histórico a `bitacora.md`.

- [ ] **L7 — Glow del pin alquiler descoordinado con el color** — pin naranja pero el glow es azul. Visualmente incoherente.

- [ ] **L8 — Card del pin tapa el pin cuando está al borde derecho** — Fix: hacer paneo con `easeTo` cuando cambia el `selectedId`.

- [ ] **L9 — use-mobile.ts retorna false en el primer render** — 1 frame de flash donde el Sheet renderiza como popover desktop antes de darse cuenta.

- [ ] **L10 — Sin test contractual de "no persistir PII"** — no hay guardarraíl que falle en CI si alguien agrega `telefono` a `toDbRow`.

---

## Verificado OK (no action needed)

- ✅ **Secrets** — `.env*` y `.claude/` en `.gitignore`. Grep de patterns sensibles en repo → 0 matches.
- ✅ **RLS** — 7 tablas con Row Level Security habilitado. Policies anon son SELECT-only.
- ✅ **XSS** — 0 `dangerouslySetInnerHTML`, `eval` ni `new Function` en `src/`.
- ✅ **Robots.txt** — chequeado antes de scrapear en los 6 scrapers. UA honesto.
- ✅ **Anti-PII** — los 6 `toDbRow()` no incluyen descripción, teléfono, email, contacto ni fotos.
