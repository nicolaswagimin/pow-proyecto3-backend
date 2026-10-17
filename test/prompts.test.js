import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTRUCCIONES_EDITAR,
  INSTRUCCIONES_ELEGIR,
  INSTRUCCIONES_GENERAR,
  INSTRUCCIONES_SECCIONES,
  promptEditar,
  promptElegir,
  promptGenerar,
  promptSecciones,
} from '../src/paginas/prompts.js';

test('generar pide un solo HTML con CSS, sin JavaScript, en español y con data-vtw', () => {
  for (const patron of [/un solo archivo/i, /<style>/, /sin javascript|nada de javascript|no uses javascript/i, /español/, /data-vtw/, /<!DOCTYPE html>/]) {
    assert.match(INSTRUCCIONES_GENERAR, patron);
  }
});

test('editar pide cambiar solo lo que dice la orden y conservar los data-vtw', () => {
  assert.match(INSTRUCCIONES_EDITAR, /solo lo que/i);
  assert.match(INSTRUCCIONES_EDITAR, /data-vtw/);
  assert.match(INSTRUCCIONES_EDITAR, /sin javascript|nada de javascript|no uses javascript/i);
});

test('elegir y secciones piden JSON', () => {
  assert.match(INSTRUCCIONES_ELEGIR, /JSON/);
  assert.match(INSTRUCCIONES_SECCIONES, /JSON/);
});

test('los mensajes llevan la orden y el HTML o el índice', () => {
  assert.match(promptGenerar({ orden: 'una cafetería en Pasto' }), /una cafetería en Pasto/);
  const editar = promptEditar({ orden: 'título azul', html: '<html><body><h1>x</h1></body></html>' });
  assert.match(editar, /título azul/);
  assert.match(editar, /<h1>x<\/h1>/);
  const elegir = promptElegir({ orden: 'agrega contacto', indice: [{ id: 'encabezado', etiqueta: 'header', titulo: 'Café', texto: 'Hola' }] });
  assert.match(elegir, /encabezado/);
  assert.match(elegir, /agrega contacto/);
  const secciones = promptSecciones({ orden: 'azul', estilos: 'h1{color:red}', secciones: [{ id: 'encabezado', html: '<header data-vtw="encabezado"></header>' }] });
  assert.match(secciones, /h1\{color:red\}/);
  assert.match(secciones, /data-vtw="encabezado"/);
});
