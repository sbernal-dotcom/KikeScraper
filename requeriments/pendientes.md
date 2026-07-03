# Pendientes / roadmap

Prioridades a fecha 2026-07-02. Se re-ordena según feedback del usuario.

## Corto plazo

### Badge "ubicación aproximada" en el frontend

Ahora tenemos `precision_ubicacion` en DB. Falta reflejarlo en las
cards:

- `PropertyGridCard.tsx` y `PropertyCard.tsx` → badge visible cuando
  `precision_ubicacion !== 'exacta'`
- Textos i18n: es "Ubicación aproximada" / en "Approximate location"
- Diseño no invasivo (badge pequeño, esquina de la imagen o pie de
  card)

### Backfill de precision_ubicacion

Filas históricas (~1000) tienen `precision_ubicacion: null`. Script de
backfill que infiera de:

- Fuente = panamaequity → `exacta` si vino del JSON-LD (chequear
  `ubicacion_fuente` es null histórico)
- Fuente = savitat → ya se está seteando
- Resto → `aproximada` como default (~93% del histórico)

### Aplicar precision_ubicacion en los otros scrapers

Actualmente solo Savitat setea `precision_ubicacion` + `ubicacion_fuente`.
Los otros scrapers (encuentra24, mlsacobir, inmopanama, acobir,
panamaequity) siguen dejando la columna null.

Extender a cada uno para consistencia. Panama Equity es el más
importante — su coord JSON-LD debe marcarse como `exacta`.

## Medio plazo

### Vista mercado (fase 2 del producto)

Con datos abiertos de MIVIOT / INEC agregar una capa:

- Precio promedio por zona
- Tendencias temporales (usando historial de scrapes)
- Ratio venta/alquiler
- Nuevos permisos de construcción (Municipio DOYC)

### Tests

No hay suite de tests. Riesgo alto:

- Regresiones silenciosas en el pipeline de geocoding
- Cambios en scrapers que rompan extractors
- Migraciones de schema que no coincidan con `types.ts`

Prioridad: tests unitarios en `panama-land.ts` (isOnLand), `zonas-panama.ts`
(centroFromTable), `geocode-edificio.ts` (mock IA + web).

### Regenerar types.ts de Supabase

Actualmente hay casts manuales (ver `propiedades_duplicados`) porque
`types.ts` está desactualizado. `supabase gen types typescript` para
regenerar.

## Largo plazo / bajo prioridad

- **Verify con concurrencia**: actualmente sequential, es el
  bottleneck del cron
- **Registro Público como servicio de due diligence**: consulta 1-a-1
  por URL de propiedad
- **Facebook Marketplace / Redes sociales**: bloqueado por ToS
- **App móvil**: solo cuando el producto web esté estable
- **Rotar claves Supabase**: seguridad, sin urgencia
- **Restricción de allowlist en Mapbox token público**: para evitar
  uso desde otros dominios

## Zonas faltantes en `zonas-panama.ts`

Zonas mencionadas en anuncios que aún no están mapeadas:

- Carrasquilla
- Volcán
- El Bosque
- Las Cumbres

Agregar centroides verificados en Google Maps.

## Bloqueadores conocidos

- **Compre o Alquile**: Cloudflare Turnstile agresivo. Playwright
  headless bloqueado. Opciones: stealth plugin (frágil) o CAPTCHA
  solver de pago. Decisión actual: abandonar hasta que aparezca una
  alternativa limpia.
- **Env vars en Vercel**: cambios manuales, se olvidan al deploy.
- **Groq rate limit**: 6k TPM free tier. Con jitter alto + concurrency
  1 en Savitat no es problema, pero limitaría scaling a más fuentes
  que dependan de la IA.
