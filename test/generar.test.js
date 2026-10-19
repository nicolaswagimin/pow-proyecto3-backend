import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorIA } from '../src/ia.js';
import { LIMITE_EDICION_COMPLETA, editar, generar } from '../src/paginas/generar.js';

// Gemini y la caché simulados: las pruebas nunca gastan cuota.

const pagina = (titulo = 'Café Pasto', extra = '') =>
  `<!DOCTYPE html><html lang="es"><head><title>${titulo}</title><style>h1{color:brown}</style></head><body>` +
  `<header data-vtw="encabezado"><h1>${titulo}</h1></header>${extra}` +
  `<section data-vtw="menu"><h2>Menú</h2>${'<p>Tinto y aromáticas.</p>'.repeat(8)}</section>` +
  `<footer data-vtw="pie"><p>Pasto</p></footer></body></html>`;

function falsos({ streams = [], llamadas = [] } = {}, guardado = new Map()) {
  const pedidos = { stream: [], llamar: [] };
  const stream = async function* (p) {
    pedidos.stream.push(p);
    const r = streams[Math.min(pedidos.stream.length - 1, streams.length - 1)];
    if (r instanceof Error) throw r;
    for (const trozo of r) yield trozo;
  };
  const llamar = async (p) => {
    pedidos.llamar.push(p);
    const r = llamadas[Math.min(pedidos.llamar.length - 1, llamadas.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === 'string' ? r : JSON.stringify(r);
  };
  const cache = { leer: async (k) => guardado.get(k) ?? null, escribir: async (k, v) => guardado.set(k, v) };
  return { deps: { stream, llamar, cache }, pedidos, guardado };
}

async function eventos(iterable) {
  const lista = [];
  for await (const e of iterable) lista.push(e);
  return lista;
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

const partido = (html) => [html.slice(0, 60), html.slice(60, 200), html.slice(200)];

test('generar reenvía cada trozo y termina con la página validada y su título', async () => {
  const { deps } = falsos({ streams: [partido(pagina())] });
  const lista = await eventos(generar({ orden: 'una cafetería en Pasto' }, deps));
  const parciales = lista.filter((e) => e.tipo === 'parcial');
  assert.equal(parciales.map((e) => e.trozo).join(''), pagina());
  assert.deepEqual(lista.at(-1), { tipo: 'final', html: pagina(), titulo: 'Café Pasto', desdeCache: false, modo: 'completo' });
});

test('la misma orden (aunque cambien mayúsculas y espacios) sale de la caché sin llamar a Gemini', async () => {
  const guardado = new Map();
  await eventos(generar({ orden: 'Una cafetería en Pasto.' }, falsos({ streams: [partido(pagina())] }, guardado).deps));
  const f = falsos({ streams: [new Error('no debería llamar')] }, guardado);
  const lista = await eventos(generar({ orden: '  una cafetería   en pasto ' }, f.deps));
  assert.equal(f.pedidos.stream.length, 0);
  assert.deepEqual(lista, [{ tipo: 'final', html: pagina(), titulo: 'Café Pasto', desdeCache: true, modo: 'completo' }]);
});

test('una respuesta inválida se reintenta una vez contándole a Gemini qué falló', async () => {
  const { deps, pedidos } = falsos({ streams: [['<p>no es una página</p>'], partido(pagina())] });
  const lista = await eventos(generar({ orden: 'x x x' }, deps));
  assert.equal(pedidos.stream.length, 2);
  assert.match(pedidos.stream[1].usuario, /no era válida/);
  assert.deepEqual(lista.find((e) => e.tipo === 'reintento'), { tipo: 'reintento', motivo: 'La página es demasiado corta para ser una página completa.' });
  assert.equal(lista.at(-1).tipo, 'final');
});

test('dos respuestas inválidas → 502 y nada en la caché', async () => {
  const { deps, guardado } = falsos({ streams: [['<p>mal</p>'], ['<p>mal</p>']] });
  const err = await errorDe(eventos(generar({ orden: 'x x x' }, deps)));
  assert.equal(err.estado, 502);
  assert.match(err.message, /inválida dos veces/);
  assert.equal(guardado.size, 0);
});

test('una página con JavaScript no se acepta', async () => {
  const conScript = pagina('Café', '<script>alert(1)</script>');
  const { deps } = falsos({ streams: [[conScript], [conScript]] });
  await errorDe(eventos(generar({ orden: 'x x x' }, deps)));
});

test('una orden vacía o demasiado larga es 400 sin llamar a Gemini', async () => {
  const { deps, pedidos } = falsos({ streams: [partido(pagina())] });
  for (const orden of ['', '  ', 'x'.repeat(2001), undefined]) {
    const err = await errorDe(eventos(generar({ orden }, deps)));
    assert.equal(err.estado, 400);
  }
  assert.equal(pedidos.stream.length, 0);
});

test('los errores de Gemini (429) se propagan con su código', async () => {
  const { deps } = falsos({ streams: [new ErrorIA('cuota', 429)] });
  assert.equal((await errorDe(eventos(generar({ orden: 'x x x' }, deps)))).estado, 429);
});

test('editar una página chica manda el HTML completo con la orden', async () => {
  const editada = pagina('Café Pasto Azul');
  const { deps, pedidos } = falsos({ streams: [partido(editada)] });
  const lista = await eventos(editar({ html: pagina(), orden: 'pon el título en azul' }, deps));
  assert.match(pedidos.stream[0].usuario, /pon el título en azul/);
  assert.ok(pedidos.stream[0].usuario.includes(pagina()));
  assert.deepEqual(lista.at(-1), { tipo: 'final', html: editada, titulo: 'Café Pasto Azul', desdeCache: false, modo: 'completo' });
});

test('editar con la misma orden sobre el mismo HTML sale de la caché', async () => {
  const guardado = new Map();
  await eventos(editar({ html: pagina(), orden: 'azul' }, falsos({ streams: [partido(pagina('Azul'))] }, guardado).deps));
  const f = falsos({ streams: [new Error('no')] }, guardado);
  assert.equal((await eventos(editar({ html: pagina(), orden: 'Azul.' }, f.deps))).at(-1).desdeCache, true);
  // Otro HTML con la misma orden sí llama.
  const g = falsos({ streams: [partido(pagina('Azul'))] }, guardado);
  await eventos(editar({ html: pagina('Otro'), orden: 'azul' }, g.deps));
  assert.equal(g.pedidos.stream.length, 1);
});

// Una página grande: muchas secciones de relleno, más de LIMITE_EDICION_COMPLETA caracteres.
const relleno = Array.from({ length: 60 }, (_, i) => `<section data-vtw="s${i}"><h2>Sección ${i}</h2>${'<p>Texto de relleno para que la página pese.</p>'.repeat(20)}</section>`).join('');
const grande = pagina('Café Grande', relleno);

test('editar una página grande usa secciones: elige y edita solo los bloques necesarios', async () => {
  assert.ok(grande.length > LIMITE_EDICION_COMPLETA);
  const { deps, pedidos } = falsos({
    llamadas: [
      { secciones: ['encabezado'], nuevas: true, estilos: false },
      {
        secciones: [{ id: 'encabezado', html: '<header data-vtw="encabezado"><h1 style="color:#1d3faa">Café Grande</h1></header>' }],
        nuevas: [{ despuesDe: 'pie', html: '<section data-vtw="contacto"><h2>Contacto</h2></section>' }],
      },
    ],
  });
  const lista = await eventos(editar({ html: grande, orden: 'título azul y agrega contacto' }, deps));
  assert.equal(pedidos.stream.length, 0, 'no se manda la página entera');
  assert.equal(pedidos.llamar.length, 2);
  assert.ok(pedidos.llamar[0].usuario.length < 20_000, 'para elegir va solo el índice');
  assert.ok(pedidos.llamar[0].usuario.includes('s59'));
  assert.ok(!pedidos.llamar[1].usuario.includes('Sección 30'), 'para editar van solo los bloques elegidos');
  assert.ok(pedidos.llamar.every((p) => p.json));
  const final = lista.at(-1);
  assert.equal(final.tipo, 'final');
  assert.equal(final.modo, 'secciones');
  assert.match(final.html, /<h1 style="color:#1d3faa">Café Grande<\/h1>/);
  assert.match(final.html, /data-vtw="contacto"/);
  assert.ok(final.html.includes('<h2>Sección 30</h2>'), 'el resto queda igual');
  assert.ok(lista.some((e) => e.tipo === 'fase'));
});

test('en secciones, un id inventado se reintenta una vez', async () => {
  const { deps, pedidos } = falsos({
    llamadas: [
      { secciones: ['no-existe'], nuevas: false, estilos: false },
      { secciones: ['menu'], nuevas: false, estilos: false },
      { secciones: [{ id: 'menu', html: '<section data-vtw="menu"><h2>Carta</h2></section>' }] },
    ],
  });
  const lista = await eventos(editar({ html: grande, orden: 'cambia el menú a carta' }, deps));
  assert.equal(pedidos.llamar.length, 3);
  assert.match(pedidos.llamar[1].usuario, /no-existe/);
  assert.match(lista.at(-1).html, /<h2>Carta<\/h2>/);
});

test('una página grande sin bloques data-vtw no se puede editar por secciones: 400 claro', async () => {
  const sinBloques = `<!DOCTYPE html><html><head><title>x</title></head><body>${'<p>texto</p>'.repeat(5000)}</body></html>`;
  const { deps } = falsos({});
  const err = await errorDe(eventos(editar({ html: sinBloques, orden: 'azul' }, deps)));
  assert.equal(err.estado, 400);
});
