import { Router } from 'express';
import { pool } from '../db.js';

// Todas las rutas se montan detrás de requireAuth: req.usuario siempre existe
// y cada consulta se filtra por usuario_id para que nadie vea registros ajenos.
const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM items WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC',
      [req.usuario.id],
    );
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudieron obtener los registros. Revisa la base de datos.' });
  }
});

router.post('/', async (req, res) => {
  const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
  const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : '';

  if (!titulo) return res.status(400).json({ error: 'El título es obligatorio.' });
  if (titulo.length > 200) {
    return res.status(400).json({ error: 'El título no puede superar los 200 caracteres.' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO items (titulo, descripcion, usuario_id) VALUES ($1, $2, $3) RETURNING *',
      [titulo, descripcion, req.usuario.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudo crear el registro. Revisa la base de datos.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'El id no es válido.' });
  }

  try {
    // Un item de otro usuario responde 404, igual que uno inexistente.
    const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1 AND usuario_id = $2', [
      id,
      req.usuario.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'El registro no existe.' });
    res.status(204).end();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'No se pudo eliminar el registro. Revisa la base de datos.' });
  }
});

export default router;
