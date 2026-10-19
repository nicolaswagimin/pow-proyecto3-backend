# Base de datos · VoiceToWeb

PostgreSQL alojado en Neon (también funciona con Supabase o un PostgreSQL local con `DB_SSL=false`). El esquema está en `schema.sql` y se ejecuta solo al arrancar (`iniciarDB()` en `src/db.js`). Todas las sentencias son idempotentes: se pueden ejecutar muchas veces sin romper nada.

## Diagrama

```
usuarios                    proyectos                       versiones
┌──────────────────────┐    ┌────────────────────────────┐  ┌──────────────────────────────────┐
│ id         SERIAL PK │◄─┐ │ id            SERIAL PK    │◄─┤ proyecto_id INTEGER FK (CASCADE) │
│ nombre               │  └─┤ usuario_id    INTEGER FK   │  │ id          SERIAL PK            │◄─┐
│ email      UNIQUE    │    │ nombre        VARCHAR(120) │  │ base_id     INTEGER FK (SET NULL)├──┘
│ password_hash        │    │ creado_en     TIMESTAMPTZ  │  │ orden       TEXT                 │
│ …                    │    │ actualizado_en TIMESTAMPTZ │  │ tipo        crear | editar       │
└──────────────────────┘    └────────────────────────────┘  │ html        TEXT                 │
                                                            │ creado_en   TIMESTAMPTZ          │
ia_cache                                                    └──────────────────────────────────┘
┌──────────────────────────┐
│ clave     CHAR(64) PK    │   Un usuario tiene muchos proyectos; un proyecto, muchas versiones.
│ respuesta JSONB          │   Las versiones forman un árbol: base_id es la versión de la que salió.
│ creado_en TIMESTAMPTZ    │
└──────────────────────────┘
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

## `proyectos`

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | |
| `usuario_id` | `INTEGER` | `NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE` | Dueño |
| `nombre` | `VARCHAR(120)` | `NOT NULL` | El `<title>` de la primera página, o el comienzo de la orden |
| `creado_en` | `TIMESTAMPTZ` | `DEFAULT NOW()` | |
| `actualizado_en` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Se actualiza con cada versión o al renombrar; ordena la lista |

Índice: `proyectos_usuario_idx` sobre `(usuario_id, actualizado_en DESC)`.

## `versiones`

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | |
| `proyecto_id` | `INTEGER` | `NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE` | |
| `base_id` | `INTEGER` | `NULL REFERENCES versiones(id) ON DELETE SET NULL` | La versión de la que salió; `NULL` en la primera |
| `orden` | `TEXT` | `NOT NULL` | Lo que se dijo o escribió para crearla |
| `tipo` | `VARCHAR(10)` | `CHECK (tipo IN ('crear', 'editar'))` | |
| `html` | `TEXT` | `NOT NULL` | La página completa (hasta 150 000 caracteres, lo valida la API) |
| `creado_en` | `TIMESTAMPTZ` | `DEFAULT NOW()` | |

Índice: `versiones_proyecto_idx` sobre `(proyecto_id, id)`.

**Ninguna versión se borra al deshacer o al editar desde una versión vieja.** Deshacer va a `base_id`; rehacer, a la hija más reciente. Ver `docs/versiones.md` del frontend.

## `ia_cache`

Respuestas de Gemini ya validadas: `{ html, modo }`. La `clave` es el SHA-256 de la versión del prompt, el modo (generar o editar), la orden normalizada (sin mayúsculas, espacios de más ni punto final) y, al editar, el HTML (ver [ia.md](ia.md#caché-y-límites)). Se escribe con `ON CONFLICT DO NOTHING`.

## `items` (ya no se usa)

Era el CRUD de ejemplo. `schema.sql` ya no la crea, pero **no la borra**, para no perder datos de bases existentes (ver [decisiones/0004](decisiones/0004-no-borrar-items.md)). Para eliminarla: `DROP TABLE IF EXISTS items;`.

## Relaciones

- `usuarios 1 ── N proyectos` por `proyectos.usuario_id`. Borrar un usuario borra sus proyectos.
- `proyectos 1 ── N versiones` por `versiones.proyecto_id`. Borrar un proyecto borra sus versiones.
- `versiones 1 ── N versiones` por `base_id`: el árbol de versiones.
- `ia_cache` no se relaciona con nadie.

## Consultas que hace la API

| Operación | SQL |
|---|---|
| Registro | `INSERT INTO usuarios (nombre, email, password_hash, proveedor) VALUES ($1, $2, $3, 'local') RETURNING …` |
| Login | `SELECT …, password_hash FROM usuarios WHERE email = $1` |
| Validar token | `SELECT … FROM usuarios WHERE id = $1` (en cada petición protegida) |
| Listar proyectos | `SELECT p.…, COUNT(v.id) AS versiones, (última orden) FROM proyectos p LEFT JOIN versiones v … WHERE p.usuario_id = $1 GROUP BY p.id ORDER BY p.actualizado_en DESC` |
| Crear proyecto | Una transacción: `INSERT INTO proyectos …` y `INSERT INTO versiones … (base_id NULL)` |
| Abrir | `SELECT … FROM proyectos WHERE id = $1 AND usuario_id = $2` y `SELECT … FROM versiones WHERE proyecto_id = $1 ORDER BY id` |
| Nueva versión | Se comprueba el dueño y que `base_id` sea del proyecto; `INSERT INTO versiones …` y `UPDATE proyectos SET actualizado_en = NOW()` |
| Renombrar / borrar | `UPDATE … / DELETE FROM proyectos WHERE id = $1 AND usuario_id = $2` |
| Caché de IA | `SELECT respuesta FROM ia_cache WHERE clave = $1` · `INSERT … ON CONFLICT (clave) DO NOTHING` |
| Salud | `SELECT 1` |

Todas son consultas parametrizadas (`$1`, `$2`…), así que no hay inyección SQL.

## Conexión

`src/db.js` crea un `pg.Pool` con `DATABASE_URL`, SSL activado salvo que `DB_SSL=false` y un tiempo máximo de conexión de 5 s. Un error en una conexión inactiva se registra sin tumbar el servidor.
