# VoiceToWeb · Funcionalidad completa · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (modo Native, pedido por el usuario). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prototipar páginas web por voz. Gemini genera y edita HTML en stream, que se ve armarse en un iframe sin permisos, con versiones en árbol y proyectos guardados.

**Architecture:**
- **Backend:** Express reenvía el stream SSE de Gemini como NDJSON, valida con Zod y cachea en Neon. Edita por secciones cuando la página es grande.
- **Frontend:** Angular con signals. Usa la Web Speech API y Web Audio para la voz, y un saneador más un iframe `sandbox=""` para la vista previa.

**Tech Stack:** Node 20 + Express 5 + pg + Zod + `node:test`; Angular 22 + Vitest + jsdom; Playwright para la verificación.

**Spec:** `backend/docs/superpowers/specs/2026-10-17-voicetoweb-funcionalidad-design.md`

## Global Constraints

- No tocar el login, el registro, auth-layout ni `/design`, ni los tokens ni las tipografías. /app se rediseña solo con los tokens actuales.
- WCAG 2.2 AA y `prefers-reduced-motion`. Cada animación comunica algo del producto.
- Commits muy pequeños, en Conventional Commits en español con alcance. Compila en cada commit. Nunca `.env`, `node_modules`, `dist` ni `.angular`. Sin push hasta aprobar.
- Gemini simulado en las pruebas; el Gemini real solo en la verificación final. Modelo por defecto `gemini-3.5-flash-lite`.
- Límites:
  - HTML generado: 200 a 100 000 caracteres, sin `<script>`;
  - versión: hasta 150 000;
  - edición completa hasta 40 000, por secciones a partir de ahí;
  - 20 generaciones o ediciones cada 15 minutos por usuario.
- No tocar los otros proyectos.

## Review Focus

1. Un stream que se corta a la mitad (red o Gemini): el cliente muestra un error y no deja una versión a medias.
2. HTML generado con XSS en atributos, SVG o `<style>` (`expression`, `url(javascript:)`): nada se ejecuta en la vista previa.
3. Deshacer y rehacer tras volver a una versión vieja y editar desde ahí: ninguna versión se pierde.
4. Órdenes de control dentro de una frase («deshacer el cambio del título»): no se confunden con una orden de edición, ni al revés.
5. Micrófono denegado mientras la Web Speech API sí está: se avisa y el teclado sigue.

---

## Backend

### B1 · Pruebas y dependencias
- `npm i zod`; script `"test": "node --test \"test/**/*.test.js\""`.
- Commits: `build(deps): zod`, `test: node:test`.

### B2 · Esquema de la base
- `schema.sql`: tablas `proyectos`, `versiones` (con `base_id`) e `ia_cache`. `items` sin `CREATE`, pero sin `DROP`.
- Commit `feat(db): tablas de proyectos, versiones y caché de la IA`.

### B3 · Gemini en stream
- `src/ia.js`: `llamarGemini({ sistema, usuario, json? })` y `streamGemini({ sistema, usuario }) → AsyncIterable<string>` (SSE), con `ErrorIA(mensaje, estado)`:
  - `429` → 429;
  - `503` → un reintento, y después 503;
  - timeout de 90 s → 502;
  - sin clave → 503.
- Pruebas: con `fetch` simulado, que lean un SSE en trozos partidos.
- Commits: `feat(ia): cliente de Gemini con streaming y errores con su código`, `test(ia): …`.

### B4 · Validación del HTML
- `src/paginas/validar.js`: `limpiarRespuesta` (quita las vallas de código) y `esquemaPagina` (Zod: doctype o `<html>`, `</html>`, `<body>`, de 200 a 100 000 caracteres, sin `<script>`). Además, `tituloDe(html)`.
- Pruebas con casos buenos y malos.
- Commit `feat(paginas): validación del HTML generado`.

### B5 · Prompts
- `src/paginas/prompts.js`: `VERSION_PROMPT`, `INSTRUCCIONES_GENERAR`, `INSTRUCCIONES_EDITAR`, `INSTRUCCIONES_ELEGIR` e `INSTRUCCIONES_SECCIONES`, más los constructores de los mensajes.
- Pruebas: piden `data-vtw`, sin JavaScript y en español.
- Commit `feat(paginas): prompts de generación y edición`.

### B6 · Caché
- `src/ia/cache.js`: `claveDe(entrada, version)` con JSON estable, más `leer` y `escribir`, igual que en a11Lens.
- Pruebas.
- Commit `feat(ia): caché de respuestas en la base`.

