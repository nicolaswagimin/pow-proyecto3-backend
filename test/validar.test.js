import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_HTML, limpiarRespuesta, tituloDe, validarPagina } from '../src/paginas/validar.js';

const pagina = (cuerpo = '<header data-vtw="encabezado"><h1>Café Pasto</h1></header>') =>
  `<!DOCTYPE html>\n<html lang="es">\n<head><meta charset="utf-8"><title>Café Pasto</title><style>body{margin:0}</style></head>\n<body>${cuerpo}${'<p>texto de relleno</p>'.repeat(10)}</body>\n</html>`;

test('acepta una página completa', () => {
  const r = validarPagina(pagina());
  assert.equal(r.ok, true, r.errores?.join('\n'));
  assert.equal(r.html, pagina());
});

test('quita las vallas de código y el texto alrededor', () => {
  assert.equal(limpiarRespuesta('Aquí está:\n```html\n' + pagina() + '\n```\nEspero que sirva'), pagina());
  assert.equal(validarPagina('```html\n' + pagina() + '\n```').ok, true);
});

test('rechaza lo que no es una página HTML completa', () => {
  for (const malo of ['hola', '<div>sin documento</div>', pagina().replace('</html>', ''), pagina().replace(/<body>|<\/body>/g, '')]) {
    const r = validarPagina(malo);
    assert.equal(r.ok, false, malo.slice(0, 40));
    assert.ok(r.errores.length);
  }
});

test('rechaza una página demasiado corta o demasiado larga', () => {
  assert.equal(validarPagina('<!DOCTYPE html><html><body></body></html>').ok, false);
  const larga = pagina(`<p>${'x'.repeat(MAX_HTML)}</p>`);
  const r = validarPagina(larga);
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => /100 000/.test(e)), r.errores.join('\n'));
});

test('rechaza una página con JavaScript', () => {
  const r = validarPagina(pagina('<script>alert(1)</script>'));
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => /JavaScript/.test(e)));
  assert.equal(validarPagina(pagina('<SCRIPT src="x.js"></SCRIPT>')).ok, false);
});

test('rechaza atributos on* y javascript: dentro de etiquetas, pero no en el texto', () => {
  assert.equal(validarPagina(pagina('<img src="x.png" onerror="alert(1)">')).ok, false);
  assert.equal(validarPagina(pagina('<template shadowrootmode="open"><img ONERROR=alert(1)></template>')).ok, false);
  assert.equal(validarPagina(pagina('<a href="javascript:alert(1)">x</a>')).ok, false);
  assert.equal(validarPagina(pagina('<p>Atención online = 24 horas; javascript: no se usa aquí.</p>')).ok, true);
});

test('tituloDe lee el <title> o devuelve null', () => {
  assert.equal(tituloDe(pagina()), 'Café Pasto');
  assert.equal(tituloDe('<html><body></body></html>'), null);
  assert.equal(tituloDe(`<title>${'a'.repeat(200)}</title>`).length, 120);
});
