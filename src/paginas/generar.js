import { z } from 'zod';
import { ErrorIA, llamarGemini, streamGemini } from '../ia.js';
import * as cacheBD from '../ia/cache.js';
import { claveDe, normalizarOrden } from '../ia/cache.js';
import {
  INSTRUCCIONES_EDITAR,
  INSTRUCCIONES_ELEGIR,
  INSTRUCCIONES_GENERAR,
  INSTRUCCIONES_SECCIONES,
  VERSION_PROMPT,
  promptEditar,
  promptElegir,
  promptGenerar,
  promptSecciones,
} from './prompts.js';
import {
  ErrorSecciones,
  aplicarSecciones,
  bloquesDe,
  estilosDe,
  indiceDe,
  validarEleccion,
  validarSecciones,
} from './secciones.js';
import { tituloDe, validarPagina } from './validar.js';

// Generar y editar páginas como una secuencia de eventos (las rutas los mandan en NDJSON):
//   { tipo: 'fase', texto }       qué está haciendo (edición por secciones)
//   { tipo: 'parcial', trozo }    un trozo del HTML apenas llega de Gemini
//   { tipo: 'reintento', motivo } la respuesta no era válida: se pide de nuevo
//   { tipo: 'final', html, titulo, desdeCache, modo }
// Un error es una excepción ErrorIA con su código HTTP.

// Hasta este tamaño se edita mandando la página entera; más grande, por secciones (ADR 0002).
export const LIMITE_EDICION_COMPLETA = 40_000;
export const MAX_HTML_EDITAR = 150_000;
const MAX_ESTILOS = 12_000;

const esquemaOrden = z
  .string({ message: 'Dime qué página quieres.' })
  .trim()
  .min(1, 'Dime qué página quieres.')
  .max(2000, 'La orden es demasiado larga (máximo 2000 caracteres).');

const esquemaHtml = z
  .string({ message: 'Falta la página que hay que editar.' })
  .min(1, 'Falta la página que hay que editar.')
  .max(MAX_HTML_EDITAR, 'La página es demasiado grande para editarla (máximo 150 000 caracteres).');

function validar(esquema, valor) {
  const r = esquema.safeParse(valor);
  if (!r.success) throw new ErrorIA(r.error.issues[0].message, 400);
  return r.data;
}

// Para las rutas: valida antes de abrir el stream, así un error de entrada es un 400 normal.
export function validarEntradaGenerar({ orden } = {}) {
  validar(esquemaOrden, orden);
}

export function validarEntradaEditar({ html, orden } = {}) {
  validar(esquemaHtml, html);
  validar(esquemaOrden, orden);
}

const DEPS = { stream: streamGemini, llamar: llamarGemini, cache: cacheBD };

const final = (html, desdeCache, modo) => ({ tipo: 'final', html, titulo: tituloDe(html), desdeCache, modo });

async function* desdeCache(cache, clave) {
  const guardada = await cache.leer(clave).catch(() => null);
  if (guardada?.html) yield final(guardada.html, true, guardada.modo ?? 'completo');
}

// Pide la página en stream; si no es válida, una vez más con los errores.
async function* paginaEnStream({ sistema, usuario }, { stream, cache }, clave) {
  let errores = [];
  for (let intento = 0; intento < 2; intento++) {
    const mensaje = intento === 0
      ? usuario
      : `${usuario}\n\nTu respuesta anterior no era válida:\n${errores.map((e) => `- ${e}`).join('\n')}\nDevuelve solo el documento HTML completo.`;
    let texto = '';
    for await (const trozo of stream({ sistema, usuario: mensaje })) {
      texto += trozo;
      yield { tipo: 'parcial', trozo };
    }
    const r = validarPagina(texto);
    if (r.ok) {
      await cache.escribir(clave, { html: r.html, modo: 'completo' }).catch(() => {});
      yield final(r.html, false, 'completo');
      return;
    }
    errores = r.errores;
    if (intento === 0) yield { tipo: 'reintento', motivo: errores[0] };
  }
  throw new ErrorIA('La IA devolvió una página inválida dos veces. Inténtalo de nuevo en un momento.', 502);
}

