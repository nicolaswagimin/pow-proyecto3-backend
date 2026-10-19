# IA · VoiceToWeb

Gemini genera y edita las páginas. El backend le pide **un solo archivo HTML con su CSS**, lo **valida con Zod** antes de entregarlo y guarda en caché lo que ya se pidió. El frontend arma la página en vivo con el stream y la muestra en un iframe sin permisos (ver [seguridad.md](seguridad.md#páginas-generadas)).

Código: `src/ia.js` (`streamGemini`, `llamarGemini`, `ErrorIA`), `src/paginas/prompts.js`, `src/paginas/validar.js`, `src/paginas/secciones.js`, `src/paginas/generar.js`, `src/ia/cache.js`. Rutas: `src/routes/paginas.js`.

## La llamada

- **Modelo:** `GEMINI_MODEL` o, si falta, **`gemini-3.5-flash-lite`**.
- **En stream:** `…:streamGenerateContent?alt=sse`. Cada evento SSE trae un trozo de texto que se reenvía al navegador apenas llega (evento `parcial`). Las llamadas cortas de la edición por secciones usan `…:generateContent` con `responseMimeType: "application/json"`.
- `temperature: 0.4`. Tiempo máximo: 90 s.
- **Errores:**
  - `429` de Gemini → `429` "Se agotó la cuota de la IA por ahora…";
  - `503` (muy solicitado, suele durar segundos) → **un reintento** tras 1.5 s, y si sigue, `503` con un mensaje claro;
  - otra respuesta de error, la red o el tiempo → `502`.
- La API key solo vive en el backend (`GEMINI_API_KEY`) y viaja en la cabecera `x-goog-api-key`.

## Prompts (`VERSION_PROMPT = paginas-v1`)

Reglas comunes de toda página:
- un solo HTML con un único `<style>`;
- **nada de JavaScript** (ni `<script>`, ni `on*`, ni `javascript:`);
- sin recursos externos salvo Google Fonts e imágenes de Unsplash o Picsum;
- textos en español, verosímiles y breves, sin "lorem ipsum";
- **cada bloque de primer nivel del `<body>` lleva `data-vtw`** con un nombre único en español (`encabezado`, `menu`, `contacto`, `pie`), en el orden en que se leen;
- accesible: `lang="es"`, un `<title>`, un solo `<h1>`, `alt`, etiquetas en los campos, contraste de 4.5:1 y diseño desde 360 px.

| Prompt | Recibe | Devuelve |
|---|---|---|
| `INSTRUCCIONES_GENERAR` | La orden | Solo el documento, de `<!DOCTYPE html>` a `</html>` |
| `INSTRUCCIONES_EDITAR` | La orden y el HTML actual | El documento entero editado, cambiando **solo lo que pide la orden** y conservando los `data-vtw` |
| `INSTRUCCIONES_ELEGIR` | La orden y el índice de la página | JSON `{ secciones: [ids], nuevas, estilos }` |
| `INSTRUCCIONES_SECCIONES` | La orden, el CSS y los bloques elegidos | JSON `{ secciones: [{ id, html }], nuevas: [{ despuesDe, html }], estilos? }` |

`data-vtw` es lo que permite armar la página por bloques en vivo, resaltar qué cambió y editar páginas grandes por secciones.

## Validación (Zod)

`validarPagina` primero quita las vallas de código (` ```html `) y el texto alrededor. Después exige:
- que empiece con `<!DOCTYPE html>` o `<html`;
- que termine en `</html>`;
- que tenga `<body>`;
- que mida de **200 a 100 000 caracteres**;
- **que no traiga `<script>`**.

En la edición por secciones, los JSON se validan con su esquema: los ids tienen que existir y haber sido elegidos, y ningún bloque puede traer `<script>`, `on*` ni `javascript:`. El documento armado se valida igual que una generación.

**Reintento:** si la respuesta no pasa, se pide **una vez más** agregando la lista de errores; el cliente ve `{ tipo: 'reintento', motivo }`. Si vuelve a fallar, `502`, y nada se guarda en la caché.

## Edición de páginas grandes

Ver [decisiones/0002](decisiones/0002-edicion-por-secciones.md).

- **Hasta 40 000 caracteres** se manda la página entera con la orden y vuelve entera, en stream.
- **Más de 40 000** se hace en dos llamadas cortas, con JSON:
  1. **Elegir.** Gemini recibe el **índice**: por cada bloque `data-vtw`, su etiqueta, su primer título y 120 caracteres de texto. Responde qué bloques tocar, si hay que agregar uno y si hay que cambiar el CSS general.
  2. **Editar.** Recibe solo esos bloques, el `<style>` (hasta 12 000 caracteres) y la orden, y devuelve los bloques nuevos.

  El servidor ubica cada bloque en el texto con parse5 (posiciones de origen) y **reemplaza solo esos**: el resto de la página queda igual byte a byte. El stream manda eventos `fase` («Buscando qué partes…», «Editando: menu…»).
- Una página grande sin bloques marcados responde `400`.

## Caché y límites

- **Caché** en la tabla `ia_cache`. La clave es el SHA-256 de `VERSION_PROMPT`, el modo, la **orden normalizada** (sin mayúsculas, espacios de más ni el punto final) y, al editar, el HTML actual. La misma orden sobre el mismo HTML responde al instante (`desdeCache: true`), aunque la pida otra persona. Cambiar los prompts exige subir `VERSION_PROMPT`.
- **Límite propio:** 20 generaciones o ediciones cada 15 minutos por usuario.
- **Comandos sin IA.** «Deshacer», «rehacer», «nueva página» y «descargar» se resuelven en el navegador y no gastan cuota.

## Pruebas

`test/ia.test.js`, `test/validar.test.js`, `test/prompts.test.js`, `test/secciones.test.js`, `test/generar.test.js` y `test/rutas-paginas.test.js` usan un Gemini y una caché simulados, así que nunca gastan cuota. Incluyen un stream SSE partido en trozos arbitrarios y una página de más de 40 000 caracteres editada por secciones.
