import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iaDisponible } from '../src/ia.js';

test('la IA está disponible solo con GEMINI_API_KEY', () => {
  const antes = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(iaDisponible(), false);
  process.env.GEMINI_API_KEY = 'x';
  assert.equal(iaDisponible(), true);
  if (antes === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = antes;
});
