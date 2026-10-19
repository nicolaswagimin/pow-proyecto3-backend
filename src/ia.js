// Integración con Google Gemini mediante su API REST (sin SDK).
// La API key solo se lee de GEMINI_API_KEY y nunca se envía al frontend. Ver docs/ia.md.

const MODELO_POR_DEFECTO = 'gemini-3.5-flash-lite';
const TIEMPO_MAXIMO_MS = 90_000;
const ESPERA_REINTENTO_MS = 1500;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function iaDisponible() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Error de la IA con el código HTTP que debe ver el cliente (400, 429, 502 o 503).
export class ErrorIA extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

// Gemini está muy solicitado (503): suele durar segundos, se reintenta una vez.
class ErrorOcupado extends Error {}

function cuerpoDe({ sistema, usuario, json }) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: [{ text: usuario }] }],
    generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
  });
}

async function pedir({ metodo, fetchImpl, tiempoMaximoMs, ...entrada }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ErrorIA('La IA no está configurada en el servidor.', 503);
  const modelo = encodeURIComponent(process.env.GEMINI_MODEL || MODELO_POR_DEFECTO);
  const url = `${BASE}/${modelo}:${metodo}`;
  const signal = AbortSignal.timeout(tiempoMaximoMs);
  let respuesta;
  try {
    respuesta = await fetchImpl(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: cuerpoDe(entrada),
    });
  } catch (err) {
    if (signal.aborted) throw new ErrorIA('La IA tardó demasiado en responder. Inténtalo de nuevo.', 502);
    throw new ErrorIA(`No se pudo consultar a la IA: ${err.message}`, 502);
  }
  if (respuesta.status === 429) {
    throw new ErrorIA('Se agotó la cuota de la IA por ahora. Espera un minuto y vuelve a intentarlo.', 429);
  }
  if (respuesta.status === 503) throw new ErrorOcupado();
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}));
    throw new ErrorIA(`No se pudo consultar a la IA: ${datos?.error?.message || `código ${respuesta.status}`}`, 502);
  }
  return respuesta;
}

async function conReintento(fn, esperaMs) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ErrorOcupado)) throw err;
    await new Promise((r) => setTimeout(r, esperaMs));
    try {
      return await fn();
    } catch (otro) {
      if (otro instanceof ErrorOcupado) {
        throw new ErrorIA('La IA está muy solicitada en este momento. Espera unos segundos y vuelve a intentarlo.', 503);
      }
      throw otro;
    }
  }
}

const textoDe = (datos) =>
  datos?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

// Una respuesta completa (para las llamadas cortas en JSON de la edición por secciones).
export async function llamarGemini({
  sistema,
  usuario,
  json = false,
  fetchImpl = fetch,
  tiempoMaximoMs = TIEMPO_MAXIMO_MS,
  esperaReintentoMs = ESPERA_REINTENTO_MS,
}) {
  const respuesta = await conReintento(
    () => pedir({ metodo: 'generateContent', fetchImpl, tiempoMaximoMs, sistema, usuario, json }),
    esperaReintentoMs,
  );
  const texto = textoDe(await respuesta.json().catch(() => ({}))).trim();
  if (!texto) throw new ErrorIA('La IA no devolvió ninguna respuesta.', 502);
  return texto;
}

// La respuesta en stream (SSE de Gemini): entrega cada trozo de texto apenas llega. Así la página
// se arma en vivo en el navegador (docs/decisiones/0001).
export async function* streamGemini({
  sistema,
  usuario,
  fetchImpl = fetch,
  tiempoMaximoMs = TIEMPO_MAXIMO_MS,
  esperaReintentoMs = ESPERA_REINTENTO_MS,
}) {
  const respuesta = await conReintento(
    () => pedir({ metodo: 'streamGenerateContent?alt=sse', fetchImpl, tiempoMaximoMs, sistema, usuario }),
    esperaReintentoMs,
  );
  if (!respuesta.body) return;
  const decodificador = new TextDecoder();
  let pendiente = '';
  try {
    for await (const trozo of respuesta.body) {
      pendiente += decodificador.decode(trozo, { stream: true });
      let fin;
      while ((fin = pendiente.search(/\r?\n\r?\n/)) !== -1) {
        const evento = pendiente.slice(0, fin);
        pendiente = pendiente.slice(fin).replace(/^\r?\n\r?\n/, '');
        const datos = evento
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!datos) continue;
        let json;
        try {
          json = JSON.parse(datos);
        } catch {
          continue;
        }
        const texto = textoDe(json);
        if (texto) yield texto;
      }
    }
  } catch (err) {
    if (err instanceof ErrorIA) throw err;
    throw new ErrorIA('La conexión con la IA se cortó. Inténtalo de nuevo.', 502);
  }
}
