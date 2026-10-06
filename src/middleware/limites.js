import { rateLimit } from 'express-rate-limit';

// 10 intentos de login cada 15 minutos por IP.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.' },
});

// 30 preguntas a la IA cada 15 minutos por usuario (se aplica después de requireAuth).
export const limiteIA = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `usuario-${req.usuario.id}`,
  message: { error: 'Hiciste muchas preguntas seguidas. Espera unos minutos y vuelve a intentarlo.' },
});
