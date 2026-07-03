# Pipeline de ubicación

Cómo cada propiedad obtiene sus coordenadas y con qué nivel de precisión.

## Pipeline de geocoding

Orquestado por [`scripts/scrapers/geocode-edificio.ts`](../scripts/scrapers/geocode-edificio.ts):

```
1. ¿La fuente publica coord (JSON-LD geo.latitude/longitude)?
   SÍ  → precision="exacta", fuente="jsonld_geo"           ✓ FIN
   NO  → sigue al paso 2
                    │
                    ▼
2. IA (Groq Llama 3.1 8B) extrae del título+descripción:
   { edificio: "PH Ocean Reef", proyecto: null, zona: "Coco del Mar" }
                    │
                    ▼
3. Con esos strings, resuelve a coord:
   a) Cache edificios (tabla edificios_cache)
      HIT (manual) → precision="exacta", fuente="edificios_cache"
      HIT (web)    → precision="aproximada", fuente="web_search"
      MISS         → paso b
                    │
                    ▼
   b) Web search DuckDuckGo (buscar-edificio-web.ts)
      Encuentra coord válida → precision="aproximada", fuente="web_search"
      Cachea (positivo o negativo)
      Nada → paso c
                    │
                    ▼
   c) Zona-declarada (SOLO si allowZoneFallback: true)
      Zona conocida en tabla → centroide SIN jitter
      precision="zona-declarada", fuente="titulo_zona" o "streetAddress_zona"
      Nada → paso d
                    │
                    ▼
   d) Descartar propiedad (strict mode)
```

## Precisión

Columna `propiedades.precision_ubicacion` con CHECK constraint. Valores:

| Valor | Cuándo | Fuente típica |
|---|---|---|
| `exacta` | Coord viene del JSON-LD del source o cache manual | Panama Equity, Savitat a veces, cache(manual) |
| `zona-declarada` | Centroide de zona conocida que el source publicó | Savitat con streetAddress + zona en tabla |
| `aproximada` | Web search resolvió el edificio | Encuentra24, MLS, InmoPanama, ACOBIR |
| `null` | Histórico no clasificado | Filas pre-migración 0014 |

Columna `propiedades.ubicacion_fuente` (text libre) para auditoría:

- `jsonld_geo` — coord del Schema.org RealEstateListing
- `edificios_cache` — cache hit (con subtag: manual/web/google)
- `web_search` — DuckDuckGo HTML resolvió
- `titulo_zona` — IA extrajo zona del título, zona en tabla
- `streetAddress_zona` — streetAddress del JSON-LD, zona en tabla

## Validación tierra/mar

Antes de aceptar una coord, [`isOnLand(lat, lng)`](../src/lib/geo/panama-land.ts)
verifica que no cae en el mar. Enfoque híbrido:

1. **Point-in-polygon** contra el contorno continental de Panamá
   (Natural Earth simplificado, ~50 puntos).
2. **Fallback whitelist**: si el punto está a ≤10 km de un landmark
   costero conocido (Coronado, Chame, Rio Hato, Pedasí, Colón, Bocas,
   Amador, etc.), lo aceptamos. Esto cubre playas donde el polígono
   grueso rechazaría puntos legítimos.

Los scrapers rechazan coords que caen en mar; el script
`archivar-en-mar` corre diariamente para limpiar histórico.

## Strict mode

Política "edificio o nada" (activa desde 2026-06-25):

- `allowZoneFallback: false` (default): si el pipeline no resuelve un
  edificio/proyecto identificable → descarta la prop.
- `allowZoneFallback: true`: solo para fuentes de alta confianza que
  publican la zona explícitamente. Actualmente solo **Savitat** lo usa.
- El fallback zona-declarada NO usa jitter (posición determinística =
  centroide exacto).

## Fuentes por método

| Fuente | Método principal | allowZoneFallback |
|---|---|---|
| Encuentra24 | Pipeline IA → cache → web | ❌ false |
| ACOBIR Proyectos | Pipeline IA → cache → web | ❌ false |
| Panama Equity | JSON-LD directo, pipeline si falta | ❌ false |
| MLS Acobir | Pipeline IA → cache → web | ❌ false |
| InmoPanama | Pipeline IA → cache → web | ❌ false |
| Savitat / CBRE | JSON-LD si tiene, si no pipeline + zona | ✅ true |

## Validación cruzada Mapbox

`mapbox-validate.ts` compara nuestra coord con lo que Mapbox devuelve
para la zona. Si diff >2 km, loguea un warning. **NO es fuente de
geocoding** — solo alerta para detectar drift.
