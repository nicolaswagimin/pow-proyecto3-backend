import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ErrorIA } from '../src/ia.js';
import { rutasPaginas } from '../src/routes/paginas.js';

// App mínima con un usuario fijo y generar/editar simulados.
async function levantar(deps) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    req.usuario = { id: 1 };
    next();
  });
  app.use('/api/paginas', rutasPaginas({ latidoMs: 20, ...deps }));
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, () => ok(s));
  });
  const base = `http://localhost:${servidor.address().port}/api/paginas`;
  return { base, cerrar: () => servidor.close() };
}

const lineas = (texto) => texto.trim().split('\n').map((l) => JSON.parse(l));

async function* eventos(...lista) {
  for (const e of lista) {
    if (e instanceof Error) throw e;
    if (typeof e === 'number') await new Promise((r) => setTimeout(r, e));
    else yield e;
  }
}

const FINAL = { tipo: 'final', html: '<!DOCTYPE html><html></html>', titulo: 'x', desdeCache: false, modo: 'completo' };

test('generar responde NDJSON sin búfer: inicio, parciales, latidos y final', async (t) => {
  let recibido;
  const s = await levantar({
    generar: (entrada) => {
      recibido = entrada;
      return eventos({ tipo: 'parcial', trozo: '<!DOC' }, 60, { tipo: 'parcial', trozo: 'TYPE' }, FINAL);
    },
  });
  t.after(s.cerrar);
  const r = await fetch(`${s.base}/generar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orden: 'una cafetería' }) });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/x-ndjson/);
  assert.match(r.headers.get('cache-control'), /no-transform/);
  assert.equal(r.headers.get('x-accel-buffering'), 'no');
  const lista = lineas(await r.text());
  assert.equal(lista[0].tipo, 'inicio');
  assert.ok(lista.some((e) => e.tipo === 'latido'), 'manda latidos mientras espera');
  assert.deepEqual(lista.filter((e) => e.tipo === 'parcial').map((e) => e.trozo), ['<!DOC', 'TYPE']);
  assert.deepEqual(lista.at(-1), FINAL);
  assert.deepEqual(recibido, { orden: 'una cafetería' });
});

test('con ?stream=0 responde un JSON con la página final (la alternativa sin streaming)', async (t) => {
  const s = await levantar({ generar: () => eventos({ tipo: 'parcial', trozo: 'x' }, FINAL) });
  t.after(s.cerrar);
  const r = await fetch(`${s.base}/generar?stream=0`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orden: 'x' }) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { html: FINAL.html, titulo: 'x', desdeCache: false, modo: 'completo' });
});

test('una orden inválida responde 400 antes de empezar el stream', async (t) => {
  const s = await levantar({ generar: () => eventos(FINAL) });
  t.after(s.cerrar);
  const r = await fetch(`${s.base}/generar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orden: '' }) });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'Dime qué página quieres.');
});

test('un error de la IA a mitad del stream llega como evento con su código', async (t) => {
  const s = await levantar({ generar: () => eventos({ tipo: 'parcial', trozo: 'x' }, new ErrorIA('Se agotó la cuota', 429)) });
  t.after(s.cerrar);
  const r = await fetch(`${s.base}/generar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orden: 'x' }) });
  assert.deepEqual(lineas(await r.text()).at(-1), { tipo: 'error', estado: 429, error: 'Se agotó la cuota' });
});

test('sin stream, un error de la IA responde con su código HTTP', async (t) => {
  const s = await levantar({ generar: () => eventos(new ErrorIA('Se agotó la cuota', 429)) });
  t.after(s.cerrar);
  const r = await fetch(`${s.base}/generar?stream=0`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orden: 'x' }) });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, 'Se agotó la cuota');
});

test('editar recibe el HTML y la orden', async (t) => {
  let recibido;
  const s = await levantar({ editar: (e) => ((recibido = e), eventos(FINAL)) });
  t.after(s.cerrar);
  const r = await fetch(`${s.base}/editar?stream=0`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html: '<html></html>', orden: 'azul' }) });
  assert.equal(r.status, 200);
  assert.deepEqual(recibido, { html: '<html></html>', orden: 'azul' });
});

test('editar sin HTML responde 400', async (t) => {
  const s = await levantar({ editar: () => eventos(FINAL) });
  t.after(s.cerrar);
  const r = await fetch(`${s.base}/editar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orden: 'azul' }) });
  assert.equal(r.status, 400);
});
