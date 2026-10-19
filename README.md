# VoiceToWeb · Backend

API de **VoiceToWeb**, una herramienta de prototipado web por voz: la persona describe en voz alta la página que quiere, la IA genera el HTML y CSS y la muestra en vivo, y nuevas órdenes de voz la modifican.

Proyecto 3 de la materia Programación orientada a la web. Node.js + Express 5, PostgreSQL (Neon) y Google Gemini por su API REST.

Frontend: <https://github.com/nicolaswagimin/pow-proyecto3-frontend>

## Qué hace

- **Genera páginas** a partir de una orden hablada o escrita. Gemini devuelve un solo HTML con su CSS, que llega en **stream** para que el navegador lo arme en vivo, o como JSON si un proxy retiene el stream.
- **Las edita** con nuevas órdenes: la página entera si es chica, o solo las secciones afectadas si es grande.
- **Valida** cada página con Zod (sin JavaScript, tamaño máximo) y reintenta una vez.
- **No repite llamadas:** la misma orden sobre el mismo HTML sale de la caché.
- **Guarda proyectos** por usuario con todas sus versiones, en árbol.

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
| `POST` | `/api/paginas/generar` | Token, 20 / 15 min | Genera una página (stream NDJSON; `?stream=0` para JSON) |
| `POST` | `/api/paginas/editar` | Token, comparte el límite | Edita una página con una orden |
| `GET`, `POST` | `/api/proyectos` | Token | Lista o crea proyectos |
| `GET`, `PATCH`, `DELETE` | `/api/proyectos/:id` | Token | Abre (con todas sus versiones), renombra o borra |
| `POST` | `/api/proyectos/:id/versiones` | Token | Agrega una versión |

El detalle de cada request, response, evento y error está en [docs/api.md](docs/api.md).

## Pruebas

```bash
npm test                 # 53 pruebas con node:test
```

Gemini, la caché, la red y la base se reemplazan por dobles: las pruebas no gastan cuota ni tocan Neon.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/api.md](docs/api.md) | Cada endpoint con request, response y errores |
| [docs/base-de-datos.md](docs/base-de-datos.md) | Tablas, columnas, relaciones y consultas |
| [docs/ia.md](docs/ia.md) | Prompts de generación y edición, validación, secciones, caché y límites |
| [docs/seguridad.md](docs/seguridad.md) | bcrypt, JWT, CORS, límites, páginas generadas y variables de entorno |
| [docs/decisiones/](docs/decisiones) | ADRs: stream con alternativa, edición por secciones, caché, items |
| [docs/despliegue.md](docs/despliegue.md) | Neon, Render, variables, cómo comprobar el stream y comprobaciones |
| [docs/arquitectura-backend.md](docs/arquitectura-backend.md) | Carpetas, middleware y flujo de una petición |
| [CHANGELOG.md](CHANGELOG.md) | Cambios |

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3003` |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL | — |
| `DB_SSL` | `false` para un PostgreSQL local sin SSL | SSL activado |
| `GEMINI_API_KEY` | API key de Gemini (solo vive en el backend) | — |
| `GEMINI_MODEL` | Modelo de Gemini | `gemini-3.5-flash-lite` |
| `FRONTEND_URL` | Orígenes permitidos por CORS, separados por comas | `http://localhost:4200` |
| `JWT_SECRET` | Secreto de las sesiones. **Obligatorio** | — |
| `JWT_EXPIRES_IN` | Duración de la sesión | `7d` |

## Pendientes conocidos

Los de [docs/seguridad.md](docs/seguridad.md): límite en el registro, cabeceras de seguridad y revocación de tokens.
