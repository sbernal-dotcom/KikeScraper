<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Política de comentarios en el código (L6)

Los comentarios inline `// fix YYYY-MM-DD: ...` solo deben sobrevivir en
el código si **explican por qué el código actual es como es** (una
sutileza no obvia, una decisión contra-intuitiva, una regresión que se
mitigó). No son un log histórico de commits.

**Regla:**
- La **historia de por qué cambió algo** vive en `bitacora.md` y en los
  mensajes de commit — no en comentarios inline.
- Los comentarios inline deben leer al **presente** ("hacemos X porque
  Y"), no al pasado ("antes hacíamos X, ahora hacemos Y porque Z"). Solo
  se acepta pasado si el contra-ejemplo pasado es imprescindible para
  entender la elección actual (raro).
- Cuando toques un archivo con **≥3 "fix 2026-MM-DD" apilados**,
  consolidalos: dejá el racional actual (presente), mové la cronología
  a la entrada correspondiente de `bitacora.md`.
- Los comentarios de auditoría con label (`// H12: ...`, `// C3: ...`)
  son excepción — se mantienen mientras el contexto de la auditoría
  siga vigente, después se consolidan igual.
