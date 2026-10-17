import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveDe, normalizarOrden } from '../src/ia/cache.js';

test('la clave no depende del orden de las propiedades', () => {
  assert.equal(claveDe({ a: 1, b: [1, { c: 2, d: 3 }] }, 'v1'), claveDe({ b: [1, { d: 3, c: 2 }], a: 1 }, 'v1'));
});

test('la clave cambia con la versión del prompt y con el contenido', () => {
  const base = claveDe({ orden: 'x' }, 'v1');
  assert.notEqual(claveDe({ orden: 'x' }, 'v2'), base);
  assert.notEqual(claveDe({ orden: 'y' }, 'v1'), base);
  assert.match(base, /^[0-9a-f]{64}$/);
});

test('normalizarOrden ignora mayúsculas, espacios de más y el punto final', () => {
  assert.equal(normalizarOrden('  Cambia el TÍTULO   a azul. '), normalizarOrden('cambia el título a azul'));
  assert.notEqual(normalizarOrden('cambia el título a azul'), normalizarOrden('cambia el título a rojo'));
});
