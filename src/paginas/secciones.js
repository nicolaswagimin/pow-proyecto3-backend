import { parse } from 'parse5';
import { z } from 'zod';

// Edición por secciones de páginas grandes (docs/decisiones/0002): los bloques de primer nivel del
// <body> llevan data-vtw; se ubican en el texto con parse5 (posiciones de origen) y se reemplazan
// sin tocar nada más.

const MAX_TEXTO_INDICE = 120;
const MAX_HTML_SECCION = 60_000;

function esElemento(n) {
  return 'tagName' in n;
}

function texto(n) {
  return (n.childNodes ?? [])
    .map((h) => (h.nodeName === '#text' ? h.value : esElemento(h) ? ` ${texto(h)} ` : ''))
    .join('');
}

function primerTitulo(n) {
  for (const h of n.childNodes ?? []) {
    if (!esElemento(h)) continue;
    if (/^h[1-6]$/.test(h.tagName)) return texto(h).replace(/\s+/g, ' ').trim();
    const adentro = primerTitulo(h);
    if (adentro) return adentro;
  }
  return null;
}

function arbol(html) {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const raiz = doc.childNodes.find((n) => esElemento(n) && n.tagName === 'html');
  const hijos = (n, etiqueta) => n?.childNodes.find((h) => esElemento(h) && h.tagName === etiqueta);
  return { head: hijos(raiz, 'head'), body: hijos(raiz, 'body') };
}

// Los bloques de primer nivel del <body> que tienen data-vtw, con su texto exacto en el HTML.
export function bloquesDe(html) {
  const { body } = arbol(html);
  return (body?.childNodes ?? [])
    .filter(esElemento)
    .map((el) => ({ el, id: el.attrs.find((a) => a.name === 'data-vtw')?.value, loc: el.sourceCodeLocation }))
    .filter((b) => b.id && b.loc)
    .map(({ el, id, loc }) => ({
      id,
      etiqueta: el.tagName,
      inicio: loc.startOffset,
      fin: loc.endOffset,
      html: html.slice(loc.startOffset, loc.endOffset),
      nodo: el,
    }));
}

// Lo que ve Gemini para elegir qué bloques tocar: id, etiqueta, primer título y un poco de texto.
export function indiceDe(html) {
  return bloquesDe(html).map((b) => ({
    id: b.id,
    etiqueta: b.etiqueta,
    titulo: primerTitulo(b.nodo),
    texto: texto(b.nodo).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_INDICE),
  }));
}

// El contenido del primer <style> del <head> y su rango (null si no hay).
export function estilosDe(html) {
  const { head } = arbol(html);
  const estilo = head?.childNodes.find((h) => esElemento(h) && h.tagName === 'style');
  const loc = estilo?.sourceCodeLocation;
  if (!loc?.startTag || !loc.endTag) return null;
  return { css: html.slice(loc.startTag.endOffset, loc.endTag.startOffset), inicio: loc.startTag.endOffset, fin: loc.endTag.startOffset };
}

export class ErrorSecciones extends Error {}

// Aplica los cambios de Gemini como reemplazos de texto sobre el HTML original.
export function aplicarSecciones(html, { secciones = [], nuevas = [], estilos } = {}) {
  const bloques = new Map(bloquesDe(html).map((b) => [b.id, b]));
  const reemplazos = [];
  for (const s of secciones) {
    const b = bloques.get(s.id);
    if (!b) throw new ErrorSecciones(`El bloque "${s.id}" no existe en la página.`);
    reemplazos.push({ inicio: b.inicio, fin: b.fin, texto: s.html });
  }
  for (const n of nuevas) {
    const b = bloques.get(n.despuesDe);
    if (!b) throw new ErrorSecciones(`El bloque "${n.despuesDe}" no existe en la página.`);
    reemplazos.push({ inicio: b.fin, fin: b.fin, texto: n.html });
  }
  if (typeof estilos === 'string') {
    const e = estilosDe(html);
    if (e) reemplazos.push({ inicio: e.inicio, fin: e.fin, texto: estilos });
  }
  // La salida se arma de izquierda a derecha sobre el HTML original, así ningún rango se mueve.
  // A igual inicio, las inserciones (vacías, al final del bloque anterior) van antes que el
  // reemplazo del bloque siguiente; entre inserciones se respeta el orden de Gemini (sort estable).
  reemplazos.sort((a, b) => a.inicio - b.inicio || (b.inicio === b.fin) - (a.inicio === a.fin));
  let salida = '';
  let cursor = 0;
  for (const r of reemplazos) {
    salida += html.slice(cursor, r.inicio) + r.texto;
    cursor = r.fin;
  }
  return salida + html.slice(cursor);
}

const CODIGO = /<script[\s>/]|\son[a-z]+\s*=|javascript\s*:/i;
const sinCodigo = (h) => !CODIGO.test(h);

const esquemaEleccion = z.object({
  secciones: z.array(z.string()).max(20),
  nuevas: z.boolean().default(false),
  estilos: z.boolean().default(false),
});

export function validarEleccion(valor, ids) {
  const r = esquemaEleccion.safeParse(valor);
  if (!r.success) return { ok: false, errores: ['La respuesta no tiene la forma { secciones, nuevas, estilos }.'] };
  const desconocidos = r.data.secciones.filter((id) => !ids.includes(id));
  if (desconocidos.length) return { ok: false, errores: desconocidos.map((id) => `El bloque "${id}" no existe.`) };
  if (!r.data.secciones.length && !r.data.nuevas && !r.data.estilos) {
    return { ok: false, errores: ['Elige al menos un bloque, uno nuevo o los estilos.'] };
  }
  return { ok: true, eleccion: r.data };
}

const html = z.string().min(1).max(MAX_HTML_SECCION).refine(sinCodigo, 'Un bloque no puede llevar JavaScript.');
const esquemaSecciones = z.object({
  secciones: z.array(z.object({ id: z.string(), html })).default([]),
  nuevas: z.array(z.object({ despuesDe: z.string(), html })).default([]),
  estilos: z.string().max(MAX_HTML_SECCION).refine(sinCodigo).optional(),
});

export function validarSecciones(valor, elegidos, ids) {
  const r = esquemaSecciones.safeParse(valor);
  if (!r.success) return { ok: false, errores: r.error.issues.map((i) => i.message) };
  const errores = [
    ...r.data.secciones.filter((s) => !elegidos.includes(s.id)).map((s) => `El bloque "${s.id}" no se eligió para editar.`),
    ...r.data.nuevas.filter((n) => !ids.includes(n.despuesDe)).map((n) => `El bloque "${n.despuesDe}" no existe.`),
  ];
  if (!r.data.secciones.length && !r.data.nuevas.length && r.data.estilos === undefined) {
    errores.push('La respuesta no trae ningún cambio.');
  }
  return errores.length ? { ok: false, errores } : { ok: true, cambios: r.data };
}
