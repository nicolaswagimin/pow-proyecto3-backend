# VoiceToWeb · Funcionalidad completa · Diseño

Fecha: 2026-10-17. Repos: `VoiceToWeb/backend` (Express + Neon + Gemini) y `VoiceToWeb/frontend` (Angular 22).

## Intención

La persona describe en voz alta la página que quiere. Gemini la genera y se ve armarse en vivo en una ventana de navegador. Después la cambia con nuevas órdenes de voz y puede volver a cualquier versión. Hablar tiene que bastar y el teclado tiene que poder hacer lo mismo.

## Metas, no metas y anti-metas

- **Metas:** las del pedido.
  - /app se rediseña alrededor de un gran micrófono.
  - Visualización real del volumen.
  - Transcripción palabra por palabra, editable antes de enviar.
  - Ventana de navegador con anchos de móvil, tablet y escritorio.
  - Construcción en vivo por bloques.
  - Edición con resaltado de lo que cambió.
  - Versiones con deshacer y rehacer.
  - Comandos de voz.
  - Estado vacío con ejemplos.
  - Errores amables.
  - Proyectos guardados.
  - Descargar y copiar.
  - Caché y límites.
- **No metas:**
  - no se toca el login, el registro, auth-layout ni `/design`;
  - no se cambian tokens ni tipografías;
  - sin gRPC;
  - sin publicar páginas en internet;
  - las páginas generadas no llevan JavaScript.
- **Anti-metas:**
  - animación decorativa (cada movimiento dice algo verdadero: volumen real, texto que asienta, bloque que llega de Gemini, cambio aplicado);
  - un script del HTML generado que se ejecute;
  - perder una versión.

## Backend

### Tablas (`schema.sql`, idempotente)

- `proyectos`: `id`, `usuario_id` (FK, `ON DELETE CASCADE`), `nombre` VARCHAR(120), `creado_en`, `actualizado_en`. Índice `(usuario_id, actualizado_en DESC)`.
- `versiones`: `id`, `proyecto_id` (FK, `CASCADE`), `base_id` (FK a `versiones`, NULL), `orden` TEXT, `tipo` (`crear` | `editar`), `html` TEXT (≤ 150 000), `creado_en`.
- `ia_cache`: `clave` CHAR(64) PK, `respuesta` JSONB, `creado_en`.
- `items` deja de crearse pero **no se borra** (mismo criterio que en los otros proyectos).

### Rutas (todas con `requireAuth`)

| Ruta | Qué hace |
|---|---|
| `POST /api/paginas/generar` `{ orden }` | Genera una página. Responde un **stream NDJSON**: `{tipo:'parcial', html}` a medida que llega de Gemini; `{tipo:'reintento', motivo}`; `{tipo:'final', html, titulo, desdeCache}`; o `{tipo:'error', estado, error}` |
| `POST /api/paginas/editar` `{ html, orden }` | Edita una página. Mismo stream; la estrategia depende del tamaño (ver «Edición de páginas grandes») |
| `GET /api/proyectos` | Lista de proyectos del usuario, del más reciente al más antiguo, con su número de versiones |
| `POST /api/proyectos` `{ nombre, version: { orden, tipo, html } }` | Crea el proyecto con su primera versión |
| `GET /api/proyectos/:id` | El proyecto con **todas** sus versiones |
| `PATCH /api/proyectos/:id` `{ nombre }` | Le cambia el nombre |
| `DELETE /api/proyectos/:id` | Lo borra |
| `POST /api/proyectos/:id/versiones` `{ base_id, orden, tipo, html }` | Agrega una versión |

- Todo se valida con Zod.
- Un proyecto ajeno responde `404`.
- Se eliminan `/api/items` y la `/api/ia` genérica.

### Gemini

- Modelo por defecto: `gemini-3.5-flash-lite`, o `GEMINI_MODEL`.
- **Streaming:** `streamGenerateContent?alt=sse`, cuya salida se reenvía como NDJSON.
- **Prompt de generación:** una página completa en **un solo archivo HTML con CSS en `<style>`**, sin JavaScript, sin recursos externos salvo Google Fonts e imágenes `https:`, en español.
  - Cada bloque de primer nivel de `<body>` (`header`, `nav`, `section`, `footer`…) lleva `data-vtw="nombre-unico"`.
  - La respuesta es **solo** el HTML, empezando por `<!DOCTYPE html>`.
