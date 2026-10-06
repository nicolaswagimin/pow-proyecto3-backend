import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { iniciarDB, dbDisponible } from './db.js';
import { iaDisponible } from './ia.js';
import { requireAuth } from './middleware/auth.js';
import { limiteIA } from './middleware/limites.js';
import authRouter from './routes/auth.js';
import itemsRouter from './routes/items.js';
import iaRouter from './routes/ia.js';

const PORT = process.env.PORT || 3003;

// Sin JWT_SECRET no se pueden firmar ni verificar sesiones: mejor no arrancar.
if (!process.env.JWT_SECRET) {
  console.error('Falta la variable JWT_SECRET en el archivo .env. Copia el ejemplo de .env.example.');
  process.exit(1);
}

// Orígenes permitidos para CORS (lista separada por comas).
const origenesPermitidos = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',')
  .map((origen) => origen.trim().replace(/\/$/, ''))
  .filter(Boolean);

const app = express();

// Render (y la mayoría de hostings) ponen un proxy delante: así req.ip es la IP real
// del cliente y el límite de intentos se aplica por persona, no al proxy.
app.set('trust proxy', 1);

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

// ---------- Autenticación ----------
app.use('/api/auth', authRouter);

// ---------- Rutas protegidas ----------
app.use('/api/items', requireAuth, itemsRouter);
app.use('/api/ia', requireAuth, limiteIA, iaRouter);

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
  .then(() => console.log('Base de datos lista (tablas usuarios e items verificadas).'))
  .catch((err) => console.error('No se pudo iniciar la base de datos:', err.message));
