import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { COLUMNAS_PUBLICAS, firmarToken, requireAuth } from '../middleware/auth.js';
import { limiteLogin } from '../middleware/limites.js';

const router = Router();

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RONDAS_BCRYPT = 10;
// Hash de relleno: comparar contra él cuando el correo no existe iguala el tiempo de respuesta.
const HASH_FALSO = bcrypt.hashSync('contraseña-de-relleno', RONDAS_BCRYPT);
const ERROR_CREDENCIALES = 'El correo o la contraseña no coinciden.';

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

router.post('/registro', async (req, res) => {
  const nombre = texto(req.body?.nombre);
  const email = texto(req.body?.email).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!nombre) return res.status(400).json({ error: 'Escribe tu nombre.', campo: 'nombre' });
  if (nombre.length > 100) {
    return res.status(400).json({ error: 'El nombre no puede superar los 100 caracteres.', campo: 'nombre' });
  }
  if (!EMAIL_VALIDO.test(email) || email.length > 255) {
    return res
      .status(400)
      .json({ error: 'Escribe un correo válido, como nombre@dominio.com.', campo: 'email' });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: 'La contraseña necesita al menos 8 caracteres.', campo: 'password' });
  }
  // bcrypt solo usa los primeros 72 bytes; más que eso daría una falsa sensación de seguridad.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return res
      .status(400)
      .json({ error: 'La contraseña no puede superar los 72 caracteres.', campo: 'password' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, RONDAS_BCRYPT);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, proveedor)
       VALUES ($1, $2, $3, 'local')
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [nombre, email, passwordHash],
    );
    const usuario = rows[0];
    res.status(201).json({ token: firmarToken(usuario), usuario });
  } catch (err) {
    if (err.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ese correo ya tiene una cuenta. Inicia sesión.', campo: 'email' });
    }
    console.error(err.message);
    res.status(500).json({ error: 'No se pudo crear la cuenta. Revisa la base de datos.' });
  }
});

router.post('/login', limiteLogin, async (req, res) => {
  const email = texto(req.body?.email).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Escribe tu correo y tu contraseña.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT ${COLUMNAS_PUBLICAS}, password_hash FROM usuarios WHERE email = $1`,
      [email],
    );
    const fila = rows[0];
    // Las cuentas creadas solo con Google no tienen contraseña: también reciben el error genérico.
    const coincide = await bcrypt.compare(password, fila?.password_hash || HASH_FALSO);
    if (!fila || !fila.password_hash || !coincide) {
      return res.status(401).json({ error: ERROR_CREDENCIALES });
    }

    const { password_hash: _omitido, ...usuario } = fila;
    res.json({ token: firmarToken(usuario), usuario });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión. Revisa la base de datos.' });
  }
});

router.get('/yo', requireAuth, (req, res) => {
  res.json({ usuario: req.usuario });
});

export default router;
