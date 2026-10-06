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
cp .env.example .env     # y rellena DATABASE_URL y GEMINI_API_KEY
npm run dev              # se reinicia solo al guardar cambios
```

El servidor queda en <http://localhost:3003>. Prueba que responda:

```bash
curl http://localhost:3003/api/health
# {"ok":true,"db":true,"ia":true}
```

Si `db` o `ia` salen en `false`, revisa `DATABASE_URL` / `DB_SSL` o `GEMINI_API_KEY` en el `.env`.
Aunque falle la base de datos, el servidor arranca igual y muestra el error en la consola.

La tabla `items` se crea sola al arrancar (a partir de `schema.sql`). También puedes pegar `schema.sql`
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

## Endpoints

Todos los errores se devuelven como JSON: `{ "error": "mensaje en español" }`.

| Método   | Ruta             | Cuerpo                                  | Respuesta                        |
| -------- | ---------------- | --------------------------------------- | -------------------------------- |
| `GET`    | `/api/health`    | —                                       | `{ ok, db, ia }`                 |
| `GET`    | `/api/items`     | —                                       | Lista de items (más nuevos primero) |
| `POST`   | `/api/items`     | `{ "titulo": "...", "descripcion": "..." }` | Item creado (`201`)          |
| `DELETE` | `/api/items/:id` | —                                       | `204` sin contenido              |
| `POST`   | `/api/ia`        | `{ "pregunta": "..." }`                 | `{ "respuesta": "..." }`         |

Ejemplos:

```bash
curl -X POST http://localhost:3003/api/items -H "Content-Type: application/json" -d '{"titulo":"Mi primer registro"}'
curl -X POST http://localhost:3003/api/ia -H "Content-Type: application/json" -d '{"pregunta":"Hola, ¿quién eres?"}'
```

## Desplegar en Render

1. En <https://render.com> crea un **New → Web Service** y conecta este repositorio.
2. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. En **Environment** agrega las variables: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` (opcional)
   y `FRONTEND_URL` con la URL de Vercel, por ejemplo `https://pow-proyecto3.vercel.app`
   (puedes dejar también `http://localhost:4200` separado por coma). No hace falta definir `PORT`: Render lo asigna.
4. Cuando termine, abre `https://TU-SERVICIO.onrender.com/api/health` para comprobarlo y copia esa URL
   en `src/environments/environment.ts` del frontend.

> En el plan gratuito de Render el servicio se "duerme" tras un rato sin uso; la primera petición puede tardar ~50 s.

## Qué cambiar al adaptar el tema

- **`schema.sql`**: renombra la tabla `items` y sus columnas según tu tema.
- **`src/index.js`**: actualiza las rutas `/api/items` y las consultas SQL para la nueva tabla/columnas y validaciones.
- **`src/ia.js`**: edita la constante `INSTRUCCIONES` para que la IA hable del tema de tu proyecto.
- **`src/db.js`**: el mensaje de `iniciarDB` si cambias el nombre de la tabla (opcional).
- **`package.json`** y este **README**: nombre y descripción del proyecto.
