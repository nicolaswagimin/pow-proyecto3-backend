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

## Items (CRUD de ejemplo)

Todas protegidas. Cada consulta se filtra por el usuario del token: nadie ve ni borra registros ajenos.

### `GET /api/items`

Response `200`: los items del usuario, del más nuevo al más viejo.

```json
[
  { "id": 12, "titulo": "Mi primer registro", "descripcion": "", "creado_en": "…", "usuario_id": 7 }
]
```

Error: `500` "No se pudieron obtener los registros. Revisa la base de datos."

### `POST /api/items`

Request:

```json
{ "titulo": "Mi primer registro", "descripcion": "Opcional" }
```

Response `201`: el item creado (mismas columnas que en la lista).

| Código | Mensaje |
|---|---|
| `400` | "El título es obligatorio." / "El título no puede superar los 200 caracteres." |
| `500` | "No se pudo crear el registro. Revisa la base de datos." |

### `DELETE /api/items/:id`

Response `204` sin cuerpo.

| Código | Mensaje |
|---|---|
| `400` | "El id no es válido." (no es un entero positivo) |
| `404` | "El registro no existe." (también si es de otro usuario) |
| `500` | "No se pudo eliminar el registro. Revisa la base de datos." |

## IA

### `POST /api/ia`

Protegida, con límite de 30 preguntas cada 15 minutos por usuario.

Request:

```json
{ "pregunta": "Hola, ¿quién eres?" }
```

Response `200`:

```json
{ "respuesta": "Soy un asistente…" }
```

| Código | Mensaje |
|---|---|
| `400` | "Escribe una pregunta." |
| `429` | "Hiciste muchas preguntas seguidas. Espera unos minutos y vuelve a intentarlo." |
| `502` | El error de Gemini: "La IA no está configurada: falta GEMINI_API_KEY…", "Error al consultar Gemini: …" o "La IA no devolvió ninguna respuesta…" |

## Probar con curl

```bash
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/registro -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","email":"ana@ejemplo.com","password":"secreta123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl http://localhost:3003/api/auth/yo -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3003/api/items -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"titulo":"Mi primer registro"}'
curl -X POST http://localhost:3003/api/ia -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"pregunta":"Hola"}'
```
