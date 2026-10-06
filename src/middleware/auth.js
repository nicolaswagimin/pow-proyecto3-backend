import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

// Columnas que se pueden mostrar al cliente. password_hash y google_id nunca salen del backend.
export const COLUMNAS_PUBLICAS = 'id, nombre, email, avatar_url, proveedor, creado_en';

export function firmarToken(usuario) {
  return jwt.sign({ sub: String(usuario.id) }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Exige "Authorization: Bearer <token>" válido y deja el usuario en req.usuario.
export async function requireAuth(req, res, next) {
  const [esquema, token] = (req.headers.authorization || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Tu sesión expiró o no es válida. Inicia sesión de nuevo.' });
  }

  try {
    // Se consulta la BD para que un usuario borrado no pueda seguir usando su token.
    const { rows } = await pool.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1`, [
      Number(payload.sub),
    ]);
    if (!rows[0]) {
      return res.status(401).json({ error: 'Tu sesión expiró o no es válida. Inicia sesión de nuevo.' });
    }
    req.usuario = rows[0];
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudo verificar la sesión. Revisa la base de datos.' });
  }
}
