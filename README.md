# VoiceToWeb · Backend

API de **VoiceToWeb**, una herramienta de prototipado web por voz: la persona describe en voz alta la página que quiere, la IA genera el HTML y CSS y la muestra en vivo, y nuevas órdenes de voz la modifican.

Proyecto 3 de la materia Programación orientada a la web. Node.js + Express 5, PostgreSQL (Neon) y Google Gemini por su API REST.

Frontend: <https://github.com/nicolaswagimin/pow-proyecto3-frontend>

## Estado actual

Funcionan el registro y el login con JWT, un CRUD de ejemplo (`items`) filtrado por usuario y una ruta de preguntas a Gemini. La función propia de VoiceToWeb todavía no está en la API: Gemini convertirá cada orden dictada en HTML y CSS, o en un cambio sobre la versión anterior. Ese es el siguiente paso (ver "Próximos pasos").

## Requisitos

- Node.js 20 o superior
- Una base de datos PostgreSQL (Neon, plan gratuito)
- Una API key de Gemini: <https://aistudio.google.com/apikey>

## Correr en local

```bash
npm install
cp .env.example .env     # rellena DATABASE_URL, GEMINI_API_KEY y JWT_SECRET
npm run dev              # http://localhost:3003, se reinicia al guardar
curl http://localhost:3003/api/health
# {"ok":true,"db":true,"ia":true}
```

Si `db` o `ia` salen en `false`, revisa `DATABASE_URL` / `DB_SSL` o `GEMINI_API_KEY`. Aunque falle la base de datos, el servidor arranca igual y muestra el error en la consola. Las tablas se crean solas a partir de `schema.sql`.

## Endpoints

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| `GET` | `/api/health` | Pública | Estado del servidor, la base y la IA |
| `POST` | `/api/auth/registro` | Pública | Crea la cuenta y devuelve `{ token, usuario }` |
| `POST` | `/api/auth/login` | Pública, 10 intentos / 15 min por IP | Devuelve `{ token, usuario }` |
| `GET` | `/api/auth/yo` | Token | Datos del usuario |
| `GET` | `/api/items` | Token | Items del usuario |
| `POST` | `/api/items` | Token | Crea un item |
| `DELETE` | `/api/items/:id` | Token | Borra un item propio |
| `POST` | `/api/ia` | Token, 30 / 15 min por usuario | Pregunta a Gemini |

El detalle de cada request, response y error está en [docs/api.md](docs/api.md).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/api.md](docs/api.md) | Cada endpoint con request, response y errores |
| [docs/base-de-datos.md](docs/base-de-datos.md) | Tablas, columnas, relaciones y consultas |
| [docs/seguridad.md](docs/seguridad.md) | bcrypt, JWT, CORS, límites de intentos y variables de entorno |
| [docs/despliegue.md](docs/despliegue.md) | Neon, Render, variables y comprobaciones |
| [docs/arquitectura-backend.md](docs/arquitectura-backend.md) | Carpetas, middleware y flujo de una petición |
| [CHANGELOG.md](CHANGELOG.md) | Cambios |

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3003` |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL | — |
| `DB_SSL` | `false` para un PostgreSQL local sin SSL | SSL activado |
| `GEMINI_API_KEY` | API key de Gemini (solo vive en el backend) | — |
| `GEMINI_MODEL` | Modelo de Gemini | `gemini-2.5-flash` |
| `FRONTEND_URL` | Orígenes permitidos por CORS, separados por comas | `http://localhost:4200` |
| `JWT_SECRET` | Secreto de las sesiones. **Obligatorio** | — |
| `JWT_EXPIRES_IN` | Duración de la sesión | `7d` |

## Próximos pasos

- Reemplazar `items` por `prototipos`, para guardar cada versión del prototipo (orden dictada y HTML resultante) para el historial con deshacer.
- Cambiar `INSTRUCCIONES` en `src/ia.js` para que devuelva solo HTML y CSS autocontenidos a partir de la orden dictada.
- Cubrir los pendientes de [docs/seguridad.md](docs/seguridad.md): límite en el registro, cabeceras de seguridad y revocación de tokens.
