import { Router } from 'express';
import { preguntarIA } from '../ia.js';

const router = Router();

router.post('/', async (req, res) => {
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

export default router;
