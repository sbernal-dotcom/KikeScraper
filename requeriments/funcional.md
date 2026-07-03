# Requerimientos funcionales

## Producto

Mapa interactivo de propiedades inmobiliarias en Panamá. Muestra
listings de venta y alquiler agregados de múltiples portales, con
ubicación exacta (edificio) o aproximada (zona) según lo que la fuente
publica.

Contacto público: **abilendesign@gmail.com**.

## Contrato del pipeline (8 pasos)

Del scraper al mapa:

1. **Scrape**: cada fuente descarga sus listados según su método
   (sitemap, listado paginado, JSON-LD, microdata).
2. **Normalización**: cada listing se convierte a `AnuncioRaw` con
   campos comunes (titulo, precio, moneda, m², habs, baños, zona,
   coord opcional).
3. **Geocoding**: si la fuente no publica coord, se corre el pipeline
   IA→cache→web→zona-declarada (ver [ubicacion.md](ubicacion.md)).
4. **Validación tierra/mar**: `isOnLand(lat, lng)` rechaza coords que
   caen en el mar según el contorno de Panamá + landmarks costeros.
5. **Enriquecimiento IA**: resumen bilingüe (es/en) + tags cerrados de
   características + tags libres. Grabado en DB.
6. **Upsert Supabase**: `propiedades` con `onConflict: url_original`.
   Se registra `precision_ubicacion` + `ubicacion_fuente` para auditar.
7. **Verify diario**: pase 2 del lifecycle marca activo /
   posible_inactivo / archivado según GET + presencia de Product.
8. **Dedupe cross-source**: `propiedades_duplicados` reconstruye
   grupos de listings del mismo edificio en distintos portales.

## Reglas de contenido

**Solo campos estructurados.** NO guardar en DB, JSON, logs ni cache:

- `descripcion_original` — la descripción del anuncio original nunca
  se persiste. Solo vive en memoria durante la corrida para pasarla a
  la IA que genera el resumen bilingüe.
- Fotos del source (usamos Mapbox Static satelital en su lugar)
- Teléfono, email, vendedor, contacto
- Frases textuales del anuncio (validador 3-gram anti-copia en el IA
  resumidor)

**Flag de kill switch IA:** `AI_SUMMARY_ENABLED=false` desactiva
extracción y enriquecimiento IA globalmente.

## Estados del anuncio

`estado_anuncio` (enum):

- `activo` — visible en el mapa
- `posible_inactivo` — 3-6 fallos de verificación consecutivos
- `archivado` — 7+ fallos, o `pin_en_mar`, o descartado por scraper
- `error_verificacion` — timeout / 5xx / captcha, no penaliza contador

`presunta_venta` (bool): true si patrón sugiere que se vendió (activa
≥30 días + archivada ≥14 días). No borra — solo marca. Se rectifica si
la prop vuelve a activarse.

## Frontend

- Página `/` — mapa con pines de propiedades
- Página `/propiedades` — grid card con imagen satelital, precio,
  detalles, resumen IA
- Página `/analisis` — vista analítica (WIP)
- Pines rosa/magenta = cluster (2+ propiedades a <11 m entre sí)
- Idioma: es / en con `LocaleProvider`
