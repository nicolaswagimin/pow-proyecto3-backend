# Proyecto 3 · Backend

API base en **Node.js + Express** con **PostgreSQL** (Neon o Supabase) e **IA de Google Gemini** (API REST, sin SDK).
Materia: Programación orientada a la web.

Frontend asociado: <https://github.com/nicolaswagimin/pow-proyecto3-frontend>

## Requisitos

- Node.js 20 o superior
- Una base de datos PostgreSQL (Neon o Supabase, plan gratuito)
- Una API key de Gemini: <https://aistudio.google.com/apikey>

## Correr en local

```bash
npm install
cp .env.example .env     # y rellena DATABASE_URL, GEMINI_API_KEY y JWT_SECRET
npm run dev              # se reinicia solo al guardar cambios
```

El servidor queda en <http://localhost:3003>. Prueba que responda:

```bash
curl http://localhost:3003/api/health
# {"ok":true,"db":true,"ia":true}
```

Si `db` o `ia` salen en `false`, revisa `DATABASE_URL` / `DB_SSL` o `GEMINI_API_KEY` en el `.env`.
Aunque falle la base de datos, el servidor arranca igual y muestra el error en la consola.

Las tablas `usuarios` e `items` se crean solas al arrancar (a partir de `schema.sql`). También puedes pegar `schema.sql`
en el editor SQL de Neon o Supabase.

## Variables de entorno

| Variable         | Descripción                                                        | Por defecto             |
| ---------------- | ------------------------------------------------------------------ | ----------------------- |
| `PORT`           | Puerto del servidor                                                | `3003`                  |
| `DATABASE_URL`   | Cadena de conexión de PostgreSQL                                   | —                       |
| `DB_SSL`         | `false` para desactivar SSL (PostgreSQL local)                     | SSL activado            |
| `GEMINI_API_KEY` | API key de Gemini (solo vive en el backend)                        | —                       |
| `GEMINI_MODEL`   | Modelo de Gemini                                                   | `gemini-2.5-flash`      |
| `FRONTEND_URL`   | Orígenes permitidos por CORS, separados por comas                  | `http://localhost:4200` |
| `JWT_SECRET`     | Secreto para firmar las sesiones. **Obligatorio**: sin él el servidor no arranca | —      |
| `JWT_EXPIRES_IN` | Duración de la sesión                                              | `7d`                    |

Genera un `JWT_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Endpoints

Todos los errores se devuelven como JSON: `{ "error": "mensaje en español" }`. Los errores de validación
del registro incluyen además `campo` (`nombre`, `email` o `password`).

### Autenticación

| Método | Ruta                 | Cuerpo                                   | Respuesta                                  |
| ------ | -------------------- | ---------------------------------------- | ------------------------------------------ |
| `POST` | `/api/auth/registro` | `{ "nombre", "email", "password" }`      | `201 { token, usuario }` · `400` · `409` si el correo existe |
| `POST` | `/api/auth/login`    | `{ "email", "password" }`                | `200 { token, usuario }` · `401` · `429`   |
| `GET`  | `/api/auth/yo`       | — (requiere token)                       | `{ usuario }`                              |

- La contraseña necesita al menos 8 caracteres (máximo 72, el límite de bcrypt). El correo se guarda en minúsculas.
- Login: 10 intentos cada 15 minutos por IP; después responde `429`.
- `usuario` nunca incluye `password_hash` ni `google_id`.
- La tabla `usuarios` ya tiene `google_id`, `avatar_url` y `proveedor` para agregar el login con Google más adelante.

### Rutas protegidas

Envían el token en la cabecera `Authorization: Bearer <token>`. Sin token válido responden `401`.

| Método   | Ruta             | Cuerpo                                      | Respuesta                               |
| -------- | ---------------- | ------------------------------------------- | --------------------------------------- |
| `GET`    | `/api/health`    | — (pública)                                 | `{ ok, db, ia }`                        |
| `GET`    | `/api/items`     | —                                           | Items **del usuario** (más nuevos primero) |
| `POST`   | `/api/items`     | `{ "titulo": "...", "descripcion": "..." }` | Item creado (`201`)                     |
| `DELETE` | `/api/items/:id` | —                                           | `204` · `404` si no existe o es de otro usuario |
| `POST`   | `/api/ia`        | `{ "pregunta": "..." }`                     | `{ "respuesta": "..." }` · `429` tras 30 preguntas en 15 min |

Ejemplos:

```bash
# Registrarse y guardar el token
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/registro -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","email":"ana@ejemplo.com","password":"secreta123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -X POST http://localhost:3003/api/items -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"titulo":"Mi primer registro"}'
curl -X POST http://localhost:3003/api/ia -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"pregunta":"Hola, ¿quién eres?"}'
```

## Estructura

```
src/
  index.js              arranque, CORS y montaje de rutas
  db.js                 conexión y creación de tablas (schema.sql)
  ia.js                 integración con Gemini
  middleware/auth.js    requireAuth y firma de tokens
  middleware/limites.js límites de intentos (login e IA)
  routes/auth.js        registro, login y /yo
  routes/items.js       CRUD de items filtrado por usuario
  routes/ia.js          preguntas a la IA
```

## Desplegar en Render

1. En <https://render.com> crea un **New → Web Service** y conecta este repositorio.
2. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. En **Environment** agrega las variables: `DATABASE_URL`, `GEMINI_API_KEY`, `JWT_SECRET` (uno nuevo, no el de local),
   `JWT_EXPIRES_IN` (opcional), `GEMINI_MODEL` (opcional)
   y `FRONTEND_URL` con la URL de Vercel, por ejemplo `https://pow-proyecto3.vercel.app`
   (puedes dejar también `http://localhost:4200,http://localhost:4203` separados por coma). No hace falta definir `PORT`: Render lo asigna.
4. Cuando termine, abre `https://TU-SERVICIO.onrender.com/api/health` para comprobarlo y copia esa URL
   en `src/environments/environment.ts` del frontend.

> En el plan gratuito de Render el servicio se "duerme" tras un rato sin uso; la primera petición puede tardar ~50 s.

## Qué cambiar al adaptar el tema

- **`schema.sql`**: renombra la tabla `items` y sus columnas según tu tema.
- **`src/routes/items.js`** y el montaje en **`src/index.js`**: actualiza las rutas `/api/items` y las consultas SQL para la nueva tabla/columnas y validaciones (mantén el filtro por `usuario_id`).
- **`src/ia.js`**: edita la constante `INSTRUCCIONES` para que la IA hable del tema de tu proyecto.
- **`src/db.js`**: el mensaje de `iniciarDB` si cambias el nombre de la tabla (opcional).
- **`package.json`** y este **README**: nombre y descripción del proyecto.
