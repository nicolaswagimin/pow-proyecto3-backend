import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorIA, llamarGemini, streamGemini } from '../src/ia.js';

// fetch simulado: Gemini nunca se llama de verdad.
process.env.GEMINI_API_KEY = 'clave-de-prueba';

const sse = (...textos) =>
  textos.map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\r\n\r\n`).join('');

// Un cuerpo que llega en trozos arbitrarios (cortando incluso dentro de una línea).
function cuerpoEnTrozos(texto, tamano = 7) {
  const bytes = new TextEncoder().encode(texto);
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += tamano) c.enqueue(bytes.slice(i, i + tamano));
      c.close();
    },
  });
}

async function juntar(iterable) {
  const partes = [];
  for await (const p of iterable) partes.push(p);
  return partes;
}

async function errorDe(promesa) {
  try {
    await promesa;
  } catch (err) {
    assert.ok(err instanceof ErrorIA, String(err));
    return err;
  }
  assert.fail('se esperaba un error');
}

test('streamGemini entrega el texto de cada evento SSE aunque llegue partido', async () => {
  let pedido;
  const fetchImpl = async (url, opciones) => {
    pedido = { url, cuerpo: JSON.parse(opciones.body), cabeceras: opciones.headers };
    return new Response(cuerpoEnTrozos(sse('<!DOCTYPE html>', '<html><body>', 'hola</body></html>')));
  };
  const partes = await juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl }));
  assert.deepEqual(partes, ['<!DOCTYPE html>', '<html><body>', 'hola</body></html>']);
  assert.match(pedido.url, /:streamGenerateContent\?alt=sse$/);
  assert.match(pedido.url, /gemini-3\.5-flash-lite|models\//);
  assert.equal(pedido.cabeceras['x-goog-api-key'], 'clave-de-prueba');
  assert.equal(pedido.cuerpo.systemInstruction.parts[0].text, 'S');
});

test('usa gemini-3.5-flash-lite si no hay GEMINI_MODEL', async () => {
  const antes = process.env.GEMINI_MODEL;
  delete process.env.GEMINI_MODEL;
  let url;
  await juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl: async (u) => ((url = u), new Response(sse('x'))) }));
  assert.match(url, /models\/gemini-3\.5-flash-lite:/);
  if (antes !== undefined) process.env.GEMINI_MODEL = antes;
});

test('un 429 de Gemini es ErrorIA 429 con mensaje amable', async () => {
  const fetchImpl = async () => new Response('{}', { status: 429 });
  const err = await errorDe(juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl })));
  assert.equal(err.estado, 429);
  assert.match(err.message, /cuota|saturada/i);
});

test('un 503 (muy solicitada) se reintenta una vez', async () => {
  let llamadas = 0;
  const fetchImpl = async () => (++llamadas === 1 ? new Response('{}', { status: 503 }) : new Response(sse('ok')));
  assert.deepEqual(await juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl, esperaReintentoMs: 0 })), ['ok']);
  assert.equal(llamadas, 2);
});

test('si sigue en 503, ErrorIA 503 con un mensaje claro', async () => {
  const fetchImpl = async () => new Response('{}', { status: 503 });
  const err = await errorDe(juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl, esperaReintentoMs: 0 })));
  assert.equal(err.estado, 503);
  assert.match(err.message, /muy solicitada/);
});

test('otro error de Gemini es 502 con su detalle', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'malo' } }), { status: 400 });
  const err = await errorDe(juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl })));
  assert.equal(err.estado, 502);
  assert.match(err.message, /malo/);
});

test('sin GEMINI_API_KEY, 503', async () => {
  delete process.env.GEMINI_API_KEY;
  const err = await errorDe(juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl: async () => new Response('') })));
  assert.equal(err.estado, 503);
  process.env.GEMINI_API_KEY = 'clave-de-prueba';
});

test('un fallo de red es 502', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNRESET');
  };
  const err = await errorDe(juntar(streamGemini({ sistema: 'S', usuario: 'U', fetchImpl })));
  assert.equal(err.estado, 502);
});

test('llamarGemini sin stream pide JSON si se le indica y devuelve el texto', async () => {
  let cuerpo;
  const fetchImpl = async (url, opciones) => {
    cuerpo = JSON.parse(opciones.body);
    assert.match(url, /:generateContent$/);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }));
  };
  assert.equal(await llamarGemini({ sistema: 'S', usuario: 'U', json: true, fetchImpl }), '{"a":1}');
  assert.equal(cuerpo.generationConfig.responseMimeType, 'application/json');
});