export async function* generar({ orden } = {}, deps = DEPS) {
  const o = validar(esquemaOrden, orden);
  const clave = claveDe({ modo: 'generar', orden: normalizarOrden(o) }, VERSION_PROMPT);
  let hubo = false;
  for await (const e of desdeCache(deps.cache, clave)) {
    hubo = true;
    yield e;
  }
  if (hubo) return;
  yield* paginaEnStream({ sistema: INSTRUCCIONES_GENERAR, usuario: promptGenerar({ orden: o }) }, deps, clave);
}

export async function* editar({ html, orden } = {}, deps = DEPS) {
  const h = validar(esquemaHtml, html);
  const o = validar(esquemaOrden, orden);
  const clave = claveDe({ modo: 'editar', html: h, orden: normalizarOrden(o) }, VERSION_PROMPT);
  let hubo = false;
  for await (const e of desdeCache(deps.cache, clave)) {
    hubo = true;
    yield e;
  }
  if (hubo) return;
  if (h.length <= LIMITE_EDICION_COMPLETA) {
    yield* paginaEnStream({ sistema: INSTRUCCIONES_EDITAR, usuario: promptEditar({ orden: o, html: h }) }, deps, clave);
    return;
  }
  yield* porSecciones(h, o, deps, clave);
}

function json(texto) {
  try {
    return JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

// Pide JSON y lo valida; si no pasa, una vez más con los errores.
async function pedirJson(llamar, sistema, usuario, validarRespuesta) {
  let errores = [];
  for (let intento = 0; intento < 2; intento++) {
    const mensaje = intento === 0
      ? usuario
      : `${usuario}\n\nTu respuesta anterior no era válida:\n${errores.map((e) => `- ${e}`).join('\n')}\nDevuelve solo el JSON.`;
    const r = validarRespuesta(json(await llamar({ sistema, usuario: mensaje, json: true })));
    if (r.ok) return r;
    errores = r.errores;
  }
  throw new ErrorIA('La IA devolvió una edición inválida dos veces. Inténtalo de nuevo en un momento.', 502);
}

// Páginas grandes: 1) con el índice, Gemini elige qué bloques tocar; 2) edita solo esos.
async function* porSecciones(html, orden, { llamar, cache }, clave) {
  const indice = indiceDe(html);
  if (!indice.length) {
    throw new ErrorIA('La página es demasiado grande para editarla entera y no tiene bloques marcados.', 400);
  }
  const ids = indice.map((b) => b.id);
  yield { tipo: 'fase', texto: 'Buscando qué partes de la página hay que cambiar…' };
  const { eleccion } = await pedirJson(llamar, INSTRUCCIONES_ELEGIR, promptElegir({ orden, indice }), (v) => validarEleccion(v, ids));

  const bloques = bloquesDe(html).filter((b) => eleccion.secciones.includes(b.id));
  yield { tipo: 'fase', texto: bloques.length ? `Editando: ${bloques.map((b) => b.id).join(', ')}…` : 'Agregando a la página…' };
  const estilos = (estilosDe(html)?.css ?? '').slice(0, MAX_ESTILOS);
  const usuario = promptSecciones({
    orden,
    estilos,
    secciones: bloques.map((b) => ({ id: b.id, html: b.html })),
  });

  const { cambios } = await pedirJson(llamar, INSTRUCCIONES_SECCIONES, usuario, (v) => {
    const r = validarSecciones(v, eleccion.secciones, ids);
    if (!r.ok) return r;
    try {
      const nuevo = validarPagina(aplicarSecciones(html, r.cambios));
      return nuevo.ok ? { ok: true, cambios: nuevo.html } : nuevo;
    } catch (err) {
      if (err instanceof ErrorSecciones) return { ok: false, errores: [err.message] };
      throw err;
    }
  });
  await cache.escribir(clave, { html: cambios, modo: 'secciones' }).catch(() => {});
  yield final(cambios, false, 'secciones');
}
