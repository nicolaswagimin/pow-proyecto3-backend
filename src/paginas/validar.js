import { z } from 'zod';

// Lo que devuelve Gemini es dato no confiable: antes de mostrarlo o guardarlo se comprueba que sea
// una página HTML completa, de tamaño razonable y sin JavaScript (docs/ia.md). El frontend además
// la sanea y la muestra en un iframe sin permisos (docs/seguridad.md).

export const MIN_HTML = 200;
export const MAX_HTML = 100_000;
const MAX_TITULO = 120;

// Gemini a veces envuelve el HTML en ```html … ``` o agrega una frase antes o después.
export function limpiarRespuesta(texto) {
  const sinVallas = texto.replace(/```(?:html)?/gi, '');
  const inicio = sinVallas.search(/<!DOCTYPE html|<html[\s>]/i);
  const fin = sinVallas.toLowerCase().lastIndexOf('</html>');
  if (inicio === -1 || fin === -1 || fin < inicio) return sinVallas.trim();
  return sinVallas.slice(inicio, fin + '</html>'.length).trim();
}

export const esquemaPagina = z
  .string()
  .min(MIN_HTML, 'La página es demasiado corta para ser una página completa.')
  .max(MAX_HTML, 'La página supera 100 000 caracteres.')
  .refine((h) => /^(<!DOCTYPE html>|<html[\s>])/i.test(h), 'La respuesta debe empezar con <!DOCTYPE html>.')
  .refine((h) => /<\/html>\s*$/i.test(h), 'La respuesta debe terminar con </html>.')
  .refine((h) => /<body[\s>]/i.test(h) && /<\/body>/i.test(h), 'La página necesita un <body>.')
  .refine((h) => !/<script[\s>/]/i.test(h), 'La página no puede llevar JavaScript (<script>).')
  // Solo dentro de etiquetas: «online = 24 h» en el texto no es código.
  .refine((h) => !/<[a-z][^>]*\son[a-z]+\s*=/i.test(h), 'La página no puede llevar atributos on* (onclick, onerror…).')
  .refine((h) => !/<[a-z][^>]*=\s*["']?\s*javascript\s*:/i.test(h), 'La página no puede llevar enlaces javascript:.');

export function validarPagina(texto) {
  const html = limpiarRespuesta(String(texto ?? ''));
  const r = esquemaPagina.safeParse(html);
  return r.success ? { ok: true, html: r.data } : { ok: false, errores: r.error.issues.map((i) => i.message) };
}

export function tituloDe(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titulo = m?.[1].replace(/\s+/g, ' ').trim();
  return titulo ? titulo.slice(0, MAX_TITULO) : null;
}
