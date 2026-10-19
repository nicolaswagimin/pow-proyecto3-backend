import { rateLimit } from 'express-rate-limit';

// 10 intentos de login cada 15 minutos por IP.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.' },
});

// 20 generaciones o ediciones con la IA cada 15 minutos por usuario (después de requireAuth).
export const limiteIA = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `usuario-${req.usuario.id}`,
  message: { error: 'Pediste muchas páginas seguidas. Espera unos minutos y vuelve a intentarlo.' },
});

// 120 operaciones con proyectos cada 15 minutos por usuario (guardar versiones, abrir, renombrar).
export const limiteProyectos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `usuario-${req.usuario.id}`,
  message: { error: 'Hiciste muchos cambios seguidos. Espera unos minutos y vuelve a intentarlo.' },
});
