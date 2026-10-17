-- Esquema de la base de datos. Se ejecuta automáticamente al arrancar el backend
-- (iniciarDB en src/db.js), pero también puedes pegarlo en el editor SQL de Neon o Supabase.
-- Todas las sentencias son idempotentes: se pueden ejecutar varias veces sin romper nada.

-- Usuarios. google_id, avatar_url y proveedor quedan listos para el login con Google futuro.
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NULL,
  google_id     VARCHAR(255) UNIQUE NULL,
  avatar_url    TEXT NULL,
  proveedor     VARCHAR(20) DEFAULT 'local',
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- La tabla items era el CRUD de ejemplo: ya no se crea, pero tampoco se borra para no perder
-- datos de bases existentes (docs/decisiones/0004). Para eliminarla: DROP TABLE IF EXISTS items;

-- Proyectos: cada página que la persona arma por voz, con su nombre.
CREATE TABLE IF NOT EXISTS proyectos (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre         VARCHAR(120) NOT NULL,
  creado_en      TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS proyectos_usuario_idx ON proyectos (usuario_id, actualizado_en DESC);

-- Versiones: cada orden crea una. base_id es la versión de la que salió (NULL en la primera):
-- forman un árbol, así deshacer y rehacer navegan sin borrar nada (docs/versiones.md del frontend).
CREATE TABLE IF NOT EXISTS versiones (
  id          SERIAL PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  base_id     INTEGER NULL REFERENCES versiones(id) ON DELETE SET NULL,
  orden       TEXT NOT NULL,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('crear', 'editar')),
  html        TEXT NOT NULL,
  creado_en   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS versiones_proyecto_idx ON versiones (proyecto_id, id);

-- Caché de la IA: la misma orden sobre el mismo HTML no vuelve a llamar a Gemini.
CREATE TABLE IF NOT EXISTS ia_cache (
  clave     CHAR(64) PRIMARY KEY,
  respuesta JSONB NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);
