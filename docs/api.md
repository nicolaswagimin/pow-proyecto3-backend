# API · VoiceToWeb

URL base: `http://localhost:3003/api` en local y `https://pow-proyecto3-backend.onrender.com/api` en producción.

- Todas las peticiones y respuestas son JSON.
- Todos los errores tienen la forma `{ "error": "mensaje en español" }`. Los errores de validación del registro agregan `campo` (`nombre`, `email` o `password`) para que el frontend muestre el mensaje junto al campo.
- Las rutas protegidas exigen la cabecera `Authorization: Bearer <token>`.

## Errores comunes a todas las rutas

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | El cuerpo no es un JSON válido | `{ "error": "El cuerpo de la petición no es un JSON válido." }` |
| `401` | Ruta protegida sin token o con el esquema equivocado | `{ "error": "Inicia sesión para continuar." }` |
| `401` | Token inválido, expirado o de un usuario que ya no existe | `{ "error": "Tu sesión expiró o no es válida. Inicia sesión de nuevo." }` |
| `404` | Ruta inexistente bajo `/api` | `{ "error": "Ruta no encontrada." }` |
| `500` | Error no previsto | `{ "error": "Error interno del servidor." }` |

## Estado

### `GET /api/health`

Pública. Dice si el servidor, la base de datos y la IA están disponibles. El frontend la usa para dibujar el estado del sistema.

```json
{ "ok": true, "db": true, "ia": true }
```

- `db` es `false` si `SELECT 1` falla o falta `DATABASE_URL`.
- `ia` es `false` si falta `GEMINI_API_KEY` (no consulta a Gemini).
- Siempre responde `200` mientras el servidor esté arriba.

## Autenticación

### `POST /api/auth/registro`

Pública. Crea la cuenta e inicia la sesión.

Request:

```json
{ "nombre": "Ana Pérez", "email": "ana@ejemplo.com", "password": "secreta123" }
```

