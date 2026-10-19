import { Router } from 'express';
import { ErrorIA } from '../ia.js';
import {
  editar as editarPagina,
  generar as generarPagina,
  validarEntradaEditar,
  validarEntradaGenerar,
} from '../paginas/generar.js';

// POST /api/paginas/generar { orden } y POST /api/paginas/editar { html, orden }.
// Por defecto responden un stream NDJSON (un evento JSON por línea) para que la página se arme en
// vivo; con ?stream=0 responden un JSON con la página final: es la alternativa automática del
// frontend si un proxy almacena el stream en búfer o lo corta (docs/decisiones/0001).
const LATIDO_MS = 3000;

function responderError(res, err) {
  if (err instanceof ErrorIA) return res.status(err.estado).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'No se pudo generar la página.' });
}

async function enStream(req, res, eventos, latidoMs) {
  res.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    // Contra el búfer de proxies (Render, nginx) y de compresión: cada línea sale apenas se escribe.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  const enviar = (evento) => res.write(`${JSON.stringify(evento)}\n`);
  enviar({ tipo: 'inicio' });
  // Un latido mientras Gemini piensa: mantiene viva la conexión y deja ver que el stream llega.
  const latido = setInterval(() => enviar({ tipo: 'latido' }), latidoMs);
  let cerrado = false;
  res.on('close', () => {
    cerrado = true;
  });
  try {
    for await (const evento of eventos) {
      if (cerrado) break;
      enviar(evento);
    }
  } catch (err) {
    if (!(err instanceof ErrorIA)) console.error(err);
    enviar({
      tipo: 'error',
      estado: err instanceof ErrorIA ? err.estado : 500,
      error: err instanceof ErrorIA ? err.message : 'No se pudo generar la página.',
    });
  } finally {
    clearInterval(latido);
    res.end();
  }
}

async function sinStream(res, eventos) {
  try {
    for await (const evento of eventos) {
      if (evento.tipo === 'final') {
        const { tipo: _t, ...pagina } = evento;
        return res.json(pagina);
      }
    }
    throw new ErrorIA('La IA no devolvió ninguna página.', 502);
  } catch (err) {
    responderError(res, err);
  }
}

export function rutasPaginas({ generar = generarPagina, editar = editarPagina, latidoMs = LATIDO_MS } = {}) {
  const router = Router();
  const manejar = (validarEntrada, accion) => async (req, res) => {
    const entrada = { ...req.body };
    try {
      validarEntrada(entrada);
    } catch (err) {
      return responderError(res, err);
    }
    const eventos = accion(entrada);
    if (req.query.stream === '0') return sinStream(res, eventos);
    return enStream(req, res, eventos, latidoMs);
  };
  router.post('/generar', manejar(validarEntradaGenerar, (b) => generar({ orden: b.orden })));
  router.post('/editar', manejar(validarEntradaEditar, (b) => editar({ html: b.html, orden: b.orden })));
  return router;
}
