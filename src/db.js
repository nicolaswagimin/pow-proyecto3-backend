import fs from 'node:fs/promises';
import pg from 'pg';

// SSL activado por defecto (Neon y Supabase lo exigen). Pon DB_SSL=false para un PostgreSQL local.
const usarSSL = process.env.DB_SSL !== 'false';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: usarSSL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
});

// Evita que un error de una conexión inactiva tumbe el servidor.
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

// Crea las tablas definidas en schema.sql (usuarios e items) si todavía no existen,
// y agrega a items la columna usuario_id en bases creadas antes de la autenticación.
export async function iniciarDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta la variable DATABASE_URL en el archivo .env');
  }
  const schema = await fs.readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}

// Devuelve true si la base de datos responde.
export async function dbDisponible() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
