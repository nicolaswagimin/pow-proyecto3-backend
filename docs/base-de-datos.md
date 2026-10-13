# Base de datos · VoiceToWeb

PostgreSQL alojado en Neon (también funciona con Supabase o un PostgreSQL local con `DB_SSL=false`). El esquema está en `schema.sql` y se ejecuta solo al arrancar (`iniciarDB()` en `src/db.js`). Todas las sentencias son idempotentes: se pueden ejecutar muchas veces sin romper nada.

## Diagrama

```
usuarios                          items
┌───────────────────────────┐     ┌──────────────────────────────┐
│ id            SERIAL  PK  │◄──┐ │ id           SERIAL  PK      │
│ nombre        VARCHAR(100)│   │ │ titulo       VARCHAR(200)    │
│ email         VARCHAR(255)│   └─┤ usuario_id   INTEGER FK      │
│ password_hash TEXT        │     │ descripcion  TEXT            │
│ google_id     VARCHAR(255)│     │ creado_en    TIMESTAMP       │
│ avatar_url    TEXT        │     └──────────────────────────────┘
│ proveedor     VARCHAR(20) │
│ creado_en     TIMESTAMP   │     Un usuario tiene muchos items.
└───────────────────────────┘     Al borrar el usuario se borran sus items.
```

## `usuarios`

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Identificador; es el `sub` del JWT |
| `nombre` | `VARCHAR(100)` | `NOT NULL` | Nombre para mostrar |
| `email` | `VARCHAR(255)` | `UNIQUE NOT NULL` | Siempre en minúsculas (lo normaliza la API) |
| `password_hash` | `TEXT` | `NULL` | Hash bcrypt. Nulo para cuentas que solo usen Google |
| `google_id` | `VARCHAR(255)` | `UNIQUE NULL` | Reservado para el login con Google |
| `avatar_url` | `TEXT` | `NULL` | Reservado para el login con Google |
| `proveedor` | `VARCHAR(20)` | `DEFAULT 'local'` | `local` o, en el futuro, `google` |
| `creado_en` | `TIMESTAMP` | `DEFAULT NOW()` | Fecha de registro |

`password_hash` y `google_id` nunca salen del backend: las consultas usan `COLUMNAS_PUBLICAS` (`id, nombre, email, avatar_url, proveedor, creado_en`).

## `items`

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | |
| `titulo` | `VARCHAR(200)` | `NOT NULL` | |
| `descripcion` | `TEXT` | `DEFAULT ''` | |
| `creado_en` | `TIMESTAMP` | `DEFAULT NOW()` | Orden de la lista (más nuevos primero) |
| `usuario_id` | `INTEGER` | `REFERENCES usuarios(id) ON DELETE CASCADE` | Dueño del item |

Índice: `items_usuario_id_idx` sobre `usuario_id`, porque todas las consultas filtran por él.

`usuario_id` se agrega con `ALTER TABLE … ADD COLUMN IF NOT EXISTS` para que las bases creadas antes de la autenticación se actualicen solas.

## Relaciones

- `usuarios 1 ── N items` por `items.usuario_id`.
- Borrar un usuario borra sus items (`ON DELETE CASCADE`).

## Consultas que hace la API

| Operación | SQL |
|---|---|
| Registro | `INSERT INTO usuarios (nombre, email, password_hash, proveedor) VALUES ($1, $2, $3, 'local') RETURNING …` |
| Login | `SELECT …, password_hash FROM usuarios WHERE email = $1` |
| Validar token | `SELECT … FROM usuarios WHERE id = $1` (en cada petición protegida) |
| Listar items | `SELECT * FROM items WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC` |
| Crear item | `INSERT INTO items (titulo, descripcion, usuario_id) VALUES ($1, $2, $3) RETURNING *` |
| Borrar item | `DELETE FROM items WHERE id = $1 AND usuario_id = $2` |
| Salud | `SELECT 1` |

Todas son consultas parametrizadas (`$1`, `$2`…), así que no hay inyección SQL.

## Conexión

`src/db.js` crea un `pg.Pool` con `DATABASE_URL`, SSL activado salvo que `DB_SSL=false` y un tiempo máximo de conexión de 5 s. Un error en una conexión inactiva se registra sin tumbar el servidor.

## Próximo paso del tema

`items` es el CRUD de ejemplo. Para VoiceToWeb, la tabla natural es `prototipos`: guardar cada versión del prototipo (orden dictada y HTML resultante) para el historial con deshacer. Debe mantener `usuario_id` con el mismo filtro por usuario.
