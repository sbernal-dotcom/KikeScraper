# Scripts archivados

Scripts que fueron **one-shots ya ejecutados** contra la DB de producción
y no se van a volver a correr en su forma actual. Se guardan como
histórico por si el patrón del script sirve como base para uno nuevo,
o para reconstruir la lógica original si aparece un bug atribuible al
backfill.

Estos scripts:
- **NO** están registrados en `package.json` — no hay `npm run <x>` para
  ejecutarlos.
- **NO** entran al type-check del CI (excluidos por `tsconfig` si hace
  falta; hoy siguen incluidos porque son solo 2 archivos y compilan bien).
- **SÍ** se pueden correr manualmente con `npx tsx scripts/scrapers/_archived/<file>.ts`
  si aparece la necesidad, pero antes revisá el contexto histórico.

## Inventario

| Script | Corrida original | Qué hizo | Por qué se archivó |
|---|---|---|---|
| `backfill-precision-null.ts` | 2026-07-25 | Llenó `precision_ubicacion="aproximada"` en las filas históricas con NULL | Los inserts nuevos ya llenan la columna correctamente desde el scraper |
| `backfill-corregimiento-normalizado.ts` | 2026-08-07 | Re-normalizó 5757 filas históricas de `corregimiento` con `normalizeKey()` — consolidó 107 buckets duplicados | Los 6 scrapers ahora aplican `normalizeKey` al insertar (fix CRITICAL C3) |

Movidos aquí en 2026-08-11 como parte del cierre de LOW L5.