### B7 · Generar y editar
- `src/paginas/generar.js`: `generar({ orden }, deps)` y `editar({ html, orden }, deps)` como async generators de eventos (`parcial`, `reintento`, `final`). Hacen: caché → stream → validación → un reintento → caché.
- `src/paginas/secciones.js`: `indiceDe(html)`, `extraerSecciones(html, ids)`, `aplicarSecciones(html, cambios)`, y los esquemas Zod de elegir y editar.
- Pruebas:
  - un acierto de caché sin llamar a Gemini;
  - un reintento con los errores;
  - 502 después de dos fallos;
  - una página grande de más de 40 000 caracteres que usa secciones y solo manda las elegidas;
  - un id desconocido que se reintenta;
  - la orden normalizada en la clave.
- Commits: uno por archivo y uno para las pruebas.

### B8 · Rutas
- `src/routes/paginas.js`: NDJSON (`application/x-ndjson`); un error antes del primer byte responde con su código HTTP, y uno después, con el evento `error`. `limiteIA` de 20 cada 15 minutos.
- `src/routes/proyectos.js`, `src/proyectos/repositorio.js` y Zod.
- Se eliminan `items` y `/api/ia`.
- Pruebas con una app Express levantada y un repositorio falso.
- Commits: uno por ruta, uno por la eliminación y uno por las pruebas.

### B9 · Docs del backend
- `api.md`, `base-de-datos.md`, `ia.md`, `seguridad.md`, `despliegue.md`, `arquitectura-backend.md`, ADRs 0001 a 0004, `CHANGELOG.md` y `README.md`, cada uno en su commit.

## Frontend

### F1 · Pruebas
- Vitest, jsdom y `vitest-base.config.mts`, más el target `test` en `angular.json`.
- Commit `build(test): Vitest con jsdom`.

### F2 · Vista previa segura
- `vista-previa/sanear.ts`: `sanear(html)` a punto fijo (aplica sobre el HTML y sobre `<style>` con `expression(` o `url(javascript:`), `documentoVistaPrevia(html, { resaltar?: string[], bloquesVisibles?: string[] })` y `CSP_VISTA`.
- `ui-ventana` (componente): barra, anchos y un iframe con `sandbox=""`.
- Pruebas: XSS, mXSS, CSP, que el sandbox sea exactamente `""` y la marca de los bloques.
- Commits separados.

### F3 · Bloques
- `paginas/bloques.ts`:
  - `bloquesCompletos(parcial)`: los `data-vtw` que ya cerraron, en orden;
  - `diffBloques(antes, despues)`: cambiados y nuevos;
  - `nombreDeBloque(id, etiqueta)`: «Encabezado», «Menú»…
- Pruebas.

### F4 · Versiones
- `paginas/versiones.ts`: un árbol puro, con `agregar`, `deshacer(actual)`, `rehacer(actual)`, `puedeDeshacer` y `puedeRehacer`.
- Pruebas: deshacer y rehacer tras ramificar sin perder ninguna versión.

### F5 · Voz
- `VozService.escucharOrden()`, que entrega el interino palabra por palabra.
- `NivelMicrofono`, con Web Audio.
- `comandos.ts`, con `interpretarComando(texto) → 'deshacer' | 'rehacer' | 'nueva' | 'descargar' | null`. Solo cuenta una frase corta y completa, para que «deshacer el cambio del título» siga siendo una edición.
- Errores de voz.
- Pruebas con un reconocedor y un `getUserMedia` simulados.

### F6 · Servicios
- `PaginasService`: `generar` y `editar` con `fetch` y lectura NDJSON (con el token y los errores 0, 401, 429 y 502).
- `ProyectosService` con `HttpClient`.
- Se elimina `api.service.ts`.
- Pruebas.

### F7 · Estado de /app
- `pages/inicio/estudio-estado.ts`: orden, transcripción, construcción (bloques y progreso), versiones, proyecto, guardado, comandos, errores, ancho de la ventana y resaltado.
- Pruebas de todo el flujo con servicios simulados.

### F8 · Pantalla /app
- Componentes `ui-microfono` (con anillos de nivel), `ui-orden` (transcripción editable y envío), `ui-ejemplos`, `ui-ventana`, `ui-construccion` (progreso), `ui-linea-tiempo` y la barra de acciones.
- `inicio.*` rediseñado con los tokens.
- Pruebas de cada componente.
- Un commit por componente y otro por estilos.

### F9 · /proyectos
- La página, la ruta y el enlace en la barra.
- Pruebas.

### F10 · Verificación y docs
- Build de producción.
- Playwright: el flujo completo con Gemini real, axe en todas las vistas y capturas.
- `demo.sh` y `stop.sh`.
- Docs: `funcionalidades.md`, `voz.md`, `vista-previa.md`, `versiones.md`, `arquitectura-frontend.md`, ADRs 0005 a 0008 (más la actualización de la 0004), `accesibilidad.md`, `CHANGELOG.md` y `README.md`, cada uno en su commit.
- Revisión final de toda la rama con un revisor nuevo; lo crítico y lo importante se corrige con TDD.
