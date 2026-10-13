# Arquitectura del backend · VoiceToWeb

Node.js 20+ con Express 5, módulos ES, PostgreSQL con `pg` y Gemini por su API REST (sin SDK).

## Carpetas

```
schema.sql               tablas usuarios e items (idempotente, se ejecuta al arrancar)
.env.example             variables de entorno sin valores
src/
  index.js               arranque: comprueba JWT_SECRET, CORS, JSON, rutas y manejo de errores
  db.js                  pool de PostgreSQL, iniciarDB() y dbDisponible()
  ia.js                  preguntarIA() contra Gemini e INSTRUCCIONES del asistente
  middleware/
    auth.js              requireAuth, firmarToken y COLUMNAS_PUBLICAS
    limites.js           limiteLogin (por IP) y limiteIA (por usuario)
  routes/
    auth.js              /registro, /login y /yo
    items.js             CRUD de items filtrado por usuario
    ia.js                pregunta a la IA
```

## Middleware, en orden

| # | Middleware | Alcance | Qué hace |
|---|---|---|---|
| 1 | `trust proxy` (1) | Todo | `req.ip` es la IP real detrás del proxy de Render |
| 2 | `cors` | Todo | Solo los orígenes de `FRONTEND_URL`; sin `Origin` se permite |
| 3 | `express.json()` | Todo | Lee el cuerpo JSON (hasta 100 kB) |
| 4 | `limiteLogin` | `POST /api/auth/login` | 10 intentos cada 15 min por IP |
| 5 | `requireAuth` | `/api/items`, `/api/ia`, `/api/auth/yo` | Verifica el JWT y carga `req.usuario` desde la base |
| 6 | `limiteIA` | `/api/ia` (después de `requireAuth`) | 30 preguntas cada 15 min por usuario |
| 7 | 404 de `/api` | Rutas no encontradas | `{ "error": "Ruta no encontrada." }` |
| 8 | Manejador de errores | Todo | JSON mal formado → `400`; cualquier otro → `500` sin detalles |

## Flujo de una petición protegida

Ejemplo: `POST /api/items` con `{ "titulo": "…" }`.

```
Navegador ──► CORS ──► express.json ──► requireAuth ──► routes/items.js ──► PostgreSQL
   ▲            │            │              │                 │                 │
   │       origen no      JSON mal      sin token o       título vacío       error
   │       permitido      formado       inválido → 401    → 400              → 500
   │                      → 400
   └──────────── 201 { id, titulo, descripcion, creado_en, usuario_id } ◄──────┘
```

1. CORS compara el `Origin` con la lista de `FRONTEND_URL`.
2. `express.json()` convierte el cuerpo; si no es JSON válido, el manejador de errores responde `400`.
3. `requireAuth` separa `Bearer <token>`, lo verifica con `JWT_SECRET` (solo `HS256`) y busca al usuario por `sub`. Si algo falla responde `401`; si la base falla, `500`.
4. La ruta valida el título, inserta con `usuario_id = req.usuario.id` y responde `201`.

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

`src/ia.js` llama a `generativelanguage.googleapis.com/v1beta/models/<modelo>:generateContent` con `systemInstruction` (la constante `INSTRUCCIONES`) y la pregunta del usuario. Une las partes de texto de la primera respuesta. Cualquier fallo se convierte en un `Error` con mensaje en español que la ruta devuelve como `502`.

Hoy `INSTRUCCIONES` es un asistente general. Para VoiceToWeb, Gemini convertirá cada orden dictada en HTML y CSS, o en un cambio sobre la versión anterior; las instrucciones deberán pedir que devuelva solo HTML y CSS autocontenidos a partir de la orden dictada.
