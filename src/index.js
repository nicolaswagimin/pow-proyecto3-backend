import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool, iniciarDB, dbDisponible } from './db.js';
import { preguntarIA, iaDisponible } from './ia.js';

const PORT = process.env.PORT || 3003;

// Orígenes permitidos para CORS (lista separada por comas).
const origenesPermitidos = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',')
  .map((origen) => origen.trim().replace(/\/$/, ''))
  .filter(Boolean);

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Peticiones sin origen (curl, Postman, health checks de Render) se permiten.
      if (!origin || origenesPermitidos.includes(origin)) return callback(null, true);
      callback(null, false);
    },
  }),
);
app.use(express.json());

// ---------- Estado ----------
app.get('/api/health', async (req, res) => {
  res.json({ ok: true, db: await dbDisponible(), ia: iaDisponible() });
});

// ---------- Items ----------
app.get('/api/items', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM items ORDER BY creado_en DESC, id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudieron obtener los registros. Revisa la base de datos.' });
  }
});

app.post('/api/items', async (req, res) => {
  const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
  const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : '';

  if (!titulo) return res.status(400).json({ error: 'El título es obligatorio.' });
  if (titulo.length > 200) {
    return res.status(400).json({ error: 'El título no puede superar los 200 caracteres.' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO items (titulo, descripcion) VALUES ($1, $2) RETURNING *',
      [titulo, descripcion],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudo crear el registro. Revisa la base de datos.' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'El id no es válido.' });
  }

  try {
    const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'El registro no existe.' });
    res.status(204).end();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudo eliminar el registro. Revisa la base de datos.' });
  }
});

// ---------- IA ----------
app.post('/api/ia', async (req, res) => {
  const pregunta = typeof req.body?.pregunta === 'string' ? req.body.pregunta.trim() : '';
  if (!pregunta) return res.status(400).json({ error: 'Escribe una pregunta.' });

  try {
    const respuesta = await preguntarIA(pregunta);
    res.json({ respuesta });
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: err.message });
  }
});

// ---------- Errores ----------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ---------- Arranque ----------
app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
  console.log(`CORS permitido para: ${origenesPermitidos.join(', ')}`);
  if (!iaDisponible()) console.warn('Aviso: falta GEMINI_API_KEY, la IA no funcionará.');
});

// Si la BD falla, el servidor sigue levantado y solo se muestra el error.
iniciarDB()
  .then(() => console.log('Base de datos lista (tabla items verificada).'))
  .catch((err) => console.error('No se pudo iniciar la base de datos:', err.message));
