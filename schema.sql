-- Esquema de la base de datos. Se ejecuta automáticamente al arrancar el backend
-- (iniciarDB en src/db.js), pero también puedes pegarlo en el editor SQL de Neon o Supabase.

CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  titulo      VARCHAR(200) NOT NULL,
  descripcion TEXT DEFAULT '',
  creado_en   TIMESTAMP DEFAULT NOW()
);
