# Arquitectura del backend · VoiceToWeb

Node.js 20+ con Express 5, módulos ES, PostgreSQL con `pg` y Gemini por su API REST (sin SDK).

## Carpetas

```
schema.sql               tablas usuarios, proyectos, versiones e ia_cache (idempotente, se ejecuta al arrancar)
.env.example             variables de entorno sin valores
src/
  index.js               arranque: comprueba JWT_SECRET, CORS, JSON (1 MB), rutas y manejo de errores
  db.js                  pool de PostgreSQL, iniciarDB() y dbDisponible()
  ia.js                  streamGemini() (SSE), llamarGemini() y ErrorIA con el código para el cliente
  ia/
    cache.js             clave SHA-256 estable, orden normalizada, lectura y escritura en ia_cache
  paginas/
    prompts.js           prompts de generar, editar, elegir secciones y editar secciones (VERSION_PROMPT)
    validar.js           validarPagina() con Zod y tituloDe()
    secciones.js         bloques data-vtw con parse5: índice, estilos, aplicar cambios y sus esquemas
    generar.js           generar() y editar() como eventos: caché → Gemini → validación → un reintento
  proyectos/
    repositorio.js       consultas de proyectos y versiones, siempre por usuario
  middleware/
    auth.js              requireAuth, firmarToken y COLUMNAS_PUBLICAS
    limites.js           limiteLogin (IP), limiteIA (20/15 min) y limiteProyectos (120/15 min)
  routes/
    auth.js              /registro, /login y /yo
    paginas.js           /generar y /editar en stream NDJSON, o JSON con ?stream=0
    proyectos.js         CRUD de proyectos y /:id/versiones, con Zod
test/                    node:test con Gemini, caché, red y base simulados
```

## Middleware, en orden

| # | Middleware | Alcance | Qué hace |
|---|---|---|---|
| 1 | `trust proxy` (1) | Todo | `req.ip` es la IP real detrás del proxy de Render |
| 2 | `cors` | Todo | Solo los orígenes de `FRONTEND_URL`; sin `Origin` se permite |
| 3 | `express.json({ limit: '1mb' })` | Todo | Lee el cuerpo JSON (las versiones traen la página) |
| 4 | `limiteLogin` | `POST /api/auth/login` | 10 intentos cada 15 min por IP |
| 5 | `requireAuth` | `/api/paginas`, `/api/proyectos`, `/api/auth/yo` | Verifica el JWT y carga `req.usuario` desde la base |
| 6 | `limiteIA` / `limiteProyectos` | `/api/paginas` / `/api/proyectos` | 20 / 120 cada 15 min por usuario |
| 7 | 404 de `/api` | Rutas no encontradas | `{ "error": "Ruta no encontrada." }` |
| 8 | Manejador de errores | Todo | JSON mal formado → `400`; cualquier otro → `500` sin detalles |

## Flujo de una generación en stream

```
Navegador ── POST /api/paginas/generar { orden } ──► requireAuth → limiteIA → validar la orden (400 antes del stream)
   │◄── 200 application/x-ndjson, sin búfer ── {"tipo":"inicio"} y un latido cada 3 s
   │
   │        generar(): ia_cache? ── sí ──► {"tipo":"final", desdeCache: true}
   │                       │ no
   │                       ▼
   │        streamGemini (SSE) ── cada trozo ──► {"tipo":"parcial","trozo":…}
   │                       ▼
   │        validarPagina (Zod) ── no ──► {"tipo":"reintento"} y una vez más con los errores ── no ──► {"tipo":"error","estado":502}
   │                       │ sí
   │                       ▼
   │◄──────── ia_cache ──► {"tipo":"final", html, titulo, desdeCache: false}
   │
   └── POST /api/proyectos o /api/proyectos/:id/versiones con la página (guardado automático)
```

Si el cliente cierra la conexión, el bucle deja de leer de Gemini. Con `?stream=0` se recorren los mismos eventos y solo se responde el `final` como JSON (la alternativa del frontend cuando un proxy retiene el stream).

## Flujo de un login

1. `limiteLogin` cuenta el intento por IP; al pasar de 10 en 15 min responde `429`.
2. Se normaliza el correo (recorte y minúsculas) y se busca el usuario.
3. `bcrypt.compare` contra su hash, o contra `HASH_FALSO` si no existe (tiempo parejo).
4. Si coincide, responde `200 { token, usuario }` sin `password_hash`; si no, `401` con el mensaje genérico.

## Arranque

1. `dotenv` carga el `.env`.
2. Sin `JWT_SECRET`, el proceso termina con un mensaje claro.
3. `app.listen` arranca **antes** de la base de datos: si Neon falla, el servidor sigue arriba, `/api/health` responde `db: false` y el error queda en el log.
4. `iniciarDB()` ejecuta `schema.sql`.

## IA

Ver [ia.md](ia.md): prompts, validación, edición por secciones de páginas grandes, caché y límites.

## Pruebas

`npm test` (53 pruebas con `node:test`). Gemini, la caché, la red y la base se reemplazan por dobles: no gastan cuota ni tocan Neon. Las rutas se prueban levantando una app Express en un puerto libre.