- **Validación (Zod) de la respuesta final:**
  - se quitan las vallas de código (```html);
  - debe empezar con `<!DOCTYPE html>` o `<html`, terminar en `</html>` y tener `<body>`;
  - 200 a 100 000 caracteres;
  - **sin `<script>`**.
  - Si falla, se reintenta **una vez** con los errores (el cliente ve `reintento`), y si vuelve a fallar responde `502`.
- **`429` de Gemini** → `429` con un mensaje amable. **`503` (muy solicitada)** → un reintento automático.
- **Caché:** SHA-256 de `VERSION_PROMPT + modo + html + orden normalizada` (sin mayúsculas ni espacios de más). Un acierto responde `final` de inmediato, con `desdeCache: true`.
- **Límite propio:** 20 generaciones o ediciones cada 15 minutos por usuario. El CRUD de proyectos queda aparte, con 120 cada 15 minutos.

### Edición de páginas grandes (ADR 0002 del backend)

- **≤ 40 000 caracteres:** se envía el HTML completo con la orden y Gemini devuelve la página entera editada (stream).
- **> 40 000 caracteres:** edición por secciones, en dos llamadas.
  1. **Elegir.** Se manda el **índice** de la página (cada `data-vtw` con su etiqueta, su primer encabezado y 120 caracteres de texto) más la orden. Gemini responde JSON `{ secciones: [ids], nuevas: boolean, estilos: boolean }`.
  2. **Editar.** Se mandan solo esas secciones, el `<style>` (hasta 12 000 caracteres) y la orden. Gemini responde JSON `{ secciones: [{ id, html }], nuevas: [{ despuesDe, html }], estilos? }`.

  El servidor arma el documento reemplazando esas secciones y valida el resultado igual que una generación. El stream manda `parcial` cuando se aplica cada sección.
- Los dos JSON se validan con Zod. Un id que no existe es error y se reintenta.

## Frontend

### Infraestructura

- Se agregan Vitest y jsdom con el builder de pruebas de Angular, como en los otros proyectos.

### Voz (`voz/`)

- `VozService` gana `escucharOrden()`: escucha continua con resultados interinos, palabra por palabra, que se detiene sola tras un silencio o al pulsar de nuevo. El texto queda **editable** antes de enviar.
- `NivelMicrofono`: `getUserMedia` + `AnalyserNode` (Web Audio). Calcula el nivel RMS en cada `requestAnimationFrame` como signal de 0 a 1, y se cierra al terminar.
- **Errores, con mensajes amables y siempre con el teclado como salida:**
  - `NotAllowedError`: permiso denegado;
  - `NotFoundError`: sin micrófono;
  - sin red: «el dictado necesita conexión»;
  - navegador sin Web Speech API (Firefox): aviso claro y el campo de texto.
- **Comandos de control:** la orden normalizada coincide con «deshacer», «rehacer», «nueva página» o «descargar» (con variantes como «deshaz», «vuelve atrás», «empezar de nuevo», «baja la página»). Se ejecutan sin IA y se anuncian.

### Pantalla /app (rediseño)

- **Escenario vacío:**
  - el gran botón de micrófono en el centro (≥ 96 px, `aria-pressed`, nombre accesible);
  - alrededor, anillos cuyo radio sigue el **nivel real** del micrófono;
  - debajo, la transcripción en Newsreader (interino en gris e itálica, asienta en tinta);
  - luego, «Revisar y enviar» con el texto editable;
  - el campo de texto siempre está como alternativa;
  - **estado vacío:** 4 frases de ejemplo de un clic (por ejemplo, «Una landing para una cafetería en Pasto con menú y contacto»).
- **Con una página:** dos zonas.
  - **La ventana de navegador** es la protagonista. Lleva una barra con tres puntos, el nombre del proyecto y los botones Móvil (375 px), Tablet (768 px) y Escritorio (100 %), con `aria-pressed`.
  - **Debajo o al costado:** el micrófono compacto para la próxima orden, la línea de tiempo de versiones y las acciones (Descargar, Copiar código, Nueva página, Mis proyectos).
- **Construcción en vivo:**
  - a medida que llega HTML parcial, cada bloque `data-vtw` que ya cerró aparece en la ventana, en orden, con una entrada breve;
  - una lista de progreso dice «Encabezado ✓ · Menú ✓ · Contacto…» y cuántos caracteres van;
  - con movimiento reducido, los bloques aparecen sin animación;
  - si viene de la caché, los bloques se muestran en orden rápido (o todos juntos con movimiento reducido) y se dice «Desde la caché».
- **Resaltado de cambios:** se comparan los bloques `data-vtw` de la versión anterior y la nueva. Los cambiados o nuevos llevan un contorno ultramar que se desvanece en 1.5 s, y un texto («Cambió: Encabezado») en `role="status"`.
- **Línea de tiempo:**
  - cada versión con su número, su orden (en Newsreader) y su hora; se vuelve a cualquiera con un clic;
  - **Deshacer** va a la base de la versión actual;
  - **Rehacer** va a la versión más reciente que salió de la actual;
  - una orden nueva crea una versión desde la que se ve, y nunca se borra ninguna (`versiones.md`).
- **Proyectos:**
  - la primera página crea el proyecto, con el `<title>` como nombre;
  - cada versión se guarda sola, y el estado se muestra («Guardado»);
  - `/proyectos` lista, abre (`/app?proyecto=id`), renombra y borra.
- **Descargar y copiar:** descarga como `<nombre>.html`, el HTML saneado sin las marcas internas, y copia con `navigator.clipboard` con un aviso.
- **Errores amables** en una región `role="alert"`, con una acción:
  - sin conexión o backend caído (`0`);
  - `429` (cuota);
  - `502` (respuesta inválida, «Reintentar»);
  - `401` (sesión).

### Vista previa segura (`vista-previa/`)

- `sanear(html)`, a punto fijo como en a11Lens, quita:
  - los elementos `script`, `noscript`, `iframe`, `frame`, `object`, `embed`, `applet`, `base` y `meta[http-equiv]`;
  - los atributos `on*`, `srcdoc` y `formaction`;
  - las URLs `javascript:`.

  Los `href` que no son de ancla pasan a `#`: la vista previa no navega.
- **Iframe `sandbox=""`, sin ningún permiso:** sin scripts, sin same-origin, sin formularios, sin ventanas emergentes, sin navegación de la pestaña.
- **CSP en `srcdoc`:** `default-src 'none'; style-src 'unsafe-inline' https:; font-src https: data:; img-src https: data:`.
- Los estilos del resaltado y de la entrada de bloques se inyectan como `<style>`, con `@media (prefers-reduced-motion)`.
- **Pruebas:** cargas de XSS conocidas, mXSS, meta refresh, `javascript:` con espacios, y que el sandbox sea exactamente `""`.

## Verificación

- `ng build` de producción sin advertencias.
- Pruebas de:
  - backend: validación, prompts, caché, estrategia por secciones, rutas, versiones;
  - frontend: saneado, comandos, versiones (deshacer y rehacer en árbol), parser de bloques parciales, diff de bloques, estado de /app y servicios.
- Flujo con Playwright y Gemini real:
  - crear por texto y «por voz»;
  - editar;
  - deshacer y rehacer;
  - volver a una versión;
  - guardar, abrir y descargar;
  - micrófono denegado;
  - backend apagado.

  La voz se simula con un `SpeechRecognition` falso y un micrófono falso de Chrome.
- axe sin errores en todas las vistas, en claro y oscuro, móvil y escritorio.
- `demo.sh`.
- Capturas.

## Documentación

- **Backend:**
  - `api.md`, `base-de-datos.md`, `ia.md`, `seguridad.md`, `despliegue.md`, `arquitectura-backend.md`;
  - ADRs: 0001 respuesta en stream, 0002 edición por secciones, 0003 caché en la base, 0004 no borrar items;
  - `CHANGELOG.md` y `README.md`.
- **Frontend:**
  - `funcionalidades.md`, `voz.md`, `vista-previa.md`, `versiones.md`, `arquitectura-frontend.md`;
  - ADRs: 0005 visualización del volumen real (actualiza la 0004), 0006 iframe sin permisos, 0007 versiones en árbol, 0008 construcción en vivo;
  - `CHANGELOG.md` y `README.md` con capturas.

## Decisiones mías

1. **Streaming NDJSON** para que la construcción en vivo sea real. Los bloques que se ven son los que ya mandó Gemini.
2. **HTML sin JavaScript** y vista previa en un iframe `sandbox=""` sin ningún permiso. El resaltado se hace con estilos inyectados, sin scripts.
3. **La visualización de la voz contradice en parte la ADR 0004.** Esa ADR prohibía ondas decorativas porque no había análisis real. Ahora el volumen se mide con Web Audio, así que la animación dice la verdad. Se actualiza la ADR.
4. **Edición por secciones** en dos llamadas, solo para páginas de más de 40 000 caracteres.
5. **Versiones en árbol** (`base_id`): deshacer y rehacer navegan, y nunca se borra ninguna.
6. **Comandos de voz** resueltos en el navegador, sin gastar cuota.
7. **`/proyectos`** como página aparte, y guardado automático.
8. **Variables de entorno:** ninguna nueva. Si en Render `GEMINI_MODEL` tiene otro valor, conviene poner `gemini-3.5-flash-lite` o borrarla. En el `.env` local hoy está `gemini-3.5-flash`.

## Ajustes al aprobar (2026-10-17)

1. **Streaming detrás del proxy de Render.**
   - El servidor manda cabeceras contra el búfer: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no` y `Connection: keep-alive`, y hace `flushHeaders()`.
   - Envía un evento `inicio` de inmediato y un `latido` cada 3 s.
   - **Alternativa automática** sin stream, cuando no llega ningún byte en 12 s, cuando se corta antes del `final` o cuando falla la lectura. El cliente aborta y repite la petición con `?stream=0`; la respuesta es un JSON con el HTML final, y si la primera llegó a terminar en el servidor, sale de la caché.
   - El progreso se muestra igual: fases («Pidiendo la página…», «Validando…») y, al llegar el HTML, los bloques aparecen en orden.
   - Se prueba localmente detrás de un proxy que almacena todo en búfer, y en Render después del push.
2. **Voz en español de Colombia** (`es-CO`) por defecto, con un selector de otras variantes (México, España, Argentina, Chile, Perú, Estados Unidos) que se recuerda en `localStorage`.
3. **`GEMINI_MODEL=gemini-3.5-flash-lite`** también en el `.env` local.
