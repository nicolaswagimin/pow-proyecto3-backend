import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarSecciones, bloquesDe, estilosDe, indiceDe, validarEleccion, validarSecciones } from '../src/paginas/secciones.js';

const HTML = `<!DOCTYPE html>
<html lang="es">
<head><title>Café</title><style>h1 { color: brown; }</style></head>
<body>
  <header data-vtw="encabezado"><h1>Café Pasto</h1><p>El mejor café del sur.</p></header>
  <section data-vtw="menu"><h2>Menú</h2><p>Tinto, capuchino y aromáticas.</p></section>
  <div class="sin-marca">suelto</div>
  <footer data-vtw="pie"><p>Pasto, Nariño</p></footer>
</body>
</html>`;

test('bloquesDe encuentra los bloques de primer nivel con data-vtw y su texto exacto', () => {
  const bloques = bloquesDe(HTML);
  assert.deepEqual(bloques.map((b) => b.id), ['encabezado', 'menu', 'pie']);
  assert.equal(bloques[1].html, '<section data-vtw="menu"><h2>Menú</h2><p>Tinto, capuchino y aromáticas.</p></section>');
  assert.equal(HTML.slice(bloques[1].inicio, bloques[1].fin), bloques[1].html);
});

test('indiceDe resume cada bloque: etiqueta, primer título y un poco de texto', () => {
  assert.deepEqual(indiceDe(HTML)[0], {
    id: 'encabezado',
    etiqueta: 'header',
    titulo: 'Café Pasto',
    texto: 'Café Pasto El mejor café del sur.',
  });
});

test('estilosDe devuelve el contenido del <style> y su rango', () => {
  const e = estilosDe(HTML);
  assert.equal(e.css, 'h1 { color: brown; }');
  assert.equal(HTML.slice(e.inicio, e.fin), 'h1 { color: brown; }');
});

test('aplicarSecciones reemplaza, agrega y cambia estilos sin tocar el resto', () => {
  const nuevo = aplicarSecciones(HTML, {
    secciones: [{ id: 'encabezado', html: '<header data-vtw="encabezado"><h1>Café Pasto Real</h1></header>' }],
    nuevas: [{ despuesDe: 'menu', html: '<section data-vtw="contacto"><h2>Contacto</h2></section>' }],
    estilos: 'h1 { color: navy; }',
  });
  assert.match(nuevo, /<h1>Café Pasto Real<\/h1>/);
  assert.match(nuevo, /<\/section><section data-vtw="contacto"><h2>Contacto<\/h2><\/section>/);
  assert.match(nuevo, /h1 \{ color: navy; \}/);
  assert.match(nuevo, /<div class="sin-marca">suelto<\/div>/);
  assert.deepEqual(bloquesDe(nuevo).map((b) => b.id), ['encabezado', 'menu', 'contacto', 'pie']);
});

test('aplicarSecciones rechaza ids que no existen', () => {
  assert.throws(() => aplicarSecciones(HTML, { secciones: [{ id: 'nada', html: '<p>x</p>' }] }), /nada/);
  assert.throws(() => aplicarSecciones(HTML, { nuevas: [{ despuesDe: 'nada', html: '<p>x</p>' }] }), /nada/);
});

test('validarEleccion exige ids existentes', () => {
  const ids = ['encabezado', 'menu', 'pie'];
  assert.equal(validarEleccion({ secciones: ['menu'], nuevas: false, estilos: false }, ids).ok, true);
  const malo = validarEleccion({ secciones: ['otro'], nuevas: false, estilos: false }, ids);
  assert.equal(malo.ok, false);
  assert.match(malo.errores.join(' '), /otro/);
  assert.equal(validarEleccion({ secciones: [], nuevas: false, estilos: false }, ids).ok, false);
  assert.equal(validarEleccion('x', ids).ok, false);
});

test('validarSecciones exige bloques elegidos, sin JavaScript', () => {
  const elegidos = ['menu'];
  const ids = ['encabezado', 'menu', 'pie'];
  const bueno = { secciones: [{ id: 'menu', html: '<section data-vtw="menu"><h2>Carta</h2></section>' }], nuevas: [] };
  assert.equal(validarSecciones(bueno, elegidos, ids).ok, true);
  assert.equal(validarSecciones({ secciones: [{ id: 'pie', html: '<footer data-vtw="pie"></footer>' }] }, elegidos, ids).ok, false);
  assert.equal(validarSecciones({ secciones: [{ id: 'menu', html: '<section data-vtw="menu" onclick="x()"></section>' }] }, elegidos, ids).ok, false);
  assert.equal(validarSecciones({ secciones: [{ id: 'menu', html: '<section data-vtw="menu"><script>x</script></section>' }] }, elegidos, ids).ok, false);
});