Response `201`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs…",
  "usuario": {
    "id": 7,
    "nombre": "Ana Pérez",
    "email": "ana@ejemplo.com",
    "avatar_url": null,
    "proveedor": "local",
    "creado_en": "2026-10-12T22:41:03.512Z"
  }
}
```

Errores:

| Código | `campo` | Mensaje |
|---|---|---|
| `400` | `nombre` | "Escribe tu nombre." / "El nombre no puede superar los 100 caracteres." |
| `400` | `email` | "Escribe un correo válido, como nombre@dominio.com." (también si supera 255 caracteres) |
| `400` | `password` | "La contraseña necesita al menos 8 caracteres." / "La contraseña no puede superar los 72 caracteres." (72 bytes en UTF-8) |
| `409` | `email` | "Ese correo ya tiene una cuenta. Inicia sesión." |
| `500` | — | "No se pudo crear la cuenta. Revisa la base de datos." |

El nombre y el correo se recortan; el correo se guarda en minúsculas.

### `POST /api/auth/login`

Pública, con límite de 10 intentos cada 15 minutos por IP.

Request:

```json
{ "email": "ana@ejemplo.com", "password": "secreta123" }
```

Response `200`: igual que el registro, `{ token, usuario }`.

Errores:

| Código | Mensaje |
|---|---|
| `400` | "Escribe tu correo y tu contraseña." |
| `401` | "El correo o la contraseña no coinciden." (mismo mensaje si el correo no existe, para no revelar qué cuentas hay) |
| `429` | "Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo." |
| `500` | "No se pudo iniciar sesión. Revisa la base de datos." |

### `GET /api/auth/yo`

Protegida. Devuelve los datos actuales del usuario del token.

Response `200`:

```json
{ "usuario": { "id": 7, "nombre": "Ana Pérez", "email": "ana@ejemplo.com", "avatar_url": null, "proveedor": "local", "creado_en": "…" } }
```

Errores: los `401` comunes y `500` "No se pudo verificar la sesión. Revisa la base de datos."

## Páginas (IA)

Las dos rutas están protegidas y tienen un límite de **20 cada 15 minutos por usuario**. Por defecto responden un **stream NDJSON**: un objeto JSON por línea, en cuanto ocurre, para que la página se arme en vivo. Con `?stream=0` responden un JSON con la página final; es la alternativa automática del frontend (ver [decisiones/0001](decisiones/0001-respuesta-en-stream-con-alternativa.md)).

### `POST /api/paginas/generar`

Request: `{ "orden": "Una landing para una cafetería en Pasto con menú y contacto" }` (de 1 a 2000 caracteres).

### `POST /api/paginas/editar`

Request: `{ "html": "<!DOCTYPE html>…", "orden": "Cambia el título a azul" }` (`html` de hasta 150 000 caracteres). Hasta 40 000 caracteres se edita la página entera; más grande, por secciones (ver [ia.md](ia.md#edición-de-páginas-grandes)).

### Eventos del stream

Cabeceras: `Content-Type: application/x-ndjson`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.

```
{"tipo":"inicio"}                                   apenas se abre el stream
{"tipo":"latido"}                                   cada 3 s mientras tanto
{"tipo":"fase","texto":"Buscando qué partes…"}      edición por secciones
{"tipo":"parcial","trozo":"<header data-vtw=…"}     un trozo del HTML, apenas llega de Gemini
{"tipo":"reintento","motivo":"La respuesta debe terminar con </html>."}
{"tipo":"final","html":"<!DOCTYPE html>…","titulo":"Café Pasto","desdeCache":false,"modo":"completo"}
{"tipo":"error","estado":429,"error":"Se agotó la cuota de la IA por ahora…"}
```

`modo` es `completo` o `secciones`. Si la orden ya se pidió sobre el mismo HTML, llega directamente `final` con `desdeCache: true`.

### Respuesta con `?stream=0`

`200` `{ "html", "titulo", "desdeCache", "modo" }`, o el error con su código HTTP.

### Errores

| Código | Cuándo | Mensaje |
|---|---|---|
| `400` | Antes de empezar (siempre como HTTP) | "Dime qué página quieres." · "La orden es demasiado larga (máximo 2000 caracteres)." · "Falta la página que hay que editar." · "La página es demasiado grande para editarla (máximo 150 000 caracteres)." · "La página es demasiado grande para editarla entera y no tiene bloques marcados." |
| `429` | Límite propio | "Pediste muchas páginas seguidas. Espera unos minutos y vuelve a intentarlo." |
| `429` | Cuota de Gemini | "Se agotó la cuota de la IA por ahora. Espera un minuto y vuelve a intentarlo." |
| `502` | Respuesta inválida dos veces, red o tiempo | "La IA devolvió una página inválida dos veces…" · "La IA devolvió una edición inválida dos veces…" · "La IA tardó demasiado en responder…" · "La conexión con la IA se cortó…" |
| `503` | Gemini muy solicitado tras un reintento, o sin clave | "La IA está muy solicitada en este momento…" · "La IA no está configurada en el servidor." |

En el stream, los errores de la IA llegan como evento `error` con su `estado`, porque las cabeceras `200` ya se mandaron.

## Proyectos y versiones

Todas protegidas, con un límite de 120 cada 15 minutos por usuario, y filtradas por el usuario del token: un proyecto ajeno responde `404`, igual que uno inexistente. Un id que no es un entero positivo responde `400`.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/api/proyectos` | — | `200` `[{ id, nombre, creado_en, actualizado_en, versiones, ultima_orden }]`, del más reciente al más antiguo |
| `POST` | `/api/proyectos` | `{ nombre, version: { orden, tipo, html } }` | `201` el proyecto con `versiones: [la primera]` |
| `GET` | `/api/proyectos/:id` | — | `200` el proyecto con **todas** sus versiones `[{ id, proyecto_id, base_id, orden, tipo, html, creado_en }]` |
| `PATCH` | `/api/proyectos/:id` | `{ nombre }` | `200` el proyecto |
| `DELETE` | `/api/proyectos/:id` | — | `204` (borra también sus versiones) |
| `POST` | `/api/proyectos/:id/versiones` | `{ base_id, orden, tipo, html }` | `201` la versión · `400` "La versión base no es de este proyecto." |

Validación (Zod):
- `nombre`: de 1 a 120 caracteres;
- `orden`: de 1 a 2000;
- `tipo`: `crear` o `editar`;
- `html`: hasta 150 000 caracteres;
- `base_id`: un entero, o `null` en la primera versión.

El primer error vuelve como `400` con su mensaje.

Las rutas `/api/items` y `/api/ia` se eliminaron: responden `404`.

## Probar con curl

```bash
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"ana@ejemplo.com","password":"secreta123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# Stream en vivo (-N para no almacenar en búfer)
curl -N -X POST http://localhost:3003/api/paginas/generar -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"orden":"una landing para una cafetería en Pasto"}'

# La misma, sin stream
curl -X POST "http://localhost:3003/api/paginas/generar?stream=0" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"orden":"una landing para una cafetería en Pasto"}'

curl http://localhost:3003/api/proyectos -H "Authorization: Bearer $TOKEN"
```
